-- Migration: v2_monthly_quota_process_scope
-- Gộp toàn bộ thay đổi schema đợt cải tiến v2 vào 1 migration duy nhất.
-- Tất cả câu lệnh là idempotent (IF NOT EXISTS / DO block) để tránh lỗi khi deploy lại.

-- =========================================================
-- 1. ProductionSchedule — thêm processId
-- =========================================================
ALTER TABLE "production_schedules" ADD COLUMN IF NOT EXISTS "processId" INTEGER;

DO $$ BEGIN
  ALTER TABLE "production_schedules"
    ADD CONSTRAINT "production_schedules_processId_fkey"
    FOREIGN KEY ("processId") REFERENCES "processes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- 2. MonthlyQuota — thêm factoryId + processId
--    (bảng đã tồn tại từ migration 20260526100220)
-- =========================================================
ALTER TABLE "monthly_quotas" ADD COLUMN IF NOT EXISTS "factoryId" INTEGER;
ALTER TABLE "monthly_quotas" ADD COLUMN IF NOT EXISTS "processId" INTEGER;

-- Xóa unique constraint cũ (chỉ salesOrderItemId + yearMonth)
DROP INDEX IF EXISTS "monthly_quotas_salesOrderItemId_yearMonth_key";

-- Xóa index cũ (yearMonth đơn)
DROP INDEX IF EXISTS "monthly_quotas_yearMonth_idx";

-- Tạo unique constraint mới (bao gồm factory + process)
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_quotas_salesOrderItemId_factoryId_processId_yearMonth_key"
  ON "monthly_quotas"("salesOrderItemId", "factoryId", "processId", "yearMonth");

-- Tạo composite index mới
CREATE INDEX IF NOT EXISTS "monthly_quotas_factoryId_processId_yearMonth_idx"
  ON "monthly_quotas"("factoryId", "processId", "yearMonth");

-- FK: monthly_quotas → factories
DO $$ BEGIN
  ALTER TABLE "monthly_quotas"
    ADD CONSTRAINT "monthly_quotas_factoryId_fkey"
    FOREIGN KEY ("factoryId") REFERENCES "factories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FK: monthly_quotas → processes
DO $$ BEGIN
  ALTER TABLE "monthly_quotas"
    ADD CONSTRAINT "monthly_quotas_processId_fkey"
    FOREIGN KEY ("processId") REFERENCES "processes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
