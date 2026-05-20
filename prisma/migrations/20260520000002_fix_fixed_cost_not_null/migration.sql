-- AlterTable: Make factoryId and yearMonth NOT NULL on fixed_cost_entries
-- This fixes PostgreSQL error 42P10: ON CONFLICT requires NOT NULL columns
-- Step 1: Backfill NULL values from parent monthly_plans / monthly_actuals

-- Fill from monthly_plans
UPDATE "fixed_cost_entries" fce
SET "factoryId" = mp."factoryId", "yearMonth" = mp."yearMonth"
FROM "monthly_plans" mp
WHERE fce."monthlyPlanId" = mp."id"
  AND (fce."factoryId" IS NULL OR fce."yearMonth" IS NULL);

-- Fill from monthly_actuals
UPDATE "fixed_cost_entries" fce
SET "factoryId" = ma."factoryId", "yearMonth" = ma."yearMonth"
FROM "monthly_actuals" ma
WHERE fce."monthlyActualId" = ma."id"
  AND (fce."factoryId" IS NULL OR fce."yearMonth" IS NULL);

-- Remove orphan records that can't be backfilled (no parent plan/actual)
DELETE FROM "fixed_cost_entries"
WHERE "factoryId" IS NULL OR "yearMonth" IS NULL;

-- Step 2: Set NOT NULL
ALTER TABLE "fixed_cost_entries" ALTER COLUMN "factoryId" SET NOT NULL;
ALTER TABLE "fixed_cost_entries" ALTER COLUMN "yearMonth" SET NOT NULL;
