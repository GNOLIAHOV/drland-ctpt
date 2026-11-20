# Spec: client-chat-ui (Giao diện Chat cho Khách hàng)

## Objective
Xây dựng một ứng dụng Web (SPA) đơn giản, mô phỏng giao diện chat để người dùng (khách thuê) có thể nhắn tin trực tiếp với AI Agent.

## Tech Stack
- Core: React 18, TypeScript, Vite
- Styling: Tailwind CSS, Lucide React
- Thư viện hỗ trợ: `axios`, `uuid` (để sinh session_id ngẫu nhiên cho mỗi phiên chat)
- Port mặc định: 5174 (tránh xung đột với admin-dashboard)

## Architecture & Boundaries
- Ứng dụng chỉ giao tiếp trực tiếp với `ai-booking-agent` qua API `POST http://localhost:8000/chat`.
- Không yêu cầu đăng nhập (Public access). Mỗi khi reload trang sẽ sinh ra một `session_id` mới (coi như một khách hàng mới).
