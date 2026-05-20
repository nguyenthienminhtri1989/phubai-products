-- AlterTable: Make factoryId and yearMonth NOT NULL on fixed_cost_entries
-- This fixes PostgreSQL error 42P10: ON CONFLICT requires NOT NULL columns
-- Pre-check confirmed 0 NULL records exist (14 total, 0 null_factory, 0 null_month)

ALTER TABLE "fixed_cost_entries" ALTER COLUMN "factoryId" SET NOT NULL;
ALTER TABLE "fixed_cost_entries" ALTER COLUMN "yearMonth" SET NOT NULL;
