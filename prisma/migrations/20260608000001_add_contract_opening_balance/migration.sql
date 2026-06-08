-- Migration: add_contract_opening_balance
-- Tạo bảng số dư đầu kỳ hợp đồng để tách dữ liệu quá khứ chuyển đổi
-- khỏi logic MonthlyQuota/ProductionLog từ tháng bắt đầu áp dụng phần mềm.

CREATE TABLE IF NOT EXISTS "contract_opening_balances" (
  "id" SERIAL PRIMARY KEY,
  "salesOrderItemId" INTEGER NOT NULL,
  "factoryId" INTEGER NOT NULL,
  "processId" INTEGER NOT NULL,
  "openingYearMonth" VARCHAR(7) NOT NULL,
  "producedBeforeKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contract_opening_balances_salesOrderItemId_fkey"
    FOREIGN KEY ("salesOrderItemId") REFERENCES "sales_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contract_opening_balances_factoryId_fkey"
    FOREIGN KEY ("factoryId") REFERENCES "factories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contract_opening_balances_processId_fkey"
    FOREIGN KEY ("processId") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "opening_balance_soi_factory_process_month"
  ON "contract_opening_balances" ("salesOrderItemId", "factoryId", "processId", "openingYearMonth");

CREATE INDEX IF NOT EXISTS "contract_opening_balances_factoryId_processId_openingYearMonth_idx"
  ON "contract_opening_balances" ("factoryId", "processId", "openingYearMonth");
