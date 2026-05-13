# TASK: Sửa trang quản lý lô hàng — bỏ liên kết mặt hàng

## Lý do

Lô nguyên liệu (bông/xơ) không gắn với mặt hàng cụ thể — cùng 1 lô bông có thể dùng cho nhiều mặt hàng khác nhau. Mặt hàng đã được xác định ở bảng điều phối máy (Machine.currentItemId) và ProductionLog.itemId, không cần lưu thêm trên Lot.

## Cần sửa

### 1. UI trang `/lots/page.tsx`:

- Bỏ trường chọn mặt hàng (itemId) khỏi form tạo/sửa lô
- Bỏ cột "Mặt hàng" khỏi bảng danh sách lô
- Giữ nguyên: lotNumber, lotType, factoryId, salesOrderItemId, status, note, rawLotIds

### 2. API `/api/lots/route.ts` (POST):

- Không gửi itemId khi tạo lô nữa

### 3. API `/api/lots/[id]/route.ts` (PUT):

- Bỏ xử lý itemId trong update

### 4. Schema: KHÔNG SỬA — giữ `itemId Int?` nullable trên model Lot, không cần migrate.

## Không đụng

- Machine.currentLotId — giữ nguyên
- ProductionLog.lotId — giữ nguyên
- LotMaterialLink — giữ nguyên
- Allocation engine — không đụng
