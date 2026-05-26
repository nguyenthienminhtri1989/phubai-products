# MODULE_KDSX.md — Cập nhật: 2026-05-26

Toàn bộ module Kinh doanh - Sản xuất (KD-SX): kế hoạch tháng, thực hiện, calculator, snapshot, đơn hàng, allocation engine, production schedule, revenue refactor v2, quản lý NVL.

---

## TỔNG QUAN MODULE KD-SX

Module số hóa toàn bộ quy trình lập kế hoạch kinh doanh hàng tháng cho 3 nhà máy sản xuất sợi, thay thế file Excel "KẾ_HOẠCH_KD-SX". Bao gồm:

1. **Kế hoạch tháng (MonthlyPlan)** — doanh thu/chi phí ước tính
2. **Thực hiện tháng (MonthlyActual)** — tổng hợp từ ProductionLog (xem MODULE_PRODUCTION.md)
3. **Đơn hàng (SalesOrder)** — hợp đồng bán sợi
4. **Allocation Engine** — phân bổ sản lượng vào hợp đồng
5. **Production Schedule** — kế hoạch SX chi tiết theo máy/ngày
6. **Revenue Dashboard v2** — DT/LN real-time

---

## NGUỒN DỮ LIỆU GỐC (EXCEL)

File Excel gốc có 2 loại sheet:

**Sheet DT (Doanh thu)** — mỗi dòng là 1 loại sợi:
- Cột: STT | Loại sợi | Hợp đồng | Số lượng (kg) | Đơn giá (USD/kg) | Doanh thu | CP NVL Cotton | CP NVL PE | CP Bán hàng | CP GC sợi xe đôi | Phế thu hồi
- Phần dưới: tổng chi phí cố định tháng + lợi nhuận ước tính

**Sheet SL (Sản lượng)** — sản lượng thực tế theo ngày/máy

---

## NGHIỆP VỤ TÍNH TOÁN

### Công thức chính

```
Doanh thu (VNĐ)   = Số lượng (kg) × Đơn giá (USD/kg) × Tỷ giá (VNĐ/USD)

CP Cotton (VNĐ)   = Tỷ giá × Qty × CottonPriceUsd × CottonRate × CottonRatio
CP PE (VNĐ)       = Tỷ giá × Qty × PePriceUsd × PeRate(GỐC) × PeRatio
                    └─ peRatio = 1 - cottonRatio; chỉ tính khi peRatio > 0

CP GC xe đôi      = Chỉ áp dụng sợi /2 (30/2 COCD, 40/2 COCM...)
Phế thu hồi       = Giá trị DƯƠNG — trừ vào tổng chi phí

Lợi nhuận gộp     = DT − CP NVL − CP Bán hàng − CP GC + Phế thu hồi
Lợi nhuận ròng    = LN gộp − Tổng CP cố định + Doanh thu HĐTC
```

### Thông số thay đổi hàng tháng

- Giá bông (USD/kg): USA/Brazil ~1.73–1.81, Pima ~3.78, CMIA ~1.70, Úc ~1.71–1.87, Supima ~3.66
- Giá PE Benma: ~1.02–1.14 USD/kg
- Tỷ lệ phối trộn bông (VD: 60% USA + 40% Brazil)
- Tỷ giá: 25,600–26,200 VNĐ/USD

### Chi phí cố định tháng (14 loại — enum FixedCostType)

Tiền lương, Trích trước lương, Tiền ăn ca, BHXH/YT/TN/KPCĐ, Tiền điện, Khấu hao, Ống cone/bao PP, CP vật liệu khác, CP quản lý DN, Lãi vay VCĐ, Lãi vay VLĐ, Lỗ CL tỷ giá, **Doanh thu HĐTC** (khoản THU, cộng vào LN), Khác.

---

## SCHEMA DATABASE

### Models mới cho KD-SX

