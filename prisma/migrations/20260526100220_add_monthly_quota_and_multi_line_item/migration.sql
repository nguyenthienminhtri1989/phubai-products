-- CreateTable: monthly_quotas
-- Phân bổ quota sản lượng cho từng dòng HĐ trong tháng.

CREATE TABLE "monthly_quotas" (
    "id" SERIAL NOT NULL,
    "salesOrderItemId" INTEGER NOT NULL,
    "yearMonth" VARCHAR(7) NOT NULL,
    "quotaQty" DOUBLE PRECISION,
    "isRemainder" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monthly_quotas_salesOrderItemId_yearMonth_key" ON "monthly_quotas"("salesOrderItemId", "yearMonth");

-- CreateIndex
CREATE INDEX "monthly_quotas_yearMonth_idx" ON "monthly_quotas"("yearMonth");

-- AddForeignKey
ALTER TABLE "monthly_quotas" ADD CONSTRAINT "monthly_quotas_salesOrderItemId_fkey"
    FOREIGN KEY ("salesOrderItemId") REFERENCES "sales_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
