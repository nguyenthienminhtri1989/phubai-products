-- CreateEnum
CREATE TYPE "BenchmarkType" AS ENUM ('THEORY', 'EMPIRICAL');

-- AlterTable
ALTER TABLE "power_meters" ADD COLUMN     "gatewayIp" TEXT,
ADD COLUMN     "gatewayPort" INTEGER NOT NULL DEFAULT 502,
ADD COLUMN     "isAuto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "modbusId" INTEGER;

-- AlterTable
ALTER TABLE "power_records" ADD COLUMN     "dataSource" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "productivity_benchmarks" ADD COLUMN     "benchmarkType" "BenchmarkType" NOT NULL DEFAULT 'THEORY',
ADD COLUMN     "empiricalNote" TEXT,
ADD COLUMN     "empiricalOutputPerDay" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "sales_order_items" ADD COLUMN     "deliveredQty" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "power_telemetries" (
    "id" BIGSERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meterId" INTEGER NOT NULL,
    "totalEnergy" DOUBLE PRECISION,
    "activePower" DOUBLE PRECISION,

    CONSTRAINT "power_telemetries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "power_telemetries_timestamp_meterId_idx" ON "power_telemetries"("timestamp", "meterId");

-- AddForeignKey
ALTER TABLE "power_telemetries" ADD CONSTRAINT "power_telemetries_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "power_meters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "productivity_benchmarks_versionId_itemId_processId_machineModel" RENAME TO "productivity_benchmarks_versionId_itemId_processId_machineM_key";
