-- CreateEnum
CREATE TYPE "LotType" AS ENUM ('RAW_COTTON', 'RAW_FIBER', 'YARN');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('OPEN', 'CLOSED', 'SHIPPED');

-- DropForeignKey
ALTER TABLE "sales_orders" DROP CONSTRAINT "sales_orders_customerId_fkey";

-- AlterTable
ALTER TABLE "machines" ADD COLUMN     "currentLotId" INTEGER;

-- AlterTable
ALTER TABLE "production_logs" ADD COLUMN     "lotId" INTEGER;

-- AlterTable
ALTER TABLE "sales_orders" ALTER COLUMN "customerId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "lots" (
    "id" SERIAL NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "lotType" "LotType" NOT NULL,
    "itemId" INTEGER,
    "factoryId" INTEGER NOT NULL,
    "salesOrderItemId" INTEGER,
    "status" "LotStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_material_links" (
    "id" SERIAL NOT NULL,
    "yarnLotId" INTEGER NOT NULL,
    "rawLotId" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "lot_material_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lots_lotType_idx" ON "lots"("lotType");

-- CreateIndex
CREATE INDEX "lots_factoryId_idx" ON "lots"("factoryId");

-- CreateIndex
CREATE INDEX "lots_itemId_idx" ON "lots"("itemId");

-- CreateIndex
CREATE INDEX "lots_lotNumber_idx" ON "lots"("lotNumber");

-- CreateIndex
CREATE INDEX "lot_material_links_yarnLotId_idx" ON "lot_material_links"("yarnLotId");

-- CreateIndex
CREATE INDEX "lot_material_links_rawLotId_idx" ON "lot_material_links"("rawLotId");

-- CreateIndex
CREATE UNIQUE INDEX "lot_material_links_yarnLotId_rawLotId_key" ON "lot_material_links"("yarnLotId", "rawLotId");

-- CreateIndex
CREATE INDEX "production_logs_lotId_idx" ON "production_logs"("lotId");

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_currentLotId_fkey" FOREIGN KEY ("currentLotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_logs" ADD CONSTRAINT "production_logs_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "sales_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_material_links" ADD CONSTRAINT "lot_material_links_yarnLotId_fkey" FOREIGN KEY ("yarnLotId") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_material_links" ADD CONSTRAINT "lot_material_links_rawLotId_fkey" FOREIGN KEY ("rawLotId") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
