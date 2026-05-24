# MODULE_PRODUCTION.md — Cập nhật: 2026-05-24

Tất cả logic liên quan đến sản xuất thực tế: nhập sản lượng (core production), điện năng, bảo dưỡng, mobile/QR, dừng máy, IoT import, định mức năng suất, quản lý lô hàng, và các cải tiến/bug fix liên quan.

---

## MODULE 1: QUẢN LÝ SẢN LƯỢNG (CORE PRODUCTION)

Đây là module cốt lõi, yêu cầu tính toán real-time và truy vết dữ liệu liên tục như Odometer (Công tơ mét).

### 1.1. Quy tắc Ngày và Ca sản xuất

- **Định nghĩa Ca:** Một ngày có 3 ca.
  - Ca 1: 06:00 - 14:00 (Thuộc ngày hiện tại).
  - Ca 2: 14:00 - 22:00 (Thuộc ngày hiện tại).
  - Ca 3: 22:00 - 06:00 sáng hôm sau (**BẤT BIẾN: Luôn thuộc về ngày sản xuất hôm nay, không phụ thuộc lịch thực tế**).
- **Logic Tự động chọn Ca/Ngày (Smart Date - Cho phép chốt sớm 1 tiếng):**
  - `13:00 - 20:59`: Gợi ý **Ca 1** - Ngày hiện tại (T).
  - `21:00 - 23:59`: Gợi ý **Ca 2** - Ngày hiện tại (T).
  - `00:00 - 04:59`: Gợi ý **Ca 2** - **Ngày hôm qua (T-1)**.
  - `05:00 - 12:59`: Gợi ý **Ca 3** - **Ngày hôm qua (T-1)**.

### 1.2. Phân loại máy & Công thức tính toán

Được lưu ở trường `formulaType` trong bảng Machine.

- **Loại 1 (Máy nén/thô - Nhập trực tiếp):** Nhập thẳng sản lượng ca. `Sản lượng = Chỉ số sau`.
- **Loại 2 (Trừ lùi - Máy cũ):** `Sản lượng = Chỉ số sau - Chỉ số trước`.
- **Loại 3 (Có số cọc & NE):** `Sản lượng = ((Chỉ số sau - Chỉ số trước) * Số cọc) / (Chi số NE * 1000 * 1.693)`.
- **Loại 4 (Chia NE):** `Sản lượng = (Chỉ số sau - Chỉ số trước) / Chi số NE`.

Shared utility: `src/lib/production-utils.ts` → `calcOutput()` (4 formulaType), `detectShiftAndDate()`, `YARN_CONSTANT`

### 1.3. Logic truy vết "Chỉ số trước" (Traceability)

Phần mềm **tự động** lục tìm bản ghi gần nhất của máy đó trong quá khứ để lấy "Chỉ số cuối" của ca trước làm "Chỉ số trước" cho ca này.

- **Thuật toán tìm kiếm (Backend):** Tìm bản ghi có `Cùng MachineID` VÀ `(Ngày < Ngày hiện tại HOẶC (Ngày = Ngày hiện tại AND Ca < Ca hiện tại))` -> Sắp xếp giảm dần -> Lấy Top 1.
- Nếu không tìm thấy (máy mới), cho phép User nhập tay "Chỉ số trước" lần đầu.

### 1.4. Xử lý sự cố & Ngoại lệ (Bắt buộc tuân thủ)

- **Máy dừng/Nghỉ:** Vẫn **PHẢI** lưu bản ghi (Sản lượng = 0, Chỉ số sau = Chỉ số trước) để chuỗi chỉ số không bị đứt đoạn.
- **Đồng hồ tua về 0 / Thay mới (Reset):** Có Checkbox "Reset/Thay đồng hồ". Khi bật, mở khóa ô "Chỉ số trước" cho nhập tay, bỏ qua logic liên tục. `Sản lượng = Chỉ số sau` (hoặc tính dựa trên số nhập tay).
- **Validation cấm lưu (Error):** Nếu (Chỉ số sau < Chỉ số trước) mà KHÔNG bật Reset -> Cảnh báo đỏ, **Khóa nút Lưu** (chống âm).
- **Validation bất thường (Warning):** Nếu tính ra > 1000kg do thừa số 0 -> Cảnh báo vàng, nhưng vẫn cho Lưu.

