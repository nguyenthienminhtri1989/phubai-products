-- AlterTable: Add isAutoQty to plan_line_items
ALTER TABLE "plan_line_items" ADD COLUMN IF NOT EXISTS "isAutoQty" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add isAutoQty and isAdHoc to actual_line_items
ALTER TABLE "actual_line_items" ADD COLUMN IF NOT EXISTS "isAutoQty" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "actual_line_items" ADD COLUMN IF NOT EXISTS "isAdHoc" BOOLEAN NOT NULL DEFAULT false;
