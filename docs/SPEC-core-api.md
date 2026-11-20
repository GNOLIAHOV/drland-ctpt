# Spec: core-api (Quản lý Bất động sản & Dịch vụ)

## Objective
Xây dựng RESTful API lõi phục vụ hệ thống quản lý phòng trọ và mặt bằng kinh doanh.

## Tech Stack
- Framework: NestJS (TypeScript)
- Database: PostgreSQL với Prisma ORM
- Môi trường: Docker Desktop

## Commands
- Khởi chạy Dev: npm run start:dev
- Build: npm run build
- Áp dụng Schema DB: npx prisma db push
- Test Unit: npm run test

## Project Structure
src/
  ├── auth/           # Xác thực JWT (chỉ dành cho Admin)
  ├── properties/     # Logic quản lý mặt bằng, giá cả, trạng thái
  ├── billing/        # Xử lý chỉ số điện nước & hóa đơn tổng
  ├── bookings/       # Endpoint nhận Booking Request từ AI Agent
  ├── notifications/  # Tích hợp gửi email thông báo
  └── prisma/         # Chứa schema.prisma định nghĩa các bảng

## Boundaries
- Always: Phân quyền chặt chẽ các route bằng JWT Guard của Admin.
- Ask first: Trước khi thay đổi cấu trúc quan hệ giữa các bảng trong schema.prisma.
- Never: Cấp quyền cho AI Agent sử dụng các phương thức PATCH/PUT/DELETE trên resource của phòng.

## Success Criteria
- Hệ thống khởi chạy thành công qua Docker.
- Admin có thể đăng nhập, thực hiện CRUD phòng và cập nhật trạng thái "Sắp trống".
- API mở đúng một endpoint giới hạn (Rate-limited) để AI đẩy Booking Request.
- Tự động gửi email thông báo ngay khi có Booking Request mới.