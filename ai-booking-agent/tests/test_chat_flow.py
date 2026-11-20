"""
Kịch bản kiểm thử tích hợp liền mạch (End-to-End) cho `POST /chat` với Memory & Tool Calling:
- Tin 1: "Chào bạn, có phòng nào đang trống giá dưới 4 triệu không?"
- Tin 2: "Tôi muốn đặt lịch xem phòng rẻ nhất vào sáng mai. Tôi là Long, SĐT 0912345678."
"""
import os
import sys
import time
from dotenv import load_dotenv
from fastapi.testclient import TestClient
import requests

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.main import app

load_dotenv()

BASE_URL = os.getenv("CORE_API_BASE_URL", "http://localhost:3001").rstrip("/")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@core-api.local")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@123456")


def seed_sample_rooms(token: str, prefix: str) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    rooms = [
        {
            "code": f"{prefix}-28",
            "name": "Phòng Studio Bình Thạnh (Rẻ nhất)",
            "type": "ROOM",
            "address": "15 Điện Biên Phủ, Bình Thạnh",
            "area": 22,
            "monthlyRent": 2800000,
            "electricityRate": 3500,
            "waterRate": 15000,
            "status": "AVAILABLE",
        },
        {
            "code": f"{prefix}-36",
            "name": "Phòng Ban Công Quận 1",
            "type": "ROOM",
            "address": "88 Nguyễn Thị Minh Khai, Q1",
            "area": 28,
            "monthlyRent": 3600000,
            "electricityRate": 3500,
            "waterRate": 15000,
            "status": "AVAILABLE",
        },
    ]
    created = []
    for r in rooms:
        resp = requests.post(f"{BASE_URL}/properties", headers=headers, json=r, timeout=10)
        resp.raise_for_status()
        created.append(resp.json())
    return {"cheapest": created[0], "second": created[1]}


def main() -> None:
    print("=== KIỂM THỬ TÍCH HỢP POST /chat (GEMINI 3.5 FLASH + MEMORY + CORE-API) ===")

    # 1. Đăng nhập Admin trên core-api để tạo 2 phòng trống dưới 4 triệu
    login = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=10,
    )
    login.raise_for_status()
    token = login.json()["accessToken"]

    prefix = f"CH{int(time.time()) % 100000}"
    seeded = seed_sample_rooms(token, prefix)
    cheapest_id = seeded["cheapest"]["id"]
    print(f"Đã tạo phòng rẻ nhất: {seeded['cheapest']['code']} (ID: {cheapest_id}, Giá: 2.800.000 VNĐ)")

    client = TestClient(app)
    session_id = f"session-long-{int(time.time())}"

    # 2. Tin nhắn 1: Hỏi phòng trống giá dưới 4 triệu
    msg1 = "Chào bạn, có phòng nào đang trống giá dưới 4 triệu không?"
    print(f"\n[Khách - Tin 1]: {msg1}")
    res1 = client.post("/chat", json={"session_id": session_id, "message": msg1})
    assert res1.status_code == 200, f"Lỗi HTTP {res1.status_code}: {res1.text}"
    reply1 = res1.json()["response"]
    print(f"[AI trả lời Tin 1]:\n{reply1}")

    # 3. Tin nhắn 2 (cùng session_id): Đặt lịch xem phòng rẻ nhất vào sáng mai
    msg2 = "Tôi muốn đặt lịch xem phòng rẻ nhất vào sáng mai. Tôi là Long, SĐT 0912345678."
    print(f"\n[Khách - Tin 2]: {msg2}")
    res2 = client.post("/chat", json={"session_id": session_id, "message": msg2})
    assert res2.status_code == 200, f"Lỗi HTTP {res2.status_code}: {res2.text}"
    reply2 = res2.json()["response"]
    print(f"[AI trả lời Tin 2]:\n{reply2}")

    # 4. Xác minh trực tiếp trên core-api rằng Booking đã thực sự được lưu cho phòng rẻ nhất
    bookings_resp = requests.get(
        f"{BASE_URL}/bookings",
        headers={"Authorization": f"Bearer {token}"},
        params={"propertyId": cheapest_id},
        timeout=10,
    )
    bookings_resp.raise_for_status()
    bookings = bookings_resp.json()["data"]
    assert len(bookings) == 1, f"Expected 1 booking in DB for cheapest room, got {len(bookings)}"
    assert bookings[0]["guestName"] == "Long"
    assert bookings[0]["phoneNumber"] == "0912345678"
    print(
        f"\n✔ XÁC MINH DB THÀNH CÔNG: Booking ID {bookings[0]['id']} đã được tạo cho phòng rẻ nhất ({cheapest_id}) - Khách: {bookings[0]['guestName']} ({bookings[0]['phoneNumber']}), Ngày hẹn: {bookings[0]['appointmentTime']}"
    )


if __name__ == "__main__":
    main()