### 1.5. Trường Hiệu suất máy (efficiency)

- Field `efficiency Float?` trong `ProductionLog`, lưu dạng % (VD: 97.5 = 97.5%)
- Công thức trọng số: `avgEff = Σ(finalOutput_i × efficiency_i) / Σ(finalOutput_i)` — chỉ tính ca có `efficiency != null && finalOutput > 0`
- Ngưỡng màu: xanh ≥95%, cam ≥85%, đỏ <85%
- Biểu đồ OutputByDate: ComposedChart Bar sản lượng + Line hiệu suất (trục Y phải [70,100])

### 1.6. Xóa/Sửa bản ghi production_logs

- DELETE endpoint: `DELETE /api/production/daily-input?id=X` — role ADMIN/DIRECTOR/FACTORY_MANAGER/STATISTICIAN
- ADMIN sửa qua `/api/production/history/[id]` (PATCH): partial update itemId, startIndex, endIndex, finalOutput, efficiency, note, lotId
- Khi đổi `itemId`, kiểm tra unique constraint `(machineId, recordDate, shift, itemId)` — trùng → 409
- Backend KHÔNG tự tính lại finalOutput từ endIndex - startIndex
- Hard delete, không soft delete, không audit log

---

## MODULE 2: QUẢN LÝ ĐIỆN NĂNG (ENERGY MANAGEMENT)

Tương tự tính sản lượng nhưng thêm hệ số và khung giờ.

- **Danh mục giá điện:** Bình thường (1,833 đ/kWh), Cao điểm (3,398 đ/kWh), Thấp điểm (1,190 đ/kWh).
- **Tổ chức thiết bị:** Nhà máy -> Trạm biến áp -> Đồng hồ điện (Công tơ).
- **Phân loại đồng hồ:**
  - _Loại 1 (Hạ thế):_ Có 1 chỉ số tổng. Điện năng = `(Chỉ số sau - Chỉ số trước) * TU * TY`.
  - _Loại 2 (Trung thế):_ Đo 3 chỉ số riêng biệt (Bình thường, Cao điểm, Thấp điểm). Tự động phân dải theo đồng hồ điện tử nhà nước.
- **Logic chốt:** Chốt vào 8:00 sáng mỗi ngày, dữ liệu được ghi nhận cho ngày **hôm trước**. Cũng áp dụng logic Reset thay đồng hồ như module Sản lượng.

---

## MODULE 3: BẢO DƯỠNG THIẾT BỊ (MAINTENANCE)

- **Dữ liệu:** Gồm bảng `MaintenanceTask` (Hạng mục định kỳ) và `MaintenanceHistory` (Lịch sử thực hiện).
- **Logic tính chu kỳ:** `Next Due Date = Last Performed Date + Interval (tháng)`.
- **Cảnh báo:** Quét tự động bằng Cron Job. Hiển thị UI màu sắc (Đỏ: Quá hạn, Cam: Sắp đến hạn, Xanh: An toàn) và gửi Email theo `leadTimeDays` (số ngày báo trước).

---

## MODULE 4: NHẬP LIỆU MOBILE & QR CODE

Bộ tính năng tối ưu cho công nhân nhà máy sử dụng điện thoại tại xưởng.

### 4.1. Trang nhập liệu Mobile (`/production/mobile-input`)

