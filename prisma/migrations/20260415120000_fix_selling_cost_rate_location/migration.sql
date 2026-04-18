-- Move sellingCostRate from raw_material_rates to sales_order_items
-- NOTE: DB already has sellingCostRate in sales_order_items and removed from raw_material_rates
-- This migration documents the state after manual changes

ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "sellingCostRate" DOUBLE PRECISION;
ALTER TABLE "raw_material_rates" DROP COLUMN IF EXISTS "sellingCostRate";
