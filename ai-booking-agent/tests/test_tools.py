"""
Script kiểm thử trực tiếp 2 LangChain Tools (`search_properties_tool` & `book_appointment_tool`)
bắn request thật xuống `core-api` (port 3001) mà không cần qua LLM.

Cách chạy (khi core-api đang chạy ở port 3001):
  .\venv\Scripts\python.exe test_tools.py
"""
import json
import os
import sys
import time
from dotenv import load_dotenv
import requests

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.tools import book_appointment_tool, search_properties_tool

load_dotenv()

BASE_URL = os.getenv("CORE_API_BASE_URL", "http://localhost:3001").rstrip("/")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@core-api.local")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@123456")


def setup_test_properties(token: str, prefix: str) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    avail = requests.post(
        f"{BASE_URL}/properties",
        headers=headers,
        json={
            "code": f"{prefix}-AVL",
            "name": "Phòng Trọ AI Test Trống",
            "type": "ROOM",
            "address": "100 Lê Lợi, Q1",
            "area": 25,
            "monthlyRent": 3500000,
            "electricityRate": 3500,
            "waterRate": 15000,
            "status": "AVAILABLE",
        },
        timeout=10,
    )
    avail.raise_for_status()

    rented = requests.post(
        f"{BASE_URL}/properties",
        headers=headers,
        json={
            "code": f"{prefix}-RNT",
            "name": "Phòng Trọ AI Test Đã Thuê",
            "type": "ROOM",
            "address": "102 Lê Lợi, Q1",
            "area": 25,
            "monthlyRent": 3500000,
            "electricityRate": 3500,
            "waterRate": 15000,
            "status": "RENTED",
        },
        timeout=10,
    )
    rented.raise_for_status()
    return {"available": avail.json(), "rented": rented.json()}


def main() -> None:
    print(f"=== KIỂM THỬ LANGCHAIN TOOLS VỚI CORE-API ({BASE_URL}) ===")

    # 1. Đăng nhập Admin để tạo dữ liệu mẫu phục vụ test
    login_resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=10,
    )
    login_resp.raise_for_status()
    token = login_resp.json()["accessToken"]

    prefix = f"AI{int(time.time()) % 100000}"
    props = setup_test_properties(token, prefix)
    avail_id = props["available"]["id"]
    rented_id = props["rented"]["id"]

    # 2. Gọi trực tiếp search_properties_tool
    print("\n[1] Gọi search_properties_tool(property_type='ROOM', max_rent=5000000):")
    search_output = search_properties_tool.invoke(
        {"property_type": "ROOM", "max_rent": 5000000}
    )
    print(search_output)
    parsed_search = json.loads(search_output)
    codes = [p["code"] for p in parsed_search["properties"]]
    assert f"{prefix}-AVL" in codes, "Phòng AVAILABLE phải xuất hiện trong kết quả!"
    assert f"{prefix}-RNT" not in codes, "Phòng RENTED KHÔNG được xuất hiện trong kết quả!"

    # 3. Gọi book_appointment_tool trên phòng AVAILABLE -> Thành công (201)
    print("\n[2] Gọi book_appointment_tool cho phòng AVAILABLE:")
    book_ok = book_appointment_tool.invoke(
        {
            "property_id": avail_id,
            "guest_name": "Lê Văn Test AI",
            "phone_number": "0912345678",
            "appointment_time": "2026-12-01",
            "message": "Test từ test_tools.py",
        }
    )
    print(book_ok)
    parsed_book = json.loads(book_ok)
    assert parsed_book["status"] == "PENDING"

    # 4. Gọi book_appointment_tool trên phòng RENTED -> Bắt lỗi 400 êm ái (không crash)
    print("\n[3] Gọi book_appointment_tool cho phòng RENTED (kiểm tra bắt lỗi HTTP 400):")
    book_rented = book_appointment_tool.invoke(
        {
            "property_id": rented_id,
            "guest_name": "Lê Văn Test AI",
            "phone_number": "0912345678",
            "appointment_time": "2026-12-01",
        }
    )
    print(book_rented)
    assert "Đặt lịch KHÔNG thành công" in book_rented and "400" in book_rented

    # 5. Gọi liên tiếp để kiểm tra bắt lỗi Rate Limit 429 êm ái
    print("\n[4] Gọi liên tiếp book_appointment_tool để kiểm tra bắt lỗi HTTP 429 Rate Limit:")
    got_429 = False
    for i in range(5):
        res_str = book_appointment_tool.invoke(
            {
                "property_id": avail_id,
                "guest_name": f"Khách Spam {i}",
                "phone_number": "0912345678",
                "appointment_time": "2026-12-02",
            }
        )
        if "429" in res_str:
            print(f" -> Lần gọi thêm thứ {i + 1}: {res_str}")
            got_429 = True
            break
    assert got_429, "Phải bắt được lỗi 429 khi vượt quá 5 requests/phút!"

    print("\n✔ TẤT CẢ KỊCH BẢN TEST TOOLS ĐỀU THÀNH CÔNG!")


if __name__ == "__main__":
    main()