- **File:** `src/app/production/mobile-input/page.tsx`, `src/app/production/mobile-input/layout.tsx`
- **Giao diện:** Layout riêng, không có sidebar/header desktop, max-width 480px, tối ưu touch
- **Hỗ trợ URL params:** `?machineId=X&processId=Y` (từ QR Code hoặc link)
- **Chức năng:**
  - Tự detect Ca/Ngày theo giờ hiện tại (cùng logic Smart Date)
  - Chọn Công đoạn → hiển thị danh sách máy → nhập liệu từng máy
  - Nút **Lưu & Tiếp** chuyển tự động sang máy kế tiếp
  - Nút điều hướng Trước/Sau giữa các máy
  - Hiển thị thanh tiến độ (số máy đã nhập / tổng máy)
  - Hỗ trợ **Đổi mặt hàng giữa ca** (xem 4.3)
- **Chỉ hiển thị máy `allowMultiItemPerShift = false`** — máy multi-item dùng trang riêng

### 4.2. Quét QR / In QR Code (`/machines/qr-machines`)

- **File:** `src/app/machines/qr-machines/page.tsx`
- **Mục đích:** Tạo và in QR Code dán trực tiếp lên máy
- **Luồng:** In QR → Dán lên máy → Quét bằng điện thoại → Mở thẳng `/production/mobile-input?machineId=X`
- **Tính năng:** Lọc theo nhà máy/công đoạn, chọn nhiều máy, in hàng loạt
- **QR image:** Dùng `api.qrserver.com` (không cần cài package)

### 4.3. Đổi mặt hàng giữa ca (Multi-item per shift)

- **Migration:** `prisma/migrations/20260310000000_allow_multi_item_per_shift/`
- **Thay đổi DB:** Unique constraint cũ `(machineId, recordDate, shift)` → mới `(machineId, recordDate, shift, itemId)`
- **Ý nghĩa:** Một máy có thể ghi nhiều bản ghi trong cùng 1 ca nếu đổi mặt hàng
- **UI:** Nút "Đổi mặt hàng giữa ca" (icon SwapOutlined) trong cả trang desktop và trang mobile

### 4.4. Nhập sản lượng dạng bảng (Grid) (`/production/daily-input-grid`)

- **File:** `src/app/production/daily-input-grid/page.tsx`
- Giao diện dạng bảng cho nhân viên thống kê, hỗ trợ paste từ Excel (Ctrl+V)
- Dùng chung `/api/production/daily-input` POST + `/api/production/daily-status` + `/api/production/last-log`
- Auto-load `startIndex` từ last-log của ca trước
- Switch "Dừng" per row, chỉ số TRƯỚC read-only có nút edit
- **Chỉ hiển thị máy `allowMultiItemPerShift = false`**

### 4.5. Máy ống chạy nhiều mặt hàng song song (Multi-item machines)

- `Machine.allowMultiItemPerShift = true` → máy có nhiều `MachineItemAssignment` (mỗi assignment có fromSpindle, toSpindle, lotId)
- API: `GET/PUT /api/machines/{id}/assignments`, `PATCH /api/machines/{id}/assignments` (đổi 1 item)
- Dữ liệu lưu: 1 ProductionLog per (machineId, itemId, date, shift) — unique constraint không đổi

### 4.6. Trang nhập liệu đánh ống (`/production/winding-input`)

- **File:** `src/app/production/winding-input/page.tsx`
- Trang desktop riêng cho máy multi-item, extract từ daily-input
- Inline đổi mặt hàng (nút ✏️), ghi ngược về MachineItemAssignment
- Khi xem ca cũ: build rows từ logs (ưu tiên lịch sử), không từ assignments
- Fix bug: DELETE log cũ trước khi POST log mới khi đổi item

### 4.7. Trang mobile đánh ống (`/production/mobile-winding`)

- **File:** `src/app/production/mobile-winding/page.tsx`
- Giao diện mobile cho máy multi-item, N cards per machine per item
- Thêm hàng giữa ca: extra card → Select chọn item → check trùng itemId
- `_uid` per row tránh conflict key

### 4.8. Fix bugs nhập liệu (2026-05-24)

