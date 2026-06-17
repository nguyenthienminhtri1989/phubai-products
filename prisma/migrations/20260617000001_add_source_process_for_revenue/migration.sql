-- Add revenue source process axis for winding production logs.
-- Strictly additive: nullable columns, foreign keys, and indexes only.

ALTER TABLE "processes"
  ADD COLUMN IF NOT EXISTS "revenueFactoryId" INTEGER;

ALTER TABLE "machines"
  ADD COLUMN IF NOT EXISTS "currentSourceProcessId" INTEGER;

ALTER TABLE "production_logs"
  ADD COLUMN IF NOT EXISTS "sourceProcessId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'processes_revenueFactoryId_fkey'
  ) THEN
    ALTER TABLE "processes"
      ADD CONSTRAINT "processes_revenueFactoryId_fkey"
      FOREIGN KEY ("revenueFactoryId") REFERENCES "factories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'machines_currentSourceProcessId_fkey'
  ) THEN
    ALTER TABLE "machines"
      ADD CONSTRAINT "machines_currentSourceProcessId_fkey"
      FOREIGN KEY ("currentSourceProcessId") REFERENCES "processes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_logs_sourceProcessId_fkey'
  ) THEN
    ALTER TABLE "production_logs"
      ADD CONSTRAINT "production_logs_sourceProcessId_fkey"
      FOREIGN KEY ("sourceProcessId") REFERENCES "processes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_machines_source_process"
  ON "machines"("currentSourceProcessId");

CREATE INDEX IF NOT EXISTS "idx_production_logs_source_process"
  ON "production_logs"("sourceProcessId");

CREATE INDEX IF NOT EXISTS "idx_processes_revenue_factory"
  ON "processes"("revenueFactoryId");
