# CHANGELOG.md — Cập nhật: 2026-05-24

Lịch sử các tính năng đã hoàn thành, theo thứ tự thời gian mới nhất. Mục đích: tra cứu nhanh "đã làm gì rồi" mà không cần đọc hết module files. Chi tiết business logic xem trong MODULE_PRODUCTION.md hoặc MODULE_KDSX.md.

---

## 2026-05-24

### PRODUCTION INPUT — Fix bug xem ca cũ (daily-input modal)
- Fix `quickAssignItemId` khởi tạo từ todayLog thay vì currentItem
- Guard assignment update khi sửa ca cũ
- Files: `src/app/production/daily-input/page.tsx`

### PRODUCTION INPUT — Fix bug xem ca cũ & đổi item (daily-input-grid + mobile-input)
- daily-input-grid: DELETE log cũ trước POST khi item thay đổi
- mobile-input: thêm `existingItemId`, ưu tiên item từ log khi save ca cũ
- Files: `src/app/production/daily-input-grid/page.tsx`, `src/app/production/mobile-input/page.tsx`

### SẢN XUẤT — Nâng cấp trang nhập liệu đánh ống (inline edit + fix lịch sử)
- Fix extra item trên mobile (bỏ disabled)
- Inline đổi mặt hàng (nút ✏️) trên cả desktop và mobile
- Fix lịch sử ca: build rows từ logs khi có, từ assignments khi chưa có
- Files: `src/app/production/winding-input/page.tsx`, `src/app/production/mobile-winding/page.tsx`

---

## 2026-05-23

### SẢN XUẤT — Tách trang nhập liệu đánh ống & Tối ưu code
- Tạo `/production/winding-input` và extract shared logic
- `src/lib/production-utils.ts`, `src/types/production.ts`, `src/hooks/useProductionMetadata.ts`
- Loại bỏ multi-item code khỏi 3 trang cũ
- Fix bug `currentItemId` bị ghi đè khi sửa log ngày cũ

### MOBILE — Trang nhập liệu đánh ống Mobile
- Tạo `/production/mobile-winding`
- Desktop `winding-input` thêm màu xen kẽ theo máy

---

## 2026-05-22

### KẾ HOẠCH SẢN XUẤT — Tách ActualProductionGrid khỏi planGrid
- Tab Thực hiện giờ chọn theo công đoạn (Process), độc lập với segments KH
- API `/actual` thêm param `processIds`

---

## 2026-05-20

### MACHINES — Gán lô sợi cho máy multi-item + Cải tiến modal điều phối
- `MachineItemAssignment.lotId` cho lô riêng từng mặt hàng
- Modal phân công thêm Select lô lọc theo mặt hàng

### DASHBOARD V2 — Fix filter công đoạn ống & timezone UTC
- Filter `isRevenueProcess: true` trong production-matrix
- Chuyển date range sang UTC

### CÔNG ĐOẠN — Đánh dấu công đoạn tính doanh thu
- Field `isRevenueProcess` trong Process
- Admin bật thủ công cho công đoạn cuối

---

## 2026-05-19

### KD-SX V2 — Revenue Refactor (Phase 1–7)
- Allocation engine v2 (waterfall: priority → deadline → signedDate)
- Calculator v2 (DT/CP/LN từ AllocationResult)
- Dashboard `/kdsx/revenue` (today + MTD + projected)
- SalesOrderItem thêm: priorityOverride, deferToMonth, wasteRecoveryRate
- FixedCostEntry v2: factoryId + yearMonth trực tiếp

---

## 2026-05-17

### KDSX — Multi-Schedule mỗi tháng + isPrimary
- Cho phép nhiều ProductionSchedule / tháng / nhà máy
- `isPrimary = true` dùng cho Dashboard, sync, recalculate

---

## 2026-05-14

### KD-SX — Sản lượng TH real-time trong summary
- API summary tính TH từ ProductionLog thay vì snapshot
- Filter theo segments của schedule isPrimary

---

## 2026-05-13

### LOT MANAGEMENT — Bỏ liên kết mặt hàng trên Lot
- Lot không còn gắn itemId khi tạo qua UI

### NHẬP SẢN LƯỢNG — Ghi ngược Mặt hàng & Lô hàng
- daily-input-grid: ghi ngược đổi item + lô về trang điều phối máy
- PATCH `/api/machines/[id]/assignments` cho máy multi-item

### DAILY INPUT (Mobile) — Hỗ trợ máy multi-item
- Modal phân nhánh theo allowMultiItemPerShift

---

## 2026-05-12

### KDSX — isAutoQty hiển thị live qty
- UI hiển thị qty mới nhất (cam + tag) nhưng chỉ lưu khi bấm "Tính lại tất cả"

### Production — Hiển thị cột "Lô" trên các trang nhập/xem sản lượng
- Thêm cột lô trên mobile cards, grid, lịch sử

### PRODUCTION — Sửa lô (lotId) trong modal sửa bản ghi lịch sử
- ADMIN sửa lotId qua PATCH `/api/production/history/[id]`

---

## 2026-05-11

### KDSX — "Tự tính SL" frontend tính từ sản lượng giả định
- Frontend tính qty từ actual + benchmark; backend chỉ validate

### KDSX — Bỏ logic tính autoQty từ ScheduleSegment ở backend
- Backend không tính qty cho isAutoQty nữa

### PRODUCTION — Sửa/Xóa bản ghi production_logs cho ADMIN trên trang Lịch sử
- PATCH + DELETE `/api/production/history/[id]` — ADMIN only

### KDSX — Dòng sợi isAutoQty tự cập nhật qty
- Auto-sync qty khi mở trang (frontend) và khi bấm "Tính lại tất cả" (backend)

---

## 2026-05-09

### LOT MANAGEMENT — Module Quản lý Lô hàng
- 3 loại lô: RAW_COTTON, RAW_FIBER, YARN
- Auto-set lotId từ Machine.currentLotId khi nhập SL
- CRUD + traceability API

### ITEMS — Mở quyền Sửa/Xóa mặt hàng cho SALES & PROCESS_LEADER

---

## 2026-05-07

### KDSX — Production Schedule: Fix logic điền benchmark
- Chỉ lastRow của mỗi máy (mặt hàng đang chạy) mới được điền benchmark

### MOBILE INPUT — Inline Multi-Item & Quick Item Change
- Multi-item machines: add/swap/remove items inline trên mobile

---

## 2026-05-06

### SẢN XUẤT — Máy ống chạy nhiều mặt hàng song song
- `allowMultiItemPerShift`, `MachineItemAssignment`, UI điều phối
- kd-daily-input render N rows per multi-item machine

### KẾ HOẠCH SẢN XUẤT — Benchmark Fill cho ô chưa nhập SL
- Ô trống → điền benchmark (chữ xám, nền xám nhạt)

### USER MANAGEMENT — Multi-Factory Assignment for STATISTICIAN
- Bảng pivot `UserFactory`, `factoryIds` bake vào JWT

---

## 2026-05-05

### DANH MỤC MẶT HÀNG — Thêm field yarnType vào Item
- `SINGLE` (sợi 1 thành phần) vs `BLENDED` (sợi pha)

### KDSX — Fix overlap logic cho segments
- Chỉ chặn overlap cùng máy + cùng mặt hàng

---

## 2026-05-03

### ADMIN — Page Registry Management UI
- CRUD danh sách trang cho hệ thống phân quyền

---

## 2026-05-01

### KDSX — Chuyển nguồn dữ liệu thực tế sang ProductionLog
- API actual grid dùng ProductionLog.groupBy thay vì KdDailyInput

---

## 2026-04-28

### HỆ THỐNG PHÂN QUYỀN — Fix stale JWT và logic fallback sai
- JWT refresh pagePermissions mỗi lần tái sử dụng
- machines/page.tsx dùng getRoleDefaultPerm thay vì hardcode

---

## 2026-04-25

### ACTUAL PRODUCTION GRID — Benchmark Map từ EMPIRICAL
- API `/actual` trả thêm benchmarkMap; UI ưu tiên benchmark so màu

