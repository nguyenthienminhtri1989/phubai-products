-- AlterTable: Cho phép nhiều mặt hàng trong cùng 1 ca (đổi hàng giữa ca)
-- Xóa ràng buộc cũ: (machineId, recordDate, shift)
DROP INDEX IF EXISTS "production_logs_machineId_recordDate_shift_key";

-- Tạo ràng buộc mới: (machineId, recordDate, shift, itemId)
CREATE UNIQUE INDEX "production_logs_machineId_recordDate_shift_itemId_key"
ON "production_logs"("machineId", "recordDate", "shift", "itemId");
