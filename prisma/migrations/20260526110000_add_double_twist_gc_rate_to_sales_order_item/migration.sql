-- AlterTable: Add doubleTwistGcRate to sales_order_items
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "doubleTwistGcRate" DOUBLE PRECISION;
