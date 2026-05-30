# PHU BAI ERP — Project Passport

# Dùng file này để bắt đầu conversation mới — paste vào là AI hiểu ngay toàn bộ dự án

## Stack & Nguyên tắc bất biến

- Next.js 16 App Router + PostgreSQL + Prisma ORM + Ant Design + NextAuth.js v5
- **Strictly additive** — không xóa/sửa model/field cũ, chỉ thêm mới
- **Backend là nguồn chân lý** — mọi tính toán ở API, frontend chỉ render
- **Không hard-code nghiệp vụ** — dùng formulaType, benchmarkType... để cấu hình động
- `yearMonth` luôn là String "YYYY-MM", không dùng DateTime
- Unique constraint `production_logs`: `(machineId, recordDate, shift, itemId)`

## Cấu trúc nhà máy

Factory → Process → Machine / Substation

- 3 nhà máy: NM1.2, NMG37, NM3
- Phân quyền theo department (FACTORY/MANAGEMENT/SALES/ACCOUNTING/WAREHOUSE) + extraModules

---

## Modules đã hoàn thành ✅

### Core Production (Module 1)

- Nhập sản lượng theo ca (3 ca/ngày), công thức formulaType 1-4
- Smart Date: tự detect ca/ngày theo giờ hiện tại
- Mobile input + QR Code
- Đổi mặt hàng giữa ca (multi-item per shift)
- Cùng mặt hàng khác lô trên 1 máy (NM1 chạy giùm NM2) — partial unique index thay unique 4 cột
- Mobile-winding 3 thao tác giữa ca: ✏️ Sửa sai / 🔄 Đổi (bao gói nhập SL cũ) / ➕ Thêm song song

### Energy Management (Module 2) ✅

### Maintenance (Module 3) ✅

### Machine Stop Logging (Module 5) ✅

### IoT Excel Import (Module 6) ✅

- Multi-format: STANDARD + DANH_ONG (HTML-as-XLS máy đánh ống)
- Parser architecture: dispatcher + sub-parsers độc lập

---

## Module KD-SX ✅ (hoàn thành đầy đủ)

### Schema chính

```
Customer → SalesOrder → SalesOrderItem
MonthlyInputParam (giá NVL + tỷ giá, unique: factoryId+yearMonth)
RawMaterialRate (định mức tiêu hao, có effectiveFrom/To)
MonthlyPlan (DRAFT→SUBMITTED→APPROVED) → PlanLineItem + FixedCostEntry
MonthlyActual → ActualLineItem + FixedCostEntry
MonthlySummarySnapshot (cache KH/TH)
OrderAllocation (phân bổ sản lượng vào HĐ, source: KD/PRODUCTION)
KdDailyInput (sản lượng ngày phòng KD nhập, unique: machineId+itemId+recordDate)
MonthlyQuota (quota tháng per dòng HĐ; isRemainder=true → nhận phần dư; unique: salesOrderItemId+yearMonth)
```

### Công thức KD-SX

```
DT = SL × Đơn giá USD × Tỷ giá
CP Cotton = SL × ĐM cotton × Giá bông BQ × Tỷ giá
CP PE = SL × ĐM PE × Giá Benma × Tỷ giá  [chỉ CVCM]
Giá bông BQ = (tỷ lệ USA × giá USA) + (tỷ lệ BRA × giá BRA) + 0.02
LN gộp = DT − CP NVL − CP BH − CP GC + Phế thu hồi
LN ròng = LN gộp − Tổng CP cố định + DOANH_THU_HDTC
```

- **DOANH_THU_HDTC là khoản THU** — cộng vào LN, không trừ
- PlanLineItem lưu **snapshot** giá tại thời điểm tạo — không tính lại on-the-fly
- DP (Dự Phòng): salesOrderItemId = null, nhận diện bằng NULL không phải string

### Allocation Engine

