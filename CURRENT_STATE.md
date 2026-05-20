# CURRENT_STATE.md — Audit hiện trạng hệ thống KD-SX

> **Ngày audit:** 2026-05-19  
> **Mục đích:** Tổng hợp toàn bộ hiện trạng module KD-SX và các phần liên quan  
> **Phương pháp:** Đọc toàn bộ schema.prisma, quét tất cả route files, grep references  

---

## PHẦN 1: SCHEMA HIỆN TẠI

### ENUMS liên quan KD-SX

| Enum | Giá trị |
|------|---------|
| `BenchmarkType` | THEORY, EMPIRICAL |
| `PlanStatus` | DRAFT, SUBMITTED, APPROVED |
| `FixedCostType` | TIEN_LUONG, TRICH_TRUOC_LUONG, TIEN_AN_CA, BHXH_YT_TN_KPCD, TIEN_DIEN, KHAU_HAO, ONG_CONE_BAO_PP, CHI_PHI_VAT_LIEU, CHI_PHI_QUAN_LY, LAI_VAY_VCD, LAI_VAY_VLD, LO_CHENH_LECH_TY_GIA, DOANH_THU_HDTC, KHAC |
| `SnapshotType` | KH, TH |
| `CustomerType` | DOMESTIC, FOREIGN |
| `OrderStatus` | ACTIVE, DONE, OVERDUE, CANCELLED |

---

### Model: Factory
- **Table name:** `factories`
- **Fields:** id (Int PK autoincrement), name (String), note (String?)
- **Relations:**
  - `processes Process[]`
  - `salesOrders SalesOrder[]`
  - `monthlyInputParams MonthlyInputParam[]`
  - `monthlyPlans MonthlyPlan[]`
  - `monthlyActuals MonthlyActual[]`
  - `summarySnapshots MonthlySummarySnapshot[]`
  - `benchmarkVersions BenchmarkVersion[]`
  - `productionSchedules ProductionSchedule[]`
  - `lots Lot[]`
  - `users User[]`, `userFactories UserFactory[]`
- **Đang được dùng bởi:** Hầu hết mọi route trong kdsx/

---

### Model: Process
- **Table name:** `processes`
- **Fields:** id (Int PK), name (String), factoryId (Int FK→Factory)
- **Relations:** `machines Machine[]`, `userProcesses UserProcess[]`, `productivityBenchmarks ProductivityBenchmark[]`

---

### Model: Item
- **Table name:** `items`
- **Fields:** id (Int PK), name (String @unique), code (String?), ne (Int?), composition (String?), twist (Int?), weavingStyle (String?), material (String?), yarnType (String @default("SINGLE"))
- **Relations:**
  - `runningOnMachines Machine[]`
  - `productionLogs ProductionLog[]`
  - `salesOrderItems SalesOrderItem[]`
  - `rawMaterialRates RawMaterialRate[]`
  - `planLineItems PlanLineItem[]`
  - `actualLineItems ActualLineItem[]`
  - `productivityBenchmarks ProductivityBenchmark[]`
  - `kdDailyInputs KdDailyInput[]`
  - `scheduleSegments ScheduleSegment[]`
  - `machineAssignments MachineItemAssignment[]`
  - `lots Lot[]`
- **Unique:** name

---

### Model: Machine
- **Table name:** `machines`
- **Fields:** id (Int PK), name (String @unique), isActive (Boolean @default(true)), model (String?), processId (Int FK→Process), formulaType (Int @default(1)), spindleCount (Int?), allowMultiItemPerShift (Boolean @default(false)), currentItemId (Int? FK→Item), currentNE (Float?), currentLotId (Int? FK→Lot)
- **Relations:** `productionLogs ProductionLog[]`, `kdDailyInputs KdDailyInput[]`, `scheduleSegments ScheduleSegment[]`, `itemAssignments MachineItemAssignment[]`, `maintenanceTasks MaintenanceTask[]`, `stopLogs MachineStopLog[]`

---

### Model: Customer
- **Table name:** `customers`
- **Fields:** id (Int PK), name (String), code (String? @unique), address (String?), phone (String?), email (String?), taxCode (String?), customerType (CustomerType @default(DOMESTIC)), note (String?), createdAt, updatedAt
- **Relations:** `salesOrders SalesOrder[]`
- **Đang được dùng bởi:** `src/app/api/kdsx/customers/`

---

### Model: SalesOrder
- **Table name:** `sales_orders`
- **Fields:** id (Int PK), orderNo (String @unique), customerId (Int? FK→Customer), factoryId (Int FK→Factory), signedDate (DateTime? @db.Date), deliveryDate (DateTime @db.Date), status (OrderStatus @default(ACTIVE)), startDate (DateTime? @db.Date), completedDate (DateTime? @db.Date), note (String?), isActive (Boolean @default(true)), createdAt, updatedAt
- **Relations:** `items SalesOrderItem[]`
- **Indexes:** factoryId, customerId
- **Đang được dùng bởi:** `src/app/api/kdsx/sales-orders/`, allocation-engine.ts, `src/app/kdsx/sales-orders/`

---

### Model: SalesOrderItem
- **Table name:** `sales_order_items`
- **Fields:** id (Int PK), orderId (Int FK→SalesOrder onDelete:Cascade), itemId (Int FK→Item), plannedQty (Float), unitPrice (Float), sellingCostRate (Float?), deliveredQty (Float @default(0)), deliveryDate (DateTime? @db.Date), allocatedQty (Float @default(0)), note (String?)
- **Relations:** `planLineItems PlanLineItem[]`, `actualLineItems ActualLineItem[]`, `allocations OrderAllocation[]`, `lots Lot[]`
- **Indexes:** orderId, itemId
- **Đang được dùng bởi:** allocation-engine.ts, monthly-plans, monthly-actuals

---

### Model: MonthlyInputParam
- **Table name:** `monthly_input_params`
- **Fields:** id (Int PK), factoryId (Int FK→Factory), yearMonth (String), exchangeRate (Float), cottonUsaPrice/cottonBrazilPrice/cottonAusPrice/cottonPimaPrice/cottonSupimaPrice/cottonCmiaPrice (Float?), peBenmaPrice/lenzingViscosePrice/livaEcoPrice (Float?), cottonUsaRatio/cottonBrazilRatio/cottonAusRatio (Float?), warehouseFee (Float? @default(0.02)), avgCottonPrice (Float?), wastePrice (Float?), note (String?), createdAt, updatedAt
- **Unique:** `[factoryId, yearMonth]`
- **Đang được dùng bởi:** `src/app/api/kdsx/input-params/`, calculator.ts, line-items routes

---