- **daily-input-grid**: DELETE log cũ trước Promise.allSettled POST khi item thay đổi
- **mobile-input**: thêm `existingItemId` vào inputStates, ưu tiên item từ log khi save ca cũ
- **daily-input (modal)**: fix `quickAssignItemId` khởi tạo từ todayLog thay vì currentItem; guard assignment update khi sửa ca cũ
- **API daily-input**: chỉ update `currentItemId` khi `recordDate = today` (tránh ghi đè khi sửa log cũ)

---

## MODULE 5: GHI NHẬN DỪNG MÁY / SỰ CỐ (MACHINE STOP LOGGING)

### 5.1. Database Models

- **`stop_categories`** — Danh mục nguyên nhân dừng: `name`, `color` (hex), `isActive`, `isDefault`.
  - 8 danh mục mặc định được seed. `isDefault = true` → **không được xóa, không được tắt**.
- **`machine_stop_logs`** — Bản ghi từng lần dừng: `machineId`, `categoryId`, `startTime`, `endTime?`, `durationMinutes?`, `severity`, `shift`, `recordDate`, `reportedById`.
  - `durationMinutes` luôn **tính server-side** = `(endTime - startTime) / 60s`
  - `shift` tự detect từ `startTime`; `recordDate` tự extract từ ngày `startTime`
  - `endTime = null` → máy vẫn đang dừng

### 5.2. API Routes

| Route                                  | Methods     | Mô tả                                                     |
| -------------------------------------- | ----------- | --------------------------------------------------------- |
| `/api/production/stop-categories`      | GET, POST   | Lấy danh sách / Tạo mới (Admin)                           |
| `/api/production/stop-categories/[id]` | PUT, DELETE | Sửa / Xóa (Admin, isDefault không xóa được)               |
| `/api/production/machine-stops`        | GET, POST   | Lịch sử (phân trang, nhiều filter) / Tạo mới              |
| `/api/production/machine-stops/[id]`   | PUT, DELETE | Cập nhật (set endTime khi máy chạy lại) / Xóa             |
| `/api/production/machine-stops/stats`  | GET         | Thống kê tổng hợp (count, downtime, top máy, by category) |

### 5.3. UI Pages

- `src/app/dashboard/stop-categories/page.tsx` — Quản lý danh mục (Admin only)
- `src/app/production/machine-stops/page.tsx` — Trang ghi nhận chính (grid card máy, auto-refresh 60s)
- `src/app/production/stop-history/page.tsx` — Lịch sử dừng máy (filter, phân trang, xuất Excel)

### 5.4. Severity

| Giá trị    | Nhãn         | Màu    |
| ---------- | ------------ | ------ |
| `low`      | Nhẹ          | Xanh   |
| `medium`   | Trung bình   | Cam    |
| `high`     | Nặng         | Đỏ     |
| `critical` | Nghiêm trọng | Đỏ đậm |

---

## MODULE 6: IMPORT IOT EXCEL

Module nhập tự động dữ liệu sản lượng từ file Excel xuất bởi các phần mềm IoT.

### 6.1. Khái niệm cốt lõi

- **IotSource (Nguồn IoT):** Mỗi phần mềm IoT là 1 source riêng biệt. Mỗi source có bộ mapping tên riêng + `fileFormat` (enum `IotFileFormat`).
- **Mapping:** Tên máy / tên mặt hàng / tên ca trong file IoT **khác** với ERP → mapping ánh xạ.
- **shiftMap:** JSON `{"Ca sáng": 1, "Shift A": 1, "Ca chiều": 2}` trong `iot_sources`.
- **Luồng wizard 4 bước:** Chọn nguồn & Upload → Khớp tên → Preview → Kết quả.

### 6.2. Database Models

- `iot_sources` — Nguồn IoT: `name` (unique), `description`, `shiftMap` (JSON), `isActive`, `fileFormat`
- `iot_machine_maps` — Mapping tên máy IoT ↔ `machineId` ERP. Unique `(sourceId, iotName)`.
- `iot_item_maps` — Mapping tên mặt hàng IoT ↔ `itemId` ERP. Unique `(sourceId, iotName)`.
- `iot_import_logs` — Lịch sử import.

