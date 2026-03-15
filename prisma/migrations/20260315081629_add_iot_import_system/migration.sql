-- CreateTable
CREATE TABLE "iot_sources" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "shiftMap" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iot_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iot_machine_maps" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "iotName" TEXT NOT NULL,
    "machineId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iot_machine_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iot_item_maps" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "iotName" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iot_item_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iot_import_logs" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "insertedRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "errorDetail" JSONB,
    "importedById" INTEGER,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iot_import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "iot_sources_name_key" ON "iot_sources"("name");

-- CreateIndex
CREATE INDEX "iot_machine_maps_sourceId_idx" ON "iot_machine_maps"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "iot_machine_maps_sourceId_iotName_key" ON "iot_machine_maps"("sourceId", "iotName");

-- CreateIndex
CREATE INDEX "iot_item_maps_sourceId_idx" ON "iot_item_maps"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "iot_item_maps_sourceId_iotName_key" ON "iot_item_maps"("sourceId", "iotName");

-- CreateIndex
CREATE INDEX "iot_import_logs_sourceId_idx" ON "iot_import_logs"("sourceId");

-- AddForeignKey
ALTER TABLE "iot_machine_maps" ADD CONSTRAINT "iot_machine_maps_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "iot_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_machine_maps" ADD CONSTRAINT "iot_machine_maps_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_item_maps" ADD CONSTRAINT "iot_item_maps_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "iot_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_item_maps" ADD CONSTRAINT "iot_item_maps_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_import_logs" ADD CONSTRAINT "iot_import_logs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "iot_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