### Model: RawMaterialRate
- **Table name:** `raw_material_rates`
- **Fields:** id (Int PK), itemId (Int FK→Item), cottonRate (Float?), peRate (Float?), cottonRatio (Float @default(1.0)), wasteRate (Float?), doubleTwistGcRate (Float?), effectiveFrom (DateTime @db.Date), effectiveTo (DateTime? @db.Date), note (String?), createdAt, updatedAt
- **Indexes:** itemId, effectiveFrom
- **Đang được dùng bởi:** `src/app/api/kdsx/raw-material-rates/`, calculator.ts

---

### Model: MonthlyPlan
- **Table name:** `monthly_plans`
- **Fields:** id (Int PK), factoryId (Int FK→Factory), yearMonth (String), status (PlanStatus @default(DRAFT)), note (String?), createdAt, updatedAt
- **Relations:** `lineItems PlanLineItem[]`, `fixedCosts FixedCostEntry[]`
- **Unique:** `[factoryId, yearMonth]`
- **Đang được dùng bởi:** 10 routes trong `src/app/api/kdsx/monthly-plans/`, `src/app/kdsx/plans/`

---

### Model: PlanLineItem
- **Table name:** `plan_line_items`
- **Fields:** id (Int PK), planId (Int FK→MonthlyPlan onDelete:Cascade), salesOrderItemId (Int? FK→SalesOrderItem), itemId (Int FK→Item), qty (Float), unitPriceUsd (Float), cottonMaterialTypeId (Int?), cottonPriceUsd (Float?), cottonRatio (Float?), peMaterialTypeId (Int?), pePriceUsd (Float?), peRatio (Float?), revenueVnd (Float?), cottonCostVnd (Float?), peCostVnd (Float?), sellingCostVnd (Float?), gcDoubleTwistVnd (Float?), wasteRecoveryVnd (Float?), grossProfitVnd (Float?), isAutoQty (Boolean @default(false)), note (String?)
- **Indexes:** planId, itemId
- **Đang được dùng bởi:** `src/app/api/kdsx/monthly-plans/[id]/line-items/`, recalculate route, sync route

---

### Model: FixedCostEntry
- **Table name:** `fixed_cost_entries`
- **Fields:** id (Int PK), costType (FixedCostType), monthlyPlanId (Int? FK→MonthlyPlan onDelete:Cascade), monthlyActualId (Int? FK→MonthlyActual onDelete:Cascade), amountVnd (Float), note (String?)
- **Ràng buộc nghiệp vụ:** Đúng 1 trong 2 FK phải có giá trị (validate ở service layer)
- **Indexes:** monthlyPlanId, monthlyActualId
- **Đang được dùng bởi:** `fixed-costs/route.ts`, monthly-plans, monthly-actuals routes, calculator.ts (refreshSummarySnapshot đọc fixed costs)

---

### Model: MonthlyActual
- **Table name:** `monthly_actuals`
- **Fields:** id (Int PK), factoryId (Int FK→Factory), yearMonth (String), note (String?), createdAt, updatedAt
- **Relations:** `lineItems ActualLineItem[]`, `fixedCosts FixedCostEntry[]`
- **Unique:** `[factoryId, yearMonth]`
- **Đang được dùng bởi:** `src/app/api/kdsx/monthly-actuals/`, `src/app/kdsx/actuals/`

---

### Model: ActualLineItem
- **Table name:** `actual_line_items`
- **Fields:** id (Int PK), actualId (Int FK→MonthlyActual onDelete:Cascade), salesOrderItemId (Int? FK→SalesOrderItem), itemId (Int FK→Item), qty (Float), unitPriceUsd (Float), [snapshot fields giống PlanLineItem: cotton/pe price, ratio, 7 tính toán fields], isAutoQty (Boolean @default(false)), isAdHoc (Boolean @default(false)), note (String?)
- **Indexes:** actualId, itemId
- **Đang được dùng bởi:** `src/app/api/kdsx/monthly-actuals/[id]/`, sync route, calculator.ts

---

### Model: MonthlySummarySnapshot
- **Table name:** `monthly_summary_snapshots`
- **Fields:** id (Int PK), factoryId (Int FK→Factory), yearMonth (String), type (SnapshotType), totalQtyKg (Float?), totalRevenueVnd (Float?), totalCostVnd (Float?), totalProfitVnd (Float?), refreshedAt (DateTime @updatedAt)
- **Unique:** `[factoryId, yearMonth, type]`
- **Đang được dùng bởi:** calculator.ts (refreshSummarySnapshot), `src/app/api/kdsx/summary/route.ts`, `src/app/kdsx/page.tsx`

---

### Model: OrderAllocation
- **Table name:** `order_allocations`
- **Fields:** id (Int PK), salesOrderItemId (Int FK→SalesOrderItem), productionDate (DateTime @db.Date), factoryId (Int), itemId (Int), allocatedQty (Float), allocationDate (DateTime @default(now())), source (String @default("PRODUCTION"))
- **Indexes:** salesOrderItemId, `[productionDate, factoryId, itemId]`
- **Đang được dùng bởi:** allocation-engine.ts, `src/app/api/kdsx/sales-orders/recalculate/`

---

### Model: KdDailyInput
- **Table name:** `kd_daily_inputs`
- **Fields:** id (Int PK), machineId (Int FK→Machine), itemId (Int FK→Item), recordDate (DateTime @db.Date), outputKg (Float), note (String?), createdById (Int FK→User), createdAt, updatedAt
- **Unique:** `[machineId, itemId, recordDate]`
- **Indexes:** recordDate, machineId, itemId
- **Đang được dùng bởi:** `src/app/api/kd-daily-input/`, allocation-engine.ts (runAllocationKD), monthly-actuals sync route, summary route

---

### Model: ProductionLog
- **Table name:** `production_logs`
- **Fields:** id (Int PK), machineId (Int FK→Machine), recordDate (DateTime @db.Date), shift (Int 1/2/3), itemId (Int FK→Item), startIndex (Float? @default(0)), endIndex (Float?), inputNE (Float?), finalOutput (Float), efficiency (Float?), note (String?), createdById (Int? FK→User), lotId (Int? FK→Lot), createdAt, updatedAt
- **Unique:** `[machineId, recordDate, shift, itemId]`
- **Indexes:** recordDate, `[recordDate, machineId]`, `[machineId, shift]`, itemId, lotId
- **Đang được dùng bởi:** `src/app/api/production/daily-input/`, production-schedule actual routes, summary route (TH real-time)

---

### Model: ProductionSchedule
- **Table name:** `production_schedules`
- **Fields:** id (Int PK), factoryId (Int FK→Factory), yearMonth (String), name (String @default("")), isPrimary (Boolean @default(false)), status (PlanStatus @default(DRAFT)), note (String?), holidays (Json @default("[]")), itemColors (Json @default("{}")), createdAt, updatedAt
- **Relations:** `segments ScheduleSegment[]`
- **Unique:** `[factoryId, yearMonth, name]`
- **Đang được dùng bởi:** `src/app/api/kdsx/production-schedule/`, sync-to-plan route, monthly-actuals sync route

