Plan: Hỗ trợ chuyển đổi mặt hàng trong ca (Sub-row cho máy đổi mặt hàng)
Context
Trong thực tế sản xuất, một máy có thể sản xuất hai mặt hàng khác nhau trong cùng một ca (ví dụ: đổi sợi giữa ca). Khi đó cần ghi 2 bản ghi production_logs cho cùng máy+ngày+ca nhưng khác itemId. Trang daily-input-grid hiện chỉ cho phép 1 bản ghi/máy. Cần hỗ trợ thêm "dòng phụ" cho máy đổi mặt hàng.
Ràng buộc kỹ thuật:
Unique constraint: (machineId, recordDate, shift, itemId) — cho phép nhiều log/máy nếu khác itemId
daily-status API hiện trả về todayLog là 1 object duy nhất (dùng take: 1)
daily-input POST UPSERT hỗ trợ đúng constraint trên — không cần thay đổi

Approach
Bước 1: Sửa API daily-status — trả về todayLogs (mảng)
File: src/app/api/production/daily-status/route.ts
Xóa take: 1 trong query productionLogs
Thêm field todayLogs: m.productionLogs (array) vào response bên cạnh todayLog hiện tại (để backward-compatible với card page và các page khác đang dùng todayLog)
// Thay đổi trong include:
productionLogs: {
where: { recordDate: dateObj, shift },
include: { item: { select: { id: true, name: true } } },
// Bỏ take: 1
},

// Trong return map:
todayLog: m.productionLogs[0] ?? null, // giữ lại cho backward compat
todayLogs: m.productionLogs, // thêm mới — mảng đầy đủ

Bước 2: Sửa RowData interface
File: src/app/production/daily-input-grid/page.tsx
Thêm 2 trường:
interface RowData {
// ... existing fields ...
rowKey: string; // unique stable key (UUID-like) để làm rowKey của Table
isSubRow?: boolean; // true = dòng phụ (máy đổi mặt hàng)
}

Bước 3: Sửa handleLoad — build sub-rows từ todayLogs
Thay vì dùng m.todayLog (1 log), dùng m.todayLogs (mảng):
Với mỗi machine m:

- Log đầu tiên (index 0): primary row — logic giữ nguyên như cũ
- Log thứ 2 trở đi (index 1+): tạo sub-row với isSubRow=true

Với máy chưa có log:

- 1 primary row với itemId từ currentItem (logic giữ nguyên)

rowKey được sinh bằng crypto.randomUUID() hoặc Date.now() + Math.random().
Bước 4: Thêm handleAddSubRow(rowIdx) và handleRemoveSubRow(rowIdx)
handleAddSubRow:
Tìm vị trí insert: sau dòng cuối cùng có cùng machineId
Insert sub-row mới với isSubRow=true, itemId=0, existingLogId=undefined, isDirty=false, copy machineId/machineName/formulaType/spindleCount từ row gốc
startIndex=0, endIndex=null
handleRemoveSubRow:
Nếu sub-row chưa lưu (!existingLogId): xóa khỏi rows array trực tiếp (không cần API)
Nếu đã lưu (existingLogId có giá trị): gọi DELETE API rồi xóa khỏi rows
Bước 5: Sửa các cột trong Table
Cột "#" (số thứ tự):
Primary row: đánh số theo thứ tự máy (không đếm sub-rows)
Sub-row: hiển thị ↳ thay vì số
Cột "Máy":
Primary row: giữ nguyên <b>tên máy</b>
Sub-row: hiển thị <span style={{ color: "#bbb", fontSize: 12 }}>↳ {machineName}</span>
Cột action cuối (thêm nút "+"):
Với primary row (không phải sub-row) và không phải isReadOnly: hiển thị nút <PlusOutlined /> có tooltip "Thêm dòng mặt hàng khác"
Với sub-row chưa lưu: hiển thị nút <CloseOutlined /> (xóa sub-row mới thêm, không cần popconfirm)
Với sub-row đã lưu + canDelete: hiển thị <DeleteOutlined /> như hiện tại
Cột "Chỉ số TRƯỚC":
Sub-row cũng cho phép sửa (vì start index của mặt hàng thứ 2 có thể khác 0)
Bước 6: Sửa rowKey của Table
Thay rowKey={(r, i) => \${r.machineId}-${i}`} thành rowKey={r => r.rowKey} (dùng stable key thêm vào RowData).
Bước 7: Sửa handleSave — không cần đổi logic
Logic save đã đúng: mỗi row (kể cả sub-row) gọi POST độc lập với itemId riêng → UPSERT constraint (machineId, recordDate, shift, itemId) tự xử lý.
Chỉ cần đảm bảo reset isDirty và originalItemId đúng sau khi save.

Files cần sửa
File
Thay đổi
src/app/api/production/daily-status/route.ts
Bỏ take: 1, thêm todayLogs array vào response
src/app/production/daily-input-grid/page.tsx
Sửa RowData, handleLoad, handleAddSubRow, handleRemoveSubRow, columns, rowKey

Verification
Tải danh sách máy cho một ca → kiểm tra primary rows hiển thị đúng
Bấm "+" trên một máy → kiểm tra sub-row xuất hiện bên dưới với tên máy mờ, ô "Chỉ số SAU" bị khóa (vì itemId=0)
Chọn mặt hàng cho sub-row → kiểm tra ô nhập liệu mở khóa
Nhập chỉ số SAU cho sub-row → kiểm tra SL(kg) tính đúng
Bấm "Lưu tất cả" → kiểm tra DB có 2 bản ghi production_logs cho cùng máy+ngày+ca nhưng khác itemId
Tải lại trang → kiểm tra cả 2 dòng (primary + sub-row) hiển thị đúng
Xóa sub-row chưa lưu (nút ×) → sub-row biến mất, không gọi API
Xóa sub-row đã lưu (nút 🗑) → gọi DELETE, sub-row biến mất
Câu hỏi rất quan trọng — plan hiện tại chưa xử lý đầy đủ cho trường hợp này. Để tôi phân tích:
Hai loại máy & vấn đề sub-row
Máy type 1 (sản lượng trực tiếp kg):
Primary row: nhập thẳng kg → OK
Sub-row (đổi MH): cũng nhập thẳng kg → OK, không vấn đề gì
Máy type 2/3/4 (cộng dồn: output = chỉ số SAU − TRƯỚC):
Primary row: startIndex = endIndex ca trước, nhập endIndex mới → OK
Sub-row (đổi MH giữa ca): Gap trong plan hiện tại
Mặt hàng thứ 1: startIndex = cuối ca trước → endIndex = thời điểm chuyển MH
Mặt hàng thứ 2: startIndex phải bằng endIndex của MH thứ 1 (thời điểm chuyển)
Nhưng plan hiện tại mặc định startIndex = 0 cho sub-row → sai với máy cộng dồn
Đề xuất cải thiện
Khi bấm "+" để thêm sub-row trên máy type 2/3/4:
Tự động lấy startIndex = endIndex của primary row (nếu đã nhập), thay vì để 0
Nếu primary row chưa có endIndex → để 0 và user tự điền
Điều này đảm bảo: SL_MH1 = endIndex_1 - startIndex_1 và SL_MH2 = endIndex_2 - endIndex_1, tổng 2 mặt hàng khớp với số đếm thực tế của máy.
Bạn muốn tôi cập nhật plan và triển khai theo hướng này không?