```
① Hợp đồng bán hàng (CẬP NHẬT 2026-05-26)
   Customer (+ address, phone, email, taxCode, customerType DOMESTIC|FOREIGN)
     → SalesOrder (contractCode, deliveryDate, status OrderStatus, startDate, completedDate)
       → SalesOrderItem (plannedQty, allocatedQty, deliveredQty, unitPriceUsd, priorityOverride, deferToMonth, wasteRecoveryRate)
         - BỎ @@unique([orderId, itemId]) → cho phép cùng 1 HĐ có 2+ dòng cùng item
         - THÊM field note: String? — ghi chú phân biệt (cảng, container)
         - Lý do: 1 HĐ có thể tách 2 dòng cùng mặt hàng nhưng đi 2 cảng khác nhau
           → CPBH khác → đơn giá khác
         - Relation mới: quotas MonthlyQuota[]
     → OrderAllocation (factoryId, itemId, productionDate, allocatedQty)

② Thông số & NVL
   MaterialType (code, name, category COTTON|PE)
     → MaterialPrice (yearMonth, priceUsd) @@unique([materialTypeId, yearMonth])
   MonthlyInputParam (factoryId, yearMonth, exchangeRate)
   RawMaterialRate (itemId, effectiveFrom/To, cottonRate, peRate, cottonRatio)

③ Kế hoạch (KH)
   MonthlyPlan (factoryId + yearMonth, status: DRAFT|SUBMITTED|APPROVED)
     ├── PlanLineItem[] — snapshot: revenueVnd, cottonCostVnd, cottonPriceUsd, pePriceUsd, cottonRatio, isAutoQty
     └── FixedCostEntry[] (v1: monthlyPlanId FK)

④ Thực hiện (TH)
   MonthlyActual (factoryId + yearMonth)
     ├── ActualLineItem[] — mirror PlanLineItem, qty tổng hợp từ ProductionLog
     └── FixedCostEntry[] (v1: monthlyActualId FK)

⑤ Dashboard
   MonthlySummarySnapshot (factoryId + yearMonth + type: KH|TH)

⑥ Kế hoạch SX chi tiết
   ProductionSchedule (factoryId + yearMonth + name, isPrimary, holidays Json, itemColors Json, status PlanStatus)
     → ScheduleSegment (machineId, itemId, fromDay, toDay, kgPerDay, benchmarkId?, isManualKg)

⑦ FixedCostEntry v2 (Revenue refactor)
   FixedCostEntry dùng factoryId + yearMonth trực tiếp (thay vì FK monthlyPlanId/monthlyActualId)

⑧ Phân bổ tháng (MonthlyQuota) — MỚI 2026-05-26
   MonthlyQuota (salesOrderItemId, yearMonth, quotaQty?, isRemainder, sortOrder)
     → SalesOrderItem @relation
     @@unique([salesOrderItemId, yearMonth])

   Mục đích: Phòng KD quyết định mỗi đầu tháng rót bao nhiêu SL cho từng dòng HĐ.
   2 loại: FIXED (quotaQty = số cụ thể) | REMAINDER (quotaQty = NULL, nhận phần dư)
   Mỗi item + yearMonth chỉ có tối đa 1 REMAINDER.
   Khi không có quota → waterfall chạy tự động như cũ.
```

---

## QUY TẮC QUAN TRỌNG KHI CODE

### 1. Lưu snapshot — KHÔNG tính lại on-the-fly

`PlanLineItem` và `ActualLineItem` lưu sẵn `revenueVnd`, `cottonCostVnd`, `cottonPriceUsd`, `pePriceUsd`... tại thời điểm tạo. Giá NVL/tỷ giá thay đổi hàng tháng — nếu tính lại bằng giá hiện tại thì lịch sử tháng trước sẽ sai.

### 2. yearMonth luôn là String "YYYY-MM"

Validate bằng `/^\d{4}-\d{2}$/`. Không dùng DateTime.

### 3. FixedCostEntry v1 có 2 optional FK