---

### Model: ScheduleSegment
- **Table name:** `schedule_segments`
- **Fields:** id (Int PK), scheduleId (Int FK→ProductionSchedule onDelete:Cascade), machineId (Int FK→Machine), itemId (Int FK→Item), fromDay (Int), toDay (Int), kgPerDay (Float), benchmarkId (Int?), isManualKg (Boolean @default(false)), note (String?), createdAt, updatedAt
- **Indexes:** scheduleId, machineId, itemId

---

### Model: ProductivityBenchmark
- **Table name:** `productivity_benchmarks`
- **Fields:** id (Int PK), versionId (Int FK→BenchmarkVersion), itemId (Int FK→Item), processId (Int FK→Process), machineModel (String), speedUnit (String), nm (Float), ne (Float), twist (Float?), speedValue (Float), spindleOrHeadCount (Int?), theoreticalOutput (Float), efficiency (Float), stdOutputPerShift (Float), note (String?), benchmarkType (BenchmarkType @default(THEORY)), empiricalOutputPerDay (Float?), empiricalNote (String?)
- **Unique:** `[versionId, itemId, processId, machineModel]`
- **Đang được dùng bởi:** production-schedule segments route (benchmark-lookup), estimate-completion.ts

---

### Model: BenchmarkVersion
- **Table name:** `benchmark_versions`
- **Fields:** id (Int PK), versionName (String), factoryId (Int FK→Factory), effectiveFrom (DateTime @db.Date), effectiveTo (DateTime? @db.Date), approvedBy (String?), note (String?), isActive (Boolean @default(true)), createdAt, updatedAt
- **Relations:** `benchmarks ProductivityBenchmark[]`

---

### Model: MaterialType
- **Table name:** `material_types`
- **Fields:** id (Int PK), code (String @unique), name (String), category (String — "COTTON" hoặc "PE"), isActive (Boolean @default(true)), note (String?), createdAt, updatedAt
- **Relations:** `prices MaterialPrice[]`
- **Đang được dùng bởi:** `src/app/api/kdsx/material-types/`, `src/app/kdsx/material-types/`

---

### Model: MaterialPrice
- **Table name:** `material_prices`
- **Fields:** id (Int PK), materialTypeId (Int FK→MaterialType), yearMonth (String), priceUsd (Float), note (String?), createdAt, updatedAt
- **Unique:** `[materialTypeId, yearMonth]`
- **Indexes:** materialTypeId, yearMonth
- **Đang được dùng bởi:** `src/app/api/kdsx/material-prices/`, line-items routes (snapshot giá)

---

## PHẦN 2: API ENDPOINTS

### Nhóm: Khách hàng

#### GET/POST /api/kdsx/customers
- **File:** `src/app/api/kdsx/customers/route.ts`
- **Chức năng:** Danh sách và tạo mới khách hàng
- **Input:** GET: query params (search, type) | POST: { name, code?, address?, phone?, email?, taxCode?, customerType }
- **Output:** Customer[] hoặc Customer mới
- **Models:** Customer

#### PUT/DELETE /api/kdsx/customers/[id]
- **File:** `src/app/api/kdsx/customers/[id]/route.ts`
- **Chức năng:** Cập nhật hoặc xóa khách hàng
- **Models:** Customer

---

### Nhóm: Loại & Giá NVL

#### GET/POST /api/kdsx/material-types
#### PUT/DELETE /api/kdsx/material-types/[id]
- **Models:** MaterialType

#### GET/POST /api/kdsx/material-prices
- **Models:** MaterialPrice

#### GET /api/kdsx/material-prices/by-month
- **Chức năng:** Lấy giá NVL theo tháng, grouped theo cotton/pe
- **Input:** query: yearMonth
- **Models:** MaterialPrice, MaterialType

---

### Nhóm: Thông số tháng

#### GET/POST /api/kdsx/input-params
- **File:** `src/app/api/kdsx/input-params/route.ts`
- **Chức năng:** Upsert thông số đầu vào tháng (tỷ giá, giá NVL, tỷ lệ phối trộn)
- **Input:** { factoryId, yearMonth, exchangeRate, ... }
- **Output:** MonthlyInputParam
- **Models:** MonthlyInputParam

#### GET/POST /api/kdsx/raw-material-rates
#### PUT/DELETE /api/kdsx/raw-material-rates/[id]
- **Models:** RawMaterialRate, Item

---

### Nhóm: Kế hoạch tháng (Monthly Plan)

#### GET/POST /api/kdsx/monthly-plans
- **File:** `src/app/api/kdsx/monthly-plans/route.ts`
- **Chức năng:** Danh sách plans hoặc tạo plan mới (+ 14 FixedCostEntry mặc định)
- **Input:** POST: { factoryId, yearMonth, note? }
- **Gọi:** `refreshSummarySnapshot(factoryId, yearMonth, KH)`
- **Models:** MonthlyPlan, FixedCostEntry, MonthlySummarySnapshot

#### GET/PUT/DELETE /api/kdsx/monthly-plans/[id]
- **File:** `src/app/api/kdsx/monthly-plans/[id]/route.ts`
- **Chức năng:** Chi tiết, cập nhật, xóa plan
- **Gọi:** `refreshSummarySnapshot(KH)` sau PUT
- **Models:** MonthlyPlan, PlanLineItem, FixedCostEntry

#### POST /api/kdsx/monthly-plans/[id]/line-items
- **File:** `src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts`
- **Chức năng:** Thêm dòng sợi vào kế hoạch (tính toán tự động)
- **Input:** { itemId, salesOrderItemId?, qty, unitPriceUsd, cottonMaterialTypeId, peMaterialTypeId }
- **Gọi:** `calculateLineItem()`, `refreshSummarySnapshot(KH)`
- **Models:** PlanLineItem, MonthlyInputParam, RawMaterialRate, MaterialPrice

#### PUT/DELETE /api/kdsx/monthly-plans/[id]/line-items/[lineItemId]
- **Gọi:** `calculateLineItem()`, `refreshSummarySnapshot(KH)`
- **Models:** PlanLineItem, MonthlyPlan

#### PUT /api/kdsx/monthly-plans/[id]/fixed-costs
- **Chức năng:** Cập nhật chi phí cố định KH
- **Gọi:** `refreshSummarySnapshot(KH)`
- **Models:** FixedCostEntry, MonthlyPlan

#### POST /api/kdsx/monthly-plans/[id]/approve
- **Chức năng:** Duyệt kế hoạch (status → APPROVED)
- **Models:** MonthlyPlan

#### POST /api/kdsx/monthly-plans/[id]/submit
- **Chức năng:** Nộp kế hoạch (validate + status → SUBMITTED)
- **Models:** MonthlyPlan

#### POST /api/kdsx/monthly-plans/[id]/unapprove
- **Chức năng:** Hủy duyệt (APPROVED → DRAFT, lưu lý do)
- **Models:** MonthlyPlan

#### POST /api/kdsx/monthly-plans/[id]/recalculate
- **Chức năng:** Tính lại toàn bộ SL từ ProductionSchedule, giữ snapshot giá cũ
- **Input:** { scheduleId? }
- **Gọi:** `calculateLineItem()`, `refreshSummarySnapshot(KH)`
- **Models:** MonthlyPlan, PlanLineItem, ProductionSchedule, ScheduleSegment, KdDailyInput

#### POST /api/kdsx/monthly-plans/[id]/revert
- **Chức năng:** Hoàn trả SUBMITTED → DRAFT
- **Models:** MonthlyPlan

---

### Nhóm: Thực hiện tháng (Monthly Actual)

#### GET/POST /api/kdsx/monthly-actuals
- **File:** `src/app/api/kdsx/monthly-actuals/route.ts`
- **Chức năng:** Tạo actual mới (+ 14 FixedCostEntry mặc định)
- **Gọi:** `refreshSummarySnapshot(TH)`
- **Models:** MonthlyActual, FixedCostEntry

#### GET/PUT /api/kdsx/monthly-actuals/[id]
- **Models:** MonthlyActual, ActualLineItem, FixedCostEntry

#### POST /api/kdsx/monthly-actuals/[id]/line-items
- **Chức năng:** Thêm dòng phát sinh (isAdHoc=true)
- **Gọi:** `calculateLineItem()`, `refreshSummarySnapshot(TH)`
- **Models:** ActualLineItem, MonthlyActual

#### DELETE /api/kdsx/monthly-actuals/[id]/line-items/[lineItemId]
- **Chức năng:** Xóa dòng phát sinh (chỉ isAdHoc)
- **Gọi:** `refreshSummarySnapshot(TH)`
- **Models:** ActualLineItem

#### PUT /api/kdsx/monthly-actuals/[id]/fixed-costs
- **Gọi:** `refreshSummarySnapshot(TH)`
- **Models:** FixedCostEntry

#### POST /api/kdsx/monthly-actuals/[id]/sync
- **File:** `src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts`
- **Chức năng:** Đồng bộ TH từ ProductionSchedule + KdDailyInput vào ActualLineItem
- **Input:** (không có body — lấy từ actualId)
- **Gọi:** `calculateLineItem()` (×N), `refreshSummarySnapshot(TH)`
- **Models:** MonthlyActual, ActualLineItem, ProductionSchedule, ScheduleSegment, KdDailyInput, MonthlyPlan, PlanLineItem, MonthlyInputParam, RawMaterialRate

---

### Nhóm: Hợp đồng (Sales Orders)

#### GET/POST /api/kdsx/sales-orders
- **File:** `src/app/api/kdsx/sales-orders/route.ts`
- **Chức năng:** Danh sách HĐ (filter factory/customer/status, tính progressPct), tạo mới
- **Models:** SalesOrder, SalesOrderItem, Item, Customer, OrderAllocation

#### GET/PUT/DELETE /api/kdsx/sales-orders/[id]
- **Gọi:** `calcEstimatedDoneDate()` trong GET
- **Models:** SalesOrder, SalesOrderItem, OrderAllocation

#### PATCH /api/kdsx/sales-orders/[id]/status
- **Chức năng:** Đổi status (ACTIVE/DONE/CANCELLED)
- **Models:** SalesOrder

#### GET /api/kdsx/sales-orders/progress
- **Chức năng:** Theo dõi tiến độ (filter status/month, tính remainingQty, estimatedDoneDate, isAtRisk)
- **Gọi:** `calcEstimatedDoneDate()` mỗi đơn hàng
- **Models:** SalesOrder, SalesOrderItem, OrderAllocation

#### POST /api/kdsx/sales-orders/recalculate
- **Chức năng:** Tính lại allocation toàn bộ theo date range (Admin only)
- **Gọi:** `recalculateAllocation(fromDate, toDate)` từ allocation-engine.ts
- **Models:** OrderAllocation, SalesOrderItem, SalesOrder

---

### Nhóm: Chi phí cố định

#### GET/POST /api/kdsx/fixed-costs
- **File:** `src/app/api/kdsx/fixed-costs/route.ts`
- **Chức năng:** Luôn trả đủ 14 dòng chi phí (bất kể db có hay chưa)
- **Input:** GET: { type (KH/TH), planId/actualId } | POST: upsert array FixedCostEntry
- **Gọi:** `refreshSummarySnapshot(KH hoặc TH)`
- **Models:** FixedCostEntry, MonthlyPlan, MonthlyActual

---

### Nhóm: Dashboard

#### GET /api/kdsx/summary
- **File:** `src/app/api/kdsx/summary/route.ts`
- **Chức năng:** Dashboard tổng hợp 3 NM (KH snapshot + TH real-time)
- **Input:** query: yearMonth
- **Output:** `factories[]` với `{kh: MonthlySummarySnapshot, th: {totalQtyKg, totalRevenueVnd, totalCostVnd, totalProfitVnd}}`
- **Models:** MonthlySummarySnapshot (KH), KdDailyInput/ProductionLog (TH), Factory

---

### Nhóm: Kế hoạch SX tháng (Production Schedule)

#### GET/POST /api/kdsx/production-schedule
- **Chức năng:** Danh sách schedule (tính totalKg), tạo mới
- **Models:** ProductionSchedule, ScheduleSegment

#### GET/PUT/DELETE /api/kdsx/production-schedule/[id]
#### POST /api/kdsx/production-schedule/[id]/segments
- **Chức năng:** Thêm segment (auto-fill kgPerDay từ EMPIRICAL benchmark)
- **Models:** ScheduleSegment, ProductivityBenchmark

#### PUT/DELETE /api/kdsx/production-schedule/[id]/segments/[segmentId]
#### POST /api/kdsx/production-schedule/[id]/set-primary
#### GET /api/kdsx/production-schedule/[id]/summary
#### GET /api/kdsx/production-schedule/[id]/actual
- **Chức năng:** So sánh KH vs TH (ProductionLog)
- **Models:** ScheduleSegment, ProductionLog, KdDailyInput

#### GET /api/kdsx/production-schedule/[id]/actual-summary-by-item
#### POST /api/kdsx/production-schedule/[id]/sync-to-plan
- **Chức năng:** Đồng bộ schedule vào MonthlyPlan
- **Gọi:** `calculateLineItem()`, `refreshSummarySnapshot(KH)`

#### GET /api/kdsx/production-schedule/benchmark-lookup
- **Chức năng:** Tra cứu EMPIRICAL benchmark cho segment
- **Models:** ProductivityBenchmark, BenchmarkVersion

---

### Nhóm: KD Daily Input

#### GET/POST /api/kd-daily-input
- **File:** `src/app/api/kd-daily-input/route.ts`
- **Chức năng:** Nhập sản lượng ngày theo máy (batch upsert)
- **Input:** GET: { factoryId?, processId?, date, itemId? } | POST: { date, factoryId, records: [{machineId, itemId, outputKg, note}] }
- **Output:** { saved: N }
- **Gọi:** `runAllocationKD(factoryId, date)` sau mỗi save
- **Models:** KdDailyInput, Machine, OrderAllocation

#### PUT/DELETE /api/kd-daily-input/[id]
- **Models:** KdDailyInput

#### GET /api/kd-daily-input/summary
- **Chức năng:** Tổng hợp theo item (date range)
- **Input:** query: { factoryId, dateFrom, dateTo, itemId? }
- **Models:** KdDailyInput, Machine, Item

---

### Nhóm: Production (chỉ liệt kê, không chi tiết)

| Method | Path | File |
|--------|------|------|
| GET/POST/DELETE | /api/production/daily-input | Upsert ProductionLog (shift-level) |
| GET | /api/production/daily-status | Trạng thái ca làm việc |
| GET | /api/production/daily-total | Tổng SL ngày theo processId |
| GET | /api/production/last-log | endIndex gần nhất |
| POST | /api/production/history | Báo cáo phân trang |
| PATCH/DELETE | /api/production/history/[id] | Sửa/xóa (ADMIN) |
| GET/POST | /api/production/machine-stops | Báo dừng máy |
| PUT/DELETE | /api/production/machine-stops/[id] | Sửa/xóa dừng máy |
| GET | /api/production/machine-stops/stats | Thống kê dừng máy |
| GET/POST | /api/production/stop-categories | Danh mục nguyên nhân dừng |
| PUT/DELETE | /api/production/stop-categories/[id] | Sửa/xóa danh mục |
| GET/POST | /api/production/lines | Quản lý tuyến SX |
| GET/PUT/DELETE | /api/production/lines/[id] | Chi tiết tuyến |
| GET | /api/production/lines/suggest | Gợi ý tuyến |
| GET | /api/production/lines/[id]/output | Tổng SL per máy trong tuyến |

---

## PHẦN 3: LIB/UTILS — CÁC HÀM LOGIC NGHIỆP VỤ

### File: `src/lib/kdsx/calculator.ts`

#### function `calculateLineItem(input: CalcInput): CalcOutput`
- **Mô tả:** Tính toán tài chính cho 1 dòng sợi (revenue, costs, profit)
- **Input:** `{ qty, unitPriceUsd, exchangeRate, cottonRate, cottonPriceUsd, cottonRatio, peRate?, pePriceUsd?, peRatio?, sellingCostRate, doubleTwistGcRate?, wasteRate?, wastePrice, warehouseFee }`
- **Output:** `{ revenueVnd, cottonCostVnd, peCostVnd, sellingCostVnd, gcDoubleTwistVnd, wasteRecoveryVnd, grossProfitVnd }`
- **Models dùng:** Không query DB trực tiếp — nhận data từ caller
- **Được gọi bởi:**
  - `src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts:104`
  - `src/app/api/kdsx/monthly-plans/[id]/line-items/[lineItemId]/route.ts:99`
  - `src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts:233`
  - `src/app/api/kdsx/monthly-actuals/[id]/line-items/route.ts:87`
  - `src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts:160, 269`
  - `src/app/api/kdsx/production-schedule/[id]/sync-to-plan/route.ts` (gián tiếp)

#### function `refreshSummarySnapshot(factoryId, yearMonth, type: SnapshotType): Promise<void>`
- **Mô tả:** Tính lại và upsert MonthlySummarySnapshot (cache dashboard)
- **Input:** factoryId (number), yearMonth (string), type (KH | TH)
- **Output:** void — side effect: upsert MonthlySummarySnapshot
- **Models dùng:** PlanLineItem (KH), ActualLineItem (TH), FixedCostEntry, MonthlySummarySnapshot
- **Được gọi bởi:**
  - `src/app/api/kdsx/monthly-plans/route.ts:67`
  - `src/app/api/kdsx/monthly-plans/[id]/route.ts:85`
  - `src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts:150`
  - `src/app/api/kdsx/monthly-plans/[id]/line-items/[lineItemId]/route.ts:159, 184`
  - `src/app/api/kdsx/monthly-plans/[id]/fixed-costs/route.ts:33`
  - `src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts:265`
  - `src/app/api/kdsx/monthly-actuals/route.ts:63`
  - `src/app/api/kdsx/monthly-actuals/[id]/line-items/route.ts:133`
  - `src/app/api/kdsx/monthly-actuals/[id]/line-items/[lineItemId]/route.ts:45`
  - `src/app/api/kdsx/monthly-actuals/[id]/fixed-costs/route.ts:31`
  - `src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts:313`
  - `src/app/api/kdsx/fixed-costs/route.ts:100, 103`

#### constant `ALL_FIXED_COST_TYPES: FixedCostType[]`
- **Mô tả:** Mảng 14 loại chi phí theo thứ tự hiển thị
- **Được dùng bởi:** `monthly-plans/route.ts`, `monthly-actuals/route.ts`, `fixed-costs/route.ts`

#### constant `FIXED_COST_LABELS: Record<FixedCostType, string>`
- **Mô tả:** Nhãn tiếng Việt cho mỗi loại chi phí

---

### File: `src/lib/allocation-engine.ts`

#### function `runAllocation(factoryId: number, date: Date): Promise<void>`
- **Mô tả:** Phân bổ sản lượng ngày vào HĐ theo waterfall deadline (đọc từ ProductionLog — **DEPRECATED**)
- **Input:** factoryId, date
- **Output:** void — cập nhật OrderAllocation, SalesOrderItem.allocatedQty, SalesOrder.status
- **Models dùng:** ProductionLog, SalesOrder, SalesOrderItem, OrderAllocation, Item
- **Được gọi bởi:** `src/lib/allocation-engine.ts:340` (recalculateAllocation)
- **Ghi chú:** Đã chuyển sang `runAllocationKD` — production/daily-input không còn gọi hàm này

#### function `runAllocationKD(factoryId: number, date: Date): Promise<void>`
- **Mô tả:** Phân bổ sản lượng từ KdDailyInput vào HĐ theo waterfall deadline
- **Input:** factoryId, date
- **Output:** void — cập nhật OrderAllocation (source='KD'), SalesOrderItem.allocatedQty, SalesOrder.status
- **Models dùng:** KdDailyInput, SalesOrder, SalesOrderItem, OrderAllocation, Item
- **Được gọi bởi:** `src/app/api/kd-daily-input/route.ts:126`

#### function `recalculateAllocation(fromDate: Date, toDate: Date): Promise<void>`
- **Mô tả:** Tính lại allocation cho khoảng thời gian (5 bước: xóa cũ → reset allocatedQty → reset status → re-run từng ngày)
- **Được gọi bởi:** `src/app/api/kdsx/sales-orders/recalculate/route.ts`

---

### File: `src/lib/estimate-completion.ts`

#### function `calcEstimatedDoneDate(itemId: number, factoryId: number, remainingQty: number): Promise<Date | null>`
- **Mô tả:** Ước tính ngày hoàn thành HĐ dựa trên định mức năng suất + số máy đang chạy
- **Input:** itemId, factoryId, remainingQty (kg)
- **Output:** `Date | null` (null nếu không có benchmark hoặc không có máy)
- **Formula:** `daysNeeded = ceil(remainingQty / (stdOutputPerShift × machineCount × 3))`
- **Models dùng:** ProductivityBenchmark, BenchmarkVersion, Machine (activeCount)
- **Được gọi bởi:**
  - `src/app/api/kdsx/sales-orders/[id]/route.ts:57`
  - `src/app/api/kdsx/sales-orders/progress/route.ts:76`

---

## PHẦN 4: UI PAGES

### Page: /kdsx (Dashboard)
- **File:** `src/app/kdsx/page.tsx`
- **Chức năng:** Dashboard KH vs TH theo tháng, hiển thị 3 nhà máy + tổng công ty
- **API calls:** `GET /api/kdsx/summary?yearMonth={yearMonth}`
- **Có form nhập liệu:** Không (chỉ xem, có month selector)

### Page: /kdsx/plans
- **File:** `src/app/kdsx/plans/page.tsx`
- **Chức năng:** Danh sách kế hoạch tháng (chọn factory + tháng → navigate)
- **API calls:** `GET /api/kdsx/monthly-plans`

### Page: /kdsx/plans/[factoryId]/[yearMonth]
- **File:** `src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx`
- **Chức năng:** Chi tiết kế hoạch tháng: tab Line Items + tab Fixed Costs
- **API calls:** GET plan, POST/PUT/DELETE line-items, PUT fixed-costs, POST approve/submit/recalculate
- **Có form nhập liệu:** Có — Item, SalesOrderItem, Qty, Price USD, loại NVL (cotton/pe)

### Page: /kdsx/actuals
- **File:** `src/app/kdsx/actuals/page.tsx`
- **Chức năng:** Danh sách thực hiện tháng
- **API calls:** `GET /api/kdsx/monthly-actuals`

### Page: /kdsx/actuals/[factoryId]/[yearMonth]
- **File:** `src/app/kdsx/actuals/[factoryId]/[yearMonth]/page.tsx`
- **Chức năng:** Chi tiết thực hiện: sync từ SX, thêm dòng phát sinh, quản lý fixed costs
- **API calls:** GET actual, POST sync, POST/DELETE line-items, PUT fixed-costs
- **Có form nhập liệu:** Có — thêm dòng phát sinh (isAdHoc)

### Page: /kdsx/sales-orders
- **File:** `src/app/kdsx/sales-orders/page.tsx`
- **Chức năng:** Danh sách HĐ (filter, tìm kiếm, tạo mới)
- **API calls:** `GET /api/kdsx/sales-orders`, `POST /api/kdsx/sales-orders`
- **Có form nhập liệu:** Có — tạo HĐ mới, thêm SalesOrderItem

### Page: /kdsx/sales-orders/[id]
- **File:** `src/app/kdsx/sales-orders/[id]/page.tsx`
- **Chức năng:** Chi tiết HĐ (progress, allocation history, estimated done date)
- **API calls:** `GET /api/kdsx/sales-orders/[id]`

### Page: /kdsx/order-progress
- **File:** `src/app/kdsx/order-progress/page.tsx`
- **Chức năng:** Theo dõi tiến độ toàn bộ HĐ đang ACTIVE
- **API calls:** `GET /api/kdsx/sales-orders/progress`

### Page: /kdsx/customers
- **File:** `src/app/kdsx/customers/page.tsx`
- **Chức năng:** Quản lý danh mục khách hàng
- **API calls:** GET/POST/PUT/DELETE `/api/kdsx/customers`
- **Có form nhập liệu:** Có

### Page: /kdsx/material-types
- **File:** `src/app/kdsx/material-types/page.tsx`
- **Chức năng:** Quản lý loại NVL (cotton, PE, viscose...)
- **API calls:** GET/POST/PUT/DELETE `/api/kdsx/material-types`

### Page: /kdsx/material-prices
- **File:** `src/app/kdsx/material-prices/page.tsx`
- **Chức năng:** Nhập giá NVL theo tháng (kế toán nhập)
- **API calls:** GET/POST `/api/kdsx/material-prices`, GET `/api/kdsx/material-prices/by-month`

### Page: /kdsx/raw-material-rates
- **File:** `src/app/kdsx/raw-material-rates/page.tsx`
- **Chức năng:** Định mức tiêu hao NVL theo mặt hàng
- **API calls:** GET/POST/PUT/DELETE `/api/kdsx/raw-material-rates`

### Page: /kdsx/production-schedule
- **File:** `src/app/kdsx/production-schedule/page.tsx`
- **Chức năng:** Danh sách kế hoạch SX tháng
- **API calls:** `GET /api/kdsx/production-schedule`

### Page: /kdsx/production-schedule/[id]
- **File:** `src/app/kdsx/production-schedule/[id]/page.tsx` (client: `ProductionScheduleDetailClient.tsx`)
- **Chức năng:** Chi tiết kế hoạch SX: Gantt chart máy, phân bổ ngày chạy, so sánh KH vs TH
- **API calls:** GET schedule + segments, GET actual, GET actual-summary-by-item, POST sync-to-plan
- **Có form nhập liệu:** Có — thêm segment (máy, mặt hàng, fromDay, toDay)

### Page: /kd-daily-input
- **File:** `src/app/kd-daily-input/page.tsx`
- **Chức năng:** Phòng KD nhập sản lượng ngày theo máy (hỗ trợ paste Excel)
- **API calls:** `GET /api/kd-daily-input`, `POST /api/kd-daily-input`
- **Có form nhập liệu:** Có — outputKg, note, item selection per máy; hỗ trợ Ctrl+V paste

### Page: /kd-daily-input/report
- **File:** `src/app/kd-daily-input/report/page.tsx`
- **Chức năng:** Báo cáo lịch sử nhập liệu KD (filter date range, factory, item)
- **API calls:** `GET /api/kd-daily-input/summary`, `GET /api/kd-daily-input`
- **Có form nhập liệu:** Không (chỉ xem, có edit/delete inline)

