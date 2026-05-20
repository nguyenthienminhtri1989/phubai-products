-- AddColumn: lotId to machine_item_assignments
ALTER TABLE "machine_item_assignments" ADD COLUMN IF NOT EXISTS "lotId" INTEGER;

-- AddForeignKey: machine_item_assignments.lotId -> lots.id
ALTER TABLE "machine_item_assignments"
  ADD CONSTRAINT "machine_item_assignments_lotId_fkey"
  FOREIGN KEY ("lotId") REFERENCES "lots"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- AddColumn: lotId to kd_daily_inputs
ALTER TABLE "kd_daily_inputs" ADD COLUMN IF NOT EXISTS "lotId" INTEGER;

-- AddForeignKey: kd_daily_inputs.lotId -> lots.id
ALTER TABLE "kd_daily_inputs"
  ADD CONSTRAINT "kd_daily_inputs_lotId_fkey"
  FOREIGN KEY ("lotId") REFERENCES "lots"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;
