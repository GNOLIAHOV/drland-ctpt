# Client Web & AI Chat Portal (`client-chat-ui` — Port `5174`)

> Tài liệu gốc toàn dự án: [CTPT Monorepo README](../README.md)

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![Oxlint](https://img.shields.io/badge/Oxlint-0_Errors-0EA5E9)

Giao diện Web công khai dành cho khách thuê tìm hiểu thông tin các tòa nhà, tra cứu danh sách phòng trọ & mặt bằng đang mở, xem trọn bộ ảnh thực tế và trò chuyện đặt lịch xem phòng trực tiếp với **Trợ lý AI**.

- **Production Cloud URL (Railway):** [client-chat-ui-production.up.railway.app](https://client-chat-ui-production.up.railway.app)
- **Local URL:** `http://localhost:5174`

---

## Tính Năng Chính

- **Đồng bộ dữ liệu sống từ `core-api` (`Home.tsx`, `ChatWidgetContext.tsx`):**
  - Tự động tải và làm mới danh sách tòa nhà (`GET /houses`), phòng trọ & mặt bằng (`GET /properties`), cùng thông tin thương hiệu, hotline, Zalo và giờ xem phòng (`GET /settings/public`).
  - Tự động chuẩn hóa danh sách địa chỉ tòa nhà hiển thị lên thanh đầu trang (`formatTopBarAddresses`, `formatNaturalAddressList`) và cập nhật khi quay lại tab trình duyệt.
- **Lọc tìm phòng & xem ảnh thực tế (`Home.tsx`):**
  - Lọc theo cơ sở/tòa nhà, loại hình (`ROOM` / `COMMERCIAL_SPACE`), giá thuê và tình trạng (`AVAILABLE`, `SOON_TO_BE_AVAILABLE`).
  - Xem chi tiết diện tích, giá phòng, tiền cọc, giá điện/nước/dịch vụ và mở modal phóng to trọn bộ ảnh thực tế từng căn.
  - Bấm **Hẹn xem** / **Hẹn xem phòng** trên từng phòng để mở ngay khung chat với câu hỏi điền sẵn tên phòng (`askAboutProperty`).
- **Khung Chat Trợ lý Đặt lịch nổi (`FloatingChatWidget.tsx`):**
  - Giao tiếp với `ai-booking-agent` qua `POST /chat`, quản lý phiên hội thoại theo `session_id` (hỗ trợ nút **Cuộc trò chuyện mới** để reset phiên).
  - Tích hợp 4 nút gợi ý nhanh (*Phòng trống hôm nay*, *Phòng dưới 4 triệu*, *Hẹn qua xem phòng*, *Điện nước & Cọc*), chống gửi trùng khi đang xử lý và hiển thị thông báo thân thiện kèm hotline dự phòng khi mạng/API gián đoạn.

---

## Cấu Trúc Thư Mục

```text
client-chat-ui/
├── src/
│   ├── api/
│   │   └── chatApi.ts                  # Giao tiếp Core API (/houses, /properties, /settings/public) & AI (/chat)
│   ├── components/
│   │   ├── Layout.tsx                  # Header địa chỉ động, nút Hotline/Zalo & footer liên hệ
│   │   ├── FloatingChatWidget.tsx      # Hộp chat nổi với Trợ lý AI, quick prompts & reset session
│   │   └── ErrorBoundary.tsx           # Bắt lỗi render giao diện an toàn
│   ├── context/
│   │   └── ChatWidgetContext.tsx       # Chia sẻ houses, publicSettings & trạng thái mở/đóng hộp chat
│   └── pages/
│       └── Home.tsx                    # Trang chủ: danh sách tòa nhà, bộ lọc phòng, modal ảnh & nút hẹn xem
├── public/                             # Font tự host (Be Vietnam Pro, JetBrains Mono) & SVG icons
├── Dockerfile                          # Multi-stage build Node + Nginx SPA fallback
├── vite.config.ts                      # Dev proxy (/core-api, /ai-api, /uploads) cho truy cập qua tunnel/LAN
├── .env.example                        # Mẫu biến môi trường
└── package.json
```

---

## Biến Môi Trường (`.env`)

Sao chép `client-chat-ui/.env.example` thành `client-chat-ui/.env`:

| Biến | Giá trị mẫu local | Mô tả |
| :--- | :--- | :--- |
| `VITE_AI_AGENT_URL` | `http://localhost:8000` | Đường dẫn tới dịch vụ `ai-booking-agent` |
| `VITE_CORE_API_URL` | `http://localhost:3001` | Đường dẫn tới dịch vụ `core-api` |

*(Trong lúc dev, nếu mở trang web qua tên miền tunnel không phải `localhost`/`127.0.0.1`, `chatApi.ts` tự chuyển sang gọi `/core-api` và `/ai-api` thông qua Vite proxy; trên Railway Cloud các URL HTTPS public được truyền vào lúc build Docker.)*

---

## Hướng Dẫn Cài Đặt, Chạy Local & Kiểm Tra

```powershell
cd client-chat-ui
npm install

npm run dev          # Chạy dev server tại http://localhost:5174
npm run lint         # Kiểm tra mã nguồn với Oxlint
npm run build        # Kiểm tra TypeScript (tsc -b) & đóng gói Vite vào dist/
npm run preview      # Xem trước bản build production
```