```typescript
if (!monthlyPlanId && !monthlyActualId) throw Error("Phải thuộc KH hoặc TH");
if (monthlyPlanId && monthlyActualId) throw Error("Không thể thuộc cả KH và TH");
```

### 4. Nguồn sản lượng TH — ProductionLog

```typescript
const actualQty = await prisma.productionLog.groupBy({
  by: ["itemId"],
  where: {
    machine: { process: { factoryId } },
    recordDate: { gte: startOfMonth, lte: endOfMonth },
  },
  _sum: { finalOutput: true },
});
```

### 5. Lấy định mức đúng thời điểm

```typescript
const rate = await prisma.rawMaterialRate.findFirst({
  where: {
    itemId,
    effectiveFrom: { lte: planDate },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: planDate } }],
  },
  orderBy: { effectiveFrom: "desc" },
});
```

### 6. `DOANH_THU_HDTC` là khoản THU — cộng vào lợi nhuận, KHÔNG tính vào chi phí

### 7. isAutoQty — frontend là source of truth

- Dòng sợi `isAutoQty=true`: frontend tính `qty = max(0, round(projected[itemId] - sum(otherLineItems.qty cùng item)))`
- Backend KHÔNG tính qty cho isAutoQty — chỉ validate qty phải có
- Projected qty = actual ProductionLog + benchmark EMPIRICAL cho lastRow của mỗi máy ở ngày chưa có data
- UI hiển thị liveQty với màu cam + tag "⚡ Đã thay đổi" khi khác qty đã lưu; chỉ persist khi bấm "Tính lại tất cả"

### 8. SalesOrderItem cho phép cùng orderId + itemId (2026-05-26)

- KHÔNG CÒN unique constraint `@@unique([orderId, itemId])`
- 1 HĐ có thể có 2+ dòng cùng mặt hàng (khác giá do cảng/container)
- Dùng field `note` để phân biệt
- Code KHÔNG ĐƯỢC dùng `findUnique({ where: { orderId_itemId } })`
  → dùng `findFirst({ where: { orderId, itemId } })` hoặc tìm theo `id`

### 9. MonthlyQuota — mỗi item+yearMonth tối đa 1 REMAINDER

- Validation: `isRemainder=true` thì `quotaQty` phải NULL
- Mỗi cặp (itemId, yearMonth) trong cùng factory chỉ có 1 dòng `isRemainder=true`
- Khi không có quota → engine hoạt động y như cũ

---

## QUYỀN TRÌNH DUYỆT

```
Kế toán: Tạo MonthlyPlan → DRAFT → nhập PlanLineItem + FixedCostEntry
    ↓ Trình duyệt → SUBMITTED (khóa chỉnh sửa)
Ban GĐ: Phê duyệt → APPROVED
    ↓
Cuối tháng — Kế toán: Tạo MonthlyActual + sync từ ProductionLog
    ↓
Dashboard: So sánh KH vs TH qua MonthlySummarySnapshot
```

---

## ORDER TRACKING & ALLOCATION ENGINE

### Allocation Engine v1 (`src/lib/allocation-engine.ts`)

- `runAllocation(factoryId, date)` — idempotent: undo allocations cũ → waterfall phân bổ mới
- Waterfall theo deadline: `orderBy: [{ order.deliveryDate asc }, { plannedQty asc }]`
- `stillNeeded = plannedQty - deliveredQty - allocatedQty`
- Auto DONE: `checkAllItemsDone(orderId)` → nếu tất cả items ≥ plannedQty → DONE
- Flag OVERDUE: `status=ACTIVE + deliveryDate < now()` → OVERDUE
- Lỗi allocation **không block** nhập sản lượng (wrapped trong try/catch riêng)
- `deliveredQty`: "Đã giao trước khi dùng phần mềm" cho hợp đồng cũ

### Allocation Engine v2 (`src/lib/allocation-engine-v2.ts`)

