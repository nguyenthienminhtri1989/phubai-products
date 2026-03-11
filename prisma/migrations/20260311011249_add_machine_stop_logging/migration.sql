/*
  Warnings:

  - You are about to drop the column `ingredient` on the `items` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `items` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `production_logs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "items" DROP COLUMN "ingredient",
DROP COLUMN "type",
ADD COLUMN     "code" TEXT,
ADD COLUMN     "composition" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "material" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "weavingStyle" TEXT;

-- AlterTable
ALTER TABLE "production_logs" ADD COLUMN     "startIndex" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "role" SET DEFAULT 'USER';

-- CreateTable
CREATE TABLE "maintenance_tasks" (
    "id" TEXT NOT NULL,
    "machineId" INTEGER NOT NULL,
    "taskName" TEXT NOT NULL,
    "description" TEXT,
    "intervalMonths" DOUBLE PRECISION NOT NULL,
    "lastPerformedDate" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 30,
    "emailNotify" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceHistory" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "performedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "notes" TEXT,
    "cost" DOUBLE PRECISION DEFAULT 0,

    CONSTRAINT "MaintenanceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electricity_prices" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "electricity_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substations" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "factoryId" INTEGER NOT NULL,

    CONSTRAINT "substations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "power_meters" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" INTEGER NOT NULL DEFAULT 1,
    "tu" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "ti" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "factoryId" INTEGER NOT NULL,
    "substationId" INTEGER,

    CONSTRAINT "power_meters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "power_records" (
    "id" TEXT NOT NULL,
    "recordDate" DATE NOT NULL,
    "meterId" INTEGER NOT NULL,
    "isReset" BOOLEAN NOT NULL DEFAULT false,
    "prevTotal" DOUBLE PRECISION,
    "currTotal" DOUBLE PRECISION,
    "consTotal" DOUBLE PRECISION,
    "prevNormal" DOUBLE PRECISION,
    "currNormal" DOUBLE PRECISION,
    "consNormal" DOUBLE PRECISION,
    "prevPeak" DOUBLE PRECISION,
    "currPeak" DOUBLE PRECISION,
    "consPeak" DOUBLE PRECISION,
    "prevOffPeak" DOUBLE PRECISION,
    "currOffPeak" DOUBLE PRECISION,
    "consOffPeak" DOUBLE PRECISION,
    "costTotal" DOUBLE PRECISION DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "power_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_lines" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "factoryId" INTEGER NOT NULL,
    "routeType" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_line_links" (
    "id" SERIAL NOT NULL,
    "lineId" INTEGER NOT NULL,
    "fromMachineId" INTEGER NOT NULL,
    "toMachineId" INTEGER NOT NULL,
    "stepOrder" INTEGER NOT NULL,

    CONSTRAINT "production_line_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stop_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#ff4d4f',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stop_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_stop_logs" (
    "id" SERIAL NOT NULL,
    "machineId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "description" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "recordDate" DATE NOT NULL,
    "shift" INTEGER,
    "reportedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_stop_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_tasks_machineId_idx" ON "maintenance_tasks"("machineId");

-- CreateIndex
CREATE INDEX "maintenance_tasks_nextDueDate_idx" ON "maintenance_tasks"("nextDueDate");

-- CreateIndex
CREATE INDEX "MaintenanceHistory_taskId_idx" ON "MaintenanceHistory"("taskId");

-- CreateIndex
CREATE INDEX "MaintenanceHistory_performedDate_idx" ON "MaintenanceHistory"("performedDate");

-- CreateIndex
CREATE UNIQUE INDEX "electricity_prices_type_key" ON "electricity_prices"("type");

-- CreateIndex
CREATE UNIQUE INDEX "substations_code_key" ON "substations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "power_meters_code_key" ON "power_meters"("code");

-- CreateIndex
CREATE UNIQUE INDEX "power_records_recordDate_meterId_key" ON "power_records"("recordDate", "meterId");

-- CreateIndex
CREATE INDEX "production_lines_factoryId_idx" ON "production_lines"("factoryId");

-- CreateIndex
CREATE INDEX "production_lines_itemId_idx" ON "production_lines"("itemId");

-- CreateIndex
CREATE INDEX "production_lines_startDate_idx" ON "production_lines"("startDate");

-- CreateIndex
CREATE INDEX "production_line_links_lineId_idx" ON "production_line_links"("lineId");

-- CreateIndex
CREATE INDEX "production_line_links_fromMachineId_idx" ON "production_line_links"("fromMachineId");

-- CreateIndex
CREATE INDEX "production_line_links_toMachineId_idx" ON "production_line_links"("toMachineId");

-- CreateIndex
CREATE UNIQUE INDEX "production_line_links_lineId_fromMachineId_toMachineId_key" ON "production_line_links"("lineId", "fromMachineId", "toMachineId");

-- CreateIndex
CREATE INDEX "machine_stop_logs_machineId_idx" ON "machine_stop_logs"("machineId");

-- CreateIndex
CREATE INDEX "machine_stop_logs_recordDate_idx" ON "machine_stop_logs"("recordDate");

-- CreateIndex
CREATE INDEX "machine_stop_logs_categoryId_idx" ON "machine_stop_logs"("categoryId");

-- CreateIndex
CREATE INDEX "production_logs_recordDate_idx" ON "production_logs"("recordDate");

-- CreateIndex
CREATE INDEX "production_logs_recordDate_machineId_idx" ON "production_logs"("recordDate", "machineId");

-- CreateIndex
CREATE INDEX "production_logs_machineId_shift_idx" ON "production_logs"("machineId", "shift");

-- CreateIndex
CREATE INDEX "production_logs_itemId_idx" ON "production_logs"("itemId");

-- AddForeignKey
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceHistory" ADD CONSTRAINT "MaintenanceHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "maintenance_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substations" ADD CONSTRAINT "substations_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_meters" ADD CONSTRAINT "power_meters_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_meters" ADD CONSTRAINT "power_meters_substationId_fkey" FOREIGN KEY ("substationId") REFERENCES "substations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_records" ADD CONSTRAINT "power_records_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "power_meters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_line_links" ADD CONSTRAINT "production_line_links_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "production_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_line_links" ADD CONSTRAINT "production_line_links_fromMachineId_fkey" FOREIGN KEY ("fromMachineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_line_links" ADD CONSTRAINT "production_line_links_toMachineId_fkey" FOREIGN KEY ("toMachineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_stop_logs" ADD CONSTRAINT "machine_stop_logs_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_stop_logs" ADD CONSTRAINT "machine_stop_logs_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "stop_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_stop_logs" ADD CONSTRAINT "machine_stop_logs_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
