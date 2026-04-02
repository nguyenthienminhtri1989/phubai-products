-- CreateTable
CREATE TABLE "benchmark_versions" (
    "id" SERIAL NOT NULL,
    "versionName" TEXT NOT NULL,
    "factoryId" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "approvedBy" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benchmark_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productivity_benchmarks" (
    "id" SERIAL NOT NULL,
    "versionId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "processId" INTEGER NOT NULL,
    "machineModel" TEXT NOT NULL,
    "speedUnit" TEXT NOT NULL,
    "nm" DOUBLE PRECISION NOT NULL,
    "ne" DOUBLE PRECISION NOT NULL,
    "twist" DOUBLE PRECISION,
    "speedValue" DOUBLE PRECISION NOT NULL,
    "spindleOrHeadCount" INTEGER,
    "theoreticalOutput" DOUBLE PRECISION NOT NULL,
    "efficiency" DOUBLE PRECISION NOT NULL,
    "stdOutputPerShift" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productivity_benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "benchmark_versions_factoryId_idx" ON "benchmark_versions"("factoryId");

-- CreateIndex
CREATE INDEX "benchmark_versions_effectiveFrom_idx" ON "benchmark_versions"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "productivity_benchmarks_versionId_itemId_processId_machineModel_key" ON "productivity_benchmarks"("versionId", "itemId", "processId", "machineModel");

-- CreateIndex
CREATE INDEX "productivity_benchmarks_versionId_idx" ON "productivity_benchmarks"("versionId");

-- CreateIndex
CREATE INDEX "productivity_benchmarks_itemId_idx" ON "productivity_benchmarks"("itemId");

-- CreateIndex
CREATE INDEX "productivity_benchmarks_processId_idx" ON "productivity_benchmarks"("processId");

-- AddForeignKey
ALTER TABLE "benchmark_versions" ADD CONSTRAINT "benchmark_versions_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_benchmarks" ADD CONSTRAINT "productivity_benchmarks_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "benchmark_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_benchmarks" ADD CONSTRAINT "productivity_benchmarks_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_benchmarks" ADD CONSTRAINT "productivity_benchmarks_processId_fkey" FOREIGN KEY ("processId") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