### 6.3. Multi-format parser architecture

- `IotFileFormat` enum: `STANDARD` | `DANH_ONG`
- `src/lib/iot-parsers/parser-standard.ts` — cột Ngày, Ca, Máy, Mặt hàng, Sản lượng
- `src/lib/iot-parsers/parser-danh-ong.ts` — file HTML-as-XLS của máy đánh ống
- `src/app/api/iot/parse-excel/route.ts` — dispatcher đọc `source.fileFormat` và gọi sub-parser

### 6.4. API Routes

| Route                   | Methods           | Mô tả                                              |
| ----------------------- | ----------------- | -------------------------------------------------- |
| `/api/iot/sources`      | GET, POST         | Danh sách sources / Tạo mới                        |
| `/api/iot/sources/[id]` | PUT, DELETE       | Sửa / Xóa (block nếu đã có import log)             |
| `/api/iot/mapping`      | GET, POST, DELETE | Xem mapping / Bulk upsert / Xóa từng entry         |
| `/api/iot/parse-excel`  | POST              | Phân tích file, trả về rows + unmapped lists        |
| `/api/iot/import`       | POST              | Ghi vào ProductionLog, tạo IotImportLog            |
| `/api/iot/import-logs`  | GET               | Lịch sử import                                     |

### 6.5. Quy tắc import

- Field cố định: `startIndex = 0`, `endIndex = null`, `inputNE = null`, `note = "Import từ IoT: {sourceName}"`
- Chỉ import rows có `status = "READY"`. INSERT mới hoặc UPDATE `finalOutput` + `note`.
- Source không xóa được nếu đã có `IotImportLog` (chỉ tắt `isActive`)

---

## MODULE 8: PRODUCTIVITY BENCHMARK

### 8.1. Tổng quan

Module lưu trữ định mức năng suất lý thuyết (kg/ca/máy) theo tổ hợp mặt hàng × công đoạn × model máy, quản lý theo phiên bản.

### 8.2. Hai loại Định mức

| | Lý thuyết (THEORY) | Thực nghiệm (EMPIRICAL) |
|---|---|---|
| Nguồn gốc | Tính từ công thức vật lý | Người dùng tự nhập |
| Đơn vị lưu | kg/ca/máy (stdOutputPerShift) | kg/ngày/loại máy (empiricalOutputPerDay) |
| Thông số cần | Nm, Ne, twist, speed, hiệu suất, số cọc | Chỉ cần: loại máy + mặt hàng + kg/ngày |
| Dùng để | Đánh giá máy có đúng thiết kế không | Lập kế hoạch và đàm phán với khách |

### 8.3. Công thức

- `speedUnit="rpm"` (máy sợi con/thô): `NS_LT = speed × 480 / (twist × Nm × 1000) × spindleCount`
- `speedUnit="mpm"` (máy ghép/ống): `NS_LT = speed × 480 / (Nm × 1000) × headCount`
- `stdOutputPerShift = theoreticalOutput × efficiency`

### 8.4. Quy tắc

- Unique constraint `(versionId, itemId, processId, machineModel)`
- Phiên bản `isActive=true` → không cho sửa/xóa benchmark (phải clone trước)
- Activate = `$transaction` deactivate tất cả cũ + activate mới (atomic)
- `efficiency` lưu 0–1 (VD: 0.85 = 85%)

### 8.5. API Routes

| Method         | Path                                               | Description                     |
| -------------- | -------------------------------------------------- | ------------------------------- |
| GET/POST       | /api/productivity-benchmark/versions               | Danh sách / tạo phiên bản       |
| GET/PUT/DELETE | /api/productivity-benchmark/versions/[id]          | Chi tiết / sửa / xóa            |
| POST           | /api/productivity-benchmark/versions/[id]/activate | Kích hoạt phiên bản             |
| POST           | /api/productivity-benchmark/versions/[id]/clone    | Nhân bản phiên bản              |
| GET/POST       | /api/productivity-benchmark/benchmarks             | Danh sách / tạo định mức        |
| PUT/DELETE     | /api/productivity-benchmark/benchmarks/[id]        | Sửa / xóa định mức              |
| POST           | /api/productivity-benchmark/benchmarks/bulk        | Nhập nhiều cùng lúc             |
| GET            | /api/productivity-benchmark/capacity               | Công suất thiết kế tổng hợp     |
| GET            | /api/productivity-benchmark/comparison             | So sánh NS thực tế vs lý thuyết |

