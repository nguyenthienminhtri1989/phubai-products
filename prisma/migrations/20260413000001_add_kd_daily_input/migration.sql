-- ============================================================
-- Migration: add_kd_daily_input
-- Tạo bảng kd_daily_inputs và thêm cột source vào order_allocations
-- ============================================================

-- 1. Thêm cột source vào order_allocations
ALTER TABLE "order_allocations" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'PRODUCTION';

-- 2. Tạo bảng kd_daily_inputs
CREATE TABLE "kd_daily_inputs" (
    "id" SERIAL NOT NULL,
    "machineId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "recordDate" DATE NOT NULL,
    "outputKg" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kd_daily_inputs_pkey" PRIMARY KEY ("id")
);

-- 3. Unique constraint: 1 máy + 1 mặt hàng + 1 ngày = 1 dòng
CREATE UNIQUE INDEX "kd_daily_inputs_machineId_itemId_recordDate_key"
    ON "kd_daily_inputs"("machineId", "itemId", "recordDate");

-- 4. Indexes
CREATE INDEX "kd_daily_inputs_recordDate_idx" ON "kd_daily_inputs"("recordDate");
CREATE INDEX "kd_daily_inputs_machineId_idx" ON "kd_daily_inputs"("machineId");
CREATE INDEX "kd_daily_inputs_itemId_idx" ON "kd_daily_inputs"("itemId");

-- 5. Foreign keys
ALTER TABLE "kd_daily_inputs" ADD CONSTRAINT "kd_daily_inputs_machineId_fkey"
    FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kd_daily_inputs" ADD CONSTRAINT "kd_daily_inputs_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kd_daily_inputs" ADD CONSTRAINT "kd_daily_inputs_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
