-- AlterTable: Machine thêm field allowMultiItemPerShift
ALTER TABLE "machines" ADD COLUMN "allowMultiItemPerShift" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: machine_item_assignments
CREATE TABLE "machine_item_assignments" (
    "id" SERIAL NOT NULL,
    "machineId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "fromSpindle" INTEGER,
    "toSpindle" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_item_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "machine_item_assignments_machineId_idx" ON "machine_item_assignments"("machineId");

-- CreateIndex
CREATE UNIQUE INDEX "machine_item_assignments_machineId_itemId_key" ON "machine_item_assignments"("machineId", "itemId");

-- AddForeignKey
ALTER TABLE "machine_item_assignments" ADD CONSTRAINT "machine_item_assignments_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_item_assignments" ADD CONSTRAINT "machine_item_assignments_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
