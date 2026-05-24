# CORE.md — Cập nhật: 2026-05-24

Thông tin nền tảng chung cho toàn bộ hệ thống Phu Bai ERP. File này chứa tech stack, data hierarchy, phân quyền, AI coding rules, cấu trúc thư mục, và schema database tổng quan. **Đọc file này trước khi làm bất kỳ task nào.**

---

## 1. TỔNG QUAN HỆ THỐNG

- **Tên dự án:** Phần mềm quản lý sản xuất ERP Sợi Phú Bài.
- **Công nghệ (Tech Stack):** Next.js 16 (App Router), PostgreSQL + Prisma ORM, Ant Design (UI), NextAuth.js v5 (Authentication).
- **Mục tiêu:** Quản lý sản lượng máy móc, điện năng tiêu thụ và bảo dưỡng thiết bị một cách tự động, chính xác, chống thất thoát dữ liệu.

---

## 2. CẤU TRÚC TỔ CHỨC DỮ LIỆU (DATA HIERARCHY)

Dữ liệu được tổ chức theo cây phân cấp chặt chẽ: **Nhà máy (Factory) -> Công đoạn (Process) -> Máy móc (Machine) / Trạm biến áp (Substation)**.

- Một Nhà máy có nhiều Công đoạn.
- Các Công đoạn ở các nhà máy khác nhau có thể trùng tên (cần phân biệt bằng `factoryId`).
- Mỗi máy chỉ thuộc về một Công đoạn duy nhất.

---

## 3. PHÂN QUYỀN NGƯỜI DÙNG (AUTHORIZATION & DATA SCOPE)

Phân quyền không chỉ theo Role (Vai trò) mà còn theo Data Scope (Phạm vi dữ liệu).

- **Tài khoản & Quản lý:** Có đăng ký tài khoản, Admin duyệt kích hoạt. User tự đổi mật khẩu, Admin đổi được mật khẩu mọi User.
- **Admin:** Toàn quyền hệ thống, không bị giới hạn dữ liệu. Chỉ Admin mới được quyền xóa máy móc.
- **Manager / Operator (User thường):** Mỗi User được gán cố định vào **1 Công đoạn (`processId`)**.
  - Chỉ được nhập liệu/sửa/xóa dữ liệu _trong công đoạn của mình_.
  - Chỉ có thể xem (Read-only) dữ liệu của công đoạn khác.
  - Không được xóa máy, chỉ được sửa cấu hình máy (mặt hàng, chi số, số cọc).

### 3.1. Phân quyền theo Department (bổ sung)

- `department`: FACTORY | MANAGEMENT | SALES | ACCOUNTING | WAREHOUSE
- `extraModules`: String[] — module được xem thêm ngoài quyền mặc định
- Logic check: xem `src/lib/permissions.ts` → hàm `canViewModule()`
- ADMIN bypass tất cả, không cần check department
- Department mặc định theo FACTORY_MODULES:
  - FACTORY: production, maintenance, energy, iot, stops
  - MANAGEMENT: tất cả module
  - SALES: kdsx
  - ACCOUNTING: kdsx, energy
  - WAREHOUSE: không có module nào

### 3.2. Hệ thống phân quyền mới (userRole)

- Toàn bộ ~35 API route đã migrate sang `session.user.userRole` (không còn dùng `accessLevel` hay `session.user.role`)
- ADMIN-only: các bảng danh mục (factories, processes, categories, items, energy, backup...)
- ALLOWED_ROLES `["ADMIN","DIRECTOR","FACTORY_MANAGER"]`: IoT import/mapping, production lines, benchmark bulk
- Write nhập liệu sản xuất: mọi user authenticated (không phân biệt role)
- JWT callback trong `auth.ts` refresh pagePermissions từ DB mỗi lần token được tái sử dụng

### 3.3. Multi-Factory Assignment (STATISTICIAN)

- Bảng pivot `UserFactory` (nhiều-nhiều User ↔ Factory)
- `factoryId` (single) trên bảng users vẫn giữ (backward compat) = factoryIds[0]
- `factoryIds` được bake vào JWT token và session
- `canEditFactory()` cho STATISTICIAN: check factoryIds.includes(targetId), fallback factoryId

---

