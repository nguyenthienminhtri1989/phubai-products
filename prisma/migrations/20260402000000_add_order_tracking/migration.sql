-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('ACTIVE', 'DONE', 'OVERDUE', 'CANCELLED');

-- AlterTable: sales_orders — thêm fields theo dõi đơn hàng
ALTER TABLE "sales_orders"
  ADD COLUMN "deliveryDate"  DATE NOT NULL DEFAULT '2099-12-31',
  ADD COLUMN "status"        "OrderStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "startDate"     DATE,
  ADD COLUMN "completedDate" DATE;

-- Drop DEFAULT sau khi migrate (rows cũ đã có giá trị)
ALTER TABLE "sales_orders" ALTER COLUMN "deliveryDate" DROP DEFAULT;

-- AlterTable: sales_order_items — thêm deadline riêng + cached allocated qty
ALTER TABLE "sales_order_items"
  ADD COLUMN "deliveryDate"  DATE,
  ADD COLUMN "allocatedQty"  DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable: order_allocations
CREATE TABLE "order_allocations" (
  "id"               SERIAL NOT NULL,
  "salesOrderItemId" INTEGER NOT NULL,
  "productionDate"   DATE NOT NULL,
  "factoryId"        INTEGER NOT NULL,
  "itemId"           INTEGER NOT NULL,
  "allocatedQty"     DOUBLE PRECISION NOT NULL,
  "allocationDate"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_allocations_salesOrderItemId_idx"
  ON "order_allocations"("salesOrderItemId");

CREATE INDEX "order_allocations_productionDate_factoryId_itemId_idx"
  ON "order_allocations"("productionDate", "factoryId", "itemId");

-- AddForeignKey
ALTER TABLE "order_allocations"
  ADD CONSTRAINT "order_allocations_salesOrderItemId_fkey"
  FOREIGN KEY ("salesOrderItemId")
  REFERENCES "sales_order_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
