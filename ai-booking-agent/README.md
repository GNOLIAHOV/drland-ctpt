# AI Booking Agent Service (`ai-booking-agent` — Port `8000`)

> Tài liệu gốc toàn dự án: [CTPT Monorepo README](../README.md)

![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-Google_Gemini-4285F4)
![Tests](https://img.shields.io/badge/Guardrail_Tests-9_Passing-22C55E)

Dịch vụ Trợ lý AI hỗ trợ khách hàng tra cứu phòng trọ & mặt bằng kinh doanh đang trống và đặt lịch hẹn xem phòng tự động 24/7 trên nền tảng **FastAPI**, **LangChain Tool Calling** và **Google Gemini**.

- **Production Cloud Health (Railway):** [ai-booking-agent-production-c251525f.up.railway.app/health](https://ai-booking-agent-production-c251525f.up.railway.app/health)
- **Swagger Docs (Local):** `http://localhost:8000/docs`
- **Local Base URL:** `http://localhost:8000`

---

## Kiến Trúc & Lớp Bảo Vệ Đặt Lịch (Booking Guardrails)

- **Nguyên tắc ranh giới:** Dịch vụ **không kết nối trực tiếp vào PostgreSQL**. Toàn bộ dữ liệu sống (danh sách tòa nhà `/houses`, cài đặt hotline `/settings/public`, tìm kiếm phòng `/properties`, tạo lịch hẹn `/bookings`) đều giao tiếp qua REST API của `core-api` thông qua `CoreApiClient`.
- **Chiến lược Failover nhiều tầng:** Lần lượt thử các model trong `CANDIDATE_MODELS` (`gemini-3.5-flash-lite` -> `gemini-3.1-flash-lite` -> `gemini-3.5-flash`) khi gặp giới hạn quota (429/503) và chuyển sang kịch bản phản hồi dự phòng (`generate_autonomous_fallback`) khi toàn bộ model tạm thời bất khả dụng.
- **Lớp bảo vệ đặt lịch đa tầng (`app/tools.py` & `app/agent.py`):**
  1. **Kiểm chứng SĐT từ hội thoại thật (`phone_appeared_in_texts`):** Đối chiếu qua `ContextVar` toàn bộ tin nhắn phía khách hàng để đảm bảo LLM không tự bịa bất kỳ số điện thoại nào.
  2. **Chặn tên giữ chỗ & Hotline chủ nhà:** Từ chối các đại từ/chữ thay thế (*"Anh/Chị"*, *"Khách hàng"*, *"Chưa rõ"*, tên toàn chữ số...) và từ chối mọi biến thể của Hotline/Zalo chủ nhà lấy từ `/settings/public`.
  3. **Chuẩn hóa múi giờ Việt Nam (`UTC+7`):** Dùng `VN_TZ = timezone(timedelta(hours=7))` để quy đổi ngày *"hôm nay / ngày mai"* và giờ hẹn (`YYYY-MM-DDTHH:MM:00+07:00`) chính xác trên server Linux.
  4. **Tự động phân giải mã phòng -> UUID (`_resolve_property_id`):** Nếu hội thoại nhiều lượt chỉ nhắc mã phòng như `P303` hay `MB-14B9`, tool tự tra UUID tương ứng trước khi gọi `core-api`.
  5. **Chống đặt lặp trong cùng phiên (`_session_bookings` + `{session_booking_status}`):** Nếu khách chỉ nhắn *"Ok"*, *"Cảm ơn"* sau khi đã chốt lịch, tool trả `"alreadyBooked": True` và không bắn lặp `POST /bookings`; nếu khách đổi giờ (*"14:00"* -> *"16:00"*), tool chuyển yêu cầu xuống backend cập nhật lại giờ hẹn trên dòng cũ.

---

## API Endpoints

| Method & Path | Mô tả | Payload / Response mẫu |
| :--- | :--- | :--- |
| `GET /health` | Kiểm tra tình trạng dịch vụ và `CORE_API_BASE_URL` | `{"status": "ok", "service": "ai-booking-agent", ...}` |
| `POST /chat` | Gửi tin nhắn hội thoại theo `session_id` (lưu lịch sử theo phiên, tối đa 500 phiên) | Request: `{"session_id": "...", "message": "..."}` -> Response: `{"response": "..."}` |

---

## Cấu Trúc Thư Mục

```text
ai-booking-agent/
├── app/
│   ├── __init__.py
│   ├── main.py               # FastAPI app, CORS, giới hạn session & endpoints /health, /chat
│   ├── agent.py              # System prompt tiếng Việt, UTC+7, {session_booking_status} & failover
│   ├── tools.py              # search_properties_tool, book_appointment_tool & toàn bộ guardrails
│   └── core_api_client.py    # HTTP Client giao tiếp REST với core-api
├── tests/
│   ├── __init__.py
│   ├── test_booking_guards.py # 9 Offline Unit Tests (mock core-api) kiểm tra mọi guardrail đặt lịch
│   ├── test_tools.py          # Kiểm thử tích hợp trực tiếp các LangChain Tools với core-api
│   └── test_chat_flow.py      # Kiểm thử luồng hội thoại đặt lịch nhiều lượt end-to-end
├── Dockerfile                 # Python 3.11-slim + uvicorn
├── .env.example               # Mẫu biến môi trường
└── requirements.txt           # Danh sách thư viện Python
```

---

## Biến Môi Trường (`.env`)

Sao chép `ai-booking-agent/.env.example` thành `ai-booking-agent/.env`:

| Biến | Giá trị mẫu local | Mô tả |
| :--- | :--- | :--- |
| `PORT` | `8000` | Cổng chạy FastAPI/Uvicorn |
| `CORE_API_BASE_URL` | `http://localhost:3001` | Đường dẫn tới `core-api` (trên Docker dùng `http://core-api:3001`) |
| `GEMINI_API_KEY` | `your-gemini-api-key-here` | API Key lấy từ Google AI Studio |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Model Gemini ưu tiên đầu tiên trong chuỗi failover |

---

## Hướng Dẫn Cài Đặt, Chạy Local & Kiểm Thử

### 1. Tạo môi trường ảo & chạy server

```powershell
cd ai-booking-agent
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt

# Khởi chạy FastAPI ở cổng 8000
.\venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

### 2. Kiểm tra cú pháp & chạy kiểm thử

```powershell
cd ai-booking-agent

# Kiểm tra cú pháp Python
.\venv\Scripts\python -m py_compile app\main.py app\agent.py app\core_api_client.py app\tools.py

# Chạy 9 Offline Guardrail Unit Tests (không cần DB hay Gemini Key)
.\venv\Scripts\python -m unittest discover -s tests -p "test_booking_guards.py" -v

# Chạy kiểm thử tích hợp với core-api đang chạy (test_chat_flow.py cần GEMINI_API_KEY hợp lệ)
.\venv\Scripts\python tests\test_tools.py
.\venv\Scripts\python tests\test_chat_flow.py
```