## 4. NGUYÊN TẮC BẤT BIẾN KHI AI VIẾT CODE (AI CODING RULES)

1. **Tuyệt đối không phá vỡ chuỗi liên tục của Chỉ số.** Không được để khoảng trống dữ liệu.
2. **Backend là nguồn chân lý (Source of Truth).** Mọi tính toán logic, tìm chỉ số phải nằm ở Backend. Frontend chỉ gửi yêu cầu và render.
3. **Cấu hình động, không hard-code.** Công thức tính toán phụ thuộc vào `formulaType` của máy, không fix cứng logic cho từng tên máy.
4. **Không tự suy diễn nghiệp vụ.** Mọi đề xuất thay đổi database/schema phải giải thích lý do và có migration an toàn.
5. **Unique constraint production_logs:** Hiện tại là `(machineId, recordDate, shift, itemId)` — cho phép nhiều mặt hàng trong 1 ca.
6. **Strictly additive** — không xóa, không đổi tên field/model/table đã có. Chỉ thêm mới.

---

## 5. UX / UI & TRẢI NGHIỆM NGƯỜI DÙNG

Thiết kế tối ưu cho tốc độ của công nhân nhà máy.

- **Tự động điền (Auto-fill):** Khi đăng nhập, tự động chọn Công đoạn theo User. Khi chọn máy, tự động điền Mặt hàng, Chi số (NE), Số cọc, Chỉ số trước.
- **Layout Lưới (Grid):** Hiển thị sơ đồ máy thay vì Dropdown dài. Máy chưa nhập màu trắng, đã nhập màu xanh.
- **Lưu & Tiếp tục (Save & Next):** Bấm 1 nút để lưu máy hiện tại và tự động chuyển form sang máy tiếp theo, không cần đóng/mở cửa sổ.
- **Tính toán Real-time:** Nhập số xong tự động nảy ra con số Sản lượng (kg) để công nhân kiểm tra trước khi bấm Lưu.

---

## 6. CẤU TRÚC THƯ MỤC TỔNG QUAN

```
src/
├── app/
│   ├── api/                      — API routes (backend)
│   │   ├── production/           — Nhập sản lượng, lịch sử, dừng máy
│   │   ├── kdsx/                 — KD-SX module (plans, actuals, sales-orders, schedule)
│   │   ├── v2/                   — Revenue refactor v2 (dashboard, contracts, fixed-costs)
│   │   ├── iot/                  — IoT import
│   │   ├── energy/               — Điện năng
│   │   ├── machines/             — CRUD máy + assignments
│   │   ├── lots/                 — Quản lý lô
│   │   └── productivity-benchmark/ — Định mức năng suất
│   ├── production/               — UI nhập sản lượng (daily-input, grid, mobile, winding)
│   ├── kdsx/                     — UI KD-SX (plans, actuals, schedule, revenue, sales-orders)
│   ├── machines/                 — UI quản lý máy
│   ├── lots/                     — UI quản lý lô
│   ├── dashboard/                — UI admin dashboards
│   ├── admin/                    — UI admin (permissions, page-registry)
│   └── reports/                  — UI báo cáo
├── components/
│   ├── AdminLayout.tsx           — Sidebar layout chính
│   ├── kdsx/                     — Components KD-SX
│   ├── iot-import/               — Components IoT import wizard
│   └── reports/                  — Components báo cáo
├── lib/
│   ├── prisma.ts                 — Prisma client singleton
│   ├── permissions.ts            — canViewModule(), canAccessKdsx(), etc.
│   ├── allocation-engine.ts      — Allocation v1 (waterfall theo deadline)
│   ├── allocation-engine-v2.ts   — Allocation v2 (revenue refactor)
│   ├── kdsx/calculator.ts        — calculateLineItem() + refreshSummarySnapshot()
│   ├── kdsx/calculator-v2.ts     — DT/CP/LN từ AllocationResult
│   ├── iot-parsers/              — Sub-parsers cho IoT import
│   ├── estimate-completion.ts    — calcEstimatedDoneDate()
│   └── production-utils.ts      — calcOutput(), detectShiftAndDate(), YARN_CONSTANT
├── hooks/
│   └── useProductionMetadata.ts  — Hook fetch metadata dùng chung
├── types/
│   └── production.ts             — Shared types cho production input
├── utils/
│   └── benchmark.ts              — calcTheoreticalOutput()
├── auth.ts                       — NextAuth config (JWT + session callbacks)
└── auth.config.ts                — Edge middleware authorized()
```

