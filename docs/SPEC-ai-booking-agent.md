# Spec: ai-booking-agent (Trợ lý AI Tư vấn & Đặt lịch)

## Objective
Xây dựng một dịch vụ độc lập đóng vai trò là "Nhân viên Sale AI", giao tiếp tự nhiên với khách thuê qua chat, tự động gọi API xuống `core-api` để tìm phòng trống và đặt lịch hẹn.

## Tech Stack
- Ngôn ngữ: Python 3.10+
- Web Framework: FastAPI
- AI Framework: LangChain
- LLM: Google Gemini API (gemini-1.5-flash)
- Môi trường: Virtual Environment (venv) chạy ở port 8000

## Architecture & Boundaries
- Cấm tuyệt đối: AI Agent KHÔNG BAO GIỜ được kết nối trực tiếp vào database PostgreSQL. Mọi thao tác dữ liệu phải gọi qua REST API của `core-api` (http://localhost:3001).
- Tools (Công cụ của Agent):
  1. `SearchPropertiesTool`: Lấy danh sách phòng (chỉ lấy trạng thái AVAILABLE hoặc SOON_TO_BE_AVAILABLE).
  2. `BookAppointmentTool`: Đặt lịch hẹn qua endpoint `/bookings`. Bắt buộc xử lý lỗi 400 (phòng đã thuê) hoặc 429 (Rate Limit).
- Giao tiếp: Cung cấp API `POST /chat` nhận câu hỏi (kèm session_id) và trả về câu trả lời của AI.