- Waterfall: priorityOverride → deadline → signedDate → orderId
- `deferToMonth`: HĐ bị hoãn không xuất hiện trong tháng hiện tại
- `wasteRecoveryRate` per-item: override định mức chung
- Tính DT/CP/LN từ AllocationResult (`src/lib/kdsx/calculator-v2.ts`)

#### Allocation Engine v2 — cập nhật MonthlyQuota (2026-05-26)

- Nếu có MonthlyQuota cho item+yearMonth → chế độ quota:
  - Rót FIXED trước (theo sortOrder), cap bởi `quotaQty`
  - Rót REMAINDER cuối (nhận phần dư)
  - HĐ không có quota nhưng active → waterfall thông thường sau REMAINDER
- Nếu không có MonthlyQuota → waterfall như cũ (backward compatible)
- `AllocationLine` thêm field `note` (ghi chú cảng/container)

### SalesOrder API

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | /api/kdsx/sales-orders | Danh sách / tạo đơn hàng |
| GET/PUT/DELETE | /api/kdsx/sales-orders/[id] | Chi tiết / sửa / xóa |
| PATCH | /api/kdsx/sales-orders/[id]/status | Update status (ACTIVE/DONE/CANCELLED) |
| POST | /api/kdsx/sales-orders/recalculate | Tính lại toàn bộ phân bổ (Admin only) |
| GET | /api/kdsx/sales-orders/progress | Tiến độ tổng hợp với isAtRisk |
| GET | /api/kdsx/sales-orders/surplus | Surplus qty per item |

### Order Progress UI

- `/kdsx/order-progress` — Dashboard card grid, card border: green=on track, orange=isAtRisk, red=OVERDUE
- `/kdsx/sales-orders/[id]?tab=progress` — Biểu đồ tích lũy Recharts

---

## PHÂN BỔ THÁNG (MONTHLY QUOTA) — MỚI 2026-05-26

### Bối cảnh nghiệp vụ

Khi nhiều HĐ cùng 1 mặt hàng, Phòng KD cần kiểm soát "tháng này rót bao nhiêu cho HĐ nào"
thay vì để waterfall tự rót hết cho HĐ ưu tiên cao nhất.

### 3 Pattern từ Excel thực tế

1. **FIXED (gõ tay)**: KD nhập số cụ thể cho từng HĐ (VD: HĐ A = 17T, HĐ B = 5T)
2. **Tham chiếu tháng trước**: HĐ tổng − SL đã SX tháng trước = còn phải SX
3. **REMAINDER (HĐ cuối)**: Tổng SL mặt hàng − tổng các FIXED = phần dư rơi vào HĐ cuối

### Schema: MonthlyQuota

| Field | Type | Mô tả |
|-------|------|-------|
| salesOrderItemId | Int | FK → SalesOrderItem |
| yearMonth | String | "2026-05" |
| quotaQty | Float? | Số kg. NULL khi isRemainder=true |
| isRemainder | Boolean | true = HĐ cuối nhận phần dư |
| sortOrder | Int | Thứ tự rót (FIXED: số nhỏ trước) |

### Waterfall v2 với quota

```
CÓ QUOTA:
  1. Rót FIXED trước (theo sortOrder)
     allocQty = min(remainingProduction, quotaQty, contractRemaining)
  2. Phần dư → REMAINDER
     allocQty = min(remainingProduction, contractRemaining)
  3. Vượt tất cả → surplus
KHÔNG CÓ QUOTA: waterfall như cũ (theo priority)
```

### API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v2/monthly-quotas | Lấy quota theo factory+yearMonth+item |
| POST | /api/v2/monthly-quotas | Tạo/cập nhật quota |
| POST | /api/v2/monthly-quotas/copy-from-previous | Copy từ tháng trước |

### UI: Trang /kdsx/monthly-quotas

Bảng nhóm theo mặt hàng, mỗi nhóm hiển thị các HĐ active với cột quota.
Mặt hàng chỉ có 1 HĐ → không cần quota.