---

## 7. SCHEMA DATABASE TỔNG QUAN

### Models chính (danh sách)

**Core:**
- `Factory` — Nhà máy
- `Process` — Công đoạn (+ `isRevenueProcess` flag)
- `Machine` — Máy móc (+ `formulaType`, `allowMultiItemPerShift`, `model`, `currentLotId`)
- `Item` — Mặt hàng (+ `yarnCategory`, `yarnCount`, `yarnPly`, `yarnType`)
- `User` — Người dùng (+ `department`, `extraModules`, `userRole`)
- `UserFactory` — Pivot nhiều-nhiều User ↔ Factory
- `MachineItemAssignment` — Phân công mặt hàng cho máy multi-item (+ `lotId`)

**Production:**
- `ProductionLog` — Bản ghi sản lượng ca (+ `efficiency`, `lotId`)
- `MachineStopLog` — Bản ghi dừng máy
- `StopCategory` — Danh mục nguyên nhân dừng
- `Lot` — Lô hàng (RAW_COTTON, RAW_FIBER, YARN)
- `LotMaterialLink` — Liên kết nguyên liệu giữa lô

**Energy:**
- `Substation` — Trạm biến áp
- `EnergyMeter` — Đồng hồ điện
- `EnergyLog` — Bản ghi điện năng

**Maintenance:**
- `MaintenanceTask` — Hạng mục bảo dưỡng
- `MaintenanceHistory` — Lịch sử bảo dưỡng

**KD-SX (xem MODULE_KDSX.md):**
- `Customer`, `SalesOrder`, `SalesOrderItem`, `OrderAllocation`
- `MonthlyPlan`, `PlanLineItem`, `MonthlyActual`, `ActualLineItem`
- `FixedCostEntry`, `MonthlyInputParam`, `MonthlySummarySnapshot`
- `RawMaterialRate`, `MaterialType`, `MaterialPrice`
- `ProductionSchedule`, `ScheduleSegment`

**Benchmark:**
- `BenchmarkVersion` — Phiên bản định mức
- `ProductivityBenchmark` — Định mức năng suất (THEORY | EMPIRICAL)

**IoT:**
- `IotSource`, `IotMachineMap`, `IotItemMap`, `IotImportLog`

**Auth/Admin:**
- `PageRegistry`, `PagePermission`

### Enums quan trọng

- `PlanStatus`: DRAFT | SUBMITTED | APPROVED
- `OrderStatus`: ACTIVE | DONE | OVERDUE | CANCELLED
- `FixedCostType`: 14 loại chi phí cố định
- `BenchmarkType`: THEORY | EMPIRICAL
- `LotType`: RAW_COTTON | RAW_FIBER | YARN
- `LotStatus`: OPEN | CLOSED
- `IotFileFormat`: STANDARD | DANH_ONG
- `CustomerType`: DOMESTIC | FOREIGN

### Conventions

- **Auth:** dùng `auth()` từ NextAuth ở đầu mọi API route
- **Error response:** `NextResponse.json({ error: '...' }, { status: 4xx })`
- **Prisma:** import từ `@/lib/prisma`
- **Số tiền:** lưu VNĐ (Float), hiển thị format `tỷ đồng` với 3 chữ số thập phân
- **yearMonth:** luôn là String `"YYYY-MM"`, validate bằng `/^\d{4}-\d{2}$/`
- **Ngày tháng:** dùng `@db.Date` cho các trường chỉ cần ngày, không dùng DateTime
- **UTC:** Date range tháng dùng UTC; khi group log theo ngày dùng `getUTCDate()` thay vì `getDate()`

---

## Liên quan đến

- **CONTEXT_INDEX.md** — Bản đồ tổng thể, đọc đầu tiên
- **MODULE_PRODUCTION.md** — Chi tiết module sản xuất, nhập liệu, IoT, dừng máy
- **MODULE_KDSX.md** — Chi tiết module KD-SX, đơn hàng, doanh thu
- **CHANGELOG.md** — Lịch sử tính năng đã hoàn thành
