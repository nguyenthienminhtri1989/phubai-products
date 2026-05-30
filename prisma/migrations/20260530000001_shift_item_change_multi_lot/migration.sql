-- Migration: shift_item_change_multi_lot
-- Cho phép 1 máy chạy cùng 1 mặt hàng từ 2 lô khác nhau (case NM1 chạy giùm NM2).
-- Thay unique constraint 4 cột bằng 2 partial unique index cho cả production_logs
-- và machine_item_assignments.

-- 1. ProductionLog: xóa unique cũ, tạo 2 partial unique index
DROP INDEX IF EXISTS "production_logs_machineId_recordDate_shift_itemId_key";
ALTER TABLE "production_logs"
  DROP CONSTRAINT IF EXISTS "production_logs_machineId_recordDate_shift_itemId_key";

-- Khi log CÓ lô: unique theo 5 cột (cho phép cùng máy/ngày/ca/item khác lô)
CREATE UNIQUE INDEX IF NOT EXISTS "prod_log_unique_with_lot"
  ON "production_logs" ("machineId", "recordDate", "shift", "itemId", "lotId")
  WHERE "lotId" IS NOT NULL;

-- Khi log KHÔNG có lô: unique theo 4 cột (chống dup âm thầm khi lotId NULL)
CREATE UNIQUE INDEX IF NOT EXISTS "prod_log_unique_no_lot"
  ON "production_logs" ("machineId", "recordDate", "shift", "itemId")
  WHERE "lotId" IS NULL;

-- 2. MachineItemAssignment: tương tự
DROP INDEX IF EXISTS "machine_item_assignments_machineId_itemId_key";
ALTER TABLE "machine_item_assignments"
  DROP CONSTRAINT IF EXISTS "machine_item_assignments_machineId_itemId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "machine_assignment_unique_with_lot"
  ON "machine_item_assignments" ("machineId", "itemId", "lotId")
  WHERE "lotId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "machine_assignment_unique_no_lot"
  ON "machine_item_assignments" ("machineId", "itemId")
  WHERE "lotId" IS NULL;
