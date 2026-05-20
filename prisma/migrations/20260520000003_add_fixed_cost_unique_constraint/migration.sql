-- CreateIndex: Add unique constraint for FixedCostEntry upsert
-- This constraint was declared in schema.prisma but never created in DB
-- Fixes PostgreSQL error 42P10: ON CONFLICT requires a unique constraint

-- Remove duplicates first (keep lowest id per group)
DELETE FROM "fixed_cost_entries" a
USING "fixed_cost_entries" b
WHERE a."factoryId" = b."factoryId"
  AND a."yearMonth" = b."yearMonth"
  AND a."costType" = b."costType"
  AND a.id > b.id;

-- Create the unique index (IF NOT EXISTS to handle both local and production)
CREATE UNIQUE INDEX IF NOT EXISTS "fixed_cost_factory_month_type"
ON "fixed_cost_entries" ("factoryId", "yearMonth", "costType");