### SCHEDULE COMPARISON DASHBOARD — Fix cấu trúc ActualGrid
- Sửa interface compatible với API mới

---

## 2026-04-21

### MATERIAL PRICE MANAGEMENT — Quản lý Giá NVL Động
- MaterialType, MaterialPrice; cottonRatio trong RawMaterialRate
- Snapshot giá vào PlanLineItem/ActualLineItem

---

## 2026-04-20

### ORDER-TRACKING — Thêm deliveredQty (Lịch sử giao hàng)
- `stillNeeded = plannedQty - deliveredQty - allocatedQty`

---

## 2026-04-19

### PRODUCTION-SCHEDULE — Cải tiến Phase 2
- Fix auto-fill multi-machine; itemColors per-schedule
- Tab Thực hiện (ActualProductionGrid) + Tab So sánh KH/TH

---

## 2026-04-17

### KD-SX — Module Kế hoạch SX tháng (Production Schedule)
- ProductionSchedule + ScheduleSegment; auto-fill từ EMPIRICAL benchmark
- Grid Excel-like, holidays, sync-to-plan

---

## 2026-04-16

### SẢN XUẤT — Nhập sản lượng dạng bảng (Grid)
- `/production/daily-input-grid` với paste Excel support

---

## 2026-04-15

### PRODUCTION — Trường Hiệu suất máy (efficiency)
- `efficiency Float?` trong ProductionLog; công thức trọng số

---

## 2026-04-14

### PRODUCTIVITY BENCHMARK — Migrate permission system
- 6 route migrate sang userRole

### TOÀN HỆ THỐNG — Migrate permission sang userRole
- ~35 API route migrate, không còn dùng accessLevel

### PRODUCTION DAILY INPUT — Xóa bản ghi production_logs
- DELETE endpoint + nút xóa với Popconfirm

---

## 2026-04-13

### KD DAILY INPUT — Quick item assignment inline
- Thay đổi mặt hàng ngay trong bảng nhập SL phòng KD

---

## 2026-04-12

### IOT IMPORT — Multi-format parser architecture
- IotFileFormat enum, sub-parser STANDARD + DANH_ONG

---

## 2026-04-11

### MODULE ĐỊNH MỨC NĂNG SUẤT — Định mức Thực nghiệm (EMPIRICAL)
- BenchmarkType enum; empiricalOutputPerDay; capacity/comparison hỗ trợ filter

---

## 2026-04-06

### KDSX — Mở rộng thông tin Khách hàng
- 5 field mới + CustomerType enum

---

## 2026-04-05

### USER-PERMISSION — Department + Extra Modules
- canViewModule(), sidebar ẩn/hiện theo department

---

## 2026-04-03

### THEO DÕI TIẾN ĐỘ — Surplus UI
- Dashboard + OrderProgressTab surplus indicator

### KẾ HOẠCH THÁNG — Hỗ trợ dòng "Dự phòng (DP)"
- `salesOrderItemId = null` = dòng Dự phòng

---

## 2026-04-02

### ORDER-TRACKING — Schema + Allocation Engine + API + UI (Parts 1-3 + corrections)
- OrderAllocation, runAllocation waterfall, recalculateAllocation
- API routes: progress, recalculate, complete, cancel
- UI: sales-orders list + detail + charts

---

## 2026-04-01

### KD-SX — Full Implementation
- 11 models, 3 enums, calculator, dashboard, plans, actuals

### PRODUCTIVITY-BENCHMARK — Định mức Năng suất Lý thuyết
- BenchmarkVersion, ProductivityBenchmark, calcTheoreticalOutput()

---

## Pre-2026-04 (Core modules — đã ổn định)

### Module 1: Core Production — Quản lý sản lượng
### Module 2: Energy Management — Quản lý điện năng
### Module 3: Maintenance — Bảo dưỡng thiết bị
### Module 4: Mobile & QR Code — Nhập liệu mobile
### Module 5: Machine Stop Logging — Ghi nhận dừng máy
### Module 6: IoT Excel Import — Import dữ liệu IoT

(Chi tiết xem MODULE_PRODUCTION.md)
