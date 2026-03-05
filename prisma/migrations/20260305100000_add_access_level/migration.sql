-- AlterTable: Add accessLevel column to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "accessLevel" TEXT NOT NULL DEFAULT 'READ_ONLY';

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "items_name_key" ON "items"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "machines_name_key" ON "machines"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "production_logs_machineId_recordDate_shift_key" ON "production_logs"("machineId", "recordDate", "shift");
