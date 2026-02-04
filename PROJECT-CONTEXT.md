# HỒ SƠ DỰ ÁN: PHU BAI ERP (Sợi Phú Bài)

## 1. Công nghệ sử dụng (Tech Stack)
- **Framework:** Next.js 16 (App Router)
- **Database:** PostgreSQL + Prisma ORM
- **UI Library:** Ant Design (v5/v6)
- **Authentication:** NextAuth.js v5 (Beta) - Dùng file `auth.ts`, `auth.config.ts`.
- **Styling:** CSS-in-JS (Antd Style) + TailwindCSS (optional).

## 2. Quy tắc Nghiệp vụ Quan trọng (Business Logic)

### A. Thời gian & Ca máy
- **Ca 1:** 06:00 - 14:00 (Thuộc ngày hiện tại).
- **Ca 2:** 14:00 - 22:00 (Thuộc ngày hiện tại).
- **Ca 3:** 22:00 - 06:00 sáng hôm sau (Được tính là Ca 3 của ngày hôm trước).
- **Quy tắc nhập liệu:** Cho phép chốt chỉ số sớm 1 tiếng (VD: 05:00 sáng đã có thể chốt cho Ca 3 hôm qua).

### B. Công thức tính Sản lượng
- **Loại 1 (Máy nén/Thô):** Sản lượng = Chỉ số Sau.
- **Loại 2 (Trừ lùi):** Sản lượng = Chỉ số Sau - Chỉ số Trước.
- **Loại 3 (Sợi con/Ống):** Có công thức phức tạp dựa trên (Delta * Số cọc) / (Chi số * Hệ số).
- **Loại 4:** (Delta / Chi số).
- **Xử lý sự cố:** Có tính năng "Reset đồng hồ" (IsReset) khi thay đồng hồ hoặc tua về 0.

### C. Phân quyền (Authorization)
- **Admin:** Toàn quyền (Duyệt user, Quản lý máy, Sửa xóa tất cả).
- **Manager:** Quản lý trong phạm vi Công đoạn (Process) của mình.
- **Operator:** Chỉ nhập liệu, không được xóa.
- **Cấu trúc User:** Mỗi User gắn với 1 `processId` cụ thể (hoặc null nếu là Admin).

## 3. Cấu trúc thư mục (App Router)
- `src/app`: Chứa các trang giao diện.
- `src/auth.ts` & `src/auth.config.ts`: Cấu hình đăng nhập v5.
- `src/lib/prisma.ts`: Kết nối DB singleton.
- `src/components/AdminLayout.tsx`: Layout chính, menu bên trái.

## 4. Tình trạng hiện tại
- Đã hoàn thành: Đăng nhập/Đăng ký, Phân quyền User, CRUD Máy móc, Nhập sản lượng hàng ngày.
- Đang phát triển: Báo cáo, Biểu đồ.