-- Add new columns
ALTER TABLE "production_schedules" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "production_schedules" ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- Existing schedules: mark all as primary (each month had at most one)
UPDATE "production_schedules" SET "isPrimary" = true;

-- Drop old unique constraint (factoryId, yearMonth)
ALTER TABLE "production_schedules" DROP CONSTRAINT IF EXISTS "production_schedules_factoryId_yearMonth_key";

-- Add new unique constraint (factoryId, yearMonth, name)
ALTER TABLE "production_schedules" ADD CONSTRAINT "production_schedules_factoryId_yearMonth_name_key"
  UNIQUE ("factoryId", "yearMonth", "name");
