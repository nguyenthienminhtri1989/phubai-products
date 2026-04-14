Chúng ta nên thiết kế phân quyền cho từng user theo hướng sau:
Trong nhà máy có các role như:

- Tổng và phó tổng giám đốc (xem mọi dữ liệu của phần mềm, có thể chỉnh sửa được dữ liệu của một số trang được gán)
- Giám đốc nhà máy (3 giám đốc quản lý 3 nhà máy khác nhau, xem và sửa được toàn bộ dữ liệu trong nhà máy của mình, nhưng chỉ có thể xem dữ liệu của nhà máy khác chứ không sửa được dữ liệu của nhà máy khác, có thể xem thêm những trang được gán, chẳng hạn như những trang của phòng kinh doanh)
- Phòng kinh doanh: xem và chỉnh sửa được dữ liệu của module kinh doanh (có thể xem và chỉnh sửa được dữ liệu ở những trang được gán, chẳng hạn xem dữ liệu sản xuất của nhà máy)
- Trưởng công đoạn (mỗi người quản lý một công đoạn của mình, có thể xem và chỉnh sửa được dữ liệu ở công đoạn mình quản lý nhưng chỉ có thể xem và không chỉnh sửa được dữ liệu ở các công đoạn khác)
- Người thống kê (có thể nhập liệu hoặc xem dữ liệu sản lượng, điện năng cho nhà máy mình được phân công)
- Tổ trưởng, chỉ có thể nhập liệu và xem được dữ liệu mà mình nhập ở công đoạn của mình
  Cần linh hoạt có 1 bảng để chọn user nào được xem trang nào? Được chỉnh sửa trang nào cho thuận tiện thay đổi
