-- Migration: remove_spindle_range_from_assignment
-- Xóa 2 field fromSpindle / toSpindle khỏi machine_item_assignments (dữ liệu không cần thiết).
-- Giữ nguyên Machine.spindleCount (field khác, vẫn dùng để tính sản lượng).

ALTER TABLE "machine_item_assignments" DROP COLUMN IF EXISTS "fromSpindle";
ALTER TABLE "machine_item_assignments" DROP COLUMN IF EXISTS "toSpindle";