- `runAllocationKD(factoryId, date)` — đọc từ KdDailyInput
- `runAllocation(factoryId, date)` — đọc từ ProductionLog (giữ nguyên, không xóa)
- Waterfall theo deadline ASC, cùng deadline ưu tiên plannedQty ASC
- Idempotent: xóa allocation cũ trước khi tạo mới
- Surplus: `salesOrderItemId = null`, `surplusQty > 0`, `source = 'KD'`
- OrderAllocation có field `source: 'KD' | 'PRODUCTION'`

### UI Pages

```
/kdsx                    → Executive dashboard (Ban GĐ, filter nhà máy + tháng)
/kdsx/sales-orders       → Hợp đồng bán hàng (tạo/sửa/xem)
/kdsx/sales-orders/[id]  → Chi tiết HĐ + tab Tiến độ (OrderProgressTab)
/kdsx/order-progress     → Dashboard tiến độ tất cả HĐ (card grid)
/kdsx/customers          → Khách hàng (8 trường, CustomerType: DOMESTIC/FOREIGN)
/kd-daily-input          → Nhập sản lượng ngày (phòng KD, paste từ Excel Ctrl+V)
```

### Quy trình duyệt kế hoạch

```
DRAFT → SUBMITTED (kế toán trình, khóa sửa)
SUBMITTED → APPROVED (Ban GĐ duyệt, chính thức)
APPROVED → SUBMITTED (Admin unapprove, phải nhập lý do)
SUBMITTED → DRAFT (Admin revert, phải nhập lý do)
APPROVED không được xóa
```

### Validate trước khi Submit

- Phải có ≥1 dòng sợi, qty > 0
- Phải có ≥1 khoản CP cố định > 0
- TIEN_LUONG + TIEN_DIEN + KHAU_HAO bắt buộc > 0

---

## Productivity Benchmark ✅

### 2 loại định mức song song

|           | THEORY                                   | EMPIRICAL                                |
| --------- | ---------------------------------------- | ---------------------------------------- |
| Công thức | calcTheoreticalOutput() — KHÔNG thay đổi | Người dùng nhập kg/ngày                  |
| Đơn vị    | kg/ca/máy (stdOutputPerShift)            | kg/ngày/loại máy (empiricalOutputPerDay) |
| Dùng cho  | Đánh giá máy vs thiết kế                 | Lập kế hoạch, đàm phán KD                |

- Unique constraint `(versionId, itemId, processId, machineModel)` áp dụng cho cả 2 loại
- API capacity/comparison: thêm param `benchmarkType=THEORY|EMPIRICAL`
- EMPIRICAL: dailyOutput = empiricalOutputPerDay (đã là kg/ngày, KHÔNG nhân 3)
- THEORY: dailyOutput = stdOutputPerShift × 3

### Trang Capacity — Bộ tính ngày mới

- 3 input: chọn mặt hàng + nhập số máy bố trí + nhập kg cần SX
- Tính realtime: days = ceil(needed / (dmPerDay × machines))
- Bảng so sánh phương án: 1,2,3,5,8,10,15,20 máy
- Gợi ý tổng máy công đoạn từ API

---

## KD Daily Input — Màn hình nhập liệu phòng KD ✅

### Tính năng chính

- Nhập sản lượng cả ngày (3 ca gộp) cho từng máy — 21 lần thay vì 63 lần
- **Paste từ Excel**: Ctrl+C cột sản lượng → click ô đầu → Ctrl+V → tự điền xuống
  - Parse số có dấu phẩy: "1,234" → 1234
  - Copy nhiều cột: chỉ lấy cột đầu (trước \t)
- Inline item selection: đổi mặt hàng ngay trong bảng, cập nhật machine.currentItemId
- Nút "Nhập 0 cho máy dừng" — bỏ qua máy chưa cấu hình (itemId = 0)
- Lưu batch bằng POST /api/kd-daily-input (upsert)
- Sau khi lưu: runAllocationKD() chạy non-blocking

