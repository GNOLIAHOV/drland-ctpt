# Spec: admin-dashboard (Hệ thống Quản trị Bất động sản)

## Objective
Xây dựng giao diện web (SPA) dành cho Chủ nhà/Admin để quản lý phòng, theo dõi hóa đơn và duyệt các yêu cầu đặt lịch xem phòng từ AI.

## Tech Stack
- Core: React 18, TypeScript, Vite
- Styling: Tailwind CSS, Lucide React (Icons)
- Routing: React Router v6
- State Management / API: Zustand (tùy chọn) & Axios
- Port mặc định: 5173

## Architecture & Boundaries
- **Xác thực:** Lưu JWT token vào `localStorage`. Sử dụng Axios Interceptor để tự động đính kèm header `Authorization: Bearer <token>` vào mọi request (trừ route `/auth/login`).
- Nếu API trả về lỗi 401 (Hết hạn token), tự động xóa token và chuyển hướng về trang Đăng nhập.
- **Giao tiếp:** Gọi API trực tiếp xuống `core-api` tại `http://localhost:3001`.
