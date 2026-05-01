File: src/app/api/kdsx/production-schedule/[id]/actual/route.ts
Sửa cách tạo startDate và endDate để tránh lỗi timezone:
typescript// CŨ:
const startDate = new Date(year, month - 1, 1);
const endDate = new Date(year, month, 0);

// MỚI:
const lastDay = new Date(year, month, 0).getDate();
const startDate = new Date(`${yearMonth}-01T00:00:00.000Z`);
const endDate = new Date(`${yearMonth}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`);
Và sửa cách lấy ngày từ recordDate để dùng UTC:
typescript// CŨ: dùng local timezone
const day = new Date(row.recordDate).getDate();

// MỚI: dùng UTC
const day = new Date(row.recordDate).getUTCDate();
Sửa tất cả chỗ có new Date(row.recordDate).getDate() trong file thành .getUTCDate().

Chỉ sửa 3 dòng trong 1 file. Lỗi này có thể ảnh hưởng đến tất cả các API khác dùng date query tương tự — sau khi fix file này, nên kiểm tra các file API khác có cùng pattern new Date(year, month, 0) và .getDate() không.