### Schema KdDailyInput

```prisma
model KdDailyInput {
  machineId   Int
  itemId      Int
  recordDate  DateTime @db.Date
  outputKg    Float
  source      String   @default("KD")
  @@unique([machineId, itemId, recordDate])
}
```

---

## Sơ đồ phân công dữ liệu sản lượng

```
Công nhân nhà máy → ProductionLog (theo ca)
  → runAllocation() → OrderAllocation (source=PRODUCTION)
  → ActualLineItem sync cuối tháng

Phòng KD → KdDailyInput (theo ngày, gộp 3 ca)
  → runAllocationKD() → OrderAllocation (source=KD)
  → Tiến độ HĐ, Dashboard KD
```

---

## Production Schedule (Kế hoạch SX tháng) ✅ Phase 1 + Phase 2

### Schema

```
ProductionSchedule (factoryId + yearMonth, status: DRAFT/SUBMITTED/APPROVED)
  holidays  Json  — [1,2,30] ngày nghỉ
  itemColors Json — {"1":"#4CAF50",...} màu per-schedule (Phase 2)
  segments  ScheduleSegment[]

ScheduleSegment
  machineId | itemId | fromDay | toDay | kgPerDay
  isManualKg Boolean — phân biệt auto-fill vs thủ công
  benchmarkId Int?  — audit trail
```

### Tính năng chính

- **Auto-fill** kgPerDay từ EMPIRICAL benchmark (hoạt động với cả 1 máy hoặc nhiều máy cùng model)
- **Color picker** ngay trên grid, lưu vào `itemColors` per-schedule
- **4 Tabs**: Kế hoạch (grid edit + drag resize) | Thực hiện (read-only, màu so sánh) | So sánh KH/TH (Recharts) | DT-LN kế hoạch (PLAN allocation P&L)
- Nguồn dữ liệu TH: KdDailyInput → fallback ProductionLog.groupBy
- Tab 4 DT-LN kế hoạch: PLAN mode allocation dùng SL từ ScheduleSegments → waterfall → P&L summary + by contract
- Drag-to-resize: kéo cạnh trái/phải segment cell để co giãn fromDay/toDay (pointer events, no library)

### Files chính

```
src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx
src/components/kdsx/ScheduleSegmentModal.tsx      — multi-machine OK (Phase 2 fix)
src/components/kdsx/ActualProductionGrid.tsx      — Grid TH read-only [MỚI]
src/components/kdsx/ScheduleComparisonDashboard.tsx — Bar+Line+Table [MỚI]
src/app/api/kdsx/production-schedule/[id]/actual/route.ts [MỚI]
src/app/api/kdsx/production-schedule/[id]/plan-pnl/route.ts [MỚI] — PLAN allocation → P&L
```

### Quy tắc benchmark fill (2026-05-07)

- Chỉ **dòng cuối cùng** của mỗi máy (combo có `lastDay` lớn nhất) mới được điền benchmark vào ngày tương lai.
- Các dòng mặt hàng đã ngưng → trống sau `lastDay` của chúng.
- Điều kiện: `bmKg > 0 && !daysWithActualData.has(day) && day > lastDay && isLastCombo`
- Map `lastRowPerMachine` / `lastComboPerMachine` được tính một lần trước vòng lặp render trong cả 3 file liên quan.

---

## File quan trọng trong project

