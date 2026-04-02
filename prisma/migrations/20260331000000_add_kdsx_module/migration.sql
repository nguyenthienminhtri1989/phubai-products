-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "FixedCostType" AS ENUM ('LUONG_CHINH', 'TRICH_TRUOC_LUONG', 'TIEN_DIEN', 'KHAU_HAO', 'LAI_VAY_VCD', 'LAI_VAY_VLD', 'CP_QUAN_LY', 'CP_SUA_CHUA', 'CP_HOA_CHAT', 'CP_VAT_LIEU_PKD', 'CP_DICH_VU_MUA_NGOAI', 'CP_DAU_TU_XHH', 'CP_KHAC', 'DT_HDTC');

-- CreateEnum
CREATE TYPE "SnapshotType" AS ENUM ('KH', 'TH');

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" SERIAL NOT NULL,
    "orderNo" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "factoryId" INTEGER NOT NULL,
    "signedDate" DATE,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_items" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "plannedQty" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "note" TEXT,

    CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_input_params" (
    "id" SERIAL NOT NULL,
    "factoryId" INTEGER NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "cottonUsaPrice" DOUBLE PRECISION,
    "cottonBrazilPrice" DOUBLE PRECISION,
    "cottonAusPrice" DOUBLE PRECISION,
    "cottonPimaPrice" DOUBLE PRECISION,
    "cottonSupimaPrice" DOUBLE PRECISION,
    "cottonCmiaPrice" DOUBLE PRECISION,
    "peBenmaPrice" DOUBLE PRECISION,
    "lenzingViscosePrice" DOUBLE PRECISION,
    "livaEcoPrice" DOUBLE PRECISION,
    "cottonUsaRatio" DOUBLE PRECISION,
    "cottonBrazilRatio" DOUBLE PRECISION,
    "cottonAusRatio" DOUBLE PRECISION,
    "warehouseFee" DOUBLE PRECISION DEFAULT 0.02,
    "avgCottonPrice" DOUBLE PRECISION,
    "wastePrice" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_input_params_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_material_rates" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "cottonRate" DOUBLE PRECISION,
    "peRate" DOUBLE PRECISION,
    "wasteRate" DOUBLE PRECISION,
    "sellingCostRate" DOUBLE PRECISION,
    "doubleTwistGcRate" DOUBLE PRECISION,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_material_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_plans" (
    "id" SERIAL NOT NULL,
    "factoryId" INTEGER NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_line_items" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "salesOrderItemId" INTEGER,
    "itemId" INTEGER NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitPriceUsd" DOUBLE PRECISION NOT NULL,
    "revenueVnd" DOUBLE PRECISION,
    "cottonCostVnd" DOUBLE PRECISION,
    "peCostVnd" DOUBLE PRECISION,
    "sellingCostVnd" DOUBLE PRECISION,
    "gcDoubleTwistVnd" DOUBLE PRECISION,
    "wasteRecoveryVnd" DOUBLE PRECISION,
    "grossProfitVnd" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "plan_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_cost_entries" (
    "id" SERIAL NOT NULL,
    "costType" "FixedCostType" NOT NULL,
    "monthlyPlanId" INTEGER,
    "monthlyActualId" INTEGER,
    "amountVnd" DOUBLE PRECISION NOT NULL,
    "note" TEXT,

    CONSTRAINT "fixed_cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_actuals" (
    "id" SERIAL NOT NULL,
    "factoryId" INTEGER NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_actuals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actual_line_items" (
    "id" SERIAL NOT NULL,
    "actualId" INTEGER NOT NULL,
    "salesOrderItemId" INTEGER,
    "itemId" INTEGER NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitPriceUsd" DOUBLE PRECISION NOT NULL,
    "revenueVnd" DOUBLE PRECISION,
    "cottonCostVnd" DOUBLE PRECISION,
    "peCostVnd" DOUBLE PRECISION,
    "sellingCostVnd" DOUBLE PRECISION,
    "gcDoubleTwistVnd" DOUBLE PRECISION,
    "wasteRecoveryVnd" DOUBLE PRECISION,
    "grossProfitVnd" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "actual_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_summary_snapshots" (
    "id" SERIAL NOT NULL,
    "factoryId" INTEGER NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "type" "SnapshotType" NOT NULL,
    "totalQtyKg" DOUBLE PRECISION,
    "totalRevenueVnd" DOUBLE PRECISION,
    "totalCostVnd" DOUBLE PRECISION,
    "totalProfitVnd" DOUBLE PRECISION,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_summary_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_orderNo_key" ON "sales_orders"("orderNo");

-- CreateIndex
CREATE INDEX "sales_orders_factoryId_idx" ON "sales_orders"("factoryId");

-- CreateIndex
CREATE INDEX "sales_orders_customerId_idx" ON "sales_orders"("customerId");

-- CreateIndex
CREATE INDEX "sales_order_items_orderId_idx" ON "sales_order_items"("orderId");

-- CreateIndex
CREATE INDEX "sales_order_items_itemId_idx" ON "sales_order_items"("itemId");

-- CreateIndex
CREATE INDEX "monthly_input_params_factoryId_idx" ON "monthly_input_params"("factoryId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_input_params_factoryId_yearMonth_key" ON "monthly_input_params"("factoryId", "yearMonth");

-- CreateIndex
CREATE INDEX "raw_material_rates_itemId_idx" ON "raw_material_rates"("itemId");

-- CreateIndex
CREATE INDEX "raw_material_rates_effectiveFrom_idx" ON "raw_material_rates"("effectiveFrom");

-- CreateIndex
CREATE INDEX "monthly_plans_factoryId_idx" ON "monthly_plans"("factoryId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_plans_factoryId_yearMonth_key" ON "monthly_plans"("factoryId", "yearMonth");

-- CreateIndex
CREATE INDEX "plan_line_items_planId_idx" ON "plan_line_items"("planId");

-- CreateIndex
CREATE INDEX "plan_line_items_itemId_idx" ON "plan_line_items"("itemId");

-- CreateIndex
CREATE INDEX "fixed_cost_entries_monthlyPlanId_idx" ON "fixed_cost_entries"("monthlyPlanId");

-- CreateIndex
CREATE INDEX "fixed_cost_entries_monthlyActualId_idx" ON "fixed_cost_entries"("monthlyActualId");

-- CreateIndex
CREATE INDEX "monthly_actuals_factoryId_idx" ON "monthly_actuals"("factoryId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_actuals_factoryId_yearMonth_key" ON "monthly_actuals"("factoryId", "yearMonth");

-- CreateIndex
CREATE INDEX "actual_line_items_actualId_idx" ON "actual_line_items"("actualId");

-- CreateIndex
CREATE INDEX "actual_line_items_itemId_idx" ON "actual_line_items"("itemId");

-- CreateIndex
CREATE INDEX "monthly_summary_snapshots_factoryId_idx" ON "monthly_summary_snapshots"("factoryId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_summary_snapshots_factoryId_yearMonth_type_key" ON "monthly_summary_snapshots"("factoryId", "yearMonth", "type");

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_input_params" ADD CONSTRAINT "monthly_input_params_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_rates" ADD CONSTRAINT "raw_material_rates_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_plans" ADD CONSTRAINT "monthly_plans_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_line_items" ADD CONSTRAINT "plan_line_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "monthly_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_line_items" ADD CONSTRAINT "plan_line_items_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "sales_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_line_items" ADD CONSTRAINT "plan_line_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_cost_entries" ADD CONSTRAINT "fixed_cost_entries_monthlyPlanId_fkey" FOREIGN KEY ("monthlyPlanId") REFERENCES "monthly_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_cost_entries" ADD CONSTRAINT "fixed_cost_entries_monthlyActualId_fkey" FOREIGN KEY ("monthlyActualId") REFERENCES "monthly_actuals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_actuals" ADD CONSTRAINT "monthly_actuals_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_line_items" ADD CONSTRAINT "actual_line_items_actualId_fkey" FOREIGN KEY ("actualId") REFERENCES "monthly_actuals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_line_items" ADD CONSTRAINT "actual_line_items_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "sales_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_line_items" ADD CONSTRAINT "actual_line_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_summary_snapshots" ADD CONSTRAINT "monthly_summary_snapshots_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