### Kiểm soát xuyên tháng

Chuỗi kiểm soát: Tổng HĐ → deliveredQty (trước PM) → Lũy kế SX các tháng trước → Còn lại → Quota tháng → Thực SX tháng → Còn lại mới.

Sang tháng mới:
- Cột "Lũy kế đã SX" hiển thị tổng SX tất cả tháng trước
- Cột "Còn lại" = Tổng HĐ - deliveredQty - lũy kế
- Nút "Copy từ tháng trước" pre-fill quota, tự điều chỉnh theo remaining
- HĐ đã hoàn thành (còn lại = 0) tự ẩn

---

## PRODUCTION SCHEDULE — Kế hoạch SX chi tiết

### Tổng quan

Phân bổ mặt hàng trên từng máy theo từng ngày, dùng benchmark EMPIRICAL auto-fill.

```
ProductivityBenchmark.empiricalOutputPerDay (định mức kg/ngày)
    ↓ (auto-fill)
ProductionSchedule + ScheduleSegment (kế hoạch SX)
    ↓ (tổng hợp, trừ ngày nghỉ)
PlanLineItem.qty (sản lượng kế hoạch)
```

### Multi-Schedule (isPrimary)

- 1 nhà máy có thể tạo nhiều schedule/tháng (VD: KH sợi con, KH sợi ống)
- Unique: `(factoryId, yearMonth, name)`
- `isPrimary = true` → dùng cho Dashboard, sync MonthlyActual, recalculate MonthlyPlan
- Set primary = transaction atomic

### Tính tổng kg có trừ ngày nghỉ

```
days = toDay - fromDay + 1
holidaysInRange = holidays.filter(h => h >= fromDay && h <= toDay).length
effectiveDays = max(0, days - holidaysInRange)
totalKg = effectiveDays × kgPerDay
```

### Workflow trạng thái

- **DRAFT**: sửa tự do segments, toggle holiday
- **SUBMITTED**: khóa segments, chỉ xem. Revert → DRAFT
- **APPROVED**: khóa hoàn toàn. Chỉ khi APPROVED mới gọi `sync-to-plan`

### Tab Thực hiện (ActualProductionGrid)

