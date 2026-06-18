ALTER TABLE "machine_item_assignments"
  ADD COLUMN IF NOT EXISTS "sourceProcessId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'machine_item_assignments_sourceProcessId_fkey'
  ) THEN
    ALTER TABLE "machine_item_assignments"
      ADD CONSTRAINT "machine_item_assignments_sourceProcessId_fkey"
      FOREIGN KEY ("sourceProcessId") REFERENCES "processes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_assignments_source_process"
  ON "machine_item_assignments"("sourceProcessId");