```
src/lib/kdsx/calculator.ts         — calculateLineItem(), refreshSummarySnapshot()
src/lib/kdsx/calculator-v2.ts      — calculateRevenuePnL() — dùng cho SPEC A/C P&L tab
src/lib/allocation-engine.ts       — runAllocation(), runAllocationKD(), recalculateAllocation()
src/lib/allocation-engine-v2.ts    — runAllocationFromProduction(factoryId, yearMonth, mode, processId?) — PLAN/REAL/PROJECTION
src/lib/estimate-completion.ts     — calcEstimatedDoneDate()
src/lib/permissions.ts             — canViewModule(), canAccessKdsx()
src/utils/benchmark.ts             — calcTheoreticalOutput() — KHÔNG sửa
src/lib/iot-parsers/               — parser-standard.ts, parser-danh-ong.ts
src/components/kdsx/ActualProductionGrid.tsx     — Grid TH read-only
src/components/kdsx/ScheduleComparisonDashboard.tsx — Dashboard so sánh KH/TH
CLAUDE.md                          — Standing instructions cho Claude Code
BUSINESS_LOGIC_CONTEXT.md         — Full context (file gốc, đọc khi cần chi tiết)
```

---

## Còn thiếu / Known Limitations

### Chưa implement

- Export Excel báo cáo KH/TH theo format file gốc
- Copy kế hoạch tháng trước sang tháng mới
- ~~UI trang nhập MonthlyQuota theo processId~~ ✅ Done SPEC B (monthly-quotas page có processId selector)
- Backfill processId cho production_schedules cũ và factoryId/processId cho monthly_quotas cũ (xem SPEC 0)
- Snapshot tháng trước cho cumProducedPrevMonths (hiện tính từ OrderAllocation)
- Tìm kiếm/lọc khách hàng theo customerType
- Validate email/phone/MST ở backend
- runAllocation tích hợp vào IoT import route
- Drill-down comparison theo từng máy (chỉ có tổng hợp tháng)
- Cảnh báo tự động NS thực tế < ngưỡng
- Export Excel grid KH/TH Production Schedule
- Color picker trên grid Thực hiện và So sánh (hiện chỉ ở tab Kế hoạch)

### Gác lại chủ ý

- Lot management (phân lô, số lô) — làm sau
- Quản lý kho (tồn kho, xuất kho nội bộ sợi xe đôi) — làm sau

---

## Insight quan trọng từ file Excel thực tế (NM3 T1/2026)

- 21 loại sợi, tổng 437,820 kg, DT 35.125 tỷ, LN −0.457 tỷ (lỗ do Tết)
- Mã HĐ ghép: "443PB25, 17PB26" → 2 dòng riêng trong PlanLineItem
- "ĐX" suffix = sợi xe đôi (ghép 2 sợi đơn) — bán được cả dạng đơn lẫn xe đôi
- Cột "Còn lại" âm = sản xuất vượt HĐ → surplus pool → waterfall tháng sau
- Sợi CVCM có thêm CP PE (Benma), các loại khác chỉ có CP Cotton
- CP GC xe đôi chỉ áp dụng sợi /2 (30/2, 40/2...)

---

## Cập nhật 2026-05-09: Module Quản lý Lô hàng

### Đã hoàn thành

- **Schema**: 2 enum mới (LotType, LotStatus) + model Lot + LotMaterialLink + field currentLotId (Machine) + lotId (ProductionLog)
- **API CRUD**: /api/lots (GET/POST), /api/lots/[id] (GET/PUT/DELETE), /api/lots/[id]/traceability (GET)
- **UI**: /lots page — CRUD lô hàng với filter, modal tạo/sửa, link nguyên liệu bằng checkbox
- **Tích hợp máy**: Machines page hiển thị "Lô đang SX", form sửa máy có Select chọn lô YARN đang OPEN
- **Auto lotId**: ProductionLog.upsert tự lấy lotId từ Machine.currentLotId (không cần UI nhập)
- **Sidebar**: catalog.lots đã có trong DANH MỤC
- **PageRegistry**: id=50, pageKey='catalog.lots'

### Gác lại chủ ý (đã cập nhật)

- ~~Lot management (phân lô, số lô)~~ → **ĐÃ XONG 2026-05-09**
- UI trang traceability riêng (hiện chỉ có API)
- Tự động clear Machine.currentLotId khi đóng lô
- Lọc lịch sử sản xuất theo lô
