-- AlterTable
ALTER TABLE "machines" ADD COLUMN "model" TEXT;

-- CreateTable
CREATE TABLE "production_schedules" (
    "id" SERIAL NOT NULL,
    "factoryId" INTEGER NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "holidays" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "production_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_segments" (
    "id" SERIAL NOT NULL,
    "scheduleId" INTEGER NOT NULL,
    "machineId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "fromDay" INTEGER NOT NULL,
    "toDay" INTEGER NOT NULL,
    "kgPerDay" DOUBLE PRECISION NOT NULL,
    "benchmarkId" INTEGER,
    "isManualKg" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "schedule_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_schedules_factoryId_idx" ON "production_schedules"("factoryId");

-- CreateIndex
CREATE UNIQUE INDEX "production_schedules_factoryId_yearMonth_key" ON "production_schedules"("factoryId", "yearMonth");

-- CreateIndex
CREATE INDEX "schedule_segments_scheduleId_idx" ON "schedule_segments"("scheduleId");

-- CreateIndex
CREATE INDEX "schedule_segments_machineId_idx" ON "schedule_segments"("machineId");

-- CreateIndex
CREATE INDEX "schedule_segments_itemId_idx" ON "schedule_segments"("itemId");

-- AddForeignKey
ALTER TABLE "production_schedules" ADD CONSTRAINT "production_schedules_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_segments" ADD CONSTRAINT "schedule_segments_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "production_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_segments" ADD CONSTRAINT "schedule_segments_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_segments" ADD CONSTRAINT "schedule_segments_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;