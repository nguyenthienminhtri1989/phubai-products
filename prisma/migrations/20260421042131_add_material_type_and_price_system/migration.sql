-- AlterTable
ALTER TABLE "actual_line_items" ADD COLUMN     "cottonMaterialTypeId" INTEGER,
ADD COLUMN     "cottonPriceUsd" DOUBLE PRECISION,
ADD COLUMN     "cottonRatio" DOUBLE PRECISION,
ADD COLUMN     "peMaterialTypeId" INTEGER,
ADD COLUMN     "pePriceUsd" DOUBLE PRECISION,
ADD COLUMN     "peRatio" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "plan_line_items" ADD COLUMN     "cottonMaterialTypeId" INTEGER,
ADD COLUMN     "cottonPriceUsd" DOUBLE PRECISION,
ADD COLUMN     "cottonRatio" DOUBLE PRECISION,
ADD COLUMN     "peMaterialTypeId" INTEGER,
ADD COLUMN     "pePriceUsd" DOUBLE PRECISION,
ADD COLUMN     "peRatio" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "raw_material_rates" ADD COLUMN     "cottonRatio" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- CreateTable
CREATE TABLE "material_types" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_prices" (
    "id" SERIAL NOT NULL,
    "materialTypeId" INTEGER NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "material_types_code_key" ON "material_types"("code");

-- CreateIndex
CREATE INDEX "material_prices_materialTypeId_idx" ON "material_prices"("materialTypeId");

-- CreateIndex
CREATE INDEX "material_prices_yearMonth_idx" ON "material_prices"("yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "material_prices_materialTypeId_yearMonth_key" ON "material_prices"("materialTypeId", "yearMonth");

-- AddForeignKey
ALTER TABLE "material_prices" ADD CONSTRAINT "material_prices_materialTypeId_fkey" FOREIGN KEY ("materialTypeId") REFERENCES "material_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