---

## LOT MANAGEMENT — Quản lý Lô hàng

### Tổng quan

Module quản lý vòng đời lô hàng: RAW_COTTON, RAW_FIBER, YARN. Lô sợi gắn với máy qua `Machine.currentLotId`, auto-set `lotId` vào `ProductionLog` khi nhập sản lượng.

### Schema

- `Lot` — lotNumber, lotType (enum), status (OPEN|CLOSED), factoryId, closedAt
- `LotMaterialLink` — liên kết nguyên liệu giữa lô (VD: lô sợi dùng từ lô bông nào)
- `Machine.currentLotId` — FK → Lot
- `ProductionLog.lotId` — FK → Lot (snapshot lô lúc nhập)
- `MachineItemAssignment.lotId` — FK → Lot (lô riêng cho từng mặt hàng trên máy multi-item)

### API Routes

| Method | Path                        | Description                                        |
|--------|-----------------------------|----------------------------------------------------|
| GET    | /api/lots                   | List lots, filter: lotType, status, factoryId      |
| POST   | /api/lots                   | Create lot, auto-link rawLotIds if YARN            |
| GET    | /api/lots/[id]              | Lot detail with rawMaterials + productionLogs      |
| PUT    | /api/lots/[id]              | Update lot, replace raw material links             |
| DELETE | /api/lots/[id]              | Delete (guard: no production logs)                 |
| GET    | /api/lots/[id]/traceability | Traceability: rawMaterials + productionSummary     |

### Quy tắc

- Lot **không** gắn với mặt hàng (itemId nullable, không dùng trong UI)
- Xóa lô chỉ khi chưa có ProductionLog liên quan
- Đóng lô: PUT status=CLOSED → set closedAt=now()
- Máy multi-item: `MachineItemAssignment.lotId` → lô riêng cho từng mặt hàng

---

## DANH MỤC MẶT HÀNG — Item

### Field yarnType

- `yarnType String @default("SINGLE")`: phân biệt sợi 1 thành phần và sợi pha
- `SINGLE`: chỉ cotton — không có ô PE trong định mức
- `BLENDED`: cotton + PE — hiện thị và cho nhập ô PE
- Hàm `hasPE(item)` dùng `item.yarnType === "BLENDED"` (không detect từ tên)

### Phân quyền Items

- POST, PUT, DELETE: ADMIN | SALES | PROCESS_LEADER

---

## Các trang nhập liệu — Tổng kết

| Trang | Path | Loại máy | Giao diện |
|-------|------|----------|-----------|
| Nhập SL (Thẻ) | /production/daily-input | allowMultiItemPerShift=false | Modal per máy |
| Nhập SL (Bảng) | /production/daily-input-grid | allowMultiItemPerShift=false | Table, paste Excel |
| Nhập SL Mobile | /production/mobile-input | allowMultiItemPerShift=false | Cards, touch-optimized |
| Đánh ống Desktop | /production/winding-input | allowMultiItemPerShift=true | Table, inline edit |
| Đánh ống Mobile | /production/mobile-winding | allowMultiItemPerShift=true | Cards per item |

---

## Liên quan đến

- **CORE.md** — Data hierarchy, phân quyền, AI coding rules
- **MODULE_KDSX.md** — KD-SX dùng `ProductionLog` để tính sản lượng thực hiện; Allocation Engine trigger sau mỗi POST daily-input
- **CHANGELOG.md** — Lịch sử chi tiết các bug fix và cải tiến
