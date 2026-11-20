@echo off
chcp 65001 > nul
echo ===================================================
echo     DỰ ÁN QUẢN LÝ PHÒNG TRỌ VÀ MẶT BẰNG (CTPT)
echo ===================================================
echo.
echo Đang khởi động toàn bộ hệ thống:
echo 1. Database PostgreSQL (Cổng 5433)
echo 2. Backend Core-API    (Cổng 3001)
echo 3. Trợ lý AI Agent     (Cổng 8000)
echo 4. Admin Dashboard     (Cổng 5173)
echo 5. Giao diện Tìm phòng (Cổng 5174)
echo.

npm run dev