- API `/api/kdsx/production-schedule/[id]/actual?processIds=1,2` — lấy ProductionLog theo công đoạn
- Benchmark fill: ô chưa có SL → điền benchmark (chữ xám nghiêng, nền #f0f0f0), CHỈ cho lastRow của mỗi máy
- Màu so sánh: xanh (TH ≥ KH), vàng (90% ≤ TH < KH), đỏ (TH < 90%)

### Tab So sánh KH/TH (ScheduleComparisonDashboard)

- Recharts: Bar chart per item + Line chart tích lũy
- Bảng tổng hợp: KH (kg) | TH (kg) | Chênh lệch | Tỷ lệ (tag màu)

### itemColors — Màu mặt hàng per-schedule

```typescript
function getItemColor(itemId, itemColors) {
  if (itemColors[String(itemId)]) return itemColors[String(itemId)];
  return DEFAULT_COLORS[itemId % 16]; // fallback palette 16 màu
}
```

### API Endpoints

| Method | Path | Mô tả |
| ------ | ---- | ----- |
| GET/POST | /api/kdsx/production-schedule | List / Tạo schedule |
| GET/PUT/DELETE | /api/kdsx/production-schedule/[id] | Chi tiết / sửa / xóa |
| POST | /api/kdsx/production-schedule/[id]/segments | Thêm segment + auto-fill |
| PUT/DELETE | /api/kdsx/production-schedule/[id]/segments/[segmentId] | Sửa / xóa segment |
| GET | /api/kdsx/production-schedule/[id]/summary | Tổng hợp kg theo item |
| POST | /api/kdsx/production-schedule/[id]/sync-to-plan | Đồng bộ sang MonthlyPlan (chỉ APPROVED) |
| GET | /api/kdsx/production-schedule/benchmark-lookup | Tra cứu EMPIRICAL |
| GET | /api/kdsx/production-schedule/[id]/actual | Sản lượng thực tế |
| POST | /api/kdsx/production-schedule/[id]/set-primary | Toggle primary |

---

## MATERIAL PRICE MANAGEMENT — Quản lý Giá NVL

### Schema

- `MaterialType` — Danh mục loại NVL (code, name, category COTTON|PE)
- `MaterialPrice` — Giá NVL theo tháng, unique `(materialTypeId, yearMonth)`
- `RawMaterialRate` — Định mức tiêu hao + `cottonRatio` (VD: 0.6 = 60% cotton, 40% PE)

### Nguyên tắc

1. **Snapshot giá bất biến:** `recalculate` dùng snapshot trong lineItem, KHÔNG tra cứu giá mới
2. **cottonRatio trong RawMaterialRate:** Nhập 1 lần, code tự tính `peRatio = 1 - cottonRatio`
3. **peRate là giá trị GỐC:** kg NL/kg TP, code nhân peRatio khi tính

### Seed data (10 loại NVL)

| Code | Tên | Category |
|------|-----|----------|
| AUS | Bông Úc | COTTON |
| US_PVC | Bông Mỹ PVC | COTTON |
| BRA | Bông Brazil | COTTON |
| WEST_AFRICA | Bông Tây Phi | COTTON |
| PIMA | Bông Pima | COTTON |
| SUPIMA | Bông Supima | COTTON |
| CMIA | Bông CMIA | COTTON |
| PE_BENMA | PE Benma (Indo) | PE |
| PE_THAI | PE Thái Lan | PE |
| VISCOSE | Xơ Viscose | PE |

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | /api/kdsx/material-types | Danh sách / tạo loại NVL |
| PUT/DELETE | /api/kdsx/material-types/[id] | Sửa / xóa |
| GET/POST | /api/kdsx/material-prices | Giá NVL / upsert |
| GET | /api/kdsx/material-prices/by-month | Tất cả loại + giá tháng |

---

## REVENUE DASHBOARD V2 (`/kdsx/revenue`)

### Tổng quan

Tính DT/LN real-time từ ProductionLog qua allocation waterfall v2, thay vì đọc snapshot.

### API Endpoints v2

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v2/dashboard/revenue | DT/LN 1 NM (today+MTD+projected) |
| GET | /api/v2/dashboard/revenue-all | Tổng hợp tất cả NM |
| GET | /api/v2/contracts/progress | Tiến độ HĐ + waterfall |
| GET/PUT | /api/v2/fixed-costs | 14 dòng CP cố định |
| POST | /api/v2/fixed-costs/copy-from-previous | Copy CP tháng trước |
| GET | /api/v2/production-matrix | Ma trận SL theo item × ngày |

### Logic

- REAL mode: CP cố định chia tỷ lệ theo ngày đã qua
- PROJECTION mode: SL tương lai = benchmark EMPIRICAL × số máy × ngày còn lại
- Production matrix chỉ tính SL công đoạn `isRevenueProcess = true` (xem CORE.md)
- Date range dùng UTC (tránh lệch timezone)

### KD-SX Summary API (`/api/kdsx/summary`)

- TH sản lượng: SUM ProductionLog.finalOutput WHERE machineId IN segments(isPrimary=true)
- KH: đọc từ MonthlySummarySnapshot (không đổi)
- Nhà máy chưa có schedule → totalQtyKg = 0

---

## DỮ LIỆU THỰC TẾ THAM KHẢO (T1/2026 — NM3)

| Chỉ số | Giá trị |
| ------ | ------- |
| Tổng sản lượng KH | 437,820 kg |
| Doanh thu ước tính | 35.125 tỷ VNĐ |
| Tổng chi phí | 35.672 tỷ VNĐ |
| Lợi nhuận | −0.457 tỷ (lỗ nhẹ do Tết) |
| Tỷ giá | 26,100 VNĐ/USD |
| Giá bông BQ | ~1.773 USD/kg |
| Số loại sợi | 21 loại |

---

## CẤU TRÚC THƯ MỤC KD-SX

```
app/kdsx/
  page.tsx                          — Dashboard tổng hợp 3 NM (cũ, có banner dẫn sang revenue)
  revenue/page.tsx                  — Dashboard DT/LN v2 mới
  customers/page.tsx                — Quản lý khách hàng
  sales-orders/page.tsx             — Quản lý đơn hàng
  sales-orders/[id]/page.tsx        — Chi tiết HĐ + tiến độ
  order-progress/page.tsx           — Dashboard tiến độ đơn hàng
  plans/page.tsx                    — Danh sách kế hoạch tháng
  plans/[factoryId]/[yearMonth]/page.tsx — Chi tiết kế hoạch
  actuals/page.tsx                  — Danh sách thực hiện tháng
  actuals/[factoryId]/[yearMonth]/page.tsx — Chi tiết thực hiện
  production-schedule/page.tsx      — Danh sách KH SX
  production-schedule/[id]/page.tsx — Chi tiết KH SX (grid Excel-like)
  material-types/page.tsx           — Danh mục NVL
  material-prices/page.tsx          — Giá NVL theo tháng
  raw-material-rates/page.tsx       — Định mức tiêu hao NVL

app/api/kdsx/
  customers/...                     — CRUD khách hàng
  sales-orders/...                  — CRUD đơn hàng + progress + recalculate + surplus
  input-params/...                  — Thông số tháng
  raw-material-rates/...            — Định mức NVL
  material-types/...                — Loại NVL
  material-prices/...               — Giá NVL
  monthly-plans/...                 — Kế hoạch tháng + line-items + fixed-costs + submit/approve/revert/recalculate
  monthly-actuals/...               — Thực hiện tháng + fixed-costs + sync
  production-schedule/...           — KH SX + segments + summary + actual + sync-to-plan + benchmark-lookup
  summary/...                       — Dashboard snapshot

lib/
  kdsx/calculator.ts                — calculateLineItem() v1 + refreshSummarySnapshot()
  kdsx/calculator-v2.ts             — DT/CP/LN từ AllocationResult
  allocation-engine.ts              — Allocation v1
  allocation-engine-v2.ts           — Allocation v2
  estimate-completion.ts            — calcEstimatedDoneDate()

components/kdsx/
  FixedCostTable.tsx                — Bảng 14 CP cố định
  OrderProgressTab.tsx              — Progress table + cumulative chart
  ScheduleSegmentModal.tsx          — Modal thêm/sửa segment
  ActualProductionGrid.tsx          — Grid thực hiện read-only
  ScheduleComparisonDashboard.tsx   — Dashboard so sánh KH/TH
```

---

## Liên quan đến

- **CORE.md** — Tech stack, phân quyền, conventions (yearMonth, amountVnd)
- **MODULE_PRODUCTION.md** — ProductionLog là nguồn SL thực tế cho KD-SX; Benchmark EMPIRICAL dùng trong schedule auto-fill
- **CHANGELOG.md** — Lịch sử chi tiết các tính năng đã hoàn thành

---

## SPEC FILES THAM KHẢO

Các file SPEC chi tiết cho từng phase implementation:

| File | Nội dung |
|------|----------|
| SPEC_PHASE1_SCHEMA_MONTHLY_QUOTA.md | Schema MonthlyQuota + bỏ unique constraint + API CRUD |
| SPEC_PHASE2_UI_MONTHLY_QUOTA.md | UI trang phân bổ tháng (/kdsx/monthly-quotas) |
| SPEC_PHASE3_ENGINE_AND_MULTILINE.md | Cập nhật engine v2 + SalesOrder UI multi-line |