---

## PHẦN 5: DEPENDENCIES MAP — AI GỌI AI

### `src/lib/kdsx/calculator.ts` — `calculateLineItem()`
- **Được import bởi:**
  - `src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts`
  - `src/app/api/kdsx/monthly-plans/[id]/line-items/[lineItemId]/route.ts`
  - `src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts`
  - `src/app/api/kdsx/monthly-actuals/[id]/line-items/route.ts`
  - `src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts`
- **Import từ:** `@/lib/prisma` (gián tiếp — caller query DB trước rồi pass vào)

### `src/lib/kdsx/calculator.ts` — `refreshSummarySnapshot()`
- **Được import bởi:** 12 route files (xem danh sách đầy đủ ở Phần 3)
- **Import từ:** `@/lib/prisma` (query PlanLineItem, ActualLineItem, FixedCostEntry)

### `src/lib/allocation-engine.ts` — `runAllocationKD()`
- **Được import bởi:** `src/app/api/kd-daily-input/route.ts` (duy nhất)
- **Import từ:** `@/lib/prisma`

### `src/lib/allocation-engine.ts` — `runAllocation()`
- **Được import bởi:** `src/lib/allocation-engine.ts` (chính nó — recalculateAllocation)
- **Đã bị comment out** trong `src/app/api/production/daily-input/route.ts`

### `src/lib/estimate-completion.ts` — `calcEstimatedDoneDate()`
- **Được import bởi:**
  - `src/app/api/kdsx/sales-orders/[id]/route.ts`
  - `src/app/api/kdsx/sales-orders/progress/route.ts`

### Model: `MonthlyPlan`
- **API routes dùng:** Tất cả routes trong `src/app/api/kdsx/monthly-plans/` (10 files)
- **UI pages dùng:** `src/app/kdsx/plans/page.tsx`, `src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx`
- **Lib functions dùng:** `refreshSummarySnapshot()` query MonthlyPlan để lấy factoryId/yearMonth

### Model: `PlanLineItem`
- **API routes dùng:**
  - `src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts`
  - `src/app/api/kdsx/monthly-plans/[id]/line-items/[lineItemId]/route.ts`
  - `src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts`
  - `src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts` (đọc để lấy unitPrice cho TH)
  - `src/app/api/kdsx/production-schedule/[id]/sync-to-plan/route.ts`
- **Lib:** `refreshSummarySnapshot()` aggregate từ PlanLineItem

### Model: `MonthlyActual`
- **API routes dùng:** Tất cả routes trong `src/app/api/kdsx/monthly-actuals/` (6 files)
- **UI pages dùng:** `src/app/kdsx/actuals/page.tsx`, `src/app/kdsx/actuals/[factoryId]/[yearMonth]/page.tsx`

### Model: `ActualLineItem`
- **API routes dùng:**
  - `src/app/api/kdsx/monthly-actuals/[id]/line-items/route.ts`
  - `src/app/api/kdsx/monthly-actuals/[id]/line-items/[lineItemId]/route.ts`
  - `src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts` (upsert)
- **Lib:** `refreshSummarySnapshot()` aggregate từ ActualLineItem

### Model: `MonthlySummarySnapshot`
- **API routes dùng (write):** Tất cả routes gọi `refreshSummarySnapshot()` (12 files)
- **API routes dùng (read):** `src/app/api/kdsx/summary/route.ts`
- **UI pages dùng:** `src/app/kdsx/page.tsx`

### Model: `OrderAllocation`
- **API routes dùng (write):** `src/lib/allocation-engine.ts` (runAllocationKD, recalculateAllocation)
- **API routes dùng (read):**
  - `src/app/api/kdsx/sales-orders/route.ts` (tính progressPct)
  - `src/app/api/kdsx/sales-orders/[id]/route.ts` (lịch sử allocation)
  - `src/app/api/kdsx/sales-orders/progress/route.ts`
  - `src/app/api/kdsx/sales-orders/recalculate/route.ts`

### Model: `KdDailyInput`
- **API routes dùng (write):** `src/app/api/kd-daily-input/route.ts`
- **API routes dùng (read):**
  - `src/app/api/kdsx/production-schedule/[id]/actual/route.ts`
  - `src/app/api/kdsx/production-schedule/[id]/actual-summary-by-item/route.ts`
  - `src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts`
  - `src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts`
  - `src/app/api/kdsx/summary/route.ts` (TH real-time)
  - `src/lib/allocation-engine.ts` (runAllocationKD)
- **Trigger:** Mỗi lần POST KdDailyInput → tự động gọi `runAllocationKD()`

---

## PHẦN 6: DATA VOLUME

Phần này bỏ qua — dữ liệu thật nằm trên server production, sẽ kiểm tra riêng trước khi migration.

Câu lệnh để chạy khi có DB connection:
```sql
SELECT 'SalesOrder' as model, COUNT(*) as count FROM sales_orders;
SELECT 'SalesOrderItem' as model, COUNT(*) as count FROM sales_order_items;
SELECT 'MonthlyPlan' as model, COUNT(*) as count FROM monthly_plans;
SELECT 'PlanLineItem' as model, COUNT(*) as count FROM plan_line_items;
SELECT 'MonthlyActual' as model, COUNT(*) as count FROM monthly_actuals;
SELECT 'ActualLineItem' as model, COUNT(*) as count FROM actual_line_items;
SELECT 'MonthlySummarySnapshot' as model, COUNT(*) as count FROM monthly_summary_snapshots;
SELECT 'OrderAllocation' as model, COUNT(*) as count FROM order_allocations;
SELECT 'KdDailyInput' as model, COUNT(*) as count FROM kd_daily_inputs;
SELECT 'FixedCostEntry' as model, COUNT(*) as count FROM fixed_cost_entries;
SELECT 'ProductionLog' as model, COUNT(*) as count FROM production_logs;
SELECT 'MonthlyInputParam' as model, COUNT(*) as count FROM monthly_input_params;
SELECT 'RawMaterialRate' as model, COUNT(*) as count FROM raw_material_rates;
SELECT 'ProductionSchedule' as model, COUNT(*) as count FROM production_schedules;
SELECT 'ScheduleSegment' as model, COUNT(*) as count FROM schedule_segments;
SELECT 'OrderAllocation', source, COUNT(*) FROM order_allocations GROUP BY source;
```

---

## PHẦN 7: NHẬN XÉT VÀ RỦI RO

### 7.1 Model/Code có thể DEPRECATE (không xóa, chỉ ngừng dùng)

