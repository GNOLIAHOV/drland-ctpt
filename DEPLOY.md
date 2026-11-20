# Hướng Dẫn Triển Khai & Vận Hành Thực Tế (Production Deployment Guide)

Tài liệu này tổng hợp cách triển khai và vận hành hệ thống **DRLAND (CTPT)** ở cả hai môi trường: **Cloud Railway (đang chạy 24/7)** và **VPS Linux với Docker Compose**.

---

## 1. Triển Khai Hiện Hành Trên Railway Cloud (`drland-ctpt`)

Toàn bộ 5 dịch vụ đang chạy trên Railway (`Postgres`, `core-api`, `ai-booking-agent`, `client-chat-ui`, `admin-dashboard`):

- **Trang Khách Thuê:** `https://client-chat-ui-production.up.railway.app`
- **Trang Quản Trị:** `https://admin-dashboard-production-df3d6636.up.railway.app`
- **Core API:** `https://core-api-production-c5118cb8.up.railway.app`
- **AI Booking Agent:** `https://ai-booking-agent-production-c251525f.up.railway.app`

### Cập nhật mã nguồn lên Railway sau khi chỉnh sửa code
Tại từng thư mục dịch vụ cần cập nhật (đã đăng nhập `railway login`), chạy:
```powershell
# Cập nhật Backend Core API
cd core-api
railway up -d -y -p a9cb8a29-7165-4aba-927a-afc2313a2f22 -e 626e9661-0688-43a8-bc5e-0551934d122e -s a9b50c57-34a5-4ca6-bcff-072314ffd22a

# Cập nhật AI Booking Agent
cd ..\ai-booking-agent
railway up -d -y -p a9cb8a29-7165-4aba-927a-afc2313a2f22 -e 626e9661-0688-43a8-bc5e-0551934d122e -s 62d4ddb4-0704-495b-b7ae-0e809145d4da

# Cập nhật Trang Khách Thuê
cd ..\client-chat-ui
railway up -d -y -p a9cb8a29-7165-4aba-927a-afc2313a2f22 -e 626e9661-0688-43a8-bc5e-0551934d122e -s f8c69b0f-a6fb-4251-95a1-87f0ac9ea74d

# Cập nhật Trang Quản Trị
cd ..\admin-dashboard
railway up -d -y -p a9cb8a29-7165-4aba-927a-afc2313a2f22 -e 626e9661-0688-43a8-bc5e-0551934d122e -s 6ea30638-d706-4e50-8285-14aa523ef1cc
```

*(Lưu ý về ảnh phòng tải lên trực tiếp từ máy tính: mặc định PostgreSQL đã có Volume bền vững `postgres-volume`; nếu sau này bạn dùng nhiều tính năng upload ảnh file nội bộ lên `core-api` thay vì dán link ảnh ngoài, hãy gắn thêm một Railway Volume trỏ vào `/app/uploads/properties` trên service `core-api`.)*

---

## 2. Chuẩn Bị Biến Môi Trường Cho VPS / Docker Compose

Khi tự triển khai lên VPS riêng, sao chép các file `.env.example` thành `.env` và điền thông tin thật:

1. **Backend (`core-api/.env`):**
   - `POSTGRES_PASSWORD` & `DATABASE_URL`: Đặt mật khẩu mạnh cho PostgreSQL.
   - `JWT_SECRET`: Sinh chuỗi ngẫu nhiên tối thiểu 48 ký tự bằng lệnh:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
     ```
   - `ADMIN_EMAIL` & `ADMIN_PASSWORD`: Thiết lập tài khoản chủ nhà ban đầu (tối thiểu 8 ký tự).
   - `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`: Dùng **Gmail App Password** (16 ký tự) để nhận email báo ngay khi có khách đặt lịch xem phòng.

2. **AI Booking Agent (`ai-booking-agent/.env`):**
   - `GEMINI_API_KEY`: API key Google AI Studio (khuyến nghị gói Pay-as-you-go).

3. **Giao diện Web (`admin-dashboard/.env` & `client-chat-ui/.env`):**
   - Truyền URL công khai qua biến môi trường hoặc build args `PUBLIC_CORE_API_URL`, `PUBLIC_AI_AGENT_URL`, `PUBLIC_CLIENT_URL`.

---

## 3. Chạy Toàn Bộ Hệ Thống Bằng Docker Compose (VPS / Production)

```bash
# Build và khởi chạy toàn bộ 5 dịch vụ
docker compose --profile prod up -d --build
```
Container `core-api` sẽ tự động đồng bộ schema (`npx prisma db push`), tạo tài khoản Admin (nếu chưa có) và nạp dữ liệu 2 tòa nhà (`14B8` & `14B9 Ngô Tất Tố`) nếu cơ sở dữ liệu còn trống.

---

## 4. Sao Lưu & Khôi Phục Dữ Liệu (Backup & Restore)

### Sao lưu trên Windows (Local Docker DB)
```powershell
npm run db:backup
```
File `.sql` lưu vào `backups/` và tự động dọn các bản sao lưu cũ hơn 30 ngày.

### Sao lưu định kỳ trên Linux VPS (Cronjob 02:00 sáng)
```bash
chmod +x scripts/backup-db.sh
0 2 * * * /duong-dan-toi-du-an/scripts/backup-db.sh >> /var/log/drland-backup.log 2>&1
```

### Khôi phục dữ liệu
```bash
docker exec -i core-api-postgres psql -U postgres -d core_api < backups/core_api_YYYYMMDD_HHMMSS.sql
```

---

## 5. Checklist Bàn Giao Cho Chủ Nhà / Quản Lý

1. Đăng nhập Trang Quản Trị (`/login`) và đổi mật khẩu cá nhân trong mục **Cài đặt -> Đổi mật khẩu quản trị**.
2. Kiểm tra tab **Thông tin liên hệ** trong **Cài đặt**: cập nhật Tên thương hiệu, Hotline, Số Zalo nhận tin và Khung giờ xem phòng (tự đồng bộ toàn bộ Website & AI).
3. Vào **Cài đặt -> Tài khoản nhận thanh toán** (hoặc nút **Tài khoản nhận** ở trang Hóa đơn): điền Ngân hàng / ZaloPay, Số tài khoản và Tên chủ tài khoản để sinh mã QR thu tiền phòng chính xác.
4. Khi có khách thuê mới hoặc gia hạn, bấm nút **Hợp đồng** tại **Tòa nhà & Phòng thuê** để xem trước bản **7 điều khoản**, **tải file Word (`.docx` chuẩn OpenXML A4)** hoặc **in PDF**.
