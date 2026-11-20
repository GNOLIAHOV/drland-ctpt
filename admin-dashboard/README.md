# Admin Dashboard (`admin-dashboard` — Port `5173`)

> Tài liệu gốc toàn dự án: [CTPT Monorepo README](../README.md)

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![Tests](https://img.shields.io/badge/Unit_Tests-14_Passing-22C55E)

Cổng Quản Trị dành cho Chủ nhà / Quản lý hệ thống phòng trọ & mặt bằng **DRLAND**, hỗ trợ điều hành đa tòa nhà, xuất hợp đồng thuê chuẩn OpenXML (`.docx`), tính hóa đơn điện nước hàng loạt, tạo QR thanh toán động và theo dõi lịch hẹn xem phòng.

- **Production Cloud URL (Railway):** [admin-dashboard-production-df3d6636.up.railway.app](https://admin-dashboard-production-df3d6636.up.railway.app)
- **Local URL:** `http://localhost:5173`

---

## Tính Năng Chính

- **Tổng quan điều hành (`Dashboard.tsx`):** Thống kê công suất phòng theo thời gian thực, doanh thu, danh sách hóa đơn chờ thanh toán, lịch hẹn mới nhất và liên kết chuyển nhanh sang từng phân hệ.
- **Quản lý Tòa nhà, Phòng thuê & Hợp đồng (`Properties.tsx`, `contract-template.ts`, `lease-expiration.ts`):**
  - Quản lý danh sách cơ sở/tòa nhà, tự động đồng bộ địa chỉ xuống từng phòng/mặt bằng.
  - Theo dõi 4 trạng thái (`AVAILABLE`, `SOON_TO_BE_AVAILABLE`, `DEPOSITED`, `RENTED`), cảnh báo hợp đồng sắp hết hạn (trong vòng 30 ngày / quá hạn) và phòng đến kỳ nghiệm thu bàn giao.
  - Upload ảnh thực tế từ máy tính hoặc dán link ảnh ngoài; xem trước, in PDF và **tải hợp đồng Word `.docx` chuẩn OpenXML khổ A4** (đầy đủ 7 điều khoản, tự đọc tiền bằng chữ tiếng Việt và kế thừa chỉ số điện nước bàn giao).
- **Quản lý Hóa đơn điện nước & QR Thanh toán (`Billings.tsx`, `billing-automation.ts`):**
  - Phát hiện phòng đến kỳ lập hóa đơn, tự động kế thừa chỉ số điện/nước cuối kỳ trước làm chỉ số đầu kỳ mới.
  - Lập hóa đơn hàng loạt, điều chỉnh cộng/trừ linh hoạt, gạch nợ thanh toán, xuất file CSV, in phiếu thu và tạo mã VietQR / ZaloPay động thông qua `/billings/qr-proxy`.
- **Quản lý Lịch hẹn xem phòng (`Bookings.tsx`):**
  - Hiển thị rõ **ngày hẹn • giờ hẹn** (`YYYY-MM-DD • HH:MM`), lọc theo trạng thái (`Chờ xử lý`, `Đã chốt hẹn`, `Khách hủy`), tìm kiếm theo tên/SĐT/mã phòng và hỗ trợ gọi điện hoặc mở Zalo 1 chạm (`https://zalo.me/...`).
- **Cài đặt tập trung & Bảo mật (`Layout.tsx`, `ProtectedRoute.tsx`):**
  - Bảo vệ toàn bộ route bằng JWT Bearer Token; cho phép đổi mật khẩu quản trị viên, cập nhật thông tin liên hệ (tự đồng bộ sang Client Portal & AI Agent) và tài khoản nhận tiền thanh toán.

---

## Cấu Trúc Thư Mục

```text
admin-dashboard/
├── src/
│   ├── api/
│   │   └── axiosClient.ts              # Axios interceptor gắn JWT Token & xử lý URL dev/prod
│   ├── components/
│   │   ├── Layout.tsx                  # Sidebar, header, modal Cài đặt hệ thống & Đổi mật khẩu
│   │   ├── ProtectedRoute.tsx          # Chặn truy cập khi chưa đăng nhập
│   │   └── ErrorBoundary.tsx           # Bắt lỗi render React an toàn
│   ├── pages/
│   │   ├── Login.tsx                   # Trang đăng nhập quản trị
│   │   ├── Dashboard.tsx               # Tổng quan thống kê & cảnh báo nhanh
│   │   ├── Properties.tsx              # Quản lý Tòa nhà, Phòng, Hợp đồng .docx & Upload ảnh
│   │   ├── Bookings.tsx                # Danh sách & xử lý lịch hẹn xem phòng (kèm giờ hẹn HH:MM)
│   │   └── Billings.tsx                # Lập hóa đơn tự động, VietQR/ZaloPay, CSV & in biên nhận
│   └── utils/
│       ├── billing-automation.ts       # Logic phát hiện kỳ ghi số, kế thừa chỉ số & dự tính tiền
│       ├── billing-automation.spec.ts  # Unit tests cho tự động hóa hóa đơn
│       ├── contract-template.ts        # Tạo hợp đồng 7 điều khoản HTML/PDF & .docx OpenXML A4
│       ├── contract-template.spec.ts   # Unit tests cho đọc tiền bằng chữ & xuất .docx
│       ├── lease-expiration.ts         # Cảnh báo hết hạn hợp đồng & bàn giao phòng
│       └── lease-expiration.spec.ts    # Unit tests cho cảnh báo thời hạn thuê
├── public/                             # Font tự host (Be Vietnam Pro, JetBrains Mono) & SVG icons
├── Dockerfile                          # Multi-stage build Node + Nginx SPA fallback
├── vite.config.ts                      # Dev proxy (/core-api, /uploads) khi truy cập qua tunnel/LAN
├── .env.example                        # Mẫu biến môi trường
└── package.json
```

---

## Biến Môi Trường (`.env`)

Sao chép `admin-dashboard/.env.example` thành `admin-dashboard/.env`:

| Biến | Giá trị mẫu local | Mô tả |
| :--- | :--- | :--- |
| `VITE_CORE_API_URL` | `http://localhost:3001` | Đường dẫn tới `core-api` (bắt buộc gắn khi build Docker Production) |
| `VITE_CLIENT_URL` | `http://localhost:5174/` | Đường dẫn nút **Xem trang khách thuê** trên thanh điều hướng |

*(Khi mở qua tên miền tunnel không phải `localhost`/`127.0.0.1` trong lúc dev, `axiosClient.ts` tự định tuyến qua `/core-api` được cấu hình trong `vite.config.ts`.)*

---

## Đăng Nhập, Chạy Local & Kiểm Thử

- **Tài khoản đăng nhập:** Sử dụng cặp `ADMIN_EMAIL` / `ADMIN_PASSWORD` đã thiết lập trong `core-api/.env` và nạp bằng `npm run db:seed`. *(Khuyến nghị đổi mật khẩu ngay tại mục **Cài đặt -> Đổi mật khẩu quản trị** sau khi đăng nhập lần đầu.)*

```powershell
cd admin-dashboard
npm install

npm run dev          # Chạy dev server tại http://localhost:5173
npm test             # Chạy 14 Unit Tests (billing-automation, contract-template, lease-expiration)
npm run lint         # Kiểm tra mã nguồn với Oxlint
npm run build        # Kiểm tra TypeScript (tsc -b) & đóng gói Vite vào dist/
npm run preview      # Xem trước bản build production
```