#### `runAllocation()` trong `src/lib/allocation-engine.ts`
- **Lý do:** Đã bị thay thế bởi `runAllocationKD()` — production/daily-input đã comment out lệnh gọi
- **Trạng thái:** Vẫn còn trong codebase, được gọi bởi `recalculateAllocation()` (cho loop nội bộ)
- **Rủi ro:** `recalculateAllocation()` vẫn gọi `runAllocation()` ở dòng 340 — nếu hệ thống chỉ dùng KD source thì sẽ bỏ sót; cần xem lại logic

#### `OrderAllocation.source = "PRODUCTION"`
- **Lý do:** Allocation từ ProductionLog đã ngừng — source "PRODUCTION" có thể là dữ liệu cũ
- **Files reference:** allocation-engine.ts (cả 2 functions đều set source khác nhau)
- **Đề xuất:** Kiểm tra DB xem có records source="PRODUCTION" không trước khi quyết định

#### `MonthlyInputParam` — các trường giá NVL cũ
- **Lý do:** Schema có cả `cottonUsaPrice`, `cottonBrazilPrice`... (cũ) lẫn model `MaterialPrice` + `MaterialType` (mới)
- **Rủi ro:** Hệ thống đang dùng model nào? Nếu đã migrate sang MaterialPrice/MaterialType, các cột giá trong MonthlyInputParam là redundant
- **Cần kiểm tra:** calculator.ts đang đọc giá từ đâu — MonthlyInputParam hay MaterialPrice?

---

### 7.2 Code phức tạp nhất (nhiều dependencies, khó sửa)

#### 1. `src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts`
- **Lý do phức tạp:** 317 dòng, đọc từ 7 models, gọi calculateLineItem N lần, xử lý nhiều edge cases (có plan / không có plan, có HĐ / không có HĐ, isAdHoc, isAutoQty)
- **Dependencies:** ProductionSchedule → ScheduleSegment → KdDailyInput → MonthlyPlan → PlanLineItem → MonthlyInputParam → RawMaterialRate → ActualLineItem → MonthlySummarySnapshot
- **Đề xuất khi refactor:** Tách thành các hàm nhỏ, mỗi bước là 1 hàm riêng trong lib/kdsx/

#### 2. `src/lib/allocation-engine.ts`
- **Lý do phức tạp:** 344 dòng, logic waterfall deadline với nhiều trạng thái, idempotent design (undo rồi redo), 2 source khác nhau (ProductionLog vs KdDailyInput)
- **Dependencies:** Gọi trực tiếp Prisma với $transaction, cập nhật 3 models cùng lúc
- **Đề xuất:** Khi refactor, giữ nguyên interface (`runAllocationKD`) để không ảnh hưởng caller

#### 3. `src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts`
- **Lý do phức tạp:** Đọc schedule → tính SL tự động → giữ snapshot giá cũ → calculateLineItem × N → refresh snapshot
- **Dependencies:** ProductionSchedule, ScheduleSegment, KdDailyInput, PlanLineItem, MonthlyInputParam, RawMaterialRate
- **Đặc biệt:** Phải giữ snapshot giá từ PlanLineItem cũ — không được dùng giá tháng mới

---

### 7.3 Rủi ro khi refactor

#### Cascade Delete cần cẩn thận

| Relation | onDelete |
|----------|----------|
| `SalesOrderItem → SalesOrder` | Cascade — xóa HĐ → xóa toàn bộ items |
| `PlanLineItem → MonthlyPlan` | Cascade — xóa plan → mất toàn bộ line items |
| `ActualLineItem → MonthlyActual` | Cascade — xóa actual → mất toàn bộ line items |
| `FixedCostEntry → MonthlyPlan/MonthlyActual` | Cascade — xóa plan/actual → xóa 14 dòng chi phí |
| `ScheduleSegment → ProductionSchedule` | Cascade |
| `MaintenanceHistory → MaintenanceTask` | Cascade |
| `UserProcess → User` | Cascade |
| `PagePermission → User` | Cascade |

#### Unique Constraints có thể conflict khi refactor

| Model | Unique |
|-------|--------|
| `MonthlyPlan` | `[factoryId, yearMonth]` — mỗi NM chỉ có 1 plan/tháng |
| `MonthlyActual` | `[factoryId, yearMonth]` — mỗi NM chỉ có 1 actual/tháng |
| `MonthlySummarySnapshot` | `[factoryId, yearMonth, type]` |
| `MonthlyInputParam` | `[factoryId, yearMonth]` |
| `ProductionSchedule` | `[factoryId, yearMonth, name]` — cho phép nhiều schedule/tháng nhưng tên phải khác |
| `KdDailyInput` | `[machineId, itemId, recordDate]` |
| `ProductionLog` | `[machineId, recordDate, shift, itemId]` — KHÔNG được thay đổi |
| `ProductivityBenchmark` | `[versionId, itemId, processId, machineModel]` |
| `MaterialPrice` | `[materialTypeId, yearMonth]` |
| `SalesOrder` | `orderNo` |

#### Enum đang được dùng nhiều nơi

| Enum | Dùng ở |
|------|--------|
| `PlanStatus` | MonthlyPlan.status, ProductionSchedule.status (tái dùng) |
| `SnapshotType` | MonthlySummarySnapshot.type, ALL routes gọi refreshSummarySnapshot |
| `FixedCostType` | FixedCostEntry.costType, ALL_FIXED_COST_TYPES constant (14 giá trị — thứ tự quan trọng) |
| `OrderStatus` | SalesOrder.status, allocation-engine (tự động chuyển DONE/OVERDUE) |
| `BenchmarkType` | ProductivityBenchmark.benchmarkType — phân biệt THEORY vs EMPIRICAL |

#### Quan sát đặc biệt: Hai luồng dữ liệu TH song song

Hệ thống hiện có **2 nguồn sản lượng thực hiện**:
1. **ProductionLog** — công nhân nhập theo ca (machineId + recordDate + shift)
2. **KdDailyInput** — phòng KD nhập theo ngày (machineId + recordDate, không có shift)

`/api/kdsx/summary` dùng cả hai nguồn cho TH real-time. `monthly-actuals/sync` chỉ dùng `KdDailyInput`. `production-schedule/actual` đọc cả hai. Đây là điểm dễ gây inconsistency nếu refactor không cẩn thận.

#### Quan sát: MonthlyInputParam vs MaterialPrice/MaterialType (dual schema)

- `MonthlyInputParam` có các trường giá NVL cũ (cottonUsaPrice, peBenmaPrice...) — được dùng trong workflow cũ
- `MaterialType` + `MaterialPrice` là schema mới (dynamic, admin quản lý)
- `PlanLineItem.cottonMaterialTypeId` → FK vào MaterialType → giá lấy từ MaterialPrice
- Cần xác nhận: calculator.ts đang đọc giá từ đâu trong mỗi luồng để tránh double-source confusion khi refactor

---

*File này được tạo tự động bằng audit codebase ngày 2026-05-19. Không chứa dữ liệu thật từ production DB (xem Phần 6).*
