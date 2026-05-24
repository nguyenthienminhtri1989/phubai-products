# CONTEXT_INDEX.md — Cập nhật: 2026-05-24

**AI đọc file này ĐẦU TIÊN trong mỗi phiên làm việc.**

---

## Mô tả dự án

Phu Bai ERP là phần mềm quản lý sản xuất cho 3 nhà máy sợi, xây trên Next.js 16 + PostgreSQL + Prisma + Ant Design. Hệ thống bao gồm: nhập sản lượng ca (core), quản lý điện năng, bảo dưỡng, nhập liệu mobile/QR, ghi nhận dừng máy, import IoT, kế hoạch kinh doanh-sản xuất (KD-SX) với allocation engine và dashboard doanh thu real-time. Dữ liệu phân cấp: Nhà máy → Công đoạn → Máy; phân quyền theo role + department + processId.

---

## Danh sách files ngữ cảnh

| File | Mục đích | Đọc khi nào |
|------|----------|-------------|
| **CONTEXT_INDEX.md** (file này) | Bản đồ tổng thể, hướng dẫn AI | Luôn đọc đầu tiên |
| **CORE.md** | Tech stack, data hierarchy, phân quyền, AI rules, schema tổng quan, cấu trúc thư mục | Luôn đọc (nền tảng mọi task) |
| **MODULE_PRODUCTION.md** | Core production, điện năng, bảo dưỡng, mobile/QR, dừng máy, IoT, benchmark, lô hàng | Task liên quan nhập SL, máy móc, IoT, benchmark, lô |
| **MODULE_KDSX.md** | KD-SX, đơn hàng, allocation, production schedule, NVL, revenue v2 | Task liên quan KD-SX, kế hoạch, đơn hàng, doanh thu |
| **CHANGELOG.md** | Lịch sử tính năng theo thời gian | Kiểm tra "đã làm gì rồi", tránh trùng lặp |
| **CLAUDE.md** | Conventions code, quy trình migration, workflow phối hợp | Luôn đọc (quy tắc bắt buộc) |
| **PROJECT_PASSPORT.md** | Hiện trạng tổng thể dự án | Session mới, cần overview nhanh |
| **AI_RULES.md** | Chi tiết conventions, phân quyền, quy trình | Cần tham khảo sâu |

---

## Ma trận phụ thuộc giữa các module

```
MODULE_PRODUCTION                    MODULE_KDSX
┌─────────────────────┐             ┌────────────────────────┐
│ Core Production     │────────────▶│ KD-SX                  │
│  · ProductionLog    │  SL thực tế │  · MonthlyActual.sync  │
│  · Machine          │  cho TH     │  · ActualProductionGrid│
│  · daily-input POST │─────────┐   │  · Summary dashboard   │
│                     │         │   │                        │
│ Benchmark           │────────▶│   │ Production Schedule    │
│  · EMPIRICAL        │ auto-fill│  │  · ScheduleSegment     │
│  · stdOutputPerShift│ kgPerDay │  │  · sync-to-plan        │
│                     │         │   │                        │
│ Lot Management      │         │   │ Allocation Engine      │
│  · Machine.currentLotId──────▶│   │  · runAllocation()     │
│  · ProductionLog.lotId│       └──▶│  · trigger post daily  │
│                     │             │    -input              │
│ Machine Stop        │             │ Revenue V2             │
│  · MachineStopLog   │             │  · allocation-engine-v2│
└─────────────────────┘             │  · calculator-v2       │
                                    │  · isRevenueProcess    │
                                    │    (từ Process model)  │
                                    └────────────────────────┘
```

### Điểm giao nhau cụ thể

1. **ProductionLog → KD-SX**: `MonthlyActual.sync` GROUP BY ProductionLog để lấy sản lượng TH; `ActualProductionGrid` hiển thị SL thực tế; `summary` route tính TH từ ProductionLog
2. **daily-input POST → Allocation Engine**: Sau mỗi upsert ProductionLog thành công, gọi `runAllocation(factoryId, date)` non-blocking
3. **Benchmark EMPIRICAL → Production Schedule**: `ScheduleSegment.kgPerDay` auto-fill từ `ProductivityBenchmark.empiricalOutputPerDay`; benchmark cũng dùng trong `ActualProductionGrid` fill ô trống
4. **Machine.currentLotId → ProductionLog.lotId**: Khi POST daily-input, auto-set `lotId` từ `Machine.currentLotId`
5. **Process.isRevenueProcess → Revenue V2**: Production matrix chỉ tính SL từ công đoạn doanh thu

