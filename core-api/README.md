# Core Backend API Service (`core-api` — Port `3001`)

> Tài liệu gốc toàn dự án: [CTPT Monorepo README](../README.md)

![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7.10-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-137_Unit_Tests_Passing-22C55E?logo=vitest&logoColor=white)
![Oxlint](https://img.shields.io/badge/Oxlint-0_Errors-0EA5E9)

Dịch vụ Backend trung tâm của hệ thống **DRLAND**, chịu trách nhiệm quản lý toàn bộ dữ liệu đa tòa nhà, phòng trọ & mặt bằng, hóa đơn điện nước, đặt lịch xem phòng, xác thực quản trị viên và thông báo email bất đồng bộ.

- **Production Cloud URL (Railway):** [core-api-production-c5118cb8.up.railway.app](https://core-api-production-c5118cb8.up.railway.app)
- **Swagger OpenAPI (Local):** `http://localhost:3001/api/docs`
- **Local Base URL:** `http://localhost:3001`

---

## Tính Năng & Thiết Kế Chính

- **Xác thực & Bảo mật (`AuthModule`):** Đăng nhập JWT (`PassportStrategy`), băm mật khẩu `bcryptjs`, kiểm tra DTO nghiêm ngặt (`ValidationPipe` với `whitelist: true` và `forbidNonWhitelisted: true`) cùng các validator tùy biến (`IsGreaterOrEqualTo`).
- **Đa tòa nhà & Phòng thuê (`HousesModule`, `PropertiesModule`):**
  - Tự động đồng bộ địa chỉ từ tòa nhà (`houses`) xuống các phòng/mặt bằng trực thuộc (`properties`).
  - Theo dõi 4 trạng thái (`AVAILABLE`, `SOON_TO_BE_AVAILABLE`, `DEPOSITED`, `RENTED`) và hỗ trợ upload ảnh thực tế bằng `multer` vào `uploads/properties/`.
- **Hóa đơn điện nước & QR Proxy (`BillingModule`):**
  - Tính toán tiền thuê, điện, nước, dịch vụ, điều chỉnh bằng `Prisma.Decimal` chính xác tuyệt đối; lưu snapshot đơn giá tại kỳ lập hóa đơn.
  - Ràng buộc duy nhất `@@unique([propertyId, periodYear, periodMonth])` tránh lập trùng hóa đơn cùng tháng.
  - Cung cấp endpoint `GET /billings/qr-proxy` tải ảnh mã VietQR/ZaloPay qua backend để hỗ trợ in phiếu thu không bị lỗi CORS.
- **Đặt lịch chống trùng & Guardrails (`BookingsModule`, `NotificationsModule`):**
  - Bảo vệ endpoint công khai `POST /bookings` bằng `ThrottlerGuard` (tối đa **5 yêu cầu / phút / IP**).
  - Chặn tên giữ chỗ (*"Anh/Chị"*, *"Khách hàng"*, *"Chưa rõ"*, tên toàn số...), chặn SĐT trùng Hotline/Zalo chủ nhà trong `system_settings`, chặn SĐT rác toàn ký tự lặp và hỗ trợ định dạng SĐT Việt Nam có dấu chấm (`0943.257.088`).
  - Tự tách khung giờ `HH:MM` từ ISO 8601 lưu vào `message` (`Giờ hẹn: HH:MM`), đồng thời xử lý **idempotent deduplication** theo khóa `(propertyId, SĐT chuẩn hóa, desiredMoveIn)`: tránh tạo dòng trùng hoặc gửi email lặp, và cập nhật giờ mới nếu đơn đang `PENDING`.
  - Phát sự kiện `@OnEvent('booking.created', { async: true })` gửi email thông báo qua Nodemailer không chặn luồng HTTP response.
- **Cài đặt hệ thống (`SettingsModule`):** Quản trị tập trung `brandName`, `hotline`, `zaloPhone`, `viewingHours` và thông tin tài khoản nhận thanh toán; cấp endpoint công khai `/settings/public` cho Client Portal và AI Agent.

---

## Danh Sách REST API

| Nhóm | Endpoint | Quyền | Mô tả |
| :--- | :--- | :---: | :--- |
| **Root** | `GET /` | Public | Kiểm tra trạng thái dịch vụ |
| **Auth** | `POST /auth/login` | Public | Đăng nhập nhận JWT `accessToken` |
| **Auth** | `GET /auth/me`, `PATCH /auth/change-password` | JWT | Thông tin quản trị viên & đổi mật khẩu |
| **Houses** | `GET /houses`, `GET /houses/:id` | Public | Danh sách & chi tiết tòa nhà/cơ sở |
| **Houses** | `POST /houses`, `PATCH\|PUT /houses/:id`, `DELETE /houses/:id` | JWT | Thêm, sửa (đồng bộ địa chỉ) & xóa tòa nhà |
| **Properties** | `GET /properties`, `GET /properties/:id` | Public | Tìm kiếm, lọc phòng/mặt bằng trống & xem chi tiết |
| **Properties** | `POST /properties`, `PATCH\|PUT /properties/:id`, `DELETE /properties/:id`, `POST /properties/upload-images` | JWT | CRUD phòng/mặt bằng & upload ảnh thực tế |
| **Billings** | `GET /billings`, `GET /billings/qr-proxy`, `GET /billings/:id`, `POST /billings`, `PATCH /billings/:id/pay`, `DELETE /billings/:id` | JWT | Quản lý hóa đơn điện nước, gạch nợ & tạo QR thanh toán |
| **Bookings** | `POST /bookings` *(Rate Limit 5 req/phút/IP)* | Public | Tạo lịch hẹn xem phòng (kèm chống trùng & validation) |
| **Bookings** | `GET /bookings`, `PATCH /bookings/:id/status`, `DELETE /bookings/:id` | JWT | Xem danh sách, cập nhật trạng thái & xóa lịch hẹn |
| **Settings** | `GET /settings/public` | Public | Lấy thương hiệu, hotline, Zalo & giờ xem phòng |
| **Settings** | `GET /settings`, `PATCH /settings` | JWT | Xem & cập nhật toàn bộ cài đặt + tài khoản nhận tiền |

---

## Cấu Trúc Thư Mục

```text
core-api/
├── src/
│   ├── auth/                # JWT strategy, guard, đổi mật khẩu & Unit Tests
│   ├── houses/              # Quản lý tòa nhà/cơ sở & đồng bộ địa chỉ
│   ├── properties/          # Quản lý phòng/mặt bằng, trạng thái, upload ảnh & Unit Tests
│   ├── billing/             # Tính tiền điện nước, hóa đơn, qr-proxy & Unit Tests
│   ├── bookings/            # Đặt lịch chống trùng, guardrails, sự kiện & Unit Tests
│   ├── notifications/       # Nodemailer async event listener & Unit Tests
│   ├── settings/            # Cài đặt hệ thống & tài khoản ngân hàng/ZaloPay
│   ├── common/validators/   # Validator kiểm tra chỉ số công tơ (IsGreaterOrEqualTo)
│   ├── prisma/              # schema.prisma, migrations/, seed.ts, seed-multi-house.ts, bootstrap-prod.ts
│   ├── app.setup.ts         # Cấu hình ValidationPipe, CORS, Swagger & static uploads
│   └── main.ts              # Khởi chạy ứng dụng NestJS
├── test/                    # Bộ E2E Tests (app, auth, billing, bookings, properties)
├── uploads/.gitkeep         # Thư mục lưu ảnh tải lên từ Admin
├── Dockerfile               # Đóng gói Production (prisma db push + bootstrap-prod.js)
├── .env.example             # Mẫu biến môi trường
├── prisma.config.ts         # Cấu hình Prisma 7
├── vitest.config.ts         # Cấu hình Vitest Unit Tests
├── vitest.config.e2e.ts     # Cấu hình Vitest E2E Tests
└── package.json
```

---

## Biến Môi Trường (`.env`)

Sao chép `core-api/.env.example` thành `core-api/.env` trước khi chạy local:

| Biến | Mô tả |
| :--- | :--- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Thông số container PostgreSQL (`docker-compose.yml`, mặc định port `5433`) |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL dành cho Prisma |
| `PORT` | Cổng lắng nghe HTTP của `core-api` (mặc định `3001`) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Khóa bí mật ký JWT (tối thiểu 48 ký tự) và thời hạn token |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME` | Thông tin tài khoản quản trị khởi tạo bởi seed script |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Cấu hình SMTP (Gmail App Password) để gửi email báo lịch hẹn mới |

---

## Hướng Dẫn Cài Đặt, Vận Hành & Kiểm Thử

### 1. Cài đặt phụ thuộc & khởi tạo Database

```powershell
cd core-api
npm install
npm run db:up                # Khởi chạy PostgreSQL container ở cổng 5433
npx prisma db push           # Đồng bộ schema xuống PostgreSQL
npm run db:seed              # Tạo tài khoản Admin từ biến môi trường .env
npm run db:seed:properties   # Nạp dữ liệu chuẩn 2 tòa nhà (14B8 & 14B9 Ngô Tất Tố)
```

> Khi chạy Docker Production (`Dockerfile`), container thực thi `npx prisma db push && node dist/prisma/bootstrap-prod.js && node dist/main.js` để tự động đồng bộ schema và khởi tạo dữ liệu ban đầu một lần duy nhất nếu DB đang trống.

### 2. Chạy Server

```powershell
npm run start:dev     # Chế độ phát triển (watch)
npm run build         # prisma generate && nest build
npm run start:prod    # Chạy bản build dist/main.js
```

### 3. Kiểm thử & Linter

```powershell
npm run test          # Chạy toàn bộ 137 Unit Tests (10 test files - Vitest)
npm run test:e2e      # Chạy E2E Tests (yêu cầu PostgreSQL đang chạy ở port 5433)
npm run lint          # Kiểm tra mã nguồn với Oxlint
```
