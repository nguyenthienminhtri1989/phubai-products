# Hãy đọc code của trang src\components\kdsx\ActualProductionGrid.tsx

# Hiện tại, mỗi một máy là 1 dòng, cột đầu tiên là tên máy, cột thứ 2 là tên mặt hàng, các cột tiếp theo là những ngày trong tháng, mỗi một ô sẽ điền giá trị sản lượng của máy đó sản xuất được trong ngày với mặt hàng đã gán

# Theo như cấu trúc hiện tại thì với những máy chạy 2 loại mặt hàng, ví dụ máy 1 chạy mặt hàng A từ ngày 1-15 và mặt hàng B từ ngày 16-31 thì vẫn đang hiển thị trên cùng 1 dòng, bây giờ tôi muốn tách ra thành 2 dòng, mỗi dòng là 1 mặt hàng, ví dụ:

# Máy 1 - Mặt hàng A 1-15 có điền giá trị, 16-31 để trống

# Máy 1 - Mặt hàng B 16-31 có điền giá trị, 1-15 để trống

# Tương tự như vậy với những máy chạy 3 loại mặt hàng, ví dụ máy 1 chạy mặt hàng A từ ngày 1-10, mặt hàng B từ ngày 11-20 và mặt hàng C từ ngày 21-31 thì sẽ hiển thị trên 3 dòng, mỗi dòng là 1 mặt hàng

# Các thông tin trong mỗi ô sản lượng vẫn giữ như cũ