---

## Quick reference — Các field/enum/constraint quan trọng

### Unique constraints

| Table | Unique | Ý nghĩa |
|-------|--------|---------|
| production_logs | (machineId, recordDate, shift, itemId) | 1 máy × 1 ca × 1 mặt hàng = 1 bản ghi |
| monthly_plans | (factoryId, yearMonth) | 1 NM × 1 tháng = 1 kế hoạch |
| production_schedules | (factoryId, yearMonth, name) | 1 NM × 1 tháng × 1 tên = 1 KH SX |
| material_prices | (materialTypeId, yearMonth) | 1 loại NVL × 1 tháng = 1 giá |
| raw_material_rates | (itemId, effectiveFrom) | Định mức theo item + thời điểm |
| productivity_benchmarks | (versionId, itemId, processId, machineModel) | 1 tổ hợp = 1 định mức |
| iot_machine_maps | (sourceId, iotName) | Mapping IoT per source |

### Enums thường dùng

| Enum | Values | Dùng ở |
|------|--------|--------|
| PlanStatus | DRAFT, SUBMITTED, APPROVED | MonthlyPlan, ProductionSchedule |
| OrderStatus | ACTIVE, DONE, OVERDUE, CANCELLED | SalesOrder |
| BenchmarkType | THEORY, EMPIRICAL | ProductivityBenchmark |
| FixedCostType | 14 giá trị | FixedCostEntry |
| LotType | RAW_COTTON, RAW_FIBER, YARN | Lot |
| IotFileFormat | STANDARD, DANH_ONG | IotSource |

### Conventions số liệu

| Item | Format | Ví dụ |
|------|--------|-------|
| yearMonth | String "YYYY-MM" | "2026-05" |
| Tiền VNĐ | Float (VNĐ tuyệt đối) | 35125000000 |
| Hiển thị tỷ đồng | ÷1e9, 3 decimal | 35.125 |
| efficiency | Float % (97.5 = 97.5%) | 97.5 |
| benchmark efficiency | Float 0-1 (0.85 = 85%) | 0.85 |
| Ngày DB | @db.Date (không DateTime) | 2026-05-24 |
| Date range | UTC | `new Date('2026-05-01T00:00:00.000Z')` |

---

## Hướng dẫn cho AI — Đọc file nào khi làm task nào

### Task liên quan SẢN XUẤT (nhập SL, máy, ca)
1. Đọc **CORE.md** (sections 1-5)
2. Đọc **MODULE_PRODUCTION.md** (Module 1: công thức, traceability, ca)
3. Nếu liên quan máy multi-item → mục 4.5-4.7
4. Nếu liên quan lô → mục Lot Management

### Task liên quan KD-SX (kế hoạch, đơn hàng, doanh thu)
1. Đọc **CORE.md** (sections 1-4, 7)
2. Đọc **MODULE_KDSX.md** (toàn bộ)
3. Nếu cần hiểu SL thực tế → **MODULE_PRODUCTION.md** Module 1

### Task liên quan PRODUCTION SCHEDULE
1. Đọc **MODULE_KDSX.md** → phần Production Schedule + ActualProductionGrid
2. Đọc **MODULE_PRODUCTION.md** → mục 8 (Benchmark) để hiểu auto-fill

### Task liên quan IOT IMPORT
1. Đọc **MODULE_PRODUCTION.md** → Module 6
2. Nếu cần thêm parser → xem `src/lib/iot-parsers/`

### Task liên quan PHÂN QUYỀN
1. Đọc **CORE.md** → sections 3 (phân quyền chi tiết)
2. Xem `src/lib/permissions.ts`

### Task liên quan MIGRATION / SCHEMA
1. Đọc **CLAUDE.md** → mục 7 (Quy trình Migration an toàn)
2. Đọc **CORE.md** → section 7 (Schema tổng quan)
3. Đọc module file liên quan để hiểu models cần thay đổi

### Task mới / không rõ scope
1. Đọc **CONTEXT_INDEX.md** (file này)
2. Đọc **CORE.md**
3. Check **CHANGELOG.md** để biết đã làm gì rồi
4. Đọc module file phù hợp

---

## Liên quan đến

- **CORE.md** — Thông tin nền tảng chung
- **MODULE_PRODUCTION.md** — Chi tiết sản xuất
- **MODULE_KDSX.md** — Chi tiết KD-SX
- **CHANGELOG.md** — Lịch sử tính năng
- **CLAUDE.md** — Conventions và quy tắc bắt buộc
