Dưới đây là tài liệu tổng hợp toàn bộ quy trình nghiệp vụ, logic tính toán và kiến trúc hệ thống được biên soạn dưới dạng **"Nguồn chân lý duy nhất" (Single Source of Truth)**. Bạn có thể lưu trực tiếp nội dung này thành một file (ví dụ: `BUSINESS_LOGIC_CONTEXT.md`) để cung cấp cho bất kỳ AI hoặc Lập trình viên nào đọc hiểu trước khi code.

---

# 📘 HỒ SƠ NGHIỆP VỤ & KIẾN TRÚC HỆ THỐNG - PHU BAI ERP

## 1. TỔNG QUAN HỆ THỐNG

- **Tên dự án:** Phần mềm quản lý sản xuất ERP Sợi Phú Bài.
- **Công nghệ (Tech Stack):** Next.js 16 (App Router), PostgreSQL + Prisma ORM, Ant Design (UI), NextAuth.js v5 (Authentication).
- **Mục tiêu:** Quản lý sản lượng máy móc, điện năng tiêu thụ và bảo dưỡng thiết bị một cách tự động, chính xác, chống thất thoát dữ liệu.

## 2. CẤU TRÚC TỔ CHỨC DỮ LIỆU (DATA HIERARCHY)

Dữ liệu được tổ chức theo cây phân cấp chặt chẽ: **Nhà máy (Factory) -> Công đoạn (Process) -> Máy móc (Machine) / Trạm biến áp (Substation)**.

- Một Nhà máy có nhiều Công đoạn.
- Các Công đoạn ở các nhà máy khác nhau có thể trùng tên (cần phân biệt bằng `factoryId`).
- Mỗi máy chỉ thuộc về một Công đoạn duy nhất.

## 3. PHÂN QUYỀN NGƯỜI DÙNG (AUTHORIZATION & DATA SCOPE)

Phân quyền không chỉ theo Role (Vai trò) mà còn theo Data Scope (Phạm vi dữ liệu).

- **Tài khoản & Quản lý:** Có đăng ký tài khoản, Admin duyệt kích hoạt. User tự đổi mật khẩu, Admin đổi được mật khẩu mọi User.
- **Admin:** Toàn quyền hệ thống, không bị giới hạn dữ liệu. Chỉ Admin mới được quyền xóa máy móc.
- **Manager / Operator (User thường):** Mỗi User được gán cố định vào **1 Công đoạn (`processId`)**.
  - Chỉ được nhập liệu/sửa/xóa dữ liệu _trong công đoạn của mình_.
  - Chỉ có thể xem (Read-only) dữ liệu của công đoạn khác.
  - Không được xóa máy, chỉ được sửa cấu hình máy (mặt hàng, chi số, số cọc).

## 4. MODULE 1: QUẢN LÝ SẢN LƯỢNG (CORE PRODUCTION)

Đây là module cốt lõi, yêu cầu tính toán real-time và truy vết dữ liệu liên tục như Odometer (Công tơ mét).

### 4.1. Quy tắc Ngày và Ca sản xuất

- **Định nghĩa Ca:** Một ngày có 3 ca.
  - Ca 1: 06:00 - 14:00 (Thuộc ngày hiện tại).
  - Ca 2: 14:00 - 22:00 (Thuộc ngày hiện tại).
  - Ca 3: 22:00 - 06:00 sáng hôm sau (**BẤT BIẾN: Luôn thuộc về ngày sản xuất hôm nay, không phụ thuộc lịch thực tế**).
- **Logic Tự động chọn Ca/Ngày (Smart Date - Cho phép chốt sớm 1 tiếng):**
  - `13:00 - 20:59`: Gợi ý **Ca 1** - Ngày hiện tại (T).
  - `21:00 - 23:59`: Gợi ý **Ca 2** - Ngày hiện tại (T).
  - `00:00 - 04:59`: Gợi ý **Ca 2** - **Ngày hôm qua (T-1)**.
  - `05:00 - 12:59`: Gợi ý **Ca 3** - **Ngày hôm qua (T-1)**.

### 4.2. Phân loại máy & Công thức tính toán

Được lưu ở trường `formulaType` trong bảng Machine.

- **Loại 1 (Máy nén/thô - Nhập trực tiếp):** Nhập thẳng sản lượng ca. `Sản lượng = Chỉ số sau`.
- **Loại 2 (Trừ lùi - Máy cũ):** `Sản lượng = Chỉ số sau - Chỉ số trước`.
- **Loại 3 (Có số cọc & NE):** `Sản lượng = ((Chỉ số sau - Chỉ số trước) * Số cọc) / (Chi số NE * 1000 * 1.693)`.
- **Loại 4 (Chia NE):** `Sản lượng = (Chỉ số sau - Chỉ số trước) / Chi số NE`.

### 4.3. Logic truy vết "Chỉ số trước" (Traceability)

Phần mềm **tự động** lục tìm bản ghi gần nhất của máy đó trong quá khứ để lấy "Chỉ số cuối" của ca trước làm "Chỉ số trước" cho ca này.

- **Thuật toán tìm kiếm (Backend):** Tìm bản ghi có `Cùng MachineID` VÀ `(Ngày < Ngày hiện tại HOẶC (Ngày = Ngày hiện tại AND Ca < Ca hiện tại))` -> Sắp xếp giảm dần -> Lấy Top 1.
- Nếu không tìm thấy (máy mới), cho phép User nhập tay "Chỉ số trước" lần đầu.

### 4.4. Xử lý sự cố & Ngoại lệ (Bắt buộc tuân thủ)

- **Máy dừng/Nghỉ:** Vẫn **PHẢI** lưu bản ghi (Sản lượng = 0, Chỉ số sau = Chỉ số trước) để chuỗi chỉ số không bị đứt đoạn.
- **Đồng hồ tua về 0 / Thay mới (Reset):** Có Checkbox "Reset/Thay đồng hồ". Khi bật, mở khóa ô "Chỉ số trước" cho nhập tay, bỏ qua logic liên tục. `Sản lượng = Chỉ số sau` (hoặc tính dựa trên số nhập tay).
- **Validation cấm lưu (Error):** Nếu (Chỉ số sau < Chỉ số trước) mà KHÔNG bật Reset -> Cảnh báo đỏ, **Khóa nút Lưu** (chống âm).
- **Validation bất thường (Warning):** Nếu tính ra > 1000kg do thừa số 0 -> Cảnh báo vàng, nhưng vẫn cho Lưu.

## 5. MODULE 2: QUẢN LÝ ĐIỆN NĂNG (ENERGY MANAGEMENT)

Tương tự tính sản lượng nhưng thêm hệ số và khung giờ.

- **Danh mục giá điện:** Bình thường (1,833 đ/kWh), Cao điểm (3,398 đ/kWh), Thấp điểm (1,190 đ/kWh).
- **Tổ chức thiết bị:** Nhà máy -> Trạm biến áp -> Đồng hồ điện (Công tơ).
- **Phân loại đồng hồ:**
  - _Loại 1 (Hạ thế):_ Có 1 chỉ số tổng. Điện năng = `(Chỉ số sau - Chỉ số trước) * TU * TY`.
  - _Loại 2 (Trung thế):_ Đo 3 chỉ số riêng biệt (Bình thường, Cao điểm, Thấp điểm). Tự động phân dải theo đồng hồ điện tử nhà nước.
- **Logic chốt:** Chốt vào 8:00 sáng mỗi ngày, dữ liệu được ghi nhận cho ngày **hôm trước**. Cũng áp dụng logic Reset thay đồng hồ như module Sản lượng.

## 6. MODULE 3: BẢO DƯỠNG THIẾT BỊ (MAINTENANCE)

- **Dữ liệu:** Gồm bảng `MaintenanceTask` (Hạng mục định kỳ) và `MaintenanceHistory` (Lịch sử thực hiện).
- **Logic tính chu kỳ:** `Next Due Date = Last Performed Date + Interval (tháng)`.
- **Cảnh báo:** Quét tự động bằng Cron Job. Hiển thị UI màu sắc (Đỏ: Quá hạn, Cam: Sắp đến hạn, Xanh: An toàn) và gửi Email theo `leadTimeDays` (số ngày báo trước).

## 7. UX / UI & TRẢI NGHIỆM NGƯỜI DÙNG

Thiết kế tối ưu cho tốc độ của công nhân nhà máy.

- **Tự động điền (Auto-fill):** Khi đăng nhập, tự động chọn Công đoạn theo User. Khi chọn máy, tự động điền Mặt hàng, Chi số (NE), Số cọc, Chỉ số trước.
- **Layout Lưới (Grid):** Hiển thị sơ đồ máy thay vì Dropdown dài. Máy chưa nhập màu trắng, đã nhập màu xanh.
- **Lưu & Tiếp tục (Save & Next):** Bấm 1 nút để lưu máy hiện tại và tự động chuyển form sang máy tiếp theo, không cần đóng/mở cửa sổ.
- **Tính toán Real-time:** Nhập số xong tự động nảy ra con số Sản lượng (kg) để công nhân kiểm tra trước khi bấm Lưu.

## 8. MODULE 4: NHẬP LIỆU MOBILE & QR CODE

Bộ tính năng tối ưu cho công nhân nhà máy sử dụng điện thoại tại xưởng.

### 8.1. Trang nhập liệu Mobile (`/production/mobile-input`)

- **File:** `src/app/production/mobile-input/page.tsx`, `src/app/production/mobile-input/layout.tsx`
- **Giao diện:** Layout riêng, không có sidebar/header desktop, max-width 480px, tối ưu touch
- **Hỗ trợ URL params:** `?machineId=X&processId=Y` (từ QR Code hoặc link)
- **Chức năng:**
  - Tự detect Ca/Ngày theo giờ hiện tại (cùng logic Smart Date)
  - Chọn Công đoạn → hiển thị danh sách máy → nhập liệu từng máy
  - Nút **Lưu & Tiếp** chuyển tự động sang máy kế tiếp
  - Nút điều hướng Trước/Sau giữa các máy
  - Hiển thị thanh tiến độ (số máy đã nhập / tổng máy)
  - Hỗ trợ **Đổi mặt hàng giữa ca** (xem 8.3)

### 8.2. Quét QR / In QR Code (`/machines/qr-machines`)

- **File:** `src/app/machines/qr-machines/page.tsx`
- **Mục đích:** Tạo và in QR Code dán trực tiếp lên máy
- **Luồng:** In QR → Dán lên máy → Quét bằng điện thoại → Mở thẳng `/production/mobile-input?machineId=X`
- **Tính năng:** Lọc theo nhà máy/công đoạn, chọn nhiều máy, in hàng loạt
- **QR image:** Dùng `api.qrserver.com` (không cần cài package)
- **Truy cập:** Admin và Manager

### 8.3. Đổi mặt hàng giữa ca (Multi-item per shift)

- **Migration:** `prisma/migrations/20260310000000_allow_multi_item_per_shift/`
- **Thay đổi DB:** Unique constraint cũ `(machineId, recordDate, shift)` → mới `(machineId, recordDate, shift, itemId)`
- **Ý nghĩa:** Một máy có thể ghi nhiều bản ghi trong cùng 1 ca nếu đổi mặt hàng
- **UI:** Nút "Đổi mặt hàng giữa ca" (icon SwapOutlined) trong cả trang desktop (`/production/daily-input`) và trang mobile
- **Cảnh báo:** Chỉ sử dụng khi máy thực sự đổi mặt hàng trong ca, không phải nhập bình thường
- **Backend:** `src/app/api/production/daily-input/route.ts` — nhận thêm `itemId` trong payload

### 8.4. Quick Input (Nhập nhanh 1 máy) (`/production/quick-input`)

- **File:** `src/app/production/quick-input/page.tsx` _(trang cũ, vẫn còn hoạt động)_
- **Mục đích:** Nhập nhanh cho 1 máy cụ thể (thường từ QR link cũ)
- **Sidebar:** Ẩn sidebar khi ở trang `/production/mobile-input` (xem `AdminLayout.tsx` line 55)

## 9. MODULE 5: GHI NHẬN DỪNG MÁY / SỰ CỐ (MACHINE STOP LOGGING)

Module ghi nhận các sự kiện dừng máy, giải thích bất thường sản lượng và hỗ trợ phân tích thống kê.

### 9.1. Database Models mới

- **`stop_categories`** — Danh mục nguyên nhân dừng: `name`, `color` (hex), `isActive`, `isDefault`.
  - 8 danh mục mặc định được seed: Hỏng máy, Bảo dưỡng định kỳ, Thiếu nguyên liệu, Sự cố điện, Thay đổi mặt hàng, Lỗi chất lượng, Thiếu nhân sự, Khác.
  - `isDefault = true` → **không được xóa, không được tắt**.
- **`machine_stop_logs`** — Bản ghi từng lần dừng: `machineId`, `categoryId`, `startTime`, `endTime?`, `durationMinutes?`, `severity`, `shift`, `recordDate`, `reportedById`.
  - `durationMinutes` luôn được **tính server-side** = `(endTime - startTime) / 60s`, client không được tự tính.
  - `shift` tự động detect từ `startTime` nếu không truyền: Ca1: 06-14h, Ca2: 14-22h, Ca3: 22-06h.
  - `recordDate` tự extract từ ngày của `startTime`.
  - `endTime = null` → máy vẫn đang dừng.

### 9.2. API Routes

| Route                                  | Methods     | Mô tả                                                     |
| -------------------------------------- | ----------- | --------------------------------------------------------- |
| `/api/production/stop-categories`      | GET, POST   | Lấy danh sách / Tạo mới (Admin)                           |
| `/api/production/stop-categories/[id]` | PUT, DELETE | Sửa / Xóa (Admin, isDefault không xóa được)               |
| `/api/production/machine-stops`        | GET, POST   | Lịch sử (phân trang, nhiều filter) / Tạo mới              |
| `/api/production/machine-stops/[id]`   | PUT, DELETE | Cập nhật (set endTime khi máy chạy lại) / Xóa             |
| `/api/production/machine-stops/stats`  | GET         | Thống kê tổng hợp (count, downtime, top máy, by category) |

**Validation bắt buộc:**

- `startTime` không được trong tương lai.
- `endTime` phải sau `startTime` và không được trong tương lai.
- Category phải tồn tại và `isActive = true`.

### 9.3. UI Pages

- **`src/app/dashboard/stop-categories/page.tsx`** — Quản lý danh mục (Admin only): bảng CRUD, color picker, toggle active.
- **`src/app/production/machine-stops/page.tsx`** — Trang ghi nhận chính:
  - Grid card máy, sorted: máy đang dừng lên đầu (màu đỏ), máy đang chạy xuống dưới (màu xanh).
  - Card hiển thị trạng thái realtime: "Đang dừng X phút" + nguyên nhân + mức độ.
  - Nút **"Báo dừng"**: chọn nguyên nhân (grid button có màu) + mức độ (4 mức) + thời gian (realtime/manual).
  - Nút **"Máy đã chạy"**: xác nhận restart + thời gian (realtime/manual).
  - Auto-refresh 60 giây.
- **`src/app/production/stop-history/page.tsx`** — Lịch sử dừng máy:
  - Filter: khoảng ngày, nhà máy, công đoạn, nguyên nhân (multi-select), trạng thái.
  - Phân trang server-side, summary stats (tổng lần dừng, tổng thời gian, đang dừng).
  - Sửa / xóa bản ghi (Admin hoặc người báo).
  - Xuất Excel (XLSX).

### 9.4. Phân quyền

- **Admin:** Toàn quyền, thấy tất cả máy mọi nhà máy.
- **User thường:** Chỉ báo dừng / xem lịch sử máy trong `processId` của mình. Chỉ xóa được bản ghi do mình tạo.
- **Danh mục:** Chỉ Admin tạo/sửa/xóa. Mọi user đọc để hiển thị.

### 9.5. Severity (Mức độ)

| Giá trị    | Nhãn         | Màu    |
| ---------- | ------------ | ------ |
| `low`      | Nhẹ          | Xanh   |
| `medium`   | Trung bình   | Cam    |
| `high`     | Nặng         | Đỏ     |
| `critical` | Nghiêm trọng | Đỏ đậm |

### 9.6. Menu mới trong AdminLayout

- Sub2 (Quản lý SX): **Ghi nhận dừng máy** (`/production/machine-stops`) + **Lịch sử dừng máy** (`/production/stop-history`).
- Sub-admin (Admin only): **Danh mục nguyên nhân dừng** (`/dashboard/stop-categories`).

**Status:** ✅ Completed

---

## 10. MODULE 6: IMPORT IOT EXCEL (IoT Excel Import)

Module nhập tự động dữ liệu sản lượng từ file Excel xuất bởi các phần mềm IoT của nhà máy.

### 10.1. Khái niệm cốt lõi

- **IotSource (Nguồn IoT):** Mỗi phần mềm IoT là 1 source riêng biệt (VD: "IoT Chải thô", "IoT Ghép"). Mỗi source có bộ mapping tên riêng.
- **Mapping:** Tên máy / tên mặt hàng / tên ca trong file Excel IoT **khác** với tên trong ERP → cần mapping để ánh xạ trước khi import.
- **shiftMap:** Lưu dạng JSON `{"Ca sáng": 1, "Shift A": 1, "Ca chiều": 2}` trong bảng `iot_sources`.
- **Luồng wizard 4 bước:** Chọn nguồn & Upload → Khớp tên (chỉ hiện nếu có unmapped) → Preview → Kết quả.

### 10.2. Database Models mới

- **`iot_sources`** — Nguồn IoT: `name` (unique), `description`, `shiftMap` (JSON), `isActive`.
- **`iot_machine_maps`** — Mapping tên máy IoT ↔ `machineId` ERP. Unique `(sourceId, iotName)`.
- **`iot_item_maps`** — Mapping tên mặt hàng IoT ↔ `itemId` ERP. Unique `(sourceId, iotName)`.
- **`iot_import_logs`** — Lịch sử từng lần import: `fileName`, `totalRows`, `insertedRows`, `updatedRows`, `skippedRows`, `errorRows`, `status`, `errorDetail` (JSON), `importedById`.

**Không sửa `ProductionLog`** — Unique constraint `(machineId, recordDate, shift, itemId)` giữ nguyên.

### 10.3. Logic Parse Excel

**Detect cột tự động** (sau khi normalize: trim + lowercase + bỏ dấu):

- Ngày: chứa `ngay`, `date`, `ngày`
- Ca: chứa `ca`, `shift`
- Máy: chứa `may`, `máy`, `machine`
- Mặt hàng: chứa `mat hang`, `hang`, `item`, `san pham` _(optional)_
- Sản lượng: chứa `san luong`, `output`, `sl`, `quantity`

**Parse ngày** hỗ trợ 3 dạng: Excel serial number, `DD/MM/YYYY`, `YYYY-MM-DD`, `DD-MM-YYYY`.

**Xác định action:** Sau khi mapping đầy đủ, query `ProductionLog.findUnique` theo unique key → `INSERT` nếu chưa có, `UPDATE` nếu đã tồn tại.

**Row status:** `READY` | `NO_DATE` | `NO_SHIFT` | `NO_MACHINE` | `NO_ITEM`.

### 10.4. API Routes

| Route                   | Methods           | Mô tả                                              |
| ----------------------- | ----------------- | -------------------------------------------------- |
| `/api/iot/sources`      | GET, POST         | Danh sách sources / Tạo mới                        |
| `/api/iot/sources/[id]` | PUT, DELETE       | Sửa / Xóa (block nếu đã có import log)             |
| `/api/iot/mapping`      | GET, POST, DELETE | Xem mapping / Bulk upsert / Xóa từng entry         |
| `/api/iot/parse-excel`  | POST              | Phân tích file Excel, trả về rows + unmapped lists |
| `/api/iot/import`       | POST              | Ghi vào ProductionLog, tạo IotImportLog            |
| `/api/iot/import-logs`  | GET               | Lịch sử import (kèm tên người thực hiện)           |

### 10.5. Files

**API:**

- `src/app/api/iot/sources/route.ts` — GET list, POST create
- `src/app/api/iot/sources/[id]/route.ts` — PUT update, DELETE
- `src/app/api/iot/mapping/route.ts` — GET/POST/DELETE mapping
- `src/app/api/iot/parse-excel/route.ts` — POST parse file Excel
- `src/app/api/iot/import/route.ts` — POST thực hiện import vào DB
- `src/app/api/iot/import-logs/route.ts` — GET lịch sử

**Components:**

- `src/components/iot-import/ImportWizard.tsx` — Wizard 4 bước (component chính)
- `src/components/iot-import/MappingStep.tsx` — Bước 2: khớp tên máy/mặt hàng/ca
- `src/components/iot-import/PreviewStep.tsx` — Bước 3: KPI cards + bảng preview với filter tabs
- `src/components/iot-import/ImportHistory.tsx` — Bảng lịch sử + drawer chi tiết lỗi

**Pages:**

- `src/app/iot-import/page.tsx` — Trang chính (2 tabs: Import | Lịch sử)
- `src/app/iot-import/sources/page.tsx` — Quản lý sources, xem/xóa mapping

### 10.6. Quy tắc import

- Khi import, field cố định: `startIndex = 0`, `endIndex = null`, `inputNE = null`, `note = "Import từ IoT: {sourceName}"`.
- Chỉ import rows có `status = "READY"`.
- `INSERT`: tạo bản ghi mới; `UPDATE`: chỉ cập nhật `finalOutput` và `note`.
- `IotImportLog` được tạo sau **mỗi lần import dù thành công hay thất bại**.
- Source không thể xóa nếu đã có `IotImportLog` liên quan (chỉ được tắt `isActive`).

### 10.7. Phân quyền

- **Admin hoặc accessLevel = "MANAGER":** Toàn quyền (import, quản lý sources, xem lịch sử).
- **User thường:** Không có quyền truy cập module này.
- **Menu sidebar:** Hiển thị mục "Import IoT" (UploadOutlined) cho Admin + Manager.

**Status:** ✅ Completed

---

## 11. NGUYÊN TẮC BẤT BIẾN KHI AI VIẾT CODE (AI CODING RULES)

1. **Tuyệt đối không phá vỡ chuỗi liên tục của Chỉ số.** Không được để khoảng trống dữ liệu.
2. **Backend là nguồn chân lý (Source of Truth).** Mọi tính toán logic, tìm chỉ số phải nằm ở Backend. Frontend chỉ gửi yêu cầu và render.
3. **Cấu hình động, không hard-code.** Công thức tính toán phụ thuộc vào `formulaType` của máy, không fix cứng logic cho từng tên máy.
4. **Không tự suy diễn nghiệp vụ.** Mọi đề xuất thay đổi database/schema phải giải thích lý do và có migration an toàn.
5. **Unique constraint production_logs:** Hiện tại là `(machineId, recordDate, shift, itemId)` — cho phép nhiều mặt hàng trong 1 ca.

---

# MODULE KD-SX — Kế hoạch Kinh doanh Sản xuất

## Tổng quan

Module KD-SX số hóa toàn bộ quy trình lập kế hoạch kinh doanh hàng tháng của 3 nhà máy sản xuất sợi (NM1.2, NMG37, NM3), thay thế file Excel "KẾ_HOẠCH_KD-SX" đang dùng trước đây. Dữ liệu nguồn được phân tích từ 12 tháng thực tế (T7/2025 – T6/2026).

---

## Nguồn dữ liệu gốc (Excel)

File Excel gốc có 2 loại sheet lặp theo tháng:

**Sheet DT (Doanh thu)** — mỗi dòng là 1 loại sợi:

- Cột: STT | Loại sợi | Hợp đồng | Số lượng (kg) | Đơn giá (USD/kg) | Doanh thu | CP NVL Cotton | CP NVL PE | CP Bán hàng | CP GC sợi xe đôi | Phế thu hồi
- Phần dưới: tổng chi phí cố định tháng (lương, điện, khấu hao, lãi vay...) và lợi nhuận ước tính
- Bảng thông số: giá bông các loại, tỷ giá, tỷ lệ phối trộn, định mức tiêu hao theo từng nhóm sợi

**Sheet SL (Sản lượng)** — sản lượng thực tế theo ngày/máy:

- Hàng = máy, cột = ngày trong tháng
- 1 máy có thể chạy nhiều mặt hàng khác nhau (đổi hàng giữa tháng)
- Cuối sheet: tổng hợp lũy kế theo mặt hàng, so sánh với đơn hàng, tính còn lại

**Sheet TH (Tổng hợp)** — bảng tổng hợp 3 nhà máy, cột KH và TH:

- Mỗi nhà máy: Sản lượng (tấn) | Doanh thu (tỷ đồng) | Chi phí (tỷ đồng) | Lợi nhuận (tỷ đồng)

---

## Nghiệp vụ tính toán

### Công thức chính

```
Doanh thu (VNĐ)   = Số lượng (kg) × Đơn giá (USD/kg) × Tỷ giá (VNĐ/USD)

CP Cotton (VNĐ)   = Số lượng × Định mức Cotton × Giá bông BQ × Tỷ giá
CP PE (VNĐ)       = Số lượng × Định mức PE × Giá Benma × Tỷ giá
                    └─ Chỉ áp dụng cho sợi CVCM (có thành phần PE)

CP GC xe đôi      = Chỉ áp dụng sợi /2 (30/2 COCD, 40/2 COCM...)
Phế thu hồi       = Giá trị DƯƠNG — trừ vào tổng chi phí

Lợi nhuận gộp     = DT − CP NVL − CP Bán hàng − CP GC + Phế thu hồi
Lợi nhuận ròng    = LN gộp − Tổng CP cố định + Doanh thu HĐTC

Giá bông BQ       = (tỷ lệ USA × giá USA) + (tỷ lệ BRA × giá BRA) + 0.02
```

### Thông số thay đổi hàng tháng

- Giá bông các loại (USD/kg): USA/Brazil ~1.73–1.81, Pima ~3.78, CMIA ~1.70, Úc ~1.71–1.87, Supima ~3.66
- Giá PE Benma: ~1.02–1.14 USD/kg
- Tỷ lệ phối trộn bông (VD: 60% USA + 40% Brazil, hoặc 100% Úc từ T6/2026)
- Tỷ giá: 25,600–26,200 VNĐ/USD

### Định mức tiêu hao tham khảo (kg NL / kg TP)

| Nhóm sợi        | Cotton     | PE         |
| --------------- | ---------- | ---------- |
| COCD (Chải kỹ)  | ~1.12–1.13 | —          |
| COCM (Chải thô) | ~1.33–1.44 | —          |
| CVCM            | ~1.33–1.35 | ~0.30–0.45 |
| CRC             | Theo HĐ    | Theo HĐ    |

### Chi phí cố định tháng (14 loại — enum FixedCostType)

Tiền lương, Trích trước lương, Tiền ăn ca, BHXH/YT/TN/KPCĐ, Tiền điện, Khấu hao, Ống cone/bao PP, CP vật liệu khác, CP quản lý DN, Lãi vay VCĐ, Lãi vay VLĐ, Lỗ CL tỷ giá, Doanh thu HĐTC, Khác.

---

## Schema Database (Prisma)

Module KD-SX được tích hợp vào schema ERP hiện tại theo nguyên tắc **strictly additive** — không xóa/sửa model cũ, chỉ thêm mới.

### Thay đổi model cũ

```prisma
// Factory — thêm 5 relations
monthlyPlans     MonthlyPlan[]
monthlyActuals   MonthlyActual[]
fixedCostEntries FixedCostEntry[]
inputParams      MonthlyInputParam[]
summarySnapshots MonthlySummarySnapshot[]

// Item — thêm 3 fields optional (không ảnh hưởng dữ liệu cũ) + 3 relations
yarnCategory String?   // "COCD" | "COCM" | "CVCM" | "CRC"
yarnCount    String?   // "16", "30", "40", "60"
yarnPly      Int?      // 1 hoặc 2

rawMaterialRates RawMaterialRate[]
planLineItems    PlanLineItem[]
actualLineItems  ActualLineItem[]
salesOrderItems  SalesOrderItem[]

// Machine — KHÔNG thay đổi
// Nguồn sản lượng cho KD-SX lấy từ ProductionLog (GROUP BY), không tạo bảng mới
```

### Models mới — 11 models + 3 enums

```
① Hợp đồng bán hàng
   Customer → SalesOrder (contractCode: "431PB25") → SalesOrderItem

② Thông số tháng
   MonthlyInputParam  — giá NVL + tỷ giá (unique: factoryId + yearMonth)
   RawMaterialRate    — định mức tiêu hao theo Item, có effectiveFrom/To

③ Kế hoạch (KH)
   MonthlyPlan (factoryId + yearMonth, status: DRAFT|SUBMITTED|APPROVED)
     ├── PlanLineItem[]   — mỗi dòng sợi, lưu snapshot giá trị tính toán
     └── FixedCostEntry[] — 14 loại CP cố định

④ Thực hiện (TH)
   MonthlyActual (factoryId + yearMonth)
     ├── ActualLineItem[]  — mirror PlanLineItem, qty tổng hợp từ ProductionLog
     └── FixedCostEntry[]  — dùng chung model với KH

⑤ Dashboard
   MonthlySummarySnapshot — cache tổng hợp (factoryId + yearMonth + type: KH|TH)

Enums: PlanStatus, SummaryType, FixedCostType
```

---

## Quy tắc quan trọng khi code

### 1. Lưu snapshot — KHÔNG tính lại on-the-fly

`PlanLineItem` và `ActualLineItem` lưu sẵn `revenueVnd`, `cottonCostVnd`... tại thời điểm tạo. Giá NVL/tỷ giá thay đổi hàng tháng — nếu tính lại bằng giá hiện tại thì lịch sử tháng trước sẽ sai.

### 2. yearMonth luôn là String "YYYY-MM"

Không dùng `DateTime` để tránh timezone issues. Validate bằng `/^\d{4}-\d{2}$/`.

### 3. FixedCostEntry có 2 optional FK — validate ở service layer

```typescript
// Phải có đúng 1 trong 2, không được cả hai null hoặc cả hai có giá trị
if (!monthlyPlanId && !monthlyActualId) throw Error("Phải thuộc KH hoặc TH");
if (monthlyPlanId && monthlyActualId)
  throw Error("Không thể thuộc cả KH và TH");
```

### 4. Nguồn sản lượng cho ActualLineItem — lấy từ ProductionLog

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

### 6. Cập nhật MonthlySummarySnapshot sau mọi thay đổi KH/TH

Gọi `refreshSummarySnapshot(factoryId, yearMonth, type)` sau mỗi tạo/cập nhật `MonthlyPlan` hoặc `MonthlyActual`.

---

## Cấu trúc thư mục

```
app/(erp)/kdsx/
  page.tsx                          — Dashboard tổng hợp 3 NM (Ban GĐ)
  [factoryId]/[yearMonth]/
    ke-hoach/page.tsx               — Xem/chỉnh kế hoạch tháng
    thuc-hien/page.tsx              — Xem thực hiện tháng

app/api/kdsx/
  monthly-plan/
    route.ts                        — GET list, POST tạo mới
    [id]/route.ts                   — GET, PUT, DELETE
    [id]/submit/route.ts            — POST: DRAFT → SUBMITTED
    [id]/approve/route.ts           — POST: SUBMITTED → APPROVED
  monthly-actual/
    route.ts
    [id]/route.ts
    [id]/sync-from-production/route.ts  — POST: tổng hợp từ ProductionLog
  summary/route.ts                  — GET dashboard 3 NM
  input-params/route.ts             — GET, POST/PUT giá NVL tháng
  sales-orders/route.ts
  customers/route.ts
```

---

## Quy trình nghiệp vụ

```
Kế toán: Cập nhật thông số tháng (giá NVL, tỷ giá)
    ↓
Kế toán: Tạo MonthlyPlan → nhập từng PlanLineItem + FixedCostEntry
    ↓  (status: DRAFT)
Kế toán: Trình duyệt → status: SUBMITTED (khóa chỉnh sửa)
    ↓
Ban GĐ: Phê duyệt → status: APPROVED
    ↓
Cuối tháng — Kế toán: Tạo MonthlyActual + sync từ ProductionLog
    ↓
Dashboard: So sánh KH vs TH qua MonthlySummarySnapshot
```

---

## Dữ liệu thực tế tham khảo (T1/2026 — NM3)

| Chỉ số             | Giá trị                   |
| ------------------ | ------------------------- |
| Tổng sản lượng KH  | 437,820 kg                |
| Doanh thu ước tính | 35.125 tỷ VNĐ             |
| Tổng chi phí       | 35.672 tỷ VNĐ             |
| Lợi nhuận          | −0.457 tỷ (lỗ nhẹ do Tết) |
| Tỷ giá             | 26,100 VNĐ/USD            |
| Giá bông BQ        | ~1.773 USD/kg             |
| Số loại sợi        | 21 loại                   |

Xu hướng 12 tháng: T2/2026 thấp nhất (−1.64 tỷ, nghỉ Tết), T6/2026 cao nhất (+5.55 tỷ, chuyển sang sợi CVCM cao cấp).

_Lưu ý cho AI: Khi nhận được file này, hãy đóng vai trò là Senior Backend/Software Architect, chỉ phát triển tính năng mới dựa trên nền tảng kiến trúc đã có, không thiết kế lại hệ thống._

---

_Cập nhật lần cuối: 2026-04-01 — Thêm Module 7: Kế hoạch Kinh doanh Sản xuất (KD-SX)_

---

## KD-SX — Kế hoạch Kinh doanh Sản xuất (Full Implementation)

**Status:** ✅ Completed 2026-03-31

### What was built

Module số hóa toàn bộ quy trình lập Kế hoạch và Thực hiện kinh doanh hàng tháng cho 3 nhà máy sản xuất sợi, thay thế file Excel "KẾ_HOẠCH_KD-SX". Tính toán doanh thu, chi phí biến đổi (NVL cotton/PE, bán hàng, GC xe đôi, phế thu hồi) và chi phí cố định (14 loại), so sánh KH vs TH qua snapshot dashboard.

### Files created/modified

```
src/lib/kdsx/calculator.ts                                 — calculateLineItem() + refreshSummarySnapshot() + ALL_FIXED_COST_TYPES
src/components/kdsx/FixedCostTable.tsx                     — Bảng nhập 14 loại chi phí cố định
src/app/kdsx/page.tsx                                      — Dashboard tổng hợp 3 NM (KH vs TH)
src/app/kdsx/customers/page.tsx                            — Quản lý khách hàng
src/app/kdsx/sales-orders/page.tsx                         — Quản lý đơn hàng (hợp đồng)
src/app/kdsx/plans/page.tsx                                — Danh sách kế hoạch tháng
src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx        — Chi tiết kế hoạch (nhập line items + fixed costs)
src/app/kdsx/actuals/page.tsx                              — Danh sách thực hiện tháng
src/app/kdsx/actuals/[factoryId]/[yearMonth]/page.tsx      — Chi tiết thực hiện (sync từ ProductionLog)
src/app/api/kdsx/customers/route.ts                        — CRUD khách hàng
src/app/api/kdsx/customers/[id]/route.ts                   — GET/PUT/DELETE khách hàng
src/app/api/kdsx/sales-orders/route.ts                     — CRUD đơn hàng
src/app/api/kdsx/sales-orders/[id]/route.ts                — GET/PUT/DELETE đơn hàng
src/app/api/kdsx/input-params/route.ts                     — GET/POST/PUT thông số tháng (giá NVL, tỷ giá)
src/app/api/kdsx/raw-material-rates/route.ts               — CRUD định mức tiêu hao NVL
src/app/api/kdsx/raw-material-rates/[id]/route.ts          — GET/PUT/DELETE định mức
src/app/api/kdsx/monthly-plans/route.ts                    — Tạo/list kế hoạch tháng
src/app/api/kdsx/monthly-plans/[id]/route.ts               — GET/PUT/DELETE kế hoạch
src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts    — CRUD dòng sợi trong kế hoạch
src/app/api/kdsx/monthly-plans/[id]/line-items/[lineItemId]/route.ts — Sửa/xóa từng dòng
src/app/api/kdsx/monthly-plans/[id]/fixed-costs/route.ts   — CRUD chi phí cố định KH
src/app/api/kdsx/monthly-plans/[id]/submit/route.ts        — DRAFT → SUBMITTED
src/app/api/kdsx/monthly-plans/[id]/approve/route.ts       — SUBMITTED → APPROVED
src/app/api/kdsx/monthly-plans/[id]/revert/route.ts        — SUBMITTED → DRAFT
src/app/api/kdsx/monthly-plans/[id]/unapprove/route.ts     — APPROVED → SUBMITTED
src/app/api/kdsx/monthly-actuals/route.ts                  — Tạo/list thực hiện tháng
src/app/api/kdsx/monthly-actuals/[id]/route.ts             — GET/PUT/DELETE thực hiện
src/app/api/kdsx/monthly-actuals/[id]/fixed-costs/route.ts — CRUD chi phí cố định TH
src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts        — Tổng hợp sản lượng từ ProductionLog
src/app/api/kdsx/summary/route.ts                          — Dashboard snapshot 3 NM
src/app/api/kdsx/fixed-costs/route.ts                      — Xem chi phí cố định tổng hợp
prisma/migrations/20260331000000_add_kdsx_module/          — 11 models mới + 3 enums
prisma/migrations/20260401000001_update_fixed_cost_type_enum/ — Rename enum FixedCostType (14 giá trị đúng nghiệp vụ)
```

### Key business logic implemented

- `calculateLineItem()`: tính revenueVnd, cottonCostVnd, peCostVnd, sellingCostVnd, gcDoubleTwistVnd, wasteRecoveryVnd, grossProfitVnd từ qty + unitPriceUsd + rates + params — không tính on-the-fly, lưu snapshot
- `refreshSummarySnapshot()`: sau mọi thay đổi KH/TH, tổng hợp lại `MonthlySummarySnapshot` (upsert)
- `DOANH_THU_HDTC` là khoản **thu**, được cộng vào lợi nhuận, **không tính vào chi phí**
- `FixedCostEntry` phải có đúng 1 trong 2 FK: `monthlyPlanId` XOR `monthlyActualId`
- Nguồn sản lượng TH: GROUP BY từ `ProductionLog` qua endpoint `/sync`, không nhập tay
- APPROVED plan không thể sửa/xóa line items; phải revert về SUBMITTED trước
- `RawMaterialRate` dùng `effectiveFrom`/`effectiveTo` để lấy đúng định mức theo tháng

### API endpoints

| Method         | Path                                                 | Description                      |
| -------------- | ---------------------------------------------------- | -------------------------------- |
| GET/POST       | /api/kdsx/customers                                  | Danh sách / tạo khách hàng       |
| GET/PUT/DELETE | /api/kdsx/customers/[id]                             | Sửa / xóa khách hàng             |
| GET/POST       | /api/kdsx/sales-orders                               | Danh sách / tạo đơn hàng         |
| GET/PUT/DELETE | /api/kdsx/sales-orders/[id]                          | Sửa / xóa đơn hàng               |
| GET/POST       | /api/kdsx/input-params                               | Thông số tháng (giá NVL, tỷ giá) |
| GET/POST       | /api/kdsx/raw-material-rates                         | Định mức tiêu hao NVL            |
| GET/PUT/DELETE | /api/kdsx/raw-material-rates/[id]                    | Sửa / xóa định mức               |
| GET/POST       | /api/kdsx/monthly-plans                              | Danh sách / tạo kế hoạch tháng   |
| GET/PUT/DELETE | /api/kdsx/monthly-plans/[id]                         | Chi tiết / sửa / xóa kế hoạch    |
| GET/POST       | /api/kdsx/monthly-plans/[id]/line-items              | Dòng sợi trong kế hoạch          |
| PUT/DELETE     | /api/kdsx/monthly-plans/[id]/line-items/[lineItemId] | Sửa / xóa dòng sợi               |
| GET/POST       | /api/kdsx/monthly-plans/[id]/fixed-costs             | Chi phí cố định kế hoạch         |
| POST           | /api/kdsx/monthly-plans/[id]/submit                  | DRAFT → SUBMITTED                |
| POST           | /api/kdsx/monthly-plans/[id]/approve                 | SUBMITTED → APPROVED             |
| POST           | /api/kdsx/monthly-plans/[id]/revert                  | SUBMITTED → DRAFT                |
| POST           | /api/kdsx/monthly-plans/[id]/unapprove               | APPROVED → SUBMITTED             |
| GET/POST       | /api/kdsx/monthly-actuals                            | Danh sách / tạo thực hiện tháng  |
| GET/PUT/DELETE | /api/kdsx/monthly-actuals/[id]                       | Chi tiết / sửa / xóa thực hiện   |
| GET/POST       | /api/kdsx/monthly-actuals/[id]/fixed-costs           | Chi phí cố định thực hiện        |
| POST           | /api/kdsx/monthly-actuals/[id]/sync                  | Sync sản lượng từ ProductionLog  |
| GET            | /api/kdsx/summary                                    | Dashboard tổng hợp 3 nhà máy     |

### Known limitations / not yet implemented

- Chưa có export Excel báo cáo KH/TH theo format file gốc
- Chưa có tính năng copy kế hoạch tháng trước sang tháng mới
- Chưa phân quyền chi tiết theo nhà máy (hiện Admin xem tất, User chỉ xem NM của mình qua processId)

### Data notes

- `yearMonth` luôn String `"YYYY-MM"`, validate `/^\d{4}-\d{2}$/`
- `amountVnd` trong `FixedCostEntry` lưu VNĐ tuyệt đối — UI hiển thị tỷ (÷1e9), phải ×1e9 khi gửi API
- Enum `FixedCostType` có 14 giá trị: TIEN_LUONG, TRICH_TRUOC_LUONG, TIEN_AN_CA, BHXH_YT_TN_KPCD, TIEN_DIEN, KHAU_HAO, ONG_CONE_BAO_PP, CHI_PHI_VAT_LIEU, CHI_PHI_QUAN_LY, LAI_VAY_VCD, LAI_VAY_VLD, LO_CHENH_LECH_TY_GIA, DOANH_THU_HDTC, KHAC

---

## PRODUCTIVITY-BENCHMARK — Định mức Năng suất Lý thuyết

**Status:** ✅ Completed 2026-04-01

### What was built

Module lưu trữ và quản lý định mức năng suất lý thuyết (kg/ca/máy) theo từng tổ hợp mặt hàng × công đoạn × model máy, quản lý theo phiên bản có hiệu lực. Hỗ trợ xem công suất thiết kế toàn nhà máy và so sánh năng suất thực tế vs lý thuyết.

### Files created/modified

```
src/utils/benchmark.ts                                          — calcTheoreticalOutput() dùng chung API + frontend
src/app/dashboard/productivity-benchmark/page.tsx              — Trang chính: 2 tab (Quản lý phiên bản + Nhập định mức)
src/app/dashboard/productivity-benchmark/capacity/page.tsx     — Xem công suất thiết kế toàn nhà máy
src/app/dashboard/productivity-benchmark/comparison/page.tsx   — So sánh NS thực tế vs lý thuyết
src/app/api/productivity-benchmark/versions/route.ts           — GET list / POST tạo phiên bản
src/app/api/productivity-benchmark/versions/[id]/route.ts      — GET / PUT / DELETE phiên bản
src/app/api/productivity-benchmark/versions/[id]/activate/route.ts — Activate phiên bản (deactivate cũ)
src/app/api/productivity-benchmark/versions/[id]/clone/route.ts    — Nhân bản phiên bản
src/app/api/productivity-benchmark/benchmarks/route.ts         — GET list / POST tạo định mức
src/app/api/productivity-benchmark/benchmarks/[id]/route.ts    — GET / PUT / DELETE định mức
src/app/api/productivity-benchmark/benchmarks/bulk/route.ts    — POST nhập nhiều định mức cùng lúc
src/app/api/productivity-benchmark/capacity/route.ts           — GET công suất tổng hợp
src/app/api/productivity-benchmark/comparison/route.ts         — GET so sánh thực tế vs lý thuyết
prisma/migrations/20260401000000_add_productivity_benchmark/   — 2 bảng: benchmark_versions, productivity_benchmarks
```

### Key business logic implemented

- `calcTheoreticalOutput()` — công thức tính theo 2 loại tốc độ:
  - `speedUnit="rpm"` (máy sợi con/thô): `NS_LT = speed × 480 / (twist × Nm × 1000) × spindleCount`
  - `speedUnit="mpm"` (máy ghép/ống): `NS_LT = speed × 480 / (Nm × 1000) × headCount`
- `stdOutputPerShift = theoreticalOutput × efficiency` — backend tự tính, không tin số frontend gửi lên
- Phiên bản `isActive=true` → không cho sửa/xóa benchmark, phải nhân bản (`clone`) trước khi chỉnh
- Khi activate phiên bản mới: dùng `$transaction` để deactivate tất cả phiên bản cũ cùng nhà máy + activate mới đồng thời — đảm bảo atomic
- Unique constraint `(versionId, itemId, processId, machineModel)` — mỗi tổ hợp chỉ có 1 định mức trong 1 phiên bản

### API endpoints

| Method         | Path                                               | Description                     |
| -------------- | -------------------------------------------------- | ------------------------------- |
| GET/POST       | /api/productivity-benchmark/versions               | Danh sách / tạo phiên bản       |
| GET/PUT/DELETE | /api/productivity-benchmark/versions/[id]          | Chi tiết / sửa / xóa phiên bản  |
| POST           | /api/productivity-benchmark/versions/[id]/activate | Kích hoạt phiên bản             |
| POST           | /api/productivity-benchmark/versions/[id]/clone    | Nhân bản phiên bản              |
| GET/POST       | /api/productivity-benchmark/benchmarks             | Danh sách / tạo định mức        |
| PUT/DELETE     | /api/productivity-benchmark/benchmarks/[id]        | Sửa / xóa định mức              |
| POST           | /api/productivity-benchmark/benchmarks/bulk        | Nhập nhiều định mức cùng lúc    |
| GET            | /api/productivity-benchmark/capacity               | Công suất thiết kế tổng hợp     |
| GET            | /api/productivity-benchmark/comparison             | So sánh NS thực tế vs lý thuyết |

### Known limitations / not yet implemented

- Chưa có export Excel cho báo cáo so sánh NS
- Chưa tích hợp cảnh báo tự động khi NS thực tế < ngưỡng % so với lý thuyết
- `comparison` chỉ so sánh tổng hợp theo tháng, chưa drill-down theo từng máy

### Data notes

- `prisma migrate dev` bị lỗi non-interactive trên môi trường này — dùng `prisma migrate deploy` thay thế
- `speedUnit`: `"rpm"` cho máy sợi con/thô (cần `twist` + `spindleOrHeadCount`); `"mpm"` cho máy ghép/ống (chỉ cần `headCount`, mặc định = 1 nếu không truyền)
- `efficiency` lưu dạng thập phân 0–1 (VD: 0.85 = 85%)

---

_Cập nhật lần cuối: 2026-04-01 — Thêm KD-SX full implementation + Module Định mức Năng suất_

---

## ORDER-TRACKING — Theo dõi Đơn hàng: Schema + Allocation Engine (Part 1)

**Status:** ✅ Completed 2026-04-02

### What was built

Nền tảng theo dõi tiến độ thực hiện hợp đồng: mở rộng `SalesOrder`/`SalesOrderItem` với fields vòng đời, thêm bảng `OrderAllocation` để lưu phân bổ sản lượng theo ngày, và engine `runAllocation` tự động phân bổ waterfall theo deadline mỗi khi công nhân nhập sản lượng.

### Files created/modified

```
prisma/schema.prisma                                        — thêm OrderStatus enum, deliveryDate/status/startDate/completedDate vào SalesOrder, deliveryDate/allocatedQty/allocations vào SalesOrderItem, thêm model OrderAllocation
prisma/migrations/20260402000000_add_order_tracking/        — SQL migration: enum + alter tables + create order_allocations
src/lib/allocation-engine.ts                               — runAllocation() + recalculateAllocation()
src/app/api/production/daily-input/route.ts                — thêm non-blocking runAllocation call sau upsert thành công
src/app/api/kdsx/sales-orders/route.ts                     — thêm deliveryDate vào POST create (required field)
```

### Key business logic implemented

- `runAllocation` **idempotent**: trước khi phân bổ lại, undo allocations cũ của ngày đó (delete + decrement `allocatedQty` trên `SalesOrderItem`), reset DONE orders về ACTIVE nếu bị ảnh hưởng
- Waterfall theo deadline: `orderBy: [{ order: { deliveryDate: 'asc' } }, { plannedQty: 'asc' }]` — cùng deadline ưu tiên HĐ ít còn thiếu hơn (dễ xong trước)
- Auto DONE: sau khi increment, `checkAllItemsDone(orderId)` — nếu tất cả items ≥ plannedQty → cập nhật `status=DONE`, `completedDate=now()`
- Flag OVERDUE: cuối `runAllocation` updateMany `status=ACTIVE` + `deliveryDate < now()` → OVERDUE
- Lỗi allocation **không block** nhập sản lượng: wrapped trong riêng try/catch ở `daily-input/route.ts`
- `recalculateAllocation`: reset toàn bộ (allocatedQty→0, DONE/OVERDUE→ACTIVE, xóa allocations), rồi re-run từng ngày theo thứ tự
- Quan hệ field name trong schema: `SalesOrderItem.orderId` (không phải `salesOrderId`), relation `order` (không phải `salesOrder`), `plannedQty` (không phải `qtyOrdered`)

### API endpoints

| Method     | Path                           | Description                                                                      |
| ---------- | ------------------------------ | -------------------------------------------------------------------------------- |
| (internal) | `src/lib/allocation-engine.ts` | `runAllocation(factoryId, date)` — tự gọi sau mỗi POST daily-input               |
| (internal) | `src/lib/allocation-engine.ts` | `recalculateAllocation(factoryId, from, to)` — dùng khi sửa lại ProductionLog cũ |

### Known limitations / not yet implemented

- Chưa có API endpoint để trigger `recalculateAllocation` thủ công từ UI
- Chưa có API GET để xem phân bổ theo đơn hàng (sẽ làm ở Part 2)
- `runAllocation` không tích hợp vào IoT import route (chỉ tích hợp daily-input)
- Lỗi allocation chỉ log ra console, chưa có alerting

### Data notes

- `deliveryDate` trên `SalesOrder`: NOT NULL, rows cũ được set mặc định `'2099-12-31'` qua migration
- `allocatedQty` trên `SalesOrderItem`: cached value, luôn = SUM(OrderAllocation.allocatedQty) cho item đó
- `OrderAllocation.factoryId` và `itemId` là denormalized (không FK) để index lookup nhanh

---

## ORDER-TRACKING — API Routes (Part 2)

**Status:** ✅ Completed 2026-04-02

### What was built

6 route files cho module theo dõi đơn hàng: CRUD hợp đồng, chuyển trạng thái (complete/cancel), trigger recalculate phân bổ, và endpoint progress tổng hợp tiến độ kèm ước tính ngày hoàn thành dựa trên benchmark.

### Files created/modified

```
src/app/api/sales-orders/route.ts                  — GET (list + filter) / POST (tạo HĐ mới)
src/app/api/sales-orders/[id]/route.ts             — GET (chi tiết + enriched) / PUT / DELETE
src/app/api/sales-orders/[id]/complete/route.ts    — POST: đánh dấu DONE thủ công
src/app/api/sales-orders/[id]/cancel/route.ts      — POST: hủy HĐ, ghi reason vào note
src/app/api/sales-orders/recalculate/route.ts      — POST: trigger recalculateAllocation (Admin only)
src/app/api/sales-orders/progress/route.ts         — GET: tiến độ tổng hợp kèm isAtRisk
```

### Key business logic implemented

- `calcEstimatedDoneDate`: benchmark.stdOutputPerShift × machineCount × 3 ca → daysNeeded = ceil(remaining/daily) — null khi không có benchmark hoặc không có máy đang chạy
- `isAtRisk = false` khi không có benchmark (thiếu dữ liệu không được flag nhầm là rủi ro)
- DELETE chỉ cho status=ACTIVE; xóa đúng thứ tự: OrderAllocation → SalesOrderItem → SalesOrder
- Cancel không xóa OrderAllocation (giữ để audit); ghi prefix `[HỦY YYYY-MM-DD]` vào note
- Recalculate giới hạn tối đa 365 ngày; có `maxDuration = 300` cho Vercel timeout
- progressPct luôn `Math.min(100, ...)` — không vượt 100%
- POST tạo HĐ: validate `deliveryDate >= today`, `contractCode` unique, `items` không rỗng, `qtyOrdered > 0`

### API endpoints

| Method | Path                            | Description                                                       |
| ------ | ------------------------------- | ----------------------------------------------------------------- |
| GET    | /api/sales-orders               | Danh sách HĐ (filter: factoryId, status, month, customerId)       |
| POST   | /api/sales-orders               | Tạo HĐ mới                                                        |
| GET    | /api/sales-orders/[id]          | Chi tiết HĐ + remainingQty/progressPct/estimatedDoneDate per item |
| PUT    | /api/sales-orders/[id]          | Sửa deliveryDate/startDate/note (chỉ ACTIVE/OVERDUE)              |
| DELETE | /api/sales-orders/[id]          | Xóa HĐ (chỉ Admin, chỉ ACTIVE)                                    |
| POST   | /api/sales-orders/[id]/complete | Đánh dấu DONE thủ công                                            |
| POST   | /api/sales-orders/[id]/cancel   | Hủy HĐ (body: { reason })                                         |
| POST   | /api/sales-orders/recalculate   | Tính lại toàn bộ phân bổ (Admin only)                             |
| GET    | /api/sales-orders/progress      | Tiến độ tổng hợp + isAtRisk (filter: factoryId, status, month)    |

### Known limitations / not yet implemented

- Chưa có API PATCH items (sửa/thêm/xóa dòng mặt hàng trong HĐ)
- estimatedDoneDate chỉ tính theo benchmark hiện tại, không tính theo lịch sử tốc độ thực tế
- Recalculate chạy đồng bộ (blocking) — với khoảng > 30 ngày có thể chậm

---

## ORDER-TRACKING — UI Pages (Part 3)

**Status:** ✅ Completed 2026-04-02

### What was built

2 UI pages cho module theo dõi đơn hàng: trang danh sách với 2 tab (bảng + dashboard tiến độ), và trang chi tiết với biểu đồ sản lượng tích lũy Recharts. Menu sidebar đã thêm "Theo dõi đơn hàng" vào nhóm KH Kinh doanh - SX.

### Files created/modified

```
src/app/sales-orders/page.tsx                — Trang chính: Tab 1 (bảng + modal tạo HĐ) + Tab 2 (cards tiến độ)
src/app/sales-orders/[id]/page.tsx           — Chi tiết HĐ: Descriptions + progress table + Recharts LineChart
src/components/AdminLayout.tsx               — Thêm menu item "Theo dõi đơn hàng" → /sales-orders
```

### Key business logic implemented

- Tab 2 (progress): chỉ hiển thị ACTIVE + OVERDUE, không hiển thị DONE/CANCELLED
- Progress bar capped tại 100% (`Math.min(100, pct)`) dù allocatedQty > plannedQty
- `isAtRisk = false` khi không có benchmark → không flag nhầm
- Nút "Cập nhật tiến độ": recalculate 90 ngày trước đến hôm nay; disabled khi chưa chọn nhà máy
- Biểu đồ: 3 đường (actual tích lũy / target ngang / ideal tuyến tính) + ReferenceLine deadline; empty state khi chưa có allocation
- Nhiều mặt hàng trong 1 HĐ → biểu đồ dùng Tabs (1 tab per item)
- Cancel: ghi prefix `[HỦY YYYY-MM-DD]` vào note, reason ≥5 ký tự validate ở cả client và server

### Known limitations / not yet implemented

- Chưa có edit inline cho items của HĐ từ UI
- Biểu đồ chỉ tính cumulative từ allocations đã có, không project về tương lai
- Responsive card: dùng Ant Design Row/Col (xs=24 lg=12 xl=8) — stack 1 cột trên mobile

---

## ORDER-TRACKING — Schema + Allocation Engine (Corrected Part 1)

**Status:** ✅ Completed 2026-04-02 (supersedes previous Part 1 entry)

### What was built

Bổ sung khả năng theo dõi tiến độ sản xuất theo từng hợp đồng VÀO MÔ HÌNH KD-SX ĐÃ CÓ — không tạo lại SalesOrder/SalesOrderItem. Schema: thêm fields `deliveryDate`, `status`, `startDate`, `completedDate` vào `SalesOrder`; thêm `allocatedQty` vào `SalesOrderItem`; thêm bảng `OrderAllocation`. Engine `runAllocation` waterfall theo deadline, idempotent.

### Files created/modified

```
prisma/schema.prisma                                        — thêm OrderStatus enum + fields mới + OrderAllocation model
prisma/migrations/20260402000000_add_order_tracking/        — migration SQL
src/lib/allocation-engine.ts                               — runAllocation() idempotent + recalculateAllocation() đúng thứ tự
src/app/api/production/daily-input/route.ts                — gọi runAllocation sau mỗi POST (non-blocking)
src/app/api/kdsx/sales-orders/route.ts                     — thêm deliveryDate vào POST
```

### Key business logic implemented

- `runAllocation` **idempotent**: undo allocations cũ (delete + decrement `allocatedQty`) TRƯỚC khi phân bổ lại
- Waterfall: `orderBy: [{ order.deliveryDate asc }, { plannedQty asc }]` — deadline sớm trước, cùng deadline ưu tiên HĐ ít còn thiếu
- `recalculateAllocation` đúng thứ tự tránh FK + mất data:
  1. Xóa allocations trong range
  2. Recount remaining (ngoài range, filter by factoryId)
  3. Reset allocatedQty = 0 rồi cộng lại từ remaining
  4. Reset DONE/OVERDUE → ACTIVE
  5. Re-run từng ngày
- Field names đúng schema: `plannedQty` (không phải qtyOrdered), `orderId` (không phải salesOrderId), `order` relation (không phải salesOrder)
- Đã xóa duplicate CRUD routes `/api/sales-orders/route.ts` và `/api/sales-orders/[id]/route.ts` — dùng KD-SX endpoints thay thế

### API endpoints

| Method     | Path                           | Description                                  |
| ---------- | ------------------------------ | -------------------------------------------- |
| (internal) | `src/lib/allocation-engine.ts` | `runAllocation(factoryId, date)`             |
| (internal) | `src/lib/allocation-engine.ts` | `recalculateAllocation(factoryId, from, to)` |

### Known limitations

- Tracking-specific routes (progress, recalculate, complete, cancel) ở `/api/sales-orders/` sẽ được review trong corrected Part 2
- UI trang `/sales-orders` tạm dùng KD-SX endpoint cho list/create — sẽ được thiết kế lại trong corrected Part 3

---

## THEO DÕI TIẾN ĐỘ ĐƠN HÀNG — Corrected Part 2: API Extensions

**Status:** ✅ Completed 2026-04-02

### What was built

Extended existing KD-SX sales-orders routes to expose progress/allocation data, added 3 new tracking-specific endpoints, removed old duplicate `/api/sales-orders/*` routes, and updated UI pages to call the new kdsx endpoints.

### Files created/modified

```
src/lib/estimate-completion.ts                          — calcEstimatedDoneDate(itemId, factoryId, remainingQty)
src/app/api/kdsx/sales-orders/route.ts                  — GET: added status filter, overallProgressPct, daysUntilDeadline
src/app/api/kdsx/sales-orders/[id]/route.ts             — GET: added allocations include, per-item progress enrichment
src/app/api/kdsx/sales-orders/[id]/status/route.ts      — PATCH status (ACTIVE/DONE/CANCELLED), guards CANCELLED→* transition
src/app/api/kdsx/sales-orders/recalculate/route.ts      — POST recalculate allocation for date range (Admin only)
src/app/api/kdsx/sales-orders/progress/route.ts         — GET progress summary list with isAtRisk flag
src/app/sales-orders/page.tsx                           — Updated: fetch from /api/kdsx/sales-orders/progress & recalculate
src/app/sales-orders/[id]/page.tsx                      — Updated: fetch from /api/kdsx/sales-orders/[id], actions via PATCH status
```

### Key business logic implemented

- `calcEstimatedDoneDate`: stdOutputPerShift × machineCount(activeItemId) × 3 shifts/day → Math.ceil(remaining/daily)
- `isAtRisk = true` only when estimatedDoneDate > deliveryDate AND benchmark exists (null estimatedDoneDate → false, safe default)
- GET list now sorts by `deliveryDate asc` (was `createdAt desc`) and computes progress inline
- GET detail includes `allocations { productionDate, allocatedQty }` sorted by date + `cumulativeData` array per item
- PATCH status blocks CANCELLED → any transition (irreversible cancellation)
- recalculate: max 365-day range guard (in UI defaults to last 90 days)

### API endpoints

| Method | Path                               | Description                                 |
| ------ | ---------------------------------- | ------------------------------------------- |
| GET    | /api/kdsx/sales-orders             | List with status filter + progress fields   |
| GET    | /api/kdsx/sales-orders/[id]        | Detail with allocations + per-item progress |
| PATCH  | /api/kdsx/sales-orders/[id]/status | Update status (ACTIVE/DONE/CANCELLED)       |
| POST   | /api/kdsx/sales-orders/recalculate | Recalculate allocation (Admin only)         |
| GET    | /api/kdsx/sales-orders/progress    | Progress summary list with isAtRisk         |

### Known limitations

- Corrected Part 3 (UI redesign for /sales-orders tracking pages) not yet implemented
- Cancel in UI still shows a "reason" text box but the reason field is not stored (status PATCH only sets status=CANCELLED)

---

## THEO DÕI TIẾN ĐỘ ĐƠN HÀNG — Corrected Part 3: UI

**Status:** ✅ Completed 2026-04-02

### What was built

Extended existing KD-SX sales-orders form with delivery/start date fields; created a tabbed detail page for individual orders; built the `OrderProgressTab` component with a progress table and cumulative Recharts chart; created the `/kdsx/order-progress` card-grid dashboard for phòng kinh doanh; updated sidebar navigation.

### Files created/modified

```
src/app/api/kdsx/sales-orders/[id]/route.ts         — PUT: added deliveryDate, startDate handling
src/app/kdsx/sales-orders/page.tsx                  — Added deliveryDate/startDate fields, status column, Tiến độ link
src/app/kdsx/sales-orders/[id]/page.tsx             — NEW: tabbed detail (Thông tin + Tiến độ), DONE/CANCEL actions
src/components/kdsx/OrderProgressTab.tsx             — NEW: progress table + cumulative chart + recalculate button
src/app/kdsx/order-progress/page.tsx                — NEW: card dashboard with factory/status filters + isAtRisk flags
src/components/AdminLayout.tsx                      — Added /kdsx/order-progress to KD-SX menu group
```

### Key business logic implemented

- `?tab=progress` URL param auto-opens progress tab (used by "Xem chi tiết →" from dashboard)
- Progress tab is lazy-loaded via `next/dynamic` to avoid chart library overhead on initial page
- Card border color: green=on track, orange=isAtRisk, red=OVERDUE
- Recalculate button defaults to last 90 days for the order's factory
- Progress bar capped at 100% even if allocatedQty > plannedQty
- Ideal progress line computed from startDate → deliveryDate (linear); falls back to first allocation date if no startDate

### API endpoints used (all existing from Parts 1 & 2)

| Method | Path                               | Used by                        |
| ------ | ---------------------------------- | ------------------------------ |
| GET    | /api/kdsx/sales-orders             | List page                      |
| GET    | /api/kdsx/sales-orders/[id]        | Detail page + OrderProgressTab |
| PUT    | /api/kdsx/sales-orders/[id]        | Edit form (now + deliveryDate) |
| PATCH  | /api/kdsx/sales-orders/[id]/status | Complete/Cancel buttons        |
| POST   | /api/kdsx/sales-orders/recalculate | Recalculate button             |
| GET    | /api/kdsx/sales-orders/progress    | Dashboard card grid            |

### Known limitations

- `/sales-orders` (old tracking page) still exists and is linked in sidebar — can be removed if confirmed redundant
- Cancel action no longer stores a cancel reason (removed in Part 2 redesign)

---

## THEO DÕI ĐƠN HÀNG — Bug fix: xóa nút "Tạo hợp đồng" khỏi trang read-only

**Status:** ✅ Completed 2026-04-02

### What was built

Removed the "Tạo hợp đồng" button from the `/sales-orders` (Theo dõi đơn hàng) page. This page is read-only — contract creation belongs exclusively to `/kdsx/sales-orders` (Hợp đồng bán hàng).

### Files created/modified

```
src/app/sales-orders/page.tsx    — Removed "Tạo hợp đồng" Button and surrounding flex wrapper from listTab
```

### Key business logic implemented

- `/sales-orders` is a read-only tracking/dashboard page — no create/edit actions
- Contract creation (POST /api/kdsx/sales-orders) is only available from `/kdsx/sales-orders`

### Known limitations

- The create modal code and `createOpen` state remain in the file (dead code); can be cleaned up later if page is confirmed read-only permanently

---

## THEO DÕI TIẾN ĐỘ — Surplus UI (phần dư sản lượng)

**Status:** ✅ Completed 2026-04-03

### What was built

Finished the surplus UI layer that was previously skeleton-only. Two UI locations updated:

1. `/kdsx/order-progress` dashboard — surplus table below the order cards grid (green +X kg, filtered to rows > 0)
2. `OrderProgressTab` — per-item surplus indicator beneath the progress bar when `allocatedQty > plannedQty`

### Files created/modified

```
src/app/kdsx/order-progress/page.tsx          — Fixed surplus color (#52c41a), added +prefix, added filter(totalSurplusQty > 0)
src/components/kdsx/OrderProgressTab.tsx       — Added surplus indicator (+X kg dư) below progress bar in progress column
```

### Key business logic implemented

- Surplus = `allocatedQty - plannedQty`; only shown when surplus > 0 (capped at 0 via `Math.max`)
- Progress bar still capped at 100% even when surplus exists; surplus shown as separate text below
- Surplus table hidden entirely when `surplus.length === 0` (section not rendered)
- `dataSource` filtered with `s.totalSurplusQty > 0` to guard against 0-qty rows from API

### API endpoints

| Method | Path                                      | Description                             |
| ------ | ----------------------------------------- | --------------------------------------- |
| GET    | /api/kdsx/sales-orders/surplus?factoryId= | Returns surplus qty per item (existing) |

### Known limitations

- `var(--color-text-success)` CSS variable not guaranteed in all themes; using hardcoded `#52c41a` instead

---

## KẾ HOẠCH THÁNG — Hỗ trợ dòng "Dự phòng (DP)"

**Status:** ✅ Completed 2026-04-03

### What was built

Cho phép nhập dòng sợi trong kế hoạch tháng mà không cần gắn với hợp đồng cụ thể — gọi là dòng "Dự phòng (DP)". Phòng KD dùng khi nhà máy sản xuất dư năng lực để tồn kho hoặc chuẩn bị cho HĐ đột xuất.

### Files created/modified

```
src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx  — Thêm Checkbox DP, disable Select HĐ khi DP, cột HĐ hiển thị Tag "Dự phòng"
src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts  — Không cần sửa (salesOrderItemId đã là Int? optional)
```

### Key business logic implemented

- `isDP = true` → `salesOrderItemId = null` (không gắn HĐ); `isDP = false` → bắt buộc chọn HĐ
- Khi checkbox DP được check → Select HĐ bị disabled và clear
- Khi mở modal edit dòng DP (salesOrderItemId = null) → checkbox tự tick, Select disabled
- Cột "HĐ" trong bảng: `salesOrderItemId !== null` → hiện orderNo; `null` → hiện `<Tag>Dự phòng</Tag>`
- `grossMarginVnd` tính đúng vì dùng `unitPriceUsd` nhập tay + rates của item, không phụ thuộc vào HĐ

### Known limitations

- Không có field `contractCode = 'DP'` trong DB (schema không có field này trong PlanLineItem); DP được nhận diện bằng `salesOrderItemId IS NULL`
- Allocation engine không thay đổi — lượng SX không có HĐ nhận tự vào surplus pool như bình thường

---

## USER-PERMISSION — Department + Extra Modules

**Status:** ✅ Completed 2026-04-05

### What was built

Thêm field `department` (enum 5 giá trị) và `extraModules` (String[]) vào model User.
Sidebar AdminLayout ẩn/hiện nhóm menu theo department + extraModules thay vì theo `accessLevel`.
Admin có thể cấp thêm quyền xem module ngoài mặc định qua form chỉnh sửa User.
Guard API trên các route nhạy cảm (kdsx, benchmark) trả 403 với user không có quyền.

### Files created/modified

```
src/lib/permissions.ts              — canViewModule(), canAccessKdsx(), canAccessBenchmark(), MODULE_KEYS, MODULE_LABELS, DEPARTMENT_LABELS, getAvailableExtraModules()
src/auth.config.ts                  — thêm department/extraModules vào JWT+session callback
src/auth.ts                         — thêm department/extraModules vào authorize return
src/components/AdminLayout.tsx      — ẩn/hiện menu theo canViewModule() thay vì accessLevel
src/app/api/users/route.ts          — accept department/extraModules trong POST và PUT
src/app/users/page.tsx              — thêm Select department + Checkbox extraModules vào form
src/app/api/kdsx/customers/route.ts — thêm canAccessKdsx guard cho GET
src/app/api/kdsx/summary/route.ts   — thêm canAccessKdsx guard cho GET
src/app/api/productivity-benchmark/versions/route.ts — thêm canAccessBenchmark guard cho GET
```

### Key business logic implemented

- `canViewModule(department, extraModules, role, module)` — logic check quyền duy nhất, dùng chung frontend + backend
- ADMIN bypass tất cả
- User cũ mặc định FACTORY + extraModules=[] — không bị ảnh hưởng (default trong schema)
- Sidebar chỉ ẩn menu (UX), bảo mật thật ở API guard
- Department mặc định theo FACTORY_MODULES:
  - FACTORY: production, maintenance, energy, iot, stops
  - MANAGEMENT: tất cả module
  - SALES: kdsx
  - ACCOUNTING: kdsx, energy
  - WAREHOUSE: không có module nào

### API endpoints

| Method | Path       | Description                              |
| ------ | ---------- | ---------------------------------------- |
| PUT    | /api/users | Thêm department/extraModules vào payload |
| POST   | /api/users | Thêm department/extraModules vào payload |

### Data notes

- `department` default = 'FACTORY' — user cũ không bị ảnh hưởng
- `extraModules` default = [] — không có quyền thêm
- MODULE_KEYS: production, maintenance, energy, iot, kdsx, benchmark, stops
- canAccessKdsx/canAccessBenchmark dùng `session as any` vì NextAuth chưa có type declaration mở rộng cho department

---

## KDSX — Mở rộng thông tin Khách hàng

**Status:** ✅ Completed 2026-04-06

### What was built

Bổ sung 5 trường thông tin mới vào model Customer: địa chỉ, số điện thoại, email, mã số thuế và phân loại khách hàng (trong nước / nước ngoài). Cập nhật toàn bộ API và giao diện UI để hỗ trợ các trường này.

### Files created/modified

```
prisma/schema.prisma                                 — Thêm enum CustomerType (DOMESTIC | FOREIGN) và 5 trường mới vào model Customer
prisma/migrations/20260406000002_add_customer_fields/ — Migration SQL thêm cột vào bảng customers
src/app/api/kdsx/customers/route.ts                  — POST nhận và lưu 5 trường mới
src/app/api/kdsx/customers/[id]/route.ts             — PUT cập nhật 5 trường mới
src/app/kdsx/customers/page.tsx                      — UI: bảng hiển thị thêm cột + form nhập đầy đủ 8 trường
```

### Key business logic implemented

- `customerType` mặc định là `DOMESTIC` (trong nước) nếu không truyền hoặc truyền sai giá trị
- Validate `customerType`: chỉ chấp nhận "DOMESTIC" | "FOREIGN", fallback về "DOMESTIC"
- Giao diện form dùng 2 cột để tiết kiệm không gian, bảng có `scroll={{ x: 1100 }}`
- Tag màu: Trong nước = blue, Nước ngoài = green

### API endpoints

| Method | Path                     | Description                      |
| ------ | ------------------------ | -------------------------------- |
| GET    | /api/kdsx/customers      | Lấy danh sách kèm \_count orders |
| POST   | /api/kdsx/customers      | Tạo khách hàng mới (8 trường)    |
| PUT    | /api/kdsx/customers/[id] | Cập nhật khách hàng (8 trường)   |
| DELETE | /api/kdsx/customers/[id] | Xóa (chỉ ADMIN)                  |

### Known limitations / not yet implemented

- Chưa có tính năng tìm kiếm / lọc theo customerType trên bảng
- Chưa validate định dạng email, số điện thoại, mã số thuế ở backend

### Data notes

- `customerType` lưu dạng enum PostgreSQL: 'DOMESTIC' | 'FOREIGN'
- Migration: `20260406000002_add_customer_fields` — cần chạy `npx prisma migrate deploy` trên máy dev

---

## MODULE �?NH M?C N�NG SU?T � C?P NH?T 2026-04-11

### T�nh n�ng m?i: �?nh m?c Th?c nghi?m (EMPIRICAL)

**Ng�y c?p nh?t:** 2026-04-11
**Files thay �?i:**

- prisma/schema.prisma � th�m enum BenchmarkType, 3 fields m?i
- src/app/api/productivity-benchmark/benchmarks/route.ts � POST h? tr? EMPIRICAL
- src/app/api/productivity-benchmark/benchmarks/[id]/route.ts � PUT h? tr? EMPIRICAL
- src/app/api/productivity-benchmark/capacity/route.ts � th�m param enchmarkType
- src/app/api/productivity-benchmark/comparison/route.ts � th�m param enchmarkType
- src/app/dashboard/productivity-benchmark/page.tsx � UI Radio ch?n lo?i + c?t m?i
- src/app/dashboard/productivity-benchmark/capacity/page.tsx � Segmented ch?n lo?i
- src/app/dashboard/productivity-benchmark/comparison/page.tsx � Segmented + c?t m?i

### 2 lo?i �?nh m?c song song

|                   | L? thuy?t (THEORY)                      | Th?c nghi?m (EMPIRICAL)                  |
| ----------------- | --------------------------------------- | ---------------------------------------- |
| Ngu?n g?c         | T�nh t? c�ng th?c v?t l?                | Ng�?i d�ng t? nh?p t? kinh nghi?m        |
| ��n v? l�u        | kg/ca/m�y (stdOutputPerShift)           | kg/ng�y/lo?i m�y (empiricalOutputPerDay) |
| Th�ng s? c?n nh?p | Nm, Ne, twist, speed, hi?u su?t, s? c?c | Ch? c?n: lo?i m�y + m?t h�ng + kg/ng�y   |
| D�ng �?           | ��nh gi� m�y c� ��ng thi?t k? kh�ng     | L?p k? ho?ch v� ��m ph�n v?i kh�ch       |

### Schema thay �?i

`prisma
enum BenchmarkType {
THEORY // �?nh m?c l? thuy?t
EMPIRICAL // �?nh m?c th?c nghi?m
}

model ProductivityBenchmark {
// ... fields c? gi? nguy�n ...
benchmarkType BenchmarkType @default(THEORY)
empiricalOutputPerDay Float? // kg/ng�y � ch? d�ng khi EMPIRICAL
empiricalNote String? // ngu?n s? li?u
}
`

Migration: prisma db push (dev) �? ch?y th�nh c�ng. DB �? sync.

### Business rules

- **Unique constraint** (versionId, itemId, processId, machineModel) v?n �p d?ng � 1 t? h?p ch? c� 1 d?ng d� l� THEORY hay EMPIRICAL
- **calcTheoreticalOutput()** trong src/utils/benchmark.ts KH�NG thay �?i g?
- **API capacity** EMPIRICAL: dailyOutputPerMachine = empiricalOutputPerDay (�? l� kg/ng�y, kh�ng nh�n 3)
- **API capacity** THEORY: dailyOutputPerMachine = stdOutputPerShift � 3 (nh� c?)
- **API comparison**: enchmarkValue = kg/ng�y � THEORY d�ng stdOutputPerShift�3, EMPIRICAL d�ng empiricalOutputPerDay

### API params m?i

| API              | Param m?i             | Gi� tr?                                 |
| ---------------- | --------------------- | --------------------------------------- |
| GET /capacity    | enchmarkType          | THEORY (default) ho?c EMPIRICAL         |
| GET /comparison  | enchmarkType          | THEORY (default) ho?c EMPIRICAL         |
| POST /benchmarks | enchmarkType          | THEORY (default) ho?c EMPIRICAL         |
| POST /benchmarks | empiricalOutputPerDay | Float (kg/ng�y, b?t bu?c n?u EMPIRICAL) |
| POST /benchmarks | empiricalNote         | String (optional)                       |

---

## IOT IMPORT — Multi-format parser architecture

**Status:** ✅ Completed 2026-04-12

### What was built

Mở rộng hệ thống IoT import để hỗ trợ nhiều định dạng file khác nhau từ các dòng máy khác nhau. Thêm field `fileFormat` vào `IotSource`, tách `parse-excel/route.ts` thành dispatcher + sub-parsers độc lập. Viết sub-parser `DANH_ONG` cho file HTML-as-XLS của máy đánh ống.

### Files created/modified

```
prisma/schema.prisma                                   — thêm enum IotFileFormat, field fileFormat vào IotSource
prisma/migrations/20260412000001_add_iot_file_format/  — migration SQL
src/lib/iot-parsers/types.ts                           — types dùng chung (ParseResult, LookupMaps, ParsedRow)
src/lib/iot-parsers/utils.ts                           — hàm dùng chung (normalize, parseDate, parseShift, parseOutput)
src/lib/iot-parsers/parser-standard.ts                 — sub-parser STANDARD (máy sợi con, format có cột Ngày/Ca/Máy/Mặt hàng)
src/lib/iot-parsers/parser-danh-ong.ts                 — sub-parser DANH_ONG (máy đánh ống, HTML-as-XLS)
src/app/api/iot/parse-excel/route.ts                   — dispatcher: đọc source.fileFormat, gọi sub-parser tương ứng
src/app/api/iot/sources/route.ts                       — POST nhận thêm fileFormat
src/app/api/iot/sources/[id]/route.ts                  — PUT nhận thêm fileFormat
src/app/iot-import/sources/page.tsx                    — thêm cột + dropdown chọn fileFormat
```

### Key business logic implemented

- `IotFileFormat` enum: `STANDARD` | `DANH_ONG` — thêm format mới chỉ cần thêm case vào switch
- STANDARD parser: cột Ngày, Ca, Máy, Mặt hàng, Sản lượng; bỏ dòng "Tổng cộng"; detect cột bằng normalize()
- DANH_ONG parser: file là HTML-as-XLS; ngày+ca lấy từ `<div>` ngoài bảng dạng "Ca: Apr/01/2026 - 2"; cột A=Lô (mặt hàng), B=Số thứ tự máy (cần mapping), M=PRKG(kg); bỏ dòng TỔNG + dòng cột B rỗng
- Existing log check: load 90 ngày gần nhất thay vì tính date range (đơn giản hơn, phù hợp import thường xuyên)
- Tất cả sub-parser trả về cùng `ParseResult` → wizard Preview/Import không cần thay đổi

### API endpoints

| Method | Path                 | Description                                           |
| ------ | -------------------- | ----------------------------------------------------- |
| POST   | /api/iot/parse-excel | Dispatcher: đọc fileFormat của source, gọi sub-parser |
| POST   | /api/iot/sources     | Nhận thêm fileFormat                                  |
| PUT    | /api/iot/sources/:id | Nhận thêm fileFormat                                  |

### Known limitations

- `as any` cast trong sources/route.ts POST vì Prisma client chưa regenerate (cần chạy migrate deploy + prisma generate trên máy)
- Chưa viết parser cho các dòng máy khác (máy chải, máy ghép...) — thêm khi cần

### Data notes

- Tất cả IotSource hiện có mặc định fileFormat = STANDARD sau khi migrate
- Cần chạy: `npx prisma migrate deploy && npx prisma generate`

---

## KD DAILY INPUT — Quick item assignment inline

**Status:** ✅ Completed 2026-04-13

### What was built

Bổ sung chức năng thay đổi mặt hàng ngay trong bảng nhập sản lượng phòng KD (`kd-daily-input/page.tsx`), tương tự chức năng đã làm cho `production/daily-input/page.tsx` nhưng dành cho giao diện bảng (table-based, không modal).

### Files created/modified

```
src/app/kd-daily-input/page.tsx   — thêm inline item selection + cập nhật điều phối khi lưu
```

### Key business logic implemented

- `RowData` thêm field `originalItemId` để detect xem mặt hàng có thay đổi so với lúc tải không
- Load danh sách mặt hàng từ `/api/items?all=true` khi mount trang
- Cột "Mặt hàng đang chạy": Tag xanh (bình thường) / Tag cam (đã thay đổi) + icon ✏️ để bật Select dropdown
- Máy chưa cấu hình (`itemId === 0`): hiện Select dropdown trực tiếp (nền vàng), không hiện Tag; ô nhập kg bị disabled cho đến khi chọn xong
- `editingItemIndex: number | null` — chỉ 1 row mở select tại 1 thời điểm; blur → đóng lại
- Trạng thái "Chưa cấu hình" → "Chọn mặt hàng" (màu warning) để user biết cần chọn
- Trong `handleSave`: với mỗi row có `itemId !== originalItemId`, gọi `/api/machines/batch` (single machine) để cập nhật `currentItemId` TRƯỚC khi lưu sản lượng
- Sau khi lưu thành công: cập nhật `originalItemId = itemId` cho tất cả rows
- `handleFillZero`: bỏ qua rows có `itemId === 0` (tránh ghi 0 cho máy chưa cấu hình)

### API endpoints

| Method | Path                | Description                                                        |
| ------ | ------------------- | ------------------------------------------------------------------ |
| POST   | /api/machines/batch | Cập nhật điều phối 1 máy (machineIds.length=1, operator được phép) |
| GET    | /api/items?all=true | Tải danh sách mặt hàng cho dropdown                                |

### Known limitations

- Khi user thay đổi mặt hàng rồi bấm "Tải danh sách" lại mà chưa lưu → thay đổi mất (expected behavior)
- rowKey dựa trên `machineId-itemId`: nếu user đổi item thì rowKey thay đổi → React re-render row; không gây bug nhưng có thể mất focus ô nhập kg (acceptable)

### Data notes

- Sau khi đổi mặt hàng và lưu: `machine.currentItemId` được cập nhật trong DB; lần tải sau sẽ hiện mặt hàng mới
- Lịch sử sản xuất (production_logs / kd_daily_outputs) không bị ảnh hưởng khi đổi currentItemId

---

## PRODUCTION DAILY INPUT — Xóa bản ghi production_logs

**Status:** ✅ Completed 2026-04-14

### What was built

Thêm tính năng xóa bản ghi sản lượng ca (`ProductionLog`) cho trang nhập liệu sản xuất. Bao gồm cả DELETE API endpoint và nút xóa có Popconfirm trong modal nhập liệu.

### Files created/modified

```
src/app/api/production/daily-input/route.ts  — Thêm DELETE handler mới
src/app/production/daily-input/page.tsx      — Thêm nút "Xóa bản ghi ca này" + hàm handleDeleteLog
```

### Key business logic implemented

- DELETE endpoint nhận `?id=X` (id của ProductionLog), xóa bằng `prisma.productionLog.delete`
- Phân quyền xóa: ADMIN (old role), hoặc userRole thuộc `["ADMIN", "DIRECTOR", "FACTORY_MANAGER", "STATISTICIAN"]`
- Nút xóa chỉ hiện trong modal khi: (1) `currentMachine.todayLog` tồn tại, VÀ (2) user có `canDelete = true`
- Sau khi xóa thành công: cập nhật local state (`todayLog → undefined`), đóng modal
- Popconfirm yêu cầu xác nhận trước khi xóa (không thể hoàn tác)
- Lỗi P2025 (không tìm thấy bản ghi) → trả về 404

### API endpoints

| Method | Path                             | Description               |
| ------ | -------------------------------- | ------------------------- |
| DELETE | /api/production/daily-input?id=X | Xóa ProductionLog theo id |

### Known limitations

- Không xóa được log có `status = APPROVED` (không có trường này trong ProductionLog — không áp dụng)
- Sau khi xóa, `machine.currentItemId` không được rollback (còn giữ item của ca bị xóa)
- Chưa có audit log khi xóa (ai xóa, khi nào)

### Data notes

- `ProductionLog.id` là auto-increment int, unique — đủ để identify chính xác bản ghi cần xóa
- Xóa log không ảnh hưởng đến bảng `KdDailyInput` (hai bảng độc lập)

---

## PRODUCTIVITY BENCHMARK — Migrate permission system

**Status:** ✅ Completed 2026-04-14

### What was built

Migrate 6 API route của module Định mức Năng suất từ hệ thống phân quyền cũ (`?.role` / `accessLevel`) sang hệ thống mới (`?.userRole` + `ALLOWED_ROLES`).

### Files created/modified

```
src/app/api/productivity-benchmark/versions/route.ts              — POST: cập nhật permission
src/app/api/productivity-benchmark/versions/[id]/route.ts         — PUT + DELETE: cập nhật permission
src/app/api/productivity-benchmark/versions/[id]/activate/route.ts — POST: cập nhật permission
src/app/api/productivity-benchmark/versions/[id]/clone/route.ts   — POST: cập nhật permission
src/app/api/productivity-benchmark/benchmarks/route.ts            — POST: cập nhật permission
src/app/api/productivity-benchmark/benchmarks/[id]/route.ts       — PUT + DELETE: cập nhật permission
```

### Key business logic implemented

- Tất cả write operations (POST/PUT/CLONE) cho phép: `["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"]`
- DELETE version và DELETE benchmark: chỉ `ADMIN`
- Activate version: chỉ `ADMIN`
- Logic nghiệp vụ không thay đổi: phiên bản `isActive = true` không thể sửa/xóa benchmark

### API endpoints

| Method | Path                                               | Permission    |
| ------ | -------------------------------------------------- | ------------- |
| POST   | /api/productivity-benchmark/versions               | ALLOWED_ROLES |
| PUT    | /api/productivity-benchmark/versions/[id]          | ALLOWED_ROLES |
| DELETE | /api/productivity-benchmark/versions/[id]          | ADMIN only    |
| POST   | /api/productivity-benchmark/versions/[id]/activate | ADMIN only    |
| POST   | /api/productivity-benchmark/versions/[id]/clone    | ALLOWED_ROLES |
| POST   | /api/productivity-benchmark/benchmarks             | ALLOWED_ROLES |
| PUT    | /api/productivity-benchmark/benchmarks/[id]        | ALLOWED_ROLES |
| DELETE | /api/productivity-benchmark/benchmarks/[id]        | ADMIN only    |

### Known limitations

- Sửa/xóa benchmark của phiên bản đang `isActive` vẫn bị block (intentional)
- Để sửa phiên bản active → phải clone ra phiên bản nháp trước

---

## TOÀN HỆ THỐNG — Migrate permission sang hệ thống mới (userRole)

**Status:** ✅ Completed 2026-04-14

### What was built

Migrate toàn bộ ~35 API route còn sót từ hệ thống phân quyền cũ (`?.role` / `accessLevel`) sang hệ thống mới (`?.userRole`). Sau đợt này KHÔNG còn file nào trong `src/app/api` còn dùng `accessLevel` hay `session.user.role`.

### Files modified (theo nhóm)

**ADMIN-only routes** — thay `?.role !== "ADMIN"` → `?.userRole !== "ADMIN"`:

- `factories/route.ts`, `factories/[id]/route.ts`
- `processes/route.ts`, `processes/[id]/route.ts`
- `production/stop-categories/route.ts`, `production/stop-categories/[id]/route.ts`
- `shift-categories/route.ts`, `shift-categories/[code]/route.ts`
- `energy/meters/route.ts`, `energy/prices/route.ts`, `energy/substations/route.ts`
- `energy-type-categories/route.ts`, `energy-type-categories/[code]/route.ts`
- `meter-group-categories/route.ts`, `meter-group-categories/[id]/route.ts`
- `items/import/route.ts`, `admin/backup/route.ts`, `admin/backup-sql/route.ts`
- `kdsx/monthly-plans/[id]/unapprove/route.ts`

**ALLOWED_ROLES routes** (`["ADMIN","DIRECTOR","FACTORY_MANAGER"]`) — thay `role !== "ADMIN" && accessLevel !== "MANAGER"`:

- `iot/import/route.ts`, `iot/import-logs/route.ts`, `iot/mapping/route.ts`
- `iot/parse-excel/route.ts`, `iot/sources/route.ts`, `iot/sources/[id]/route.ts`
- `productivity-benchmark/benchmarks/bulk/route.ts`
- `production/lines/route.ts`, `production/lines/[id]/route.ts`

**Special cases**:

- `kd-daily-input/route.ts`, `production/daily-input/route.ts` POST — bỏ check READ_ONLY, cho phép mọi user đã login ghi nhập liệu
- `production/daily-input/route.ts` DELETE — dọn fallback `role` cũ
- `machines/batch/route.ts` — `isAdmin`/`isManager` dùng `userRole` mới
- `production/machine-stops/route.ts`, `machine-stops/stats/route.ts`, `machine-stops/[id]/route.ts` — `userRole` cho data-level filtering

### Key business logic

- ADMIN-only: các bảng danh mục (factories, processes, categories, items, energy, backup...)
- ALLOWED_ROLES `["ADMIN","DIRECTOR","FACTORY_MANAGER"]`: IoT import/mapping, production lines, benchmark bulk
- Write nhập liệu sản xuất: mọi user authenticated (không phân biệt role)
- Sau migration: `accessLevel` và `session.user.role` KHÔNG còn được đọc ở bất kỳ API route nào

### Known limitations

- Frontend pages (`.tsx`) chưa được scan — một số trang vẫn dùng `session?.user?.role === "ADMIN"` để ẩn/hiện UI button. Đây là acceptable vì chỉ ảnh hưởng hiển thị, không ảnh hưởng bảo mật (backend đã chuẩn)

---

## PRODUCTION — Trường Hiệu suất máy (efficiency) trong production_logs

**Status:** ✅ Completed 2026-04-15

### What was built

Bổ sung trường `efficiency` (hiệu suất máy, %, không bắt buộc) vào bảng `production_logs`. Tích hợp nhập liệu, hiển thị trong lịch sử, và báo cáo biểu đồ sản lượng. Hiệu suất TB được tính theo công thức trọng số sản lượng: `Σ(output_i × eff_i) / Σ(output_i)` — chỉ tính các ca có nhập hiệu suất.

### Files created/modified

```
prisma/schema.prisma                                          — Thêm field `efficiency Float?` vào model ProductionLog
prisma/migrations/20260415082959_add_efficiency.../           — ALTER TABLE production_logs ADD COLUMN efficiency DOUBLE PRECISION
src/app/api/production/daily-input/route.ts                  — POST nhận/lưu efficiency; GET trả efficiency
src/app/production/daily-input/page.tsx                      — Thêm InputNumber nhập hiệu suất (0–100%, optional) trong modal
src/app/api/production/history/route.ts                      — Tính avgEfficiency có trọng số, trả về trong stats
src/app/production/history/page.tsx                          — Cột Hiệu suất (màu: xanh ≥95%, cam ≥85%, đỏ <85%), card avgEfficiency
src/app/api/reports/production/route.ts                      — byDate thêm avgEfficiency/ngày; summary thêm avgEfficiency cả kỳ
src/app/reports/production/page.tsx                          — Truyền avgEfficiency xuống KpiCards
src/components/reports/KpiCards.tsx                          — Card KPI thứ 5: Hiệu suất TB (màu theo ngưỡng)
src/components/reports/OutputByDate.tsx                      — Chuyển LineChart → ComposedChart: Bar sản lượng + Line hiệu suất (trục Y phải)
```

### Key business logic implemented

- Công thức trọng số: `avgEff = Σ(finalOutput_i × efficiency_i) / Σ(finalOutput_i)` — chỉ tính ca có `efficiency != null && finalOutput > 0`
- `avgEfficiency` trả về `null` khi chưa có ca nào nhập hiệu suất (không giả định = 0)
- Ngưỡng màu hiệu suất: xanh ≥95%, cam ≥85%, đỏ <85%
- Biểu đồ OutputByDate: Line hiệu suất chỉ hiện khi có ít nhất 1 ngày có dữ liệu (`connectNulls=false`)
- Trục Y phải hiệu suất domain [70, 100] để tránh lệch tỷ lệ

### API endpoints

| Method | Path                        | Description                                                   |
| ------ | --------------------------- | ------------------------------------------------------------- |
| GET    | /api/production/daily-input | Trả về log theo (machineId, date, shift), bao gồm efficiency  |
| POST   | /api/production/daily-input | Lưu/cập nhật log, bao gồm efficiency (optional)               |
| POST   | /api/production/history     | Trả data + stats.avgEfficiency (trọng số theo toàn bộ filter) |
| GET    | /api/reports/production     | byDate[].avgEfficiency + summary.avgEfficiency cả kỳ          |

### Known limitations / not yet implemented

- Chưa có validation ngưỡng tối thiểu/tối đa nghiệp vụ cho efficiency (0–100 là giới hạn UI, không enforce ở backend)
- Biểu đồ OutputByDate không có tooltip riêng khi hover trên Line hiệu suất ở vùng null

### Data notes

- `efficiency` lưu dạng số thực (VD: 97.5 nghĩa là 97.5%), không phải tỷ lệ 0–1
- Migration: file SQL tạo thủ công do Prisma CLI bị block network; cần chạy `npx prisma migrate deploy` + `npx prisma generate` từ Windows terminal

---

## SẢN XUẤT — Nhập sản lượng dạng bảng (Grid)

**Status:** ✅ Completed 2026-04-16

### What was built

Giao diện nhập sản lượng dạng bảng dành cho nhân viên thống kê, hoạt động song song với giao diện thẻ (card) cũ. Cho phép paste dữ liệu từ Excel (Ctrl+V) vào cột "Chỉ số SAU", hỗ trợ tất cả formulaType, tự động tải chỉ số đầu ca từ ca trước và lưu vào cùng bảng `production_logs` qua cùng API.

### Files created/modified

```
src/app/production/daily-input-grid/page.tsx  — Trang nhập liệu dạng bảng mới
src/components/AdminLayout.tsx                 — Thêm menu "Nhập sản lượng (Bảng)", icon TableOutlined
```

### Key business logic implemented

- Dùng chung `/api/production/daily-input` POST + `/api/production/daily-status` + `/api/production/last-log` — không tạo API mới
- Auto-load `startIndex` từ last-log của ca trước (Promise.all song song cho tất cả máy)
- Paste Excel: lấy cột đầu tiên của mỗi dòng (split by `\t`), dán từ row được click xuống dưới
- Công thức tính `finalOutput` phía client giống hệt trang card cũ (formulaType 1/2/3/4)
- Switch "Dừng" per row thay cho modal riêng — khi Dừng: finalOutput=0, note="Máy dừng"
- Chỉ số TRƯỚC hiển thị read-only, có nút edit nhỏ khi cần sửa (tương đương isReset của card cũ)
- Xóa log: chỉ user có role ADMIN/DIRECTOR/FACTORY_MANAGER/STATISTICIAN mới thấy nút xóa

### API endpoints

| Method | Path                            | Description                                            |
| ------ | ------------------------------- | ------------------------------------------------------ |
| GET    | /api/production/daily-status    | Tải machines + todayLog theo processId/date/shift      |
| GET    | /api/production/last-log        | Lấy endIndex ca trước cho startIndex                   |
| POST   | /api/production/daily-input     | Lưu từng row (upsert theo machineId+date+shift+itemId) |
| DELETE | /api/production/daily-input?id= | Xóa log (role-restricted)                              |

### Known limitations

- Chưa hỗ trợ "Đổi hàng giữa ca" (tính năng phức tạp của giao diện thẻ); người dùng cần dùng giao diện thẻ nếu cần đổi hàng giữa ca
- Không có cảnh báo ca thiếu (missing shifts warning) như giao diện thẻ
- Cột NE hiển thị "—" cho formulaType 1 và 2

---

## KD-SX — Module Kế hoạch Sản xuất tháng (Production Schedule)

**Status:** ✅ Completed 2026-04-17

### Mô tả nghiệp vụ

Module lập kế hoạch sản xuất chi tiết cho tháng — phân bổ mặt hàng trên từng máy theo từng ngày. Đây là **tiền đề** để tính doanh thu/lợi nhuận kế hoạch theo số lý thuyết (thay cho việc nhập tay `PlanLineItem.qty`).

**Luồng dữ liệu:**

```
ProductivityBenchmark.empiricalOutputPerDay (định mức kg/ngày)
    ↓ (auto-fill)
ProductionSchedule + ScheduleSegment (kế hoạch SX)
    ↓ (tổng hợp, trừ ngày nghỉ)
PlanLineItem.qty (số lượng kế hoạch cho DT)
    ↓
Tính doanh thu / chi phí / lợi nhuận KH
```

### Schema thay đổi

**Additive-only — không phá vỡ data cũ:**

- `Machine.model String?` — thêm field nullable để map tới `ProductivityBenchmark.machineModel`
- `ProductionSchedule` — model mới: 1 nhà máy × 1 tháng (`@@unique([factoryId, yearMonth])`)
  - `holidays Json @default("[]")` — mảng số ngày nghỉ trong tháng (VD: `[1, 30]`)
  - `status PlanStatus` — tái dùng enum DRAFT/SUBMITTED/APPROVED
- `ScheduleSegment` — model mới: 1 máy × 1 mặt hàng × khoảng ngày
  - `fromDay Int`, `toDay Int` — ngày trong tháng (1–31)
  - `kgPerDay Float` — sản lượng kg/ngày (auto-fill hoặc nhập tay)
  - `benchmarkId Int?` — audit trail: fill từ benchmark nào
  - `isManualKg Boolean @default(false)` — cờ phân biệt auto vs thủ công
- Relations thêm vào model cũ: `Factory.productionSchedules`, `Machine.scheduleSegments`, `Item.scheduleSegments`
- Migration: `20260417230626_add_production_schedule_module`

### Logic nghiệp vụ quan trọng

**1. Auto-fill kgPerDay từ EMPIRICAL benchmark:**

- Khi thêm segment: tra `ProductivityBenchmark` theo `(versionId, itemId, processId, machineModel, benchmarkType=EMPIRICAL)`
- `BenchmarkVersion` được chọn: `effectiveFrom <= planDate` + `(effectiveTo IS NULL OR effectiveTo >= planDate)` + `isActive=true` → order by `effectiveFrom DESC` → take first
- Machine phải có field `model` (nullable), nếu không có → không auto-fill được
- Nếu không tìm thấy benchmark EMPIRICAL → trả lỗi 400 `NO_BENCHMARK`, gợi ý cấu hình

**2. Overlap check (server-side):**

- Trước khi tạo/sửa segment, kiểm tra máy đó không có segment khác trùng khoảng ngày
- 3 điều kiện overlap: `fromDay trong range cũ` OR `toDay trong range cũ` OR `range mới bao trùm range cũ`
- Khi sửa: exclude chính segmentId đang edit

**3. Tính tổng kg có trừ ngày nghỉ:**

```
days = toDay - fromDay + 1
holidaysInRange = holidays.filter(h => h >= fromDay && h <= toDay).length
effectiveDays = max(0, days - holidaysInRange)
totalKg = effectiveDays × kgPerDay
```

**4. Workflow trạng thái:**

- **DRAFT**: cho sửa tự do (thêm/sửa/xóa segments, toggle holiday)
- **SUBMITTED**: khóa sửa segments, chỉ xem. Có thể revert về DRAFT
- **APPROVED**: khóa hoàn toàn. Phải unapprove → SUBMITTED mới sửa được
- **Chỉ khi APPROVED** mới được gọi `sync-to-plan` → tránh số kế hoạch DT thay đổi liên tục
- Chỉ DRAFT mới xóa được schedule (onDelete: Cascade xóa toàn bộ segments)

**5. Sync to Plan (`sync-to-plan`):**

- Tính summary `{itemId → totalKg}` từ tất cả segments (có trừ holidays)
- Tìm hoặc tạo `MonthlyPlan` cho `(factoryId, yearMonth)`
- Với mỗi item: upsert `PlanLineItem` (`salesOrderItemId=null` = direct plan không gắn HĐ)
- Kết quả trả về danh sách items đã sync với action CREATED/UPDATED

**6. Màu mặt hàng (hash stable):**

```typescript
function itemColor(itemId: number): string {
  const hue = (itemId * 137.5) % 360; // golden angle
  return `hsla(${hue}, 65%, 60%, 1)`;
}
```

### API Endpoints

| Method | Path                                                      | Mô tả                                                           |
| ------ | --------------------------------------------------------- | --------------------------------------------------------------- |
| GET    | `/api/kdsx/production-schedule`                           | List schedules (filter: factoryId, yearMonth) + tổng kg         |
| POST   | `/api/kdsx/production-schedule`                           | Tạo schedule trống cho (factoryId, yearMonth)                   |
| GET    | `/api/kdsx/production-schedule/[id]`                      | Chi tiết schedule + tất cả segments + machine/item info         |
| PUT    | `/api/kdsx/production-schedule/[id]`                      | Update note, holidays, status                                   |
| DELETE | `/api/kdsx/production-schedule/[id]`                      | Xóa (chỉ DRAFT, cascade segments)                               |
| POST   | `/api/kdsx/production-schedule/[id]/segments`             | Thêm segment + auto-fill kgPerDay từ EMPIRICAL                  |
| PUT    | `/api/kdsx/production-schedule/[id]/segments/[segmentId]` | Sửa segment (re-auto-fill nếu đổi item)                         |
| DELETE | `/api/kdsx/production-schedule/[id]/segments/[segmentId]` | Xóa 1 segment                                                   |
| GET    | `/api/kdsx/production-schedule/[id]/summary`              | Tổng hợp kg theo mặt hàng (trừ holidays)                        |
| POST   | `/api/kdsx/production-schedule/[id]/sync-to-plan`         | Đồng bộ sang MonthlyPlan (chỉ APPROVED)                         |
| GET    | `/api/kdsx/production-schedule/benchmark-lookup`          | Tra cứu EMPIRICAL cho (machineId, itemId, yearMonth, factoryId) |

### Files created/modified

```
prisma/schema.prisma                                                      ← Machine.model, ProductionSchedule, ScheduleSegment
prisma/migrations/20260417230626_add_production_schedule_module/          ← Migration SQL
prisma/seed-page-registry.js                                              ← Seed PageRegistry entry (id=45)

src/app/api/kdsx/production-schedule/route.ts                            ← GET list / POST create
src/app/api/kdsx/production-schedule/[id]/route.ts                       ← GET/PUT/DELETE
src/app/api/kdsx/production-schedule/[id]/segments/route.ts              ← POST add segment + auto-fill
src/app/api/kdsx/production-schedule/[id]/segments/[segmentId]/route.ts  ← PUT/DELETE segment
src/app/api/kdsx/production-schedule/[id]/summary/route.ts               ← GET summary by item
src/app/api/kdsx/production-schedule/[id]/sync-to-plan/route.ts          ← POST sync to MonthlyPlan
src/app/api/kdsx/production-schedule/benchmark-lookup/route.ts           ← GET benchmark lookup

src/app/kdsx/production-schedule/page.tsx                                ← Trang danh sách
src/app/kdsx/production-schedule/[id]/page.tsx                           ← Trang chi tiết (grid Excel-like)
src/components/kdsx/ScheduleSegmentModal.tsx                             ← Modal thêm/sửa segment

src/components/AdminLayout.tsx                                            ← Thêm kdsx.production-schedule vào sidebar
```

### PageRegistry

```json
{
  "pageKey": "kdsx.production-schedule",
  "pageName": "Ke hoach SX thang",
  "pageGroup": "KINH DOANH",
  "path": "/kdsx/production-schedule",
  "sortOrder": 50
}
```

→ `page_registry.id = 45`

### UI Features

- **Trang danh sách** (`/kdsx/production-schedule`): stats cards (tổng KH, đã duyệt, tổng tấn), filter nhà máy, table + modal tạo mới
- **Trang chi tiết** (`/kdsx/production-schedule/[id]`):
  - Summary cards màu theo mặt hàng (click để highlight máy liên quan trong grid)
  - Grid Excel-like: sticky 2 cột đầu (Mã máy + Mặt hàng), N cột ngày (header click = toggle holiday), cột TỔNG
  - Màu ô theo itemId (golden angle hashing), ô trống = có thể thêm
  - Ngày nghỉ lễ: header đỏ, ô xám "—", tổng cuối tự trừ
  - Click ô có segment → mở modal sửa; click ô trống → mở modal thêm với machine/day pre-filled
  - Workflow buttons: Trình duyệt / Phê duyệt / Đồng bộ sang KH DT / Unapprove
- **ScheduleSegmentModal**: auto-fetch benchmark khi chọn máy+mặt hàng, preview `X ngày × Y kg/ngày = Z kg`, warning nếu thiếu benchmark

### Known limitations / Next steps

- Grid chưa có "Export Excel" (button hiển thị nhưng chưa implement logic export)
- Khi `sync-to-plan`, `PlanLineItem.unitPriceUsd` được set = 0 với dòng tạo mới tự động — user cần cập nhật đơn giá sau
- `sync-to-plan` chỉ upsert dòng `salesOrderItemId = null`; các dòng gắn HĐ cụ thể phải tự map
- Chưa có seed data mẫu 21 máy × 30 ngày (phase 2 nếu cần)

---

## PRODUCTION-SCHEDULE — Cải tiến Phase 2 (2026-04-19)

**Status:** ✅ Completed 2026-04-19

### Những thay đổi đã thực hiện

#### 1. Fix auto-fill kgPerDay khi chọn nhiều máy

**File:** `src/components/kdsx/ScheduleSegmentModal.tsx`

- **Vấn đề cũ:** Khi chọn nhiều máy cùng model, `handleMachineOrItemChange` chỉ gọi `lookupBenchmark` khi `selectedMachineIds.length === 1`, nên auto-fill không hoạt động với đa máy.
- **Fix:** Đổi điều kiện sang `> 0` — luôn lookup với máy đầu tiên trong danh sách (đảm bảo cùng model). `handleMachineIdsChange` vẫn giữ logic kiểm tra cùng model để quyết định lookup hay warning.

#### 2. Màu mặt hàng per-schedule (itemColors)

**Vấn đề cũ:** Màu dùng `hue = (itemId * 137.5) % 360` — cố định, không đổi được.

**Schema thêm:**

```prisma
model ProductionSchedule {
  // ... fields hiện có
  itemColors Json @default("{}") // {"1":"#4CAF50","5":"#2196F3",...}
}
```

**Migration:** `20260419114408_add_item_colors_to_schedule`

**API PUT** `src/app/api/kdsx/production-schedule/[id]/route.ts`:

- Thêm `itemColors` vào body destructuring và data upsert
- Guard `APPROVED` được nới lỏng: `!status && !itemColors` (cho phép lưu màu kể cả khi APPROVED)

**UI** `ProductionScheduleDetailClient.tsx`:

- Hàm `getItemColor(itemId, itemColors)`: tra `itemColors[String(itemId)]`, fallback palette 16 màu theo `itemId % 16`
- Helpers: `getColor()`, `getBg()` (`+66` = alpha 40%), `getBorder()` (`+AA` = alpha 67%)
- Color picker `<input type="color" />` (14×14px) hiển thị cạnh tên mặt hàng trong cột sticky — **chỉ khi DRAFT**
- `handleChangeItemColor`: optimistic update local state ngay, gọi PUT API non-blocking

#### 3. Tab Thực hiện — Grid sản lượng thực tế

**API mới:** `GET /api/kdsx/production-schedule/[id]/actual`

- File: `src/app/api/kdsx/production-schedule/[id]/actual/route.ts`
- Ưu tiên `KdDailyInput` (phòng KD nhập). Nếu trống → fallback `ProductionLog.groupBy` theo `(machineId, itemId, recordDate)` SUM finalOutput
- Trả về: `{ grid: { machineId: { day: { itemId, kg } } }, source: "KD_DAILY_INPUT" | "PRODUCTION_LOG" }`

**Component mới:** `src/components/kdsx/ActualProductionGrid.tsx`

- Layout giống grid KH (cùng sticky columns, cùng cấu trúc)
- **Read-only** — dữ liệu từ `/actual` API
- Màu ô so sánh TH vs KH: `xanh (TH ≥ KH)`, `vàng (KH×0.9 ≤ TH < KH)`, `đỏ (TH < KH×0.9)`
- Mỗi ô hiện 2 số: số thực tế (lớn, đậm) + số KH (nhỏ, nhạt, trong ngoặc)
- Badge "Nguồn dữ liệu": KD Daily Input (xanh) hoặc Nhật ký SX (cam)

#### 4. Tab So sánh KH/TH — Dashboard

**Component mới:** `src/components/kdsx/ScheduleComparisonDashboard.tsx`

- Dùng Recharts (đã có trong `package.json: "recharts": "^3.7.0"`)
- **Bar chart**: mỗi mặt hàng 1 nhóm 2 cột (Kế hoạch vs Thực hiện, đơn vị tấn)
- **Line chart**: 2 đường tích lũy theo ngày (KH và TH), giúp thấy tiến độ so với kế hoạch
- **Bảng tổng hợp**: Mặt hàng | KH (kg) | TH (kg) | Chênh lệch | Tỷ lệ (tag màu ≥100% xanh / 90-99% vàng / <90% đỏ)
- Tính tổng TH từ `/actual` API (gọi riêng, lazy load khi chuyển tab)

#### 5. Tabs tích hợp vào trang chi tiết

**File sửa:** `src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx`

Thêm `<Tabs>` component Ant Design với 3 tab:

- `📋 Kế hoạch` — grid KH hiện tại (giữ nguyên)
- `📊 Thực hiện` — `<ActualProductionGrid />`
- `📈 So sánh KH/TH` — `<ScheduleComparisonDashboard />`

Props truyền vào `ActualProductionGrid` và `ScheduleComparisonDashboard` đều bao gồm `itemColors` từ schedule để dùng cùng bảng màu.

### Files created/modified (Phase 2)

```
prisma/schema.prisma                                                      ← Thêm itemColors Json vào ProductionSchedule
prisma/migrations/20260419114408_add_item_colors_to_schedule/             ← Migration SQL

src/app/api/kdsx/production-schedule/[id]/route.ts                       ← PUT thêm itemColors, guard APPROVED nới lỏng
src/app/api/kdsx/production-schedule/[id]/actual/route.ts                ← **MỚI** GET actual data

src/components/kdsx/ScheduleSegmentModal.tsx                             ← Fix auto-fill multi-machine
src/components/kdsx/ActualProductionGrid.tsx                             ← **MỚI** Grid thực hiện read-only
src/components/kdsx/ScheduleComparisonDashboard.tsx                     ← **MỚI** Dashboard so sánh KH/TH
src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx ← Tabs + color picker + itemColors
```

### API endpoints mới (Phase 2)

| Method | Path                                        | Mô tả                                                                   |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------- |
| GET    | `/api/kdsx/production-schedule/[id]/actual` | Sản lượng thực tế theo ngày/máy (KdDailyInput → fallback ProductionLog) |

### Cập nhật API endpoints hiện có (Phase 2)

| Method | Path                                 | Thay đổi                            |
| ------ | ------------------------------------ | ----------------------------------- |
| PUT    | `/api/kdsx/production-schedule/[id]` | Thêm field `itemColors` vào payload |

### Logic màu (itemColors) — Quy tắc

```typescript
// Palette fallback 16 màu (index = itemId % 16)
const DEFAULT_COLORS = ["#4CAF50","#2196F3","#FF9800","#9C27B0","#F44336",
  "#00BCD4","#FFEB3B","#E91E63","#3F51B5","#8BC34A",
  "#FF5722","#607D8B","#009688","#795548","#CDDC39","#673AB7"];

function getItemColor(itemId, itemColors): string {
  if (itemColors[String(itemId)]) return itemColors[String(itemId)]; // user đã chọn
  return DEFAULT_COLORS[itemId % 16]; // fallback
}
// Alpha variants:
getBg(itemId)     → getColor(itemId) + "66"  // 40% opacity
getBorder(itemId) → getColor(itemId) + "AA"  // 67% opacity
```

**Ghi chú:** `itemColors` là per-schedule (không phải per-item global) — mỗi schedule tự quản lý bảng màu, không ảnh hưởng lẫn nhau.

_Cập nhật lần cuối: 2026-04-20 — Thêm deliveredQty cho theo dõi đơn hàng cũ_

---

## ORDER-TRACKING — Thêm `deliveredQty` (Lịch sử giao hàng)

**Status:** ✅ Completed 2026-04-20

### What was built

Hỗ trợ nhập số lượng "Đã giao trước khi dùng phần mềm" (`deliveredQty`) cho các hợp đồng cũ để hệ thống tính đúng số "Còn lại".
Công thức tính "Còn lại" = `plannedQty - deliveredQty - allocatedQty`.

### Files created/modified

```
prisma/schema.prisma                                      ← Thêm field deliveredQty vào SalesOrderItem
src/app/api/kdsx/sales-orders/route.ts                    ← Nhận deliveredQty khi POST và sửa cách tính progress
src/app/api/kdsx/sales-orders/[id]/route.ts               ← PUT/GET deliveredQty và sửa cách tính remainingQty
src/app/api/kdsx/sales-orders/progress/route.ts           ← Cập nhật tính toán remainingQty và progressPct
src/app/kdsx/sales-orders/page.tsx                        ← Thêm ô nhập "Đã giao trước" trong form và hiển thị
src/lib/allocation-engine.ts                              ← Cập nhật công thức stillNeeded và checkAllItemsDone
```

### Key business logic implemented

- Field `deliveredQty` là một số Float, default = 0.
- `stillNeeded = plannedQty - deliveredQty - allocatedQty`.
- Hệ thống Allocation Engine (`runAllocation` và `runAllocationKD`) được update để lấy `deliveredQty` khi tính toán stillNeeded.
- `checkAllItemsDone` sử dụng `(allocatedQty + deliveredQty) >= plannedQty`.
- UI `progressPct` được điều chỉnh dựa trên `totalDelivered = allocatedQty + deliveredQty`.

---

## MATERIAL PRICE MANAGEMENT — Quản lý Giá Nguyên vật liệu Động

**Status:** ✅ Completed 2026-04-21

### What was built

Hệ thống quản lý giá NVL động (database-driven) thay thế các trường giá hard-code trong `MonthlyInputParam`. Cho phép nhập giá bông/PE theo tháng, lưu snapshot giá vào từng `PlanLineItem`/`ActualLineItem` để bảo toàn lịch sử.

### Schema changes

```prisma
// Mới: Danh mục loại NVL
model MaterialType {
  id       Int     @id @default(autoincrement())
  code     String  @unique  // "AUS", "US_PVC", "PE_BENMA"...
  name     String           // "Bông Úc", "PE Benma (Indo)"...
  category String           // "COTTON" hoặc "PE"
  isActive Boolean @default(true)
  prices   MaterialPrice[]
}

// Mới: Giá NVL theo tháng
model MaterialPrice {
  id             Int          @id @default(autoincrement())
  materialTypeId Int
  materialType   MaterialType
  yearMonth      String       // "2026-04"
  priceUsd       Float        // USD/kg
  @@unique([materialTypeId, yearMonth])
}

// Cập nhật: RawMaterialRate — thêm cottonRatio
model RawMaterialRate {
  // ... fields cũ ...
  cottonRatio Float @default(1.0)  // Tỷ lệ cotton (0-1), peRatio = 1 - cottonRatio
  // peRate = giá trị GỐC (kg NL/kg TP), code tự nhân peRatio khi tính
}

// Cập nhật: PlanLineItem/ActualLineItem — thêm snapshot NVL
// cottonMaterialTypeId, cottonPriceUsd, cottonRatio
// peMaterialTypeId, pePriceUsd, peRatio
```

### Business logic changes

```typescript
// Công thức mới trong calculateLineItem()
// CP Cotton = tỷ giá × qty × cottonPriceUsd × cottonRate × cottonRatio
const cottonCostVnd =
  exchangeRate * qty * cottonPriceUsd * cottonRate * cottonRatio;

// CP PE = tỷ giá × qty × pePriceUsd × peRate(GỐC) × peRatio
const peRatio = 1 - cottonRatio;
const peCostVnd =
  peRatio > 0 ? exchangeRate * qty * pePriceUsd * peRate * peRatio : 0;

// CalcInput.params mới:
// cottonPriceUsd: number  (thay avgCottonPrice)
// pePriceUsd?: number     (thay peBenmaPrice)
// REMOVED: wastePrice (đã dùng exchangeRate × 0.95 đúng công thức)
```

### Key principles

1. **Snapshot giá bất biến:** Khi tạo `PlanLineItem`, lưu `cottonPriceUsd`, `pePriceUsd`, `cottonRatio` vào đó. `recalculate` chỉ tính lại số tiền, KHÔNG tra cứu lại giá mới — giữ nguyên snapshot.
2. **Fallback cho actuals sync:** Nếu không có kế hoạch tương ứng, lấy giá NVL đầu tiên từ `MaterialPrice` tháng đó theo category.
3. **cottonRatio trong RawMaterialRate:** Nhập 1 lần khi tạo định mức. Ví dụ: sợi CVCM = 0.6 (60% cotton, 40% PE).
4. **peRate là giá trị GỐC:** Nhập kg NL/kg TP không tính tỷ lệ. Code tự nhân peRatio khi tính chi phí.
5. **MonthlyInputParam đơn giản hóa:** Chỉ còn `exchangeRate` và `note`. Các trường giá cũ (`avgCottonPrice`, `peBenmaPrice`, `wastePrice`...) giữ lại trong DB (nullable) nhưng không còn dùng trong tính toán mới.

### Files created/modified

```
prisma/schema.prisma                                          ← Thêm MaterialType, MaterialPrice; cottonRatio vào RawMaterialRate; snapshot fields vào PlanLineItem/ActualLineItem
prisma/migrations/20260421_add_material_type_and_price_system/ ← Migration tự động
scripts/seed-material-types.ts                               ← Seed 10 loại NVL mẫu
src/lib/kdsx/calculator.ts                                   ← CalcInput interface và calculateLineItem() dùng cottonPriceUsd/pePriceUsd/cottonRatio
src/app/api/kdsx/material-types/route.ts                     ← GET list, POST tạo mới (ADMIN only)
src/app/api/kdsx/material-types/[id]/route.ts                ← PUT sửa, DELETE (chỉ khi chưa có giá)
src/app/api/kdsx/material-prices/route.ts                    ← GET list (filter yearMonth/category), POST upsert giá
src/app/api/kdsx/material-prices/by-month/route.ts           ← GET tất cả loại NVL + giá tháng, grouped by COTTON/PE
src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts      ← POST: nhận cottonMaterialTypeId/cottonPriceUsd/peMaterialTypeId/pePriceUsd
src/app/api/kdsx/monthly-plans/[id]/line-items/[lineItemId]/route.ts ← PUT: cập nhật snapshot NVL nếu body gửi lên
src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts     ← POST: dùng snapshot cottonPriceUsd/pePriceUsd trong lineItem
src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts          ← Tra cứu PlanLineItem cùng tháng để lấy snapshot giá; fallback lấy giá đầu từ MaterialPrice
src/app/api/kdsx/raw-material-rates/route.ts                 ← POST: nhận cottonRatio
src/app/api/kdsx/raw-material-rates/[id]/route.ts            ← PUT: nhận cottonRatio
src/app/kdsx/material-types/page.tsx                         ← Trang CRUD danh mục NVL
src/app/kdsx/material-prices/page.tsx                        ← Trang nhập/xem giá NVL theo tháng
src/app/kdsx/raw-material-rates/page.tsx                     ← Thêm cột/field cottonRatio (hiển thị "60% cotton/40% PE")
src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx          ← Modal thông số tháng đơn giản hóa; modal dòng sợi thêm dropdown chọn loại bông/PE
src/components/AdminLayout.tsx                               ← Thêm 2 menu mới: Danh mục NVL + Giá NVL theo tháng
prisma/fix-data.js                                           ← Thêm page registry entries cho material-types và material-prices
```

### API endpoints mới

| Method | Path                                          | Description                                       |
| ------ | --------------------------------------------- | ------------------------------------------------- |
| GET    | /api/kdsx/material-types                      | Danh sách loại NVL (filter: category, isActive)   |
| POST   | /api/kdsx/material-types                      | Tạo mới (ADMIN only)                              |
| PUT    | /api/kdsx/material-types/[id]                 | Sửa name/note/isActive                            |
| DELETE | /api/kdsx/material-types/[id]                 | Xóa (chỉ khi chưa có giá)                         |
| GET    | /api/kdsx/material-prices                     | Giá NVL (filter: yearMonth, category)             |
| POST   | /api/kdsx/material-prices                     | Upsert giá theo unique(materialTypeId, yearMonth) |
| GET    | /api/kdsx/material-prices/by-month?yearMonth= | Tất cả loại NVL + giá tháng, grouped COTTON/PE    |

### Seed data (10 loại NVL mẫu)

| Code        | Tên                 | Category |
| ----------- | ------------------- | -------- |
| AUS         | Bông Úc (Australia) | COTTON   |
| US_PVC      | Bông Mỹ PVC         | COTTON   |
| BRA         | Bông Brazil         | COTTON   |
| WEST_AFRICA | Bông Tây Phi        | COTTON   |
| PIMA        | Bông Pima           | COTTON   |
| SUPIMA      | Bông Supima         | COTTON   |
| CMIA        | Bông CMIA           | COTTON   |
| PE_BENMA    | PE Benma (Indo)     | PE       |
| PE_THAI     | PE Thái Lan         | PE       |
| VISCOSE     | Xơ Viscose          | PE       |

---

_Cập nhật lần cuối: 2026-04-21 — Thêm Material Price Management System_

---

## ACTUAL PRODUCTION GRID � Benchmark Map t? EMPIRICAL

**Status:** ? Completed 2026-04-25

### What was built
API /actual tr? th�m enchmarkMap � b?ng �?nh m?c EMPIRICAL kgPerDay cho t?ng combo (machineId, itemId) c� trong grid th?c t?. Component ActualProductionGrid �u ti�n d�ng enchmarkMap �? so m�u TH vs KH, fallback sang segment KH n?u kh�ng c� benchmark.

### Files created/modified
```
src/app/api/kdsx/production-schedule/[id]/actual/route.ts  � Th�m query BenchmarkVersion active + ProductivityBenchmark EMPIRICAL; tr? benchmarkMap trong JSON
src/components/kdsx/ActualProductionGrid.tsx               � Th�m state benchmarkMap; �?c t? API; d�ng benchmarkKg || segKg l�m planKg
```

### Key business logic implemented
- enchmarkMap["machineId-itemId"] = empiricalOutputPerDay t? ProductivityBenchmark (benchmarkType=EMPIRICAL, versionId=activeVersion c?a factory)
- �u ti�n benchmark EMPIRICAL, fallback v? kgPerDay c?a segment KH n?u kh�ng c� benchmark
- compareColor(actual, plan): xanh ? KH, v�ng ? 90% KH, �? < 90% KH, x�m n?u plan=0

### API endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/kdsx/production-schedule/[id]/actual | Tr? grid + benchmarkMap (EMPIRICAL) + machines + items |

### Known limitations
- Benchmark ch? l?y version isActive=true �?u ti�n (effectiveFrom desc)
- N?u m�y kh�ng c� model s? b? qua, kh�ng t?m benchmark

---

---

## SCHEDULE COMPARISON DASHBOARD � Fix c?u tr�c ActualGrid

**Status:** ? Completed 2026-04-25

### What was built
S?a bug dashboard d�ng c?u tr�c grid c? { itemId, kg } kh�ng t��ng th�ch v?i API �? tr? v? c?u tr�c m?i { [itemId]: kg }.

### Files created/modified
```
src/components/kdsx/ScheduleComparisonDashboard.tsx  � S?a interface ActualGrid + 2 v?ng l?p t�nh t?ng TH
```

### Key business logic implemented
- Interface ActualGrid s?a [day: number]: { itemId: number; kg: number } ? [day: number]: { [itemId: number]: number }
- V?ng l?p 	hByItem: d�ng Object.entries(dayData) �? iterate theo itemId
- V?ng l?p 	hCumul (line chart): d�ng Object.values(dayData) �? c?ng t?ng kg ng�y, ki?m tra holiday tr�?c

### Known limitations
- Kh�ng c� thay �?i schema hay API

---

---

## HE THONG PHAN QUYEN � Fix stale JWT va logic fallback sai

**Status:** Completed 2026-04-28

### What was built
Fix bug khien user co role PROCESS_LEAD duoc phan quyen trang /machines qua trang admin permissions nhung van bi chac ra "Khong co quyen truy cap". Root cause la 2 loi: (1) JWT pagePermissions chi duoc load 1 lan luc login, sau khi admin cap quyen user phai logout/login lai; (2) logic fallback trong machines/page.tsx hardcode ["ADMIN","FACTORY_MANAGER"] bo qua PROCESS_LEAD.

### Files created/modified
src/auth.ts                              � JWT callback gio refresh pagePermissions tu DB moi lan token duoc tai su dung, khong phai chi luc login
src/auth.config.ts                       � Xoa jwt/session callbacks trung lap, chi giu authorized() cho Edge middleware
src/app/machines/page.tsx                � Thay hardcode role list bang getRoleDefaultPerm() tu permissions.ts, dam bao nhat quan voi ma tran quyen toan he thong

### Key business logic implemented
- JWT callback trong auth.ts gio co 2 nhanh: neu co user (lan dang nhap dau) -> bake data; neu token.id (tai su dung) -> fetch pagePermissions moi tu DB
- machines/page.tsx dung getRoleDefaultPerm(role, "SAN XUAT") lam fallback khi chua co PagePermission record trong DB
- auth.config.ts chi giu authorized() vi chay trong Edge runtime (khong co Prisma), jwt/session callbacks phai dat trong auth.ts
- PROCESS_LEAD co viewGroups = ["SAN XUAT", ...] nen mac dinh duoc phep xem trang /machines

### API endpoints
Khong thay doi API

### Known limitations
- JWT refresh pagePermissions moi lan session duoc doc (moi request co useSession) co the gay N+1 query neu nhieu user online. Co the optimize bang cache Redis sau.

---

## KDSX � Chuy?n ngu?n d? li?u th?c t? sang ProductionLog

**Status:** ? Completed 2026-05-01

### What was built
Thay th? ngu?n d? li?u th?c t? trong API actual grid t? KdDailyInput sang ProductionLog. Query m?i d�ng groupBy tr�n (machineId, itemId, recordDate) v� SUM(finalOutput) �? t?ng h?p 3 ca trong ng�y th�nh m?t gi� tr? duy nh?t. Ph?n c?n l?i c?a file (build grid, machines, items, benchmarkMap) gi? nguy�n v? data v?n c�ng format { machineId, itemId, recordDate, outputKg }.

### Files created/modified
```
src/app/api/kdsx/production-schedule/[id]/actual/route.ts  � Thay KdDailyInput.findMany() b?ng ProductionLog.groupBy() + SUM(finalOutput), source �?i th�nh "PRODUCTION_LOG"
```

### Key business logic implemented
- ProductionLog.groupBy(["machineId", "itemId", "recordDate"]) g?p 3 ca (shift) trong c�ng 1 ng�y th�nh t?ng inalOutput
- outputKg = l._sum.finalOutput ?? 0 � gi� tr? null ��?c x? l? v? 0
- source = "PRODUCTION_LOG" � frontend c� th? ph�n bi?t ngu?n d? li?u

### API endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/kdsx/production-schedule/[id]/actual | Tr? v? grid th?c t? l?y t? ProductionLog thay v? KdDailyInput |

### Known limitations
- Kh�ng l?c theo machineId t? segments � l?y t?t c? m�y c� record trong th�ng
- Ch�a c� filter theo factoryId trong ProductionLog query

---

## ADMIN � Page Registry Management UI

**Status:** ? Completed 2026-05-03

### What was built
Giao di?n qu?n l? danh s�ch trang (Page Registry) cho Admin, cho ph�p th�m/s?a/xo� c�c trang v�o h? th?ng ph�n quy?n tr?c ti?p t? UI m� kh�ng c?n ch?y script seed. API ��?c m? r?ng v?i �?y �? CRUD.

### Files created/modified
```
src/app/api/page-registry/route.ts    � M? r?ng th�m POST (create/upsert), PUT (update by id), DELETE (delete by id)
src/app/admin/page-registry/page.tsx  � Giao di?n CRUD danh s�ch trang v?i b?ng, form modal, filter theo nh�m
```

### Key business logic implemented
- POST d�ng upsert theo pageKey � tr�nh tr�ng l?p
- pageKey ��?c validate ch? ch?a [a-z0-9._-], t? �?ng sinh t? path khi t?o m?i
- DELETE c?nh b�o s? xo� to�n b? PagePermission li�n quan (cascade do Prisma schema)
- Ch? ADMIN m?i c� th? truy c?p t?t c? endpoints v� trang n�y

### API endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/page-registry | L?y danh s�ch t?t c? trang |
| POST | /api/page-registry | T?o/upsert trang theo pageKey |
| PUT | /api/page-registry | C?p nh?t trang theo id |
| DELETE | /api/page-registry?id=xxx | Xo� trang theo id |

### Known limitations
- Ch�a c� x�c nh?n n?u xo� trang v?n c?n user ��?c c?p quy?n truy c?p
- Ch�a h? tr? th�m pageGroup m?i �?ng (danh s�ch group hi?n t?i hard-code trong UI)

---

## DANH MUC MAT HANG — Them field yarnType vao Item

**Status:** ✅ Completed 2026-05-05

### What was built
Them field yarnType (String, default "SINGLE") vao model Item de phan biet soi mot thanh phan va soi pha. UI trang Items duoc cap nhat them dropdown chon loai soi. Trang Dinh muc NVL (raw-material-rates) da duoc refactor de dung yarnType thay vi detect tu ten mat hang de quyet dinh an/hien truong PE.

### Files created/modified
`
prisma/schema.prisma                                   — Them yarnType String @default("SINGLE") vao model Item
prisma/migrations/20260505000001_add_yarn_type_to_item/ — Migration SQL ADD COLUMN yarnType
src/app/api/items/route.ts                             — POST nhan them yarnType tu body
src/app/api/items/[id]/route.ts                        — PUT nhan them yarnType tu body
src/app/items/page.tsx                                 — Them Form.Item dropdown "Loai soi" va cot hien thi trong bang
src/app/kdsx/raw-material-rates/page.tsx               — Refactor hasPE(item: ItemInfo) dung yarnType; cap nhat ItemInfo interface
`

### Key business logic implemented
- yarnType = "SINGLE": soi mot thanh phan (chi cotton) — khong co o PE trong dinh muc
- yarnType = "BLENDED": soi pha (cotton + PE) — hien thi va cho nhap o PE trong dinh muc
- Ham hasPE(item: ItemInfo) doi tu detect-from-name sang doc truc tiep item.yarnType === "BLENDED"
- Cac row Item cu trong DB duoc migrate voi gia tri mac dinh "SINGLE" (an toan)

### API endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST   | /api/items | Nhan them truong yarnType khi tao mat hang moi |
| PUT    | /api/items/[id] | Nhan them truong yarnType khi cap nhat mat hang |

### Known limitations
- Cac mat hang CVCM hien tai trong DB se co yarnType = "SINGLE" (gia tri mac dinh) — Admin can vao trang Items de cap nhat sang "BLENDED" cho tung mat hang soi pha
- Ham detectYarnGroup() va isDoubleTwist() khong bi anh huong va giu nguyen


---

## KDSX — Fix overlap logic: cho phép 1 máy chạy 2 mặt hàng trong cùng ngày

**Status:** ✅ Completed 2026-05-05

### What was built

Nới lỏng logic kiểm tra overlap segment trong kế hoạch sản xuất. Trước đây hệ thống chặn mọi trường hợp 2 segment cùng machineId có ngày trùng nhau. Nay chỉ chặn khi cùng máy + cùng mặt hàng (itemId) bị trùng ngày — cho phép 1 máy chạy 2 mặt hàng khác nhau trong cùng khoảng ngày.

### Files created/modified
```
src/app/api/kdsx/production-schedule/[id]/segments/route.ts          — thêm itemId vào hàm checkOverlap + lời gọi POST
src/app/api/kdsx/production-schedule/[id]/segments/[segmentId]/route.ts — thêm itemId vào hàm checkOverlap + lời gọi PUT
```

### Key business logic implemented

- checkOverlap() cũ: filter theo scheduleId + machineId → chặn tất cả overlap cùng máy
- checkOverlap() mới: filter theo scheduleId + machineId + itemId → chỉ chặn overlap cùng máy + cùng mặt hàng
- Thực tế sản xuất: 1 máy có thể đổi mặt hàng trong ngày (VD: ngày 5 chạy cả MH A và MH B)
- Message lỗi cũng được cập nhật cho rõ hơn: "Máy này đã có kế hoạch cho mặt hàng này trong khoảng ngày đã chọn"

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST   | /api/kdsx/production-schedule/[id]/segments | Tạo segment mới, chỉ chặn nếu cùng máy + cùng mặt hàng trùng ngày |
| PUT    | /api/kdsx/production-schedule/[id]/segments/[segmentId] | Sửa segment, check overlap tương tự |

### Known limitations

- Không validate trường hợp 1 máy chạy quá nhiều mặt hàng cùng lúc (không giới hạn số lượng mặt hàng trên 1 máy trong 1 ngày)
- Frontend không cần thay đổi


---

## USER MANAGEMENT � Multi-Factory Assignment for STATISTICIAN

**Status:** ? Completed 2026-05-06

### What was built
Th�m t�nh n�ng g�n nhi?u nh� m�y cho User (�?c bi?t l� role STATISTICIAN). Tr�?c ��y m?i user ch? c� th? g�n 1 nh� m�y qua actoryId. B�y gi? c� b?ng pivot user_factories �? l�u quan h? nhi?u-nhi?u User <-> Factory.

### Files created/modified
`
prisma/schema.prisma                            � Th�m model UserFactory + relation v�o User v� Factory
prisma/migrations/20260506000001_.../           � Migration t?o b?ng user_factories
src/app/api/users/route.ts                      � Thay factoryId b?ng factoryIds[], sync b?ng UserFactory
src/app/users/page.tsx                          � Select multi-factory (mode="multiple"), hi?n th? nhi?u NM trong b?ng
src/auth.ts                                     � Load factoryIds t? userFactories v�o JWT token v� session
src/lib/permissions.ts                          � Th�m factoryIds v�o PermUser, c?p nh?t canEditFactory cho STATISTICIAN
`

### Key business logic implemented
- UserFactory l� b?ng pivot nhi?u-nhi?u gi?a User v� Factory, t��ng t? UserProcess
- actoryId (single) tr�n b?ng users v?n ��?c gi? nguy�n (backward compat), lu�n = actoryIds[0]
- canEditFactory() cho STATISTICIAN: check actoryIds.includes(targetId) tr�?c, fallback actoryId
- Khi save user, x�a to�n b? userFactory c? r?i insert l?i (delete-and-recreate pattern gi?ng processIds)
- actoryIds ��?c bake v�o JWT token v� session, d�ng ��?c ? c? server-side API v� client-side

### API endpoints
| Method | Path        | Description |
|--------|-------------|-------------|
| GET    | /api/users  | Tr? v? userFactories k�m factory info |
| POST   | /api/users  | Nh?n actoryIds[], t?o UserFactory records |
| PUT    | /api/users  | Nh?n actoryIds[], x�a c? v� t?o l?i UserFactory records |

### Known limitations
- Token JWT kh�ng t? refresh khi admin thay �?i factoryIds c?a user �ang ��ng nh?p (c?n logout/login l?i �? c?p nh?t factoryIds trong session)
- actoryId (single) tr�n b?ng users v?n ��?c gi? �? tr�nh breaking change v?i c�c API kh�c �ang d�ng tr?c ti?p

---

## K? HO?CH S?N XU?T � Benchmark Fill cho � ch�a nh?p SL

**Status:** ? Completed 2026-05-06

### What was built
Khi � ng�y trong l�?i th?c t? ch�a c� SL nh?p v�o, h? th?ng t? �i?n gi� tr? �?nh m?c t? benchmarkMap v?i n?n x�m nh?t v� ch? nghi�ng x�m. Gi� tr? n�y ��?c t�nh v�o t?ng d?ng v� t?ng ng�y. Kh�ng thay �?i DB hay API.

### Files created/modified
```
src/components/kdsx/ActualProductionGrid.tsx          � S?a render � ng�y (benchmark fill), rowTotal, totalActualByDay
src/components/kdsx/ScheduleComparisonDashboard.tsx   � Th�m prop benchmarkMap, s?a t�nh thByItem
src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx � Truy?n actualBenchmarkMap v�o ScheduleComparisonDashboard
```

### Key business logic implemented
- � ch�a nh?p SL th?c t? ? hi?n gi� tr? �?nh m?c (ch? x�m nghi�ng, n?n #f0f0f0), t�nh v�o t?ng
- � �? nh?p SL th?c t? ? hi?n SL th?c t? + so s�nh m�u (xanh/v�ng/�? so benchmark), k�m s? �?nh m?c nh? b�n d�?i
- rowTotal = ? (th?c t? n?u c�, ng�?c l?i benchmark) cho t?ng ng�y kh�ng ph?i ngh?
- totalActualByDay = t��ng t? nh�ng iterate qua gridRows thay v? allMachineIds
- ScheduleComparisonDashboard.thByItem = t?ng th?c t? + benchmark cho ng�y tr?ng, c?ng qua rowCombos t? grid + segments

### Known limitations
- T?ng v� bi?u �? so s�nh trong ScheduleComparisonDashboard ph?n �nh c? benchmark fill, c� th? g�y nh?m l?n n?u benchmark kh�ng ch�nh x�c

---

## SẢN XUẤT — Máy ống chạy nhiều mặt hàng song song (Multi-item per shift)

**Status:** ✅ Completed 2026-05-06

### What was built

Thêm khả năng cấu hình máy chạy nhiều mặt hàng trong cùng 1 ca (VD: máy ống chia cọc). Bao gồm: field schema, bảng phân công, API CRUD, UI điều phối chi tiết trên trang Máy, và UI nhập sản lượng theo từng mặt hàng trên trang kd-daily-input.

### Files created/modified
```
prisma/schema.prisma                                           — Thêm allowMultiItemPerShift vào Machine; relation ngược vào Item; model MachineItemAssignment mới
prisma/migrations/20260506140000_add_multi_item_assignment/    — Migration SQL tạo bảng machine_item_assignments + cột allowMultiItemPerShift
src/app/api/machines/[id]/assignments/route.ts                 — API mới: GET lấy assignments, PUT replace-all assignments của máy
src/app/api/machines/[id]/route.ts                             — Thêm allowMultiItemPerShift vào PUT update
src/app/api/machines/route.ts                                  — Thêm allowMultiItemPerShift vào POST create
src/app/machines/page.tsx                                      — Thêm Switch "Chạy nhiều MH/ca", nút Điều phối chi tiết, Modal Form.List thêm/xóa assignments theo cọc
src/app/kd-daily-input/page.tsx                                — Khi load, fetch assignments cho máy multi-item → render N rows (1/mặt hàng). Máy thường giữ nguyên UI cũ.
```

### Key business logic implemented
- allowMultiItemPerShift = true → máy có nhiều MachineItemAssignment (mỗi assignment có fromSpindle, toSpindle)
- kd-daily-input: máy multi-item render N rows riêng biệt, không cho đổi mặt hàng tại giao diện (cố định theo assignment)
- PUT /api/machines/{id}/assignments dùng replace-all: deleteMany rồi createMany — tránh duplicate
- Dữ liệu lưu ProductionLog vẫn là 1 record per (machineId, itemId, date, shift) — unique constraint không thay đổi
- Máy multi-item không có nút "Đổi hàng giữa ca" (vì đã có nhiều ô sẵn từ assignments)
- Tag "Multi" hiển thị ở cột Máy trên kd-daily-input để phân biệt

### API endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/machines/{id}/assignments | Lấy danh sách assignments (isActive=true, order by sortOrder) |
| PUT    | /api/machines/{id}/assignments | Replace toàn bộ assignments của máy |

### Known limitations
- Chưa có validation: fromSpindle phải < toSpindle
- Chưa kiểm tra overlap cọc giữa các assignments trong cùng máy
- Trang daily-input/grid (sx.daily-input-grid) chưa hỗ trợ multi-item
- Nút "Nhập 0 cho máy dừng" áp dụng cho cả row multi-item (mỗi mặt hàng riêng)

---

## KDSX — Production Schedule: Fix logic điền benchmark (Benchmark Fill Scope Fix)

**Status:** ✅ Completed 2026-05-07

### What was built

Sửa lỗi logic điền định mức (benchmark fill) trên tab Thực hiện và So sánh KH/TH của màn hình Production Schedule. Trước đó, ô ngày hiển thị `benchmarkKg` cho tất cả các dòng của máy kể cả mặt hàng đã ngưng chạy — gây ra số liệu ảo. Sau fix, chỉ dòng cuối cùng (mặt hàng đang chạy hiện tại, `lastDay` lớn nhất) của mỗi máy mới được điền benchmark vào các ngày tương lai.

### Files created/modified

```
src/components/kdsx/ActualProductionGrid.tsx                          — thêm Map lastRowPerMachine, sửa isBenchmarkFill / rowTotal / totalActualByDay
src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx — thêm lastComboPerMachine, sửa actualSummaryByItem
src/components/kdsx/ScheduleComparisonDashboard.tsx                   — thêm lastComboPerMachine, sửa thByItem và thCumul (lineData)
```

### Key business logic implemented

- **lastRowPerMachine / lastComboPerMachine**: Map `machineId → rowKey (hoặc combo)` lưu dòng có `lastDay` lớn nhất cho từng máy. Tính một lần trước vòng lặp render.
- **isBenchmarkFill** (ActualProductionGrid): chỉ `true` khi `!hasActualData && benchmarkKg > 0 && !daysWithActualData.has(day) && day > row.lastDay && isLastRowOfMachine`.
- **Điều kiện benchmark fill chung**: `bmKg > 0 && !daysWithActualData.has(day) && lastDay > 0 && day > lastDay && isLastCombo` — loại bỏ điều kiện `day >= firstDay` (không cần thiết khi đã check `isLastCombo`).
- Các dòng mặt hàng đã ngưng (không phải dòng cuối của máy) → để trống sau `lastDay`, không điền benchmark.

### API endpoints

Không có endpoint mới — chỉ sửa logic tính toán frontend.

### Known limitations / not yet implemented

- Nếu 2 mặt hàng trên cùng máy có cùng `lastDay` lớn nhất, chỉ 1 trong 2 được chọn làm "last row" (theo thứ tự duyệt Set/Map). Trường hợp này hiếm gặp trong thực tế.

### Data notes

- Không thay đổi schema hay dữ liệu.

---

## MOBILE INPUT — Inline Multi-Item & Quick Item Change

**Status:** ✅ Completed 2026-05-07

### What was built

Added full inline management of machine-item assignments directly on the mobile production input form. Multi-item machines can now add, swap, or remove items without leaving the page. Regular (single-item) machines get a new "Đổi mặt hàng" quick-change button in addition to the existing "Đổi hàng giữa ca" button.

### Files created/modified

```
src/app/production/mobile-input/page.tsx  — added addItemModal, quickChangeItemModal, handleRemoveAssignment, edit/delete buttons per multi-item assignment, + Thêm mặt hàng button, Đổi mặt hàng button for regular machines
```

### Key business logic implemented

- Multi-item form: each item card now shows a SwapOutlined button (change) and a CloseOutlined button (delete), plus a dashed "Thêm mặt hàng" button after the list.
- editAssignmentItem state: null means "add new", non-null means "swap existing item" — shared by one modal.
- handleRemoveAssignment: filters local assignments, clears corresponding multiInputStates entry, then persists via PUT /api/machines/:id/assignments.
- Quick change (regular machines): calls /api/machines/batch POST to reassign machine to new item, updates local machines state. Only shown when currentItem exists and allowMultiItemPerShift is false.
- "Đổi hàng giữa ca" (mid-shift change) is kept and shown side-by-side with the new "Đổi mặt hàng" button.

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| PUT | /api/machines/:id/assignments | Save updated assignment list |
| POST | /api/machines/batch | Reassign machine to a new item (quick change) |

### Known limitations

- Adding a new item to multi-item machine does not pre-fill fromSpindle/toSpindle — user must configure those in the Machines management page.
- No confirmation dialog before removing an assignment.

### Data notes

- No schema changes. Uses existing MachineItemAssignment model.

---

## LOT MANAGEMENT — Module Quản lý Lô hàng

**Status:** ✅ Completed 2026-05-09

### What was built

Module quản lý vòng đời lô hàng gồm 3 loại: lô bông (RAW_COTTON), lô xơ (RAW_FIBER), và lô sợi (YARN). Lô sợi được gắn với máy đang chạy, và khi công nhân nhập sản lượng, hệ thống tự động lấy lotId từ Machine.currentLotId mà không cần chọn thủ công. Trang CRUD đầy đủ với filter loại/trạng thái/nhà máy và chức năng link nguyên liệu giữa các lô.

### Files created/modified

`
src/app/api/lots/route.ts                          — GET (list + filter) + POST (create lot + link raw materials)
src/app/api/lots/[id]/route.ts                     — GET detail + PUT update (replace raw material links) + DELETE (guard: no production logs)
src/app/api/lots/[id]/traceability/route.ts        — GET traceability: NL links + production summary for a YARN lot
src/app/lots/page.tsx                              — CRUD UI: filter bar + table + modal tạo/sửa lô + quick close button
src/app/machines/page.tsx                          — Thêm cột "Lô đang SX", Select chọn lô trong modal sửa máy
src/app/api/machines/route.ts                      — GET include currentLot relation
src/app/api/machines/[id]/route.ts                 — PUT accept currentLotId field
src/app/api/production/daily-input/route.ts        — Auto-set lotId from Machine.currentLotId on ProductionLog upsert
src/components/AdminLayout.tsx                     — Add catalog.lots to ALL_PAGES + SIDEBAR_GROUPS group-catalog
prisma/schema.prisma                               — Add LotType enum, LotStatus enum, Lot model, LotMaterialLink model; add currentLotId to Machine, lotId to ProductionLog, lots[] to Factory/Item/SalesOrderItem
prisma/seed-lots-page.js                           — Seed pageRegistry for catalog.lots (id=50)
`

### Key business logic implemented

- **Lô sợi tự động lấy lotId từ máy**: ProductionLog.upsert tự fetch Machine.currentLotId → lotId = null nếu máy chưa gán lô, không cần UI thêm
- **YARN bắt buộc chọn itemId**: Validate ở POST /api/lots trả 400 nếu lotType=YARN và không có itemId
- **Xóa lô chỉ khi chưa có sản lượng**: DELETE /api/lots/[id] kiểm tra count(ProductionLog WHERE lotId) trước khi cho phép xóa
- **Replace raw material links**: PUT dùng deleteMany + createMany (replace all) thay vì merge để đơn giản hóa
- **Warning 1 lô xơ**: UI cảnh báo nếu chọn > 1 lô xơ nhưng không enforce ở backend (nghiệp vụ ghi chú: thường chỉ 1)
- **Đóng lô**: nút "Đóng lô" PUT status=CLOSED → set closedAt=now()

### API endpoints

| Method | Path                             | Description                                        |
|--------|----------------------------------|----------------------------------------------------|
| GET    | /api/lots                        | List lots, filter: lotType, status, factoryId, search |
| POST   | /api/lots                        | Create lot, auto-link rawLotIds if YARN            |
| GET    | /api/lots/[id]                   | Lot detail with rawMaterials + productionLogs      |
| PUT    | /api/lots/[id]                   | Update lot, replace raw material links             |
| DELETE | /api/lots/[id]                   | Delete (ADMIN/FACTORY_MANAGER only, no prod logs)  |
| GET    | /api/lots/[id]/traceability      | Traceability: rawMaterials + productionSummary     |

### Known limitations / not yet implemented

- Không có trang traceability riêng (UI) — chỉ có API
- SalesOrderItem dropdown trong modal chưa load từ API (cần fetch /api/kdsx/sales-orders/items hoặc tương tự)
- Không tự động cập nhật Machine.currentLotId khi lô CLOSED (cần làm thủ công)
- Chưa tích hợp lotId vào mobile-report hay trang history để lọc theo lô

### Data notes

- pageRegistry seeded: pageKey='catalog.lots', id=50, sortOrder=35
- LotStatus default = OPEN
- closedAt tự set khi PUT status=CLOSED
- Lot model dùng @@map("lots"), LotMaterialLink dùng @@map("lot_material_links")

---

## ITEMS — Mở quyền Sửa/Xóa mặt hàng cho SALES & PROCESS_LEADER

**Status:** ✅ Completed 2026-05-09

### What was built

Mở rộng quyền PUT/DELETE trên Item cho SALES và PROCESS_LEADER (trước đó chỉ ADMIN). Trước đó POST đã được mở cho 3 role này, nhưng PUT/DELETE vẫn chặn → trưởng công đoạn không sửa/xóa được mặt hàng. UI cũng ẩn nút thao tác do `canEdit` không bao gồm các role mới.

### Files created/modified

```
src/app/api/items/[id]/route.ts    — PUT & DELETE: cho phép ADMIN | SALES | PROCESS_LEADER
src/app/items/page.tsx             — canEdit: thêm SALES, PROCESS_LEADER vào điều kiện hiển thị nút
```

### Key business logic implemented

- 3 endpoint Item (POST, PUT, DELETE) hiện đồng nhất whitelist role: ADMIN, SALES, PROCESS_LEADER
- UI dùng `session.user.role` (không phải `userRole`) để check ở client side — đã có sẵn nhờ auth.ts:110

### API endpoints

| Method | Path             | Description                                       |
| ------ | ---------------- | ------------------------------------------------- |
| PUT    | /api/items/[id]  | Sửa item — ADMIN/SALES/PROCESS_LEADER             |
| DELETE | /api/items/[id]  | Xóa item — ADMIN/SALES/PROCESS_LEADER (có blocker)|

### Known limitations / not yet implemented

- /api/items/import (bulk import) chưa được rà soát role trong scope này

---

## KDSX — "Tự tính SL" frontend tính từ sản lượng giả định (TH + định mức)

**Status:** ✅ Completed 2026-05-11

### What was built

Trên trang chi tiết kế hoạch tháng (KDSX), khi user tick checkbox "Tự tính SL" trong modal thêm/sửa dòng sợi, frontend sẽ tự tính `qty` ngay tại client = (tổng sản lượng giả định của mặt hàng đó từ ProductionSchedule) − (SL các dòng HĐ khác cùng mặt hàng đã có trong plan). Ô qty chuyển sang readonly (vẫn hiển thị giá trị) thay vì disable hoàn toàn. Backend không thay đổi — chỉ nhận `qty` đã tính sẵn.

### Files created/modified

```
src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx — thêm state projectedQtyByItem, fetch schedule/actual grid trong useEffect, tính projected qty per item theo logic ActualProductionGrid (actual + benchmark cho lastRow), sửa onChange checkbox isAutoQty để tính qty client-side, đổi InputNumber qty từ disabled sang readOnly
```

### Key business logic implemented

- Sản lượng giả định per item = Σ(actual qty mỗi ngày) + Σ(benchmark kg cho ngày chưa có data, day > combo.lastDay, chỉ áp cho lastRow của machine)
- Khi tick "Tự tính SL": `qty = max(0, round(totalProjected − Σ qty các lineItem khác cùng itemId trong plan, loại trừ chính dòng đang sửa))`
- Nếu chưa có dữ liệu giả định cho mặt hàng → set qty=0 và hiện warning
- qty input dùng `readOnly` (không `disabled`) để vẫn hiện giá trị đã tự tính cho user thấy
- Backend không cần đổi: `qty` từ form gửi thẳng, `isAutoQty` chỉ là flag

### API endpoints

Không thêm/sửa endpoint nào. Frontend gọi sẵn:
- GET /api/kdsx/production-schedule?factoryId=&yearMonth=
- GET /api/kdsx/production-schedule/[id]/actual

### Known limitations / not yet implemented

- Logic chỉ chạy cho schedule đầu tiên (`schedules[0]`) của tháng — nếu factory có nhiều schedule trong cùng tháng, chỉ dùng cái đầu

---

## KDSX — Bỏ logic tính autoQty từ ScheduleSegment ở backend, frontend là source of truth

**Status:** ✅ Completed 2026-05-11

### What was built

Backend (POST + PUT line-items) trước đây tính `qty` từ `ProductionSchedule.segments` (KH-SL) khi `isAutoQty=true`, nhưng nguồn dữ liệu này SAI — phải lấy từ sản lượng giả định (actual + benchmark) chứ không phải KH-SL. Đã xóa toàn bộ block tính lại ở backend; backend chỉ validate `qty` phải có khi `isAutoQty=true`. Frontend đã tính `qty` sẵn từ `projectedQtyByItem` và gửi xuống. Bổ sung guard "Chọn loại sợi trước" cho checkbox và onChange cho Select itemId để tự tính lại khi đổi mặt hàng trong lúc isAutoQty=true.

### Files created/modified

```
src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts             — POST: xóa block tính autoQty từ ScheduleSegment, chỉ validate qty
src/app/api/kdsx/monthly-plans/[id]/line-items/[lineItemId]/route.ts — PUT: xóa block tính autoQty từ ScheduleSegment, chỉ validate qty
src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx                  — checkbox isAutoQty thêm guard "Chọn loại sợi trước", reset qty khi bỏ tick; Select itemId thêm onChange tự tính lại qty khi isAutoQty=true
```

### Key business logic implemented

- Backend KHÔNG tính `qty` cho `isAutoQty` nữa — chỉ trả 400 nếu thiếu `qty`: `"isAutoQty=true nhưng thiếu qty. Frontend cần tính và gửi qty."`
- Frontend là source of truth cho `qty` khi `isAutoQty=true` (tính từ actual grid + benchmarkMap của ProductionSchedule)
- Checkbox isAutoQty: nếu chưa chọn `itemId` → warning "Chọn loại sợi trước" và tự bỏ tick; nếu mặt hàng chưa có data giả định → vẫn tick được nhưng qty=0 và hiện warning
- Bỏ tick checkbox → qty reset về undefined (user nhập tay)
- Đổi `itemId` khi `isAutoQty=true` → tự tính lại qty cho mặt hàng mới

### API endpoints

| Method | Path                                                  | Description                                                |
| ------ | ----------------------------------------------------- | ---------------------------------------------------------- |
| POST   | /api/kdsx/monthly-plans/[id]/line-items               | Backend không tự tính qty từ ScheduleSegment nữa            |
| PUT    | /api/kdsx/monthly-plans/[id]/line-items/[lineItemId]  | Backend không tự tính qty từ ScheduleSegment nữa            |

### Known limitations / not yet implemented

- Nếu frontend không fetch được `projectedQtyByItem` (mạng lỗi, schedule không tồn tại), tick "Tự tính SL" sẽ điền qty=0 + warning thay vì lấy từ KH-SL như trước

---

## PRODUCTION — Sửa/Xóa bản ghi production_logs cho ADMIN trên trang Lịch sử

**Status:** ✅ Completed 2026-05-11

### What was built

Trang `/production/history` bổ sung chức năng sửa và xóa từng bản ghi `production_logs` (tên mặt hàng, chỉ số đầu/cuối, sản lượng, hiệu suất, ghi chú) **chỉ dành cho ADMIN**. Backend hard-delete, kiểm tra unique constraint khi đổi mặt hàng. Frontend ẩn cột "Thao tác" với user không phải ADMIN.

### Files created/modified

```
src/app/api/production/history/[id]/route.ts — MỚI: PATCH (sửa) + DELETE (xóa) — chỉ ADMIN
src/app/production/history/page.tsx          — thêm cột "Thao tác" (ADMIN), Modal sửa, Popconfirm xóa
```

### Key business logic implemented

- Cả PATCH và DELETE check `userRole === "ADMIN"` → 403 nếu không phải ADMIN
- PATCH chỉ update các field có trong body (partial update): `itemId`, `startIndex`, `endIndex`, `finalOutput`, `efficiency`, `note`
- Khi đổi `itemId`, kiểm tra unique constraint `(machineId, recordDate, shift, itemId)` — nếu trùng với bản ghi khác → trả 409 "Đã có bản ghi khác cho máy/ngày/ca/mặt hàng này"
- Backend KHÔNG tự tính lại `finalOutput` từ `endIndex - startIndex` — vì admin chủ yếu sửa máy `formulaType=1` (nhập trực tiếp, `endIndex = finalOutput`, không theo công thức trừ)
- DELETE là hard delete (không soft delete)
- Frontend: `isAdmin = (session?.user as any)?.userRole === "ADMIN"` — cột "Thao tác" và Modal sửa chỉ render khi `isAdmin === true` (double-layer với backend)

### API endpoints

| Method | Path                          | Description                                     |
| ------ | ----------------------------- | ----------------------------------------------- |
| PATCH  | /api/production/history/[id]  | ADMIN sửa 1 bản ghi production_logs             |
| DELETE | /api/production/history/[id]  | ADMIN hard-delete 1 bản ghi                     |

### Known limitations / not yet implemented

- Không log audit trail khi ADMIN sửa/xóa — chưa lưu vết ai sửa, lúc nào, sửa gì
- Không kiểm tra dữ liệu liên quan trước khi xóa (vd: nếu bản ghi đã được dùng trong allocation/báo cáo) — admin tự chịu trách nhiệm
- Hardcode role ADMIN thay vì dùng `canEdit` từ hệ phân quyền — nếu sau này muốn cho role khác có quyền, phải sửa cả backend lẫn frontend

---

## KDSX — Dòng sợi isAutoQty tự cập nhật qty theo sản lượng giả định

**Status:** ✅ Completed 2026-05-11

### What was built

Dòng sợi có `isAutoQty=true` trong kế hoạch tháng (DRAFT) nay tự đồng bộ qty theo sản lượng giả định (actual ProductionLog + benchmark) ở 2 thời điểm: (1) khi mở trang chi tiết kế hoạch, frontend phát hiện chênh lệch >1kg sẽ tự PUT cập nhật từng dòng; (2) khi bấm "Tính lại tất cả", backend recalculate cũng tự tính projectedQtyByItem rồi áp dụng `qty = projected - otherQty` cho các dòng isAutoQty.

### Files created/modified

```
src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx                — thêm useEffect tự PUT cập nhật qty cho dòng isAutoQty (DRAFT, ngưỡng chênh >1kg)
src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts           — tự tính projectedQtyByItem từ ProductionSchedule.segments + ProductionLog + benchmark, áp dụng qty mới cho dòng isAutoQty trước khi calculateLineItem
```

### Key business logic implemented

- Công thức autoQty: `qty = max(0, round(projectedQtyByItem[itemId] - sum(qty các dòng cùng itemId không phải dòng đang xét)))`
- Chỉ tự cập nhật khi plan ở trạng thái DRAFT — SUBMITTED/APPROVED không sửa
- Ngưỡng chênh lệch frontend: >1kg mới gọi PUT (tránh PUT vô ích do làm tròn)
- Backend recalculate dùng cùng thuật toán projected như frontend: actual nếu có, ngược lại bù `empiricalOutputPerDay` cho lastRow của mỗi máy ở những ngày chưa có dữ liệu (`day > combo.lastDay && !daysWithData.has(day) && isLastRow`)

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/kdsx/monthly-plans/[id]/recalculate | Tính lại toàn bộ lineItems; với dòng isAutoQty tự cập nhật qty từ projectedQtyByItem |
| PUT  | /api/kdsx/monthly-plans/[id]/line-items/[lineItemId] | Frontend gọi cho từng dòng isAutoQty cần đồng bộ (qty mới + giữ nguyên itemId/salesOrderItemId/unitPriceUsd/note) |

### Known limitations

- Frontend chỉ chạy useEffect 1 lần khi `projectedQtyByItem` hoặc `plan.id` đổi — nếu user mở modal sửa rồi đóng mà chưa reload trang, dòng isAutoQty mới thêm không trigger lại cho tới khi fetchPlan() chạy
- Recalculate backend không trả về projectedQtyByItem cho debug — chỉ trả `{ updated }`

---

## KDSX — isAutoQty hiển thị live qty, chỉ lưu khi bấm "Tính lại tất cả"

**Status:** ✅ Completed 2026-05-12

### What was built

Thay đổi hành vi dòng `isAutoQty` trên trang chi tiết kế hoạch tháng: UI hiển thị qty mới nhất (tính realtime từ `projectedQtyByItem`) với màu cam + tag "⚡ Đã thay đổi" + tooltip khi khác qty đã lưu. DB không còn tự ghi đè khi `projectedQtyByItem` thay đổi — chỉ cập nhật khi user bấm "Tính lại tất cả".

### Files created/modified

```
src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx       — cột "SL (kg)" render liveQty; xóa useEffect tự PUT line-items
```

### Key business logic implemented

- Cột "SL (kg)" cho dòng `isAutoQty`: tính `liveQty = max(0, round(projected[itemId] - sum(otherLineItems.qty cùng item)))`; nếu `|liveQty - savedQty| > 1` → hiển thị màu cam #fa8c16 + tag "⚡ Đã thay đổi" + tooltip hiện qty đã lưu
- Bỏ hoàn toàn cơ chế auto-PUT khi `projectedQtyByItem` thay đổi (trước đây tự ghi đè DB → vi phạm nguyên tắc "lưu có chủ đích")
- POST `/api/kdsx/monthly-plans/[id]/line-items` đã enforce: `isAutoQty=true` mà thiếu `qty` → 400 (frontend tự tính và gửi qty)
- Endpoint `/recalculate` tính lại qty cho dòng isAutoQty bằng cùng công thức `projected - other` (đồng nhất với frontend)

### API endpoints

Không thay đổi (giữ nguyên `/api/kdsx/monthly-plans/[id]/recalculate` và `/line-items`).

### Known limitations

- Nếu user thêm/sửa dòng khác cùng `itemId` trong cùng kế hoạch, liveQty của dòng isAutoQty sẽ thay đổi ngay nhưng chỉ persist khi bấm "Tính lại tất cả".

---

## Production — Hiển thị cột "Lô" trên các trang nhập/xem sản lượng

**Status:** ✅ Completed 2026-05-12

### What was built

Hoàn tất phần UI còn lại của Lot Management: thêm cột/hiển thị **tên lô** trên các trang nhập SL (mobile cards + grid) và trang lịch sử/báo cáo, để công nhân và quản lý thấy ngay lô đang chạy trên từng máy / từng bản ghi ProductionLog.

### Files created/modified

```
src/app/api/production/history/route.ts          — include lot { id, lotNumber } trong findMany
src/app/api/production/daily-status/route.ts     — include currentLot { id, lotNumber } cho machine
src/app/production/history/page.tsx              — thêm cột "Lô" sau "Mặt hàng" + cột "Lô" trong Excel export
src/app/production/daily-input-grid/page.tsx     — thêm field currentLotNumber vào RowData, cột "Lô" trước "Chỉ số TRƯỚC", cập nhật colSpan summary row (6→7, 7→8)
src/app/production/daily-input/page.tsx          — hiển thị "Lô: <lotNumber>" dưới tên mặt hàng trên thẻ máy (màu cam #fa8c16)
```

### Key business logic implemented

- ProductionLog đã có `lotId` (tự lấy từ `Machine.currentLotId` lúc tạo log) — UI nay phơi giá trị này
- Mobile cards & grid hiển thị `machine.currentLot.lotNumber` (read-only) — không cho sửa lô từ form nhập SL; muốn đổi lô phải vào trang điều phối máy / Lot Management
- Bảng history hiển thị `log.lot.lotNumber` cho từng bản ghi quá khứ (lô lúc log được tạo, snapshot qua `lotId` chứ không phải lô hiện hành của máy)

### API endpoints

Không endpoint mới — chỉ mở rộng include trong 2 endpoint có sẵn.

### Known limitations

- Trang `/production/mobile-report` (báo cáo grouping) chưa thêm hiển thị lô — UI đã đông và group view không có cột; bỏ qua theo gợi ý "có thể không cần cột" trong yêu cầu.
- Excel export trên grid page chưa được cập nhật (trang này không có nút xuất Excel, chỉ có trên `/production/history` — đã cập nhật).

---

## PRODUCTION — Sửa lô (lotId) trong modal sửa bản ghi lịch sử sản xuất

**Status:** ✅ Completed 2026-05-12

### What was built

Cho phép ADMIN sửa trường `lotId` của bản ghi `production_logs` qua modal "Sửa bản ghi" tại trang `/production/history`, tương tự cách đang cho sửa `itemId`. Có thể đổi sang lô khác hoặc bỏ trống.

### Files created/modified

```
src/app/api/production/history/[id]/route.ts  — PATCH nay nhận lotId (null/số), validate Lot tồn tại, include lot trong response
src/app/production/history/page.tsx           — load danh sách /api/lots, thêm Form.Item Select "Lô" trong modal sửa
```

### Key business logic implemented

- `lotId` là optional: gửi `null`/`""` → set `lot` = null; gửi số → validate Lot tồn tại trước khi update.
- Không enforce ràng buộc lô phải cùng item — ADMIN tự chịu trách nhiệm khi gắn lô.
- Không đụng tới unique constraint `(machineId, recordDate, shift, itemId)` (lô không tham gia).

### API endpoints

| Method | Path                              | Description                              |
| ------ | --------------------------------- | ---------------------------------------- |
| PATCH  | /api/production/history/[id]      | Thêm field `lotId` (optional, nullable)  |

### Known limitations

- Select hiện load toàn bộ lots (không filter theo factory/item của bản ghi) — phù hợp khi số lô còn nhỏ; cần phân trang/search nếu danh sách lớn.

---

## LOT MANAGEMENT — Bỏ liên kết mặt hàng trên Lot

**Status:** ✅ Completed 2026-05-13

### What was built

Gỡ bỏ trường `itemId` khỏi UI tạo/sửa lô và bỏ xử lý `itemId` trong API POST/PUT của lot. Lot không còn gắn với mặt hàng cụ thể — mặt hàng được xác định ở Machine.currentItemId và ProductionLog.itemId. Schema giữ nguyên (Lot.itemId vẫn là Int? nullable, không migrate).

### Files created/modified

```
src/app/lots/page.tsx              — bỏ form field "Mặt hàng", bỏ cột "Mặt hàng" trong bảng, bỏ state items
src/app/api/lots/route.ts          — POST không nhận/ghi itemId, bỏ validate "YARN phải có itemId"
src/app/api/lots/[id]/route.ts     — PUT bỏ xử lý itemId
```

### Key business logic implemented

- Lot nguyên liệu (bông/xơ) và lô sợi (YARN) đều không gắn với Item nữa khi tạo qua UI
- Cùng 1 lô bông có thể dùng cho nhiều mặt hàng khác nhau — mặt hàng tracking đã chuyển sang Machine.currentItemId & ProductionLog.itemId
- Schema strictly additive: Lot.itemId giữ nguyên nullable, không xóa cột (tuân nguyên tắc không xóa field)

### API endpoints

| Method | Path           | Description                                       |
| ------ | -------------- | ------------------------------------------------- |
| POST   | /api/lots      | Tạo lô — không còn nhận itemId                    |
| PUT    | /api/lots/[id] | Cập nhật lô — bỏ xử lý itemId trong body          |

### Known limitations

- Cột `Lot.itemId` trong DB vẫn còn (nullable) cho các lô cũ; dữ liệu cũ không bị thay đổi
- API GET vẫn `include: { item }` — không ảnh hưởng vì field nullable, có thể dọn sau

---

## NHẬP SẢN LƯỢNG — Ghi ngược Mặt hàng & Lô hàng về trang Điều phối máy

**Status:** ✅ Completed 2026-05-13

### What was built

Khi user đổi mặt hàng hoặc lô hàng trên trang nhập sản lượng (`/production/daily-input-grid`) rồi Lưu, thay đổi được ghi ngược về trang điều phối máy (`/machines`). Hỗ trợ cả máy thường (1 mặt hàng/ca) lẫn máy multi-item (nhiều mặt hàng/ca). Bỏ hiển thị cọc (cọc X-Y) trong nhãn mặt hàng của máy multi-item.

### Files created/modified

```
src/app/api/machines/[id]/assignments/route.ts   — thêm PATCH: đổi 1 assignment (oldItemId → newItemId)
src/app/production/daily-input-grid/page.tsx     — handleSave phân nhánh máy thường/multi-item; thêm ghi ngược lô; thêm field originalLotNumber; bỏ hiển thị cọc
```

### Key business logic implemented

- Máy multi-item đổi mặt hàng → PATCH `/api/machines/{id}/assignments` với `{ oldItemId, newItemId }`, validate trùng (conflict) trả 400
- Máy thường đổi mặt hàng → tái dùng `POST /api/machines/batch` (logic cũ giữ nguyên, chỉ cho primary row)
- Đổi lô → `PUT /api/machines/{id}` với `{ currentLotId }`; 1 request/máy (lấy primary row đại diện); lỗi lô không chặn lưu sản lượng
- Reset `originalItemId` + `originalLotNumber` sau khi lưu thành công để không re-trigger ghi ngược

### API endpoints

| Method | Path                              | Description                          |
| ------ | --------------------------------- | ------------------------------------ |
| PATCH  | /api/machines/[id]/assignments    | Đổi 1 assignment cho máy multi-item  |

### Known limitations

- Ghi ngược lô chỉ dùng primary row làm đại diện; nếu UI cho phép đặt lô khác nhau ở sub-row sau này, cần mở rộng

---

## DAILY INPUT (Mobile) — Hỗ trợ máy multi-item

**Status:** ✅ Completed 2026-05-13

### What was built

Trang `/production/daily-input` (mobile, nhập từng máy qua modal) giờ phân nhánh theo loại máy: máy multi-item (`allowMultiItemPerShift = true`) hiển thị N ô nhập riêng — mỗi ô 1 mặt hàng theo assignments — và ghi ngược thay đổi mặt hàng vào `machine_item_assignments` (qua PATCH). Máy thường giữ nguyên flow cũ.

### Files created/modified

```
src/app/production/daily-input/page.tsx                       — thêm UI multi-item, state, handleSaveMultiItem
src/app/api/machines/[id]/assignments/route.ts                — (đã có sẵn) PATCH oldItemId→newItemId
src/app/api/production/daily-status/route.ts                  — (đã có sẵn) trả allowMultiItemPerShift + todayLogs
```

### Key business logic implemented

- Máy multi-item: 1 ProductionLog per (machine, shift, itemId) — tận dụng unique constraint sẵn có
- Đổi mặt hàng trên máy multi-item → PATCH assignment (không gọi `/api/machines/batch`)
- Ghi ngược lô hàng dùng chung flow với máy thường (PUT `/api/machines/[id]` với currentLotId)
- Khi `endIndex <= 0` và không `isStopped`: bỏ qua dòng đó (không tạo log rỗng)
- Card hiển thị tổng kg cộng dồn từ `todayLogs` cho máy multi-item

### API endpoints

| Method | Path                                | Description                                  |
| ------ | ----------------------------------- | -------------------------------------------- |
| PATCH  | /api/machines/[id]/assignments      | Đổi 1 assignment (oldItemId → newItemId)     |
| GET    | /api/production/daily-status        | Trả machines kèm allowMultiItemPerShift + todayLogs |
| POST   | /api/production/daily-input         | Lưu 1 ProductionLog (gọi N lần cho multi-item)|

### Known limitations

- Máy multi-item dùng formulaType = 1 (nhập thẳng kg); không hỗ trợ tính theo cọc/NE per item
- Số lô áp dụng cho toàn máy, không phân theo từng mặt hàng
- Không hỗ trợ "Đổi hàng giữa ca" cho máy multi-item (đã có nhiều ô sẵn)

---

## KD-SX — Sản lượng TH real-time trong summary

**Status:** ✅ Completed 2026-05-14

### What was built

API `/api/kdsx/summary` giờ tính sản lượng TH real-time từ `ProductionLog` thay vì đọc từ snapshot. Các cột tiền (doanh thu/chi phí/lợi nhuận) TH vẫn đọc snapshot, hiện `null` nếu snapshot chưa được refresh.

### Files created/modified

```
src/app/api/kdsx/summary/route.ts  — TH.totalQtyKg sum finalOutput từ ProductionLog theo tháng, group theo factory qua Machine.process.factoryId
```

### Key business logic implemented

- TH sản lượng = SUM(`ProductionLog.finalOutput`) WHERE `recordDate` trong tháng, group theo `Machine.process.factoryId`
- `th` không bao giờ null nữa — luôn có `totalQtyKg` (mặc định 0)
- Các cột tiền TH (`totalRevenueVnd`, `totalCostVnd`, `totalProfitVnd`) = null nếu snapshot TH chưa tồn tại → frontend hiện `-`
- KH vẫn đọc nguyên từ snapshot, không đổi

### API endpoints

| Method | Path                | Description                                |
| ------ | ------------------- | ------------------------------------------ |
| GET    | /api/kdsx/summary   | KH từ snapshot, TH sản lượng real-time     |

### Known limitations

- Doanh thu/chi phí/lợi nhuận TH vẫn cần chạy `refreshSummarySnapshot()` mới có số

---

## KD-SX — Filter sản lượng TH theo segments của ProductionSchedule

**Status:** ✅ Completed 2026-05-14

### What was built

Sửa `/api/kdsx/summary` để TH sản lượng chỉ cộng từ máy có trong `ProductionSchedule.segments` của tháng đó, khớp đúng với cách `ActualProductionGrid` tính. Trước đó cộng tất cả máy trong nhà máy → lệch số với grid.

### Files created/modified

```
src/app/api/kdsx/summary/route.ts  — query ProductionSchedule lấy segmentMachineIds, filter ProductionLog.machineId IN segments; bỏ query Machine.findMany
```

### Key business logic implemented

- TH sản lượng dashboard = SUM(`ProductionLog.finalOutput`) WHERE `machineId IN ProductionSchedule.segments[].machineId` của tháng, group theo `ProductionSchedule.factoryId`
- Nhà máy chưa tạo schedule cho tháng đó → `totalQtyKg = 0`
- Map `machineId → factoryId` lấy trực tiếp từ schedule.segments, không cần query Machine

### Known limitations

- Nếu sau khi nhập sản lượng mà sửa schedule (xóa machine khỏi segments) → log của machine đó sẽ không còn được cộng vào TH dashboard

---

## KDSX — Multi-Schedule mỗi tháng + isPrimary

**Status:** ✅ Completed 2026-05-17

### What was built

Cho phép 1 nhà máy tạo nhiều ProductionSchedule trong cùng 1 tháng (VD: KH sợi con, KH sợi ống). Mỗi tháng chỉ có 1 schedule `isPrimary = true` được dùng làm nguồn TH-Sản lượng cho Dashboard và làm nguồn cho `sync` (MonthlyActual) + `recalculate` (MonthlyPlan).

### Files created/modified

```
prisma/schema.prisma                                                  — thêm name + isPrimary, đổi unique constraint
prisma/migrations/20260517000001_schedule_multi_with_primary/         — migration thủ công bảo toàn data cũ
src/app/api/kdsx/production-schedule/route.ts                         — POST nhận name, auto-set primary cho schedule đầu tiên
src/app/api/kdsx/production-schedule/[id]/route.ts                    — PUT nhận name + isPrimary, tự unset primary cũ
src/app/api/kdsx/production-schedule/[id]/set-primary/route.ts        — route mới, toggle primary trong transaction
src/app/api/kdsx/summary/route.ts                                     — chỉ lấy segments từ schedule isPrimary
src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts                   — chuyển sang findFirst({ isPrimary: true })
src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts              — chuyển sang findFirst({ isPrimary: true })
src/app/kdsx/production-schedule/page.tsx                             — thêm cột Tên KH + cột Chính + nút Đặt chính, form thêm field name
```

### Key business logic implemented

- Unique constraint mới: `(factoryId, yearMonth, name)` — bỏ `(factoryId, yearMonth)`
- Schedule đầu tiên trong 1 tháng tự động được set `isPrimary = true`
- Set primary cho schedule khác = transaction: bỏ primary các schedule còn lại + set primary cho schedule được chọn (atomic)
- TH-Sản lượng (summary route) + sync (MonthlyActual) + recalculate (MonthlyPlan) đều chỉ đọc từ schedule có `isPrimary = true`
- Data cũ sau migration: tất cả schedule hiện có được set `isPrimary = true`, `name = ""`

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/kdsx/production-schedule | Body thêm `name`. Tạo schedule, auto primary nếu là schedule đầu của tháng |
| PUT | /api/kdsx/production-schedule/[id] | Body có thể có `name` + `isPrimary` |
| POST | /api/kdsx/production-schedule/[id]/set-primary | Đặt schedule này làm primary của tháng |

### Known limitations

- Khi xóa schedule đang là `isPrimary`, không tự động chọn schedule khác làm primary thay thế — phải user tự đặt lại
- UI chi tiết schedule (`/kdsx/production-schedule/[id]`) chưa hiển thị/sửa được `name` và `isPrimary` từ trang chi tiết, chỉ làm được từ danh sách

---

## KD-SX V2 — Revenue Refactor (Phase 1–7)

**Status:** ✅ Completed 2026-05-19

### What was built

Refactor hoàn toàn module tính doanh thu/lợi nhuận: thay vì tính từ MonthlyPlan/MonthlyActual (snapshot tĩnh), v2 tính trực tiếp từ ProductionLog realtime qua allocation waterfall. Trang Dashboard mới `/kdsx/revenue` cho sếp xem DT/LN hôm nay, MTD, và ước tính cả tháng.

### Files created/modified

```
prisma/schema.prisma                                    — thêm fields SalesOrderItem, FixedCostEntry, MonthlyInputParam; DEPRECATED 5 models
src/lib/allocation-engine-v2.ts                        — engine phân bổ SL từ ProductionLog → HĐ (waterfall)
src/lib/kdsx/calculator-v2.ts                          — tính DT/CP/LN từ AllocationResult
src/app/api/v2/dashboard/revenue/route.ts              — GET today+MTD+projected PnL
src/app/api/v2/dashboard/revenue-all/route.ts          — GET tổng hợp tất cả NM
src/app/api/v2/contracts/progress/route.ts             — GET tiến độ HĐ
src/app/api/v2/fixed-costs/route.ts                    — GET/PUT chi phí cố định standalone
src/app/api/v2/fixed-costs/copy-from-previous/route.ts — POST copy CP từ tháng trước
src/app/api/v2/production-matrix/route.ts              — GET ma trận SL theo ngày
src/app/kdsx/revenue/page.tsx                          — Dashboard DT/LN mới (tab dashboard + tab CP cố định)
src/app/kdsx/page.tsx                                  — thêm Alert banner dẫn sang trang mới
src/app/kdsx/sales-orders/page.tsx                     — thêm 3 fields: priorityOverride, deferToMonth, wasteRecoveryRate
src/app/api/kdsx/sales-orders/[id]/route.ts            — PUT lưu 3 fields mới
src/components/AdminLayout.tsx                         — thêm kdsx.revenue vào sidebar, ẩn plans/actuals/dashboard cũ
```

### Key business logic implemented

- Waterfall allocation: rót SL vào HĐ theo thứ tự priorityOverride → deadline → signedDate → orderId
- deferToMonth: HĐ bị hoãn không xuất hiện trong tháng hiện tại nếu deferToMonth > yearMonth
- wasteRecoveryRate per-item: override định mức chung, dùng trong công thức Phế = qty × rate × wasteAdjustmentFactor × exchangeRate
- FixedCostEntry v2: dùng factoryId + yearMonth thay vì monthlyPlanId/monthlyActualId
- REAL mode: CP cố định chia tỷ lệ theo ngày đã qua trong tháng
- PROJECTION mode: SL tương lai = benchmark EMPIRICAL × số máy × ngày còn lại (fallback: trung bình thực tế)

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v2/dashboard/revenue | DT/LN 1 NM (today+MTD+projected) |
| GET | /api/v2/dashboard/revenue-all | Tổng hợp tất cả NM |
| GET | /api/v2/contracts/progress | Tiến độ HĐ + waterfall allocation |
| GET | /api/v2/fixed-costs | 14 dòng CP cố định |
| PUT | /api/v2/fixed-costs | Upsert CP cố định |
| POST | /api/v2/fixed-costs/copy-from-previous | Copy CP từ tháng trước |
| GET | /api/v2/production-matrix | Ma trận SL theo item × ngày |

### Known limitations

- AllocationLine dùng `orderItemId` (không phải `salesOrderItemId`) do rename trong quá trình dev
- `prisma db push` thay vì `migrate dev` (non-interactive env) — không có migration file v2_revenue_refactor
- Giá cotton lấy bản gần nhất duy nhất (không phân biệt loại AUS/USA/Brazil) — cần cải thiện sau
- Dashboard chưa có nút "Chốt tháng" (snapshot cuối tháng)
- Chưa có export Excel

### Data notes

- FixedCostEntry: 14 records đã migrate từ MonthlyPlan → factoryId=2, yearMonth=2027-05
- Dev DB: toàn bộ bảng KD đều trống (ProductionLog=0, SalesOrder=0) — cần nhập dữ liệu thật để test
- PageRegistry: thêm entry `kdsx.revenue` trực tiếp vào DB

---

## MACHINES — Gán lô sợi cho máy multi-item + Cải tiến modal điều phối

**Status:** ✅ Completed 2026-05-20

### What was built
Mở rộng hệ thống máy multi-item: mỗi `MachineItemAssignment` giờ lưu `lotId` riêng cho từng mặt hàng, thay vì chỉ dùng `machine.currentLotId` chung. Modal phân công được cải tiến thêm Select lô lọc theo mặt hàng. Bảng máy hiển thị danh sách lô thay vì "—" cho máy multi-item.

### Files created/modified
```
prisma/schema.prisma                                      — MachineItemAssignment.lotId, KdDailyInput.lotId, Lot.machineAssignments + kdDailyInputs
prisma/migrations/20260520000001_.../migration.sql        — ALTER TABLE thêm lotId vào 2 bảng
src/app/api/machines/[id]/assignments/route.ts            — GET include lot, PUT lưu lotId
src/app/api/machines/route.ts                             — GET include itemAssignments (item + lot)
src/app/machines/page.tsx                                 — Interface + columns + modal multi-item với Select lô
src/app/kd-daily-input/page.tsx                           — RowData.lotId, capture từ assignment, truyền khi save
src/app/api/kd-daily-input/route.ts                       — Upsert lưu lotId vào kd_daily_inputs
src/app/api/production/daily-input/route.ts               — bodyLotId override machine.currentLotId
```

### Key business logic implemented
- `MachineItemAssignment.lotId`: nullable FK → Lot; một máy multi-item có thể chạy lô khác nhau cho từng mặt hàng cùng lúc
- Cột "Lô đang SX": máy multi-item render nhiều Tag lô từ `itemAssignments`; máy thường giữ nguyên `currentLot`
- Select lô trong modal: lọc `assignmentLots` theo `itemId` đã chọn cùng dòng (dùng `shouldUpdate`); khi đổi mặt hàng tự reset `lotId`
- `production/daily-input`: `lotId` từ body ưu tiên hơn `machine.currentLotId` — hỗ trợ cả luồng multi-item lẫn thường

### API endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/machines/[id]/assignments | Trả assignments kèm lot {id, lotNumber} |
| PUT | /api/machines/[id]/assignments | Lưu assignments kèm lotId |
| GET | /api/machines | Trả danh sách máy kèm itemAssignments (item + lot) |

### Known limitations
- Select lô trong modal chỉ load lô YARN status=OPEN; lô CLOSED không hiển thị
- Không có validation bắt buộc gán lô cho máy multi-item (lotId optional)
- `kd-daily-input` page chưa hiển thị tên lô trực tiếp trong bảng nhập liệu (chỉ lưu DB)

### Data notes
- Migration thêm cột nullable — không ảnh hưởng dữ liệu cũ (NULL mặc định)
- Cần restart dev server sau khi apply migration để Prisma client pick up schema mới

---

## DASHBOARD V2 — Fix filter công đoạn ống & timezone UTC

**Status:** ✅ Completed 2026-05-20

### What was built
Fix 2 bug trong API ma trận sản lượng và các điểm tạo date range của module v2: (1) bổ sung filter `isRevenueProcess: true` để chỉ lấy SL công đoạn ống thay vì tất cả công đoạn; (2) chuyển toàn bộ cách dựng `firstDay`/`lastDay` và trích `day` từ `recordDate` sang UTC để khớp với cách Prisma lưu `@db.Date`.

### Files created/modified
```
src/app/api/v2/production-matrix/route.ts   — fix filter isRevenueProcess + UTC range + getUTCDate
src/app/api/v2/contracts/progress/route.ts  — firstDayOfMonth dùng UTC string
src/lib/allocation-engine-v2.ts             — firstDay/lastDay/today chuyển sang UTC (2 hàm: runAllocationFromProduction, runAllocationToday)
```

### Key business logic implemented
- Production matrix chỉ tính SL của công đoạn doanh thu (`isRevenueProcess = true`) — các công đoạn phụ không tính vào ma trận hiển thị
- Date range tháng dùng UTC: `new Date(`${yearMonth}-01T00:00:00.000Z`)` cho firstDay và `Date.UTC(year, month, 0, 23, 59, 59, 999)` cho lastDay — tránh lệch sang tháng trước trên server có TZ khác UTC
- Khi group log theo ngày phải dùng `recordDate.getUTCDate()` thay vì `getDate()`

### Known limitations
- Các file ngoài scope v2 (allocation-engine.ts cũ, kdsx/*) chưa được audit timezone trong lần fix này

---

## CÔNG ĐOẠN — Đánh dấu công đoạn tính doanh thu

**Status:** ✅ Completed 2026-05-20

### What was built
Thêm field `isRevenueProcess` vào model `Process` và UI quản lý công đoạn (`/processes`) để Admin có thể đánh dấu công đoạn cuối (thường là ống) làm nguồn SL tính doanh thu. Dashboard v2 production-matrix đã lọc theo cờ này.

### Files created/modified
```
prisma/schema.prisma                                                  — thêm field isRevenueProcess Boolean @default(false) vào Process
prisma/migrations/20260520000004_add_is_revenue_process_to_process/   — ADD COLUMN IF NOT EXISTS (vì DB local đã có sẵn cột do db push trước đó)
src/app/api/processes/route.ts                                        — POST nhận isRevenueProcess
src/app/api/processes/[id]/route.ts                                   — PUT nhận isRevenueProcess
src/app/processes/page.tsx                                            — thêm cột "CĐ doanh thu" + Switch trong form
```

### Key business logic implemented
- Mỗi nhà máy nên chỉ bật `isRevenueProcess = true` cho 1 công đoạn (UI chưa enforce, dùng tooltip nhắc)
- Mặc định `false` cho tất cả công đoạn cũ — Admin phải vào bật thủ công sau khi deploy, nếu không matrix sẽ trống

### API endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST   | /api/processes | Tạo công đoạn, accept isRevenueProcess (optional, default false) |
| PUT    | /api/processes/[id] | Cập nhật, isRevenueProcess optional — chỉ update khi truyền lên |

### Known limitations
- Chưa enforce unique 1 công đoạn doanh thu / nhà máy — nếu Admin bật 2 công đoạn, matrix sẽ cộng SL của cả hai (sai)

---

## KẾ HOẠCH SẢN XUẤT — Tách ActualProductionGrid khỏi planGrid

**Status:** ✅ Completed 2026-05-22

### What was built
Tháo bỏ sự phụ thuộc của tab **Thực hiện** (ActualProductionGrid) vào việc phải tạo segments kế hoạch trước. Trước đây, API `/actual` chỉ lấy ProductionLog của các máy CÓ trong segments → nếu chưa tạo KH thì bảng TH luôn trống. Nay user chọn công đoạn (Process) thì bảng TH hiển thị sản lượng thực tế của tất cả máy trong công đoạn đó, hoàn toàn độc lập với planGrid.

### Files created/modified
```
src/app/api/kdsx/production-schedule/[id]/actual/route.ts   — thêm processIds query param; khi có processIds → query tất cả máy active của công đoạn đó thay vì segment machines
src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx — thêm Process interface + state (factoryProcesses, selectedProcessIds); refactor useEffect initial load thành 2-phase async (phase 1: song song; phase 2: fetch actual với processIds); thêm process selector UI dạng toggle buttons trong tab Thực hiện
```

### Key business logic implemented
- **API priority**: `processIds` param → segment machines → empty (3 mức ưu tiên)
- **Default processIds khi load**: nếu schedule có segments → lấy processId của các máy trong segments; nếu không có segments → lấy tất cả công đoạn của nhà máy đó
- **Backward compatible**: khi UI cũ không truyền `processIds`, API fallback về segment machines như trước
- **BenchmarkMap**: vẫn hoạt động bình thường vì dùng machineId+itemId từ dữ liệu thực tế, không từ segments

### API endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/kdsx/production-schedule/[id]/actual?processIds=1,2 | Lấy grid thực tế theo công đoạn (không cần segments) |
| GET | /api/kdsx/production-schedule/[id]/actual | Fallback: dùng segment machines như cũ |

### Known limitations
- Tab **So sánh KH/TH** (`ScheduleComparisonDashboard`) vẫn self-fetch `/actual` không có processIds → hiển thị đúng khi có segments, trống khi không có segments (chấp nhận được vì tab đó cần KH để so sánh)
- Process selector UI dùng native HTML buttons thay vì Ant Design Select để tránh thêm import

---

## SẢN XUẤT — Tách trang nhập liệu đánh ống & Tối ưu code nhập sản lượng

**Status:** ✅ Completed 2026-05-23

### What was built

Tạo trang nhập liệu riêng cho máy đánh ống multi-item (`/production/winding-input`), extract shared logic (formulas, types, hooks) thành modules chung, loại bỏ toàn bộ code multi-item khỏi 3 trang nhập cũ (daily-input, daily-input-grid, mobile-input), fix bug `currentItemId` bị ghi đè khi sửa log ngày cũ.

### Files created/modified

```
src/lib/production-utils.ts              — Shared: calcOutput(), detectShiftAndDate(), YARN_CONSTANT
src/types/production.ts                  — Shared types: MachineForInput, ProductionLogEntry, MachineAssignment, etc.
src/hooks/useProductionMetadata.ts       — Hook fetch factories/processes/items/lots dùng chung
src/app/production/winding-input/page.tsx — Trang nhập liệu đánh ống mới (multi-item machines only)
src/app/production/daily-input-grid/page.tsx — Xóa multi-item code, import shared utils, filter !allowMultiItemPerShift
src/app/production/mobile-input/page.tsx    — Xóa multi-item code, import shared calcOutput, filter !allowMultiItemPerShift
src/app/production/daily-input/page.tsx     — Xóa multi-item code, import shared calcOutput, filter !allowMultiItemPerShift
src/app/api/production/daily-status/route.ts — Include itemAssignments trong response (tránh N+1)
src/app/api/production/daily-input/route.ts  — Fix bug: chỉ update currentItemId khi recordDate = today
src/components/AdminLayout.tsx              — Thêm menu "Nhập liệu đánh ống" vào sidebar
prisma/fix-data.js                          — Thêm PageRegistry entry sx.winding-input
```

### Key business logic implemented

- Máy có `allowMultiItemPerShift = true` chỉ xuất hiện ở trang đánh ống mới, không còn ở 3 trang cũ
- Trang đánh ống dùng `MachineItemAssignment` (included in daily-status API) để hiển thị items, hỗ trợ thêm hàng giữa ca
- `calcOutput()` shared: 4 formulaType (1=direct kg, 2=delta, 3=spindle+NE, 4=NE), thay thế 3 implementation trùng lặp
- `detectShiftAndDate()` shared: Ca 1=13-21h, Ca 2=21-5h (date -1 if past midnight), Ca 3=5-13h (date -1)
- Fix bug: `currentItemId` chỉ update khi `recordDate` = today, tránh ghi đè khi sửa log cũ

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/production/daily-status?processId=X&date=Y&shift=Z | Trả về machines + todayLog + itemAssignments (mới) |
| POST | /api/production/daily-input | Upsert production log (fix: chỉ update currentItemId khi nhập ngày hôm nay) |

### Known limitations

- Shared hook `useProductionMetadata` chỉ được dùng ở daily-input-grid; 2 trang còn lại (mobile-input, daily-input) vẫn fetch metadata theo cách riêng

### Data notes

- PageRegistry entry: `sx.winding-input` với sortOrder 103, path `/production/winding-input`

---

## MOBILE — Trang nhập liệu đánh ống Mobile

**Status:** ✅ Completed 2026-05-23

### What was built

Tạo trang mobile riêng `/production/mobile-winding` cho máy đánh ống multi-item. Giao diện tương tự `mobile-input` nhưng thay vì chỉ số trước/sau thì hiển thị N cards nhập kg theo từng mặt hàng. Cập nhật desktop `winding-input` thêm màu xen kẽ theo máy. Sửa redirect từ `mobile-input` trỏ đúng sang trang mobile thay vì desktop.

### Files created/modified

```
src/app/production/mobile-winding/page.tsx   — Trang mobile cho máy đánh ống
src/app/production/winding-input/page.tsx    — Thêm màu xen kẽ theo máy + fix rowSpan + uid
src/app/production/mobile-input/page.tsx     — Fix empty state + redirect đúng trang mobile
src/components/AdminLayout.tsx               — Thêm menu mobile.winding vào MOBILE group
prisma/fix-data.js                           — Thêm PageRegistry mobile.winding
```

### Key business logic implemented

- `mobile-winding`: Chỉ load máy `allowMultiItemPerShift = true`, mỗi máy hiển thị card per item, nhập kg trực tiếp (formulaType không quan trọng)
- Thêm hàng giữa ca: nút "＋ Thêm mặt hàng giữa ca" → extra card với Select chọn item → check trùng itemId trong cùng máy
- `_uid` per row: tránh conflict khi nhiều extra rows chưa chọn item, dùng làm key và match để update/remove
- Màu xen kẽ desktop: `winding-row-even` (#ffffff) / `winding-row-odd` (#f0f7ff), dirty row = #fff7e6 + border trái vàng
- Redirect mobile-input: khi public winding-only process → nút trỏ `/production/mobile-winding` thay vì desktop

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/production/daily-status?processId=X&date=Y&shift=Z | Dùng lại, trả về itemAssignments + todayLogs |
| POST | /api/production/daily-input | Dùng lại, lưu kg per item |

### Known limitations

- `mobile-winding` chưa hỗ trợ QR code scan (chỉ chọn công đoạn thủ công hoặc qua URL ?processId=X)


---

## SẢN XUẤT — Nâng cấp trang nhập liệu đánh ống (inline edit + fix lịch sử)

**Status:** ✅ Completed 2026-05-24

### What was built

Ba cải tiến quan trọng cho trang nhập liệu đánh ống (desktop + mobile):
1. **Fix extra item trên mobile**: Bỏ `disabled` trên ô lô và ô kg khi thêm mặt hàng giữa ca — người dùng có thể điền ngay sau khi chọn mặt hàng.
2. **Inline đổi mặt hàng**: Thêm nút ✏️ bên cạnh tên mặt hàng trên cả desktop và mobile, cho phép sửa mặt hàng assignment ngay tại form nhập liệu mà không cần thoát sang bảng điều phối.
3. **Fix lịch sử ca**: Sửa bug build rows sai khi xem ca cũ sau khi assignment đã thay đổi ở ca mới.

### Files created/modified

```
src/app/production/winding-input/page.tsx     — Thêm EditOutlined, originalItemId, editMode vào WindingRow; sửa handleLoad; sửa handleSave; render nút ✏️ trong cột Mặt hàng
src/app/production/mobile-winding/page.tsx    — Thêm EditOutlined, originalItemId, editMode vào ItemInput; sửa buildMachineItems; sửa handleSave; render nút ✏️ trong item card
```

### Key business logic implemented

**Inline đổi mặt hàng (✏️):**
- Nút ✏️ chỉ hiện cho dòng từ assignment (`!isExtra`), không hiện cho dòng extra (thêm giữa ca)
- Khi click → row/card chuyển sang Select chọn item mới; khi chọn xong → đóng về Tag, lô tự xóa (vì item đổi thì lô phải chọn lại)
- Tag đổi màu cam + nhãn "Đã đổi" khi item khác với `originalItemId`
- **Khi lưu (3 bước):**
  1. Nếu item thay đổi và có `existingLogId` → `DELETE /api/production/daily-input?id=X` xóa log cũ
  2. `POST /api/production/daily-input` tạo log mới với itemId mới
  3. `PATCH /api/machines/{id}/assignments` `{oldItemId, newItemId}` cập nhật MachineItemAssignment

**Fix lịch sử ca (build rows từ logs):**
- **Vấn đề:** `MachineItemAssignment` không lưu lịch sử. Khi Ca 2 đổi assignment từ A→B, quay lại xem Ca 1 sẽ thấy item B trống + item A bị đẩy thành "extra" (sai).
- **Fix:** `handleLoad` / `buildMachineItems` dùng logic mới:
  - `todayLogs.length > 0` → build rows **từ logs** (ưu tiên lịch sử thực tế), không add unlogged assignment items
  - `todayLogs.length === 0` → build rows **từ assignments** (template ca mới, như cũ)
- Rows từ log: `originalItemId` chỉ set nếu item vẫn còn khớp assignment hiện tại (nút ✏️ hiện), `isExtra = !assignment`

**Trade-off chấp nhận được:**
- Nếu ca đang nhập dở (1 item đã log, item khác chưa log) → item chưa log không tự xuất hiện (người dùng dùng "Thêm hàng" thủ công)
- Trường hợp này hiếm vì thực tế nhập đánh ống thường nhập 1 lần cuối ca

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| DELETE | /api/production/daily-input?id=X | Xóa log cũ khi đổi item |
| PATCH  | /api/machines/{id}/assignments | `{oldItemId, newItemId}` — đã có sẵn, dùng để sync assignment |
| POST   | /api/production/daily-input | Tạo log mới với item đã đổi |

### Known limitations

- Chỉ cho đổi item với dòng từ assignment (`!isExtra`). Dòng extra (thêm giữa ca có log) không có nút ✏️.
- Assignment history không được lưu — nếu item đổi nhiều lần trong ngày, chỉ trạng thái cuối cùng được ghi nhận trong `MachineItemAssignment`.
- Khi PATCH assignment thất bại (item mới đã có trong assignment khác), log vẫn được lưu nhưng assignment không sync — hiển thị cảnh báo cho người dùng.


---

## PRODUCTION INPUT — Fix bug xem ca cũ & đổi item (daily-input-grid + mobile-input)

**Status:** ✅ Completed 2026-05-24

### What was built

Fix 2 bug trên 2 trang nhập liệu thông thường (không phải đánh ống), tương tự bug đã fix trên winding-input/mobile-winding:

1. **daily-input-grid** — Bug 2: Khi primary/sub-row đổi item (A→B) và đã có `existingLogId`, code không DELETE log cũ (item A) trước khi POST log mới (item B), dẫn đến máy có 2 logs trong cùng ca.

2. **mobile-input** — Bug 1: `handleSave` luôn dùng `currentMachine.currentItem?.id` (trạng thái hiện tại). Khi xem lại ca cũ mà item đã thay đổi (hôm qua dùng A, hôm nay B), sẽ POST sai item cho ca hôm qua. Fix: thêm `existingItemId` vào inputStates, load từ existing log, ưu tiên khi save.

### Files created/modified

```
src/app/production/daily-input-grid/page.tsx  — Thêm bước DELETE log cũ trước Promise.allSettled POST
src/app/production/mobile-input/page.tsx      — Thêm existingItemId vào inputStates type, loadPreviousIndexes, handleSave, handleMobileItemChange
```

### Key business logic implemented

**daily-input-grid fix (Bug 2 — DELETE trước POST):**
- Lọc `rowsToDeleteOldLog`: các dirty rows có `existingLogId && itemId !== originalItemId && cả 2 khác 0`
- Loop DELETE từng log cũ TRƯỚC khi vào `Promise.allSettled` POST
- Áp dụng cho cả primary row và sub-row (không giới hạn `!r.isSubRow`)

**mobile-input fix (Bug 1 — existingItemId):**
- `inputStates` có thêm field `existingItemId?: number`
- `loadPreviousIndexes` extract `existing.itemId` từ API `/api/production/daily-input?machineId=...&date=...&shift=...` và lưu vào `existingItemId`
- `handleSave` dùng `currentState.existingItemId ?? currentMachine.currentItem?.id` làm itemId trong payload
- `handleMobileItemChange` reset `existingItemId = itemChangeNewId` sau khi đổi hàng giữa ca (tránh lần save tiếp dùng sai item)

**Xác nhận Bug 3 (currentItemId ghi đè):** Không có trong 2 file này — API `daily-input/route.ts` đã fix riêng.

### API endpoints

Không có endpoint mới — chỉ tận dụng `DELETE /api/production/daily-input?id=X` đã có.

### Known limitations

- `mobile-input` không hỗ trợ nhiều items/ca trên 1 máy (machines có `allowMultiItemPerShift=false`), nên không cần xử lý multi-log như winding-input.
- Khi xem ca cũ trên mobile-input, `inputNE` vẫn lấy từ `m.currentNE` (không từ log) — nếu NE đã thay đổi thì hiển thị không chính xác (minor, không ảnh hưởng lưu vì người dùng có thể sửa).

---

## PRODUCTION INPUT — Fix bug xem ca cũ (daily-input modal)

**Status:** ✅ Completed 2026-05-24

### What was built

Fix 2 bug liên quan trên trang nhập sản lượng modal-based (`/production/daily-input`):

**Bug 1** — `quickAssignItemId` khởi tạo sai: `handleOpenMachine` luôn gán `machine.currentItem?.id`, dù máy đã có `todayLog` với `itemId` khác. `submitData` dùng `effectiveItemId = quickAssignItemId` → POST log với item hiện tại thay vì item thực tế của ca đó.

**Bug 2 (phụ sinh)** — Assignment update không được guard: Nếu `quickAssignItemId` (từ log, ví dụ A) khác `currentItem` (B), code sẽ gọi `/api/machines/batch` ghi đè assignment B→A khi đang sửa ca cũ.

### Files created/modified

```
src/app/production/daily-input/page.tsx  — Sửa khởi tạo quickAssignItemId; thêm guard !currentMachine?.todayLog cho assignment update
```

### Key business logic implemented

- `handleOpenMachine`: `setQuickAssignItemId((machine.todayLog?.itemId ?? machine.currentItem?.id) ?? null)` — ưu tiên item của log
- `setShowQuickAssign(!machine.currentItem && !machine.todayLog)` — chỉ auto-mở select khi máy chưa gán hàng VÀ chưa có log
- `submitData`: điều kiện cập nhật assignment đổi thành `!currentMachine?.todayLog && effectiveItemId !== prevItemId` — chỉ update assignment khi nhập mới, không cập nhật khi sửa log cũ
- UI "Thay đổi" button đã có guard `{!currentMachine?.todayLog && ...}` từ trước — nên không cần sửa thêm phần render

### API endpoints

Không có endpoint mới.

### Known limitations

- Trang này dùng `machine.todayLog` (log đơn) thay vì `todayLogs` (đa log) — không hỗ trợ máy đổi hàng giữa ca theo flow thông thường (chỉ hỗ trợ qua nút "Đổi hàng giữa ca" riêng biệt).

---

## UTILS — Natural Sort cho tên máy

**Status:** ✅ Completed 2026-05-24

### What was built

Thêm utility function `naturalSortBy` dùng chung toàn dự án để sắp xếp tên máy theo thứ tự số tự nhiên (natural sort). Giải quyết vấn đề tên máy lưu dạng text bị sort sai thứ tự ("Máy số 10" đứng trước "Máy số 2").

### Files created/modified

```
src/utils/naturalSort.ts                                    — [MỚI] naturalSortBy(), naturalSortComparator()
src/app/kd-daily-input/report/page.tsx                     — Thay inline naturalSortMachineName bằng import từ utils
src/app/production/machine-stops/page.tsx                  — Thêm natural sort theo tên sau khi sort stopped-first
src/app/production/mobile-stops/page.tsx                   — Thêm natural sort theo tên sau khi sort stopped-first
src/app/production/daily-input/page.tsx                    — Sort danh sách máy khi fetch về
src/app/production/mobile-input/page.tsx                   — Thay sort by id bằng natural sort by name
src/app/production/mobile-winding/page.tsx                 — Thêm natural sort khi set danh sách máy
```

### Key business logic implemented

- `naturalSortBy(a, b)`: tách chuỗi thành tokens (số và text xen kẽ), so sánh từng token — số so sánh numerically, text so sánh bằng `localeCompare("vi")`
- Thuật toán xử lý đúng mọi tình huống: "Máy số 1" < "Máy số 2" < "Máy số 10" < "Máy số 20"
- `naturalSortComparator<T>(keyFn)`: factory tạo comparator với key extractor, tiện dùng cho bất kỳ object nào
- Trên các trang dừng máy: sort stopped first, cùng trạng thái thì natural sort theo tên

### API endpoints

Không có endpoint mới — thay đổi hoàn toàn ở frontend.

### Known limitations

- Không ảnh hưởng đến order ở database level (Prisma vẫn dùng `orderBy: { name: "asc" }` hoặc `id: "asc"`) — sort chỉ xảy ra ở frontend sau khi fetch
- Nếu cần sort ở DB level, dùng PostgreSQL raw query: `ORDER BY regexp_replace(name, '\\D', '', 'g')::int`


---

## MODULE KDSX — MonthlyQuota + Multi-line SalesOrderItem (Phase 1)

**Status:** ✅ Completed 2026-05-26

### What was built

Thêm bảng `MonthlyQuota` cho phép Phòng KD phân bổ sản lượng tháng cho từng dòng hợp đồng. Sửa allocation engine v2 để ưu tiên waterfall theo quota thay vì waterfall tự động khi có quota. API CRUD đầy đủ bao gồm copy từ tháng trước.

### Files created/modified

```
prisma/schema.prisma                                              — Thêm model MonthlyQuota + relation quotas vào SalesOrderItem
prisma/migrations/20260526100220_add_monthly_quota_and_multi_line_item/migration.sql — Tạo bảng monthly_quotas
src/app/api/v2/monthly-quotas/route.ts                            — GET (lấy quota theo factory+tháng) + POST (upsert quota)
src/app/api/v2/monthly-quotas/copy-from-previous/route.ts         — POST copy quota từ tháng nguồn
src/lib/allocation-engine-v2.ts                                   — Sửa waterfallAllocate: hỗ trợ quota-based waterfall
```

### Key business logic implemented

- `MonthlyQuota.isRemainder=true` → quotaQty phải NULL; nhận phần còn lại sau khi rót xong các FIXED
- Mỗi `itemId + yearMonth` tối đa 1 dòng REMAINDER (enforce ở API layer)
- Allocation engine: nếu có quota cho item → dùng FIXED (sort theo sortOrder ASC) rồi REMAINDER; nếu không có quota → fallback waterfall cũ (backward compatible)
- `@@unique([orderId, itemId])` đã không tồn tại trong schema → schema hỗ trợ multi-line ngay từ đầu; field `note` đã có sẵn trên `SalesOrderItem`
- Migration apply theo workaround thủ công (shadow DB có bug ở migration cũ 20260520000002)

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/v2/monthly-quotas?factoryId=&yearMonth=&itemId= | Lấy quota + remainingTotal của từng HĐ |
| POST   | /api/v2/monthly-quotas | Upsert quota cho tháng (body: yearMonth + quotas[]) |
| POST   | /api/v2/monthly-quotas/copy-from-previous | Copy quota từ tháng nguồn, bỏ qua HĐ đã done |

### Known limitations

- Phase 1 chỉ có schema + API + engine. Chưa có UI trang nhập quota.
- `cumProducedPrevMonths` tính từ `OrderAllocation` — chưa có snapshot tháng, nên nếu KD chưa chạy allocation tháng trước thì giá trị = 0.
- Engine không xử lý trường hợp quota FIXED vượt remainingTotal (chỉ cảnh báo trong API GET, không block).

### Data notes

- `yearMonth` format: `"YYYY-MM"` (VarChar 7), indexed
- `sortOrder`: số nguyên, nhỏ = rót trước; REMAINDER luôn rót sau cùng bất kể sortOrder

---

## MODULE KDSX — UI Phân bổ tháng (MonthlyQuota Phase 2)

**Status:** ✅ Completed 2026-05-26

### What was built

Trang `/kdsx/monthly-quotas` cho Phòng KD nhập và quản lý quota sản lượng hàng tháng cho từng dòng hợp đồng. Hỗ trợ nhóm HĐ theo mặt hàng, chọn FIXED/REMAINDER, copy từ tháng trước, lưu vào DB.

### Files created/modified

```
src/app/kdsx/monthly-quotas/page.tsx                   — Trang UI chính
src/app/api/v2/monthly-quotas/route.ts                 — Bổ sung producedThisMonth (từ allocation engine)
src/components/AdminLayout.tsx                         — Thêm "Phân bổ tháng" vào ALL_PAGES + SIDEBAR_GROUPS KINH DOANH
prisma/seed-monthly-quotas-page.js                     — Seed PageRegistry (pageKey: kdsx.monthly-quotas)
```

### Key business logic implemented

- Group HĐ theo itemId; chỉ nhóm có >= 2 HĐ mới hiển thị bảng quota (nhóm 1 HĐ hiển thị tag đơn giản)
- REMAINDER: cột quota hiển thị "= xxx" tự tính (remainingTotal - tổng FIXED); không cho nhập
- Chuyển REMAINDER: confirm dialog, HĐ cũ đổi thành FIXED với quotaQty = giá trị computed hiện tại
- Validate trước khi lưu: mỗi nhóm đa-HĐ phải có đúng 1 REMAINDER
- producedThisMonth lấy từ allocation engine v2 (REAL mode, có quota support)
- Copy từ tháng trước: POST copy-from-previous, điều chỉnh quotaQty theo remainingTotal mới

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/v2/monthly-quotas | Đã bổ sung producedThisMonth per contract |

### Known limitations

- Bảng scroll ngang trên màn hình nhỏ; chưa có phím tắt tăng/giảm số
- producedThisMonth tính từ allocation engine — chậm hơn khi có nhiều items (~1-2s)
- Chưa có drag-and-drop để đổi thứ tự sortOrder
- Sidebar hiện là icon PartitionOutlined (tạm dùng, phù hợp với theme phân chia)

---

## MODULE KDSX — Phase 3: Note field + Revenue dashboard + SalesOrder multi-line warning

**Status:** ✅ Completed 2026-05-26

### What was built

Ba cập nhật nhỏ hoàn thiện hỗ trợ multi-line SalesOrderItem: (A) thêm `note` vào AllocationLine interface và engine; (B) cảnh báo trực quan trong form tạo HĐ khi có 2+ dòng cùng mặt hàng; (C) API progress và trang doanh thu trả thêm `note`, `quotaThisMonth`, `isRemainder`.

### Files created/modified

```
src/lib/allocation-engine-v2.ts                        — Thêm note vào AllocationLine, truyền note vào tất cả allocations.push()
src/app/api/v2/contracts/progress/route.ts             — Include quotas trong query, trả thêm note/quotaThisMonth/isRemainder
src/app/kdsx/revenue/page.tsx                          — Mở rộng ContractProgress interface, thêm cột "Chi tiết" hiển thị note
src/app/kdsx/sales-orders/page.tsx                     — Thêm duplicate itemId detection, highlight xanh + tag "Cùng mặt hàng"
```

### Key business logic implemented

- `AllocationLine.note` lấy từ `SalesOrderItem.note` — dùng phân biệt cảng/container cho cùng mặt hàng
- `duplicateItemIds` tính bằng `Form.useWatch("items", form)` + `useMemo`; chỉ cảnh báo trực quan, không block lưu
- `contracts/progress` API mới trả `quotaThisMonth` (quotaQty của tháng đó) và `isRemainder` — để revenue page phân biệt FIXED vs REMAINDER
- Revenue dashboard thêm cột "Chi tiết" (width 120px, ellipsis) hiển thị note dạng Text secondary

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/v2/contracts/progress | Đã bổ sung note, quotaThisMonth, isRemainder |

### Known limitations

- Duplicate warning chỉ ở phía client (Form.useWatch), không validate ở server — intentional vì multi-line là hợp lệ
- Revenue page hiển thị note nhưng chưa có filter theo note
- `isRemainder` trả về trong progress API nhưng chưa được dùng trong revenue UI (reserved for future)

---

## KDSX — Chuyển wasteRate + doubleTwistGcRate sang SalesOrderItem

**Status:** ✅ Completed 2026-05-26

### What was built

Hai trường `wasteRate` và `doubleTwistGcRate` được chuyển từ `RawMaterialRate` (định mức chung) sang `SalesOrderItem` (per-contract), vì chúng có thể khác nhau theo từng hợp đồng/khách hàng. Công thức calculator v2 được cập nhật để đọc từ `AllocationLine` (truyền từ SalesOrderItem) thay vì RawMaterialRate.

### Files created/modified

```
prisma/schema.prisma                                       — Thêm doubleTwistGcRate vào SalesOrderItem; @deprecated comments trên RawMaterialRate.wasteRate và .doubleTwistGcRate
prisma/migrations/20260526110000_.../migration.sql         — ALTER TABLE sales_order_items ADD COLUMN doubleTwistGcRate
src/lib/allocation-engine-v2.ts                            — Thêm doubleTwistGcRate vào AllocationLine interface và 4 chỗ push
src/lib/kdsx/calculator-v2.ts                              — Sửa gcDoubleTwistVnd đọc từ line.doubleTwistGcRate; sửa wasteRecoveryVnd bỏ fallback rate.wasteRate, thêm unitPrice vào công thức
src/app/api/kdsx/sales-orders/route.ts                     — POST: thêm wasteRecoveryRate, doubleTwistGcRate, priorityOverride, deferToMonth vào items.create
src/app/api/kdsx/sales-orders/[id]/route.ts                — PUT: thêm doubleTwistGcRate vào items.createMany
src/app/kdsx/sales-orders/page.tsx                         — Thêm doubleTwistGcRate field; cập nhật label/tooltip wasteRecoveryRate sang "%"
src/app/kdsx/raw-material-rates/page.tsx                   — Xóa cột wasteRate, doubleTwistGcRate khỏi bảng và form
src/app/api/kdsx/raw-material-rates/route.ts               — POST: bỏ wasteRate và doubleTwistGcRate khỏi body parsing
src/app/api/kdsx/raw-material-rates/[id]/route.ts          — PUT: bỏ wasteRate và doubleTwistGcRate khỏi update data
```

### Key business logic implemented

- `wasteRecoveryRate` và `doubleTwistGcRate` trên `SalesOrderItem` là FRACTION of unitPrice (0.07 = 7%), không phải USD/kg
- Công thức mới: `gcDoubleTwistVnd = qty × doubleTwistGcRate × unitPriceUsd × exchangeRate`
- Công thức mới: `wasteRecoveryVnd = qty × wasteRecoveryRate × unitPriceUsd × wasteAdjustmentFactor × exchangeRate`
- RawMaterialRate.wasteRate và .doubleTwistGcRate được đánh dấu `@deprecated` nhưng KHÔNG xóa khỏi schema (giữ data cũ)
- Data migration: copy giá trị từ RawMaterialRate sang SalesOrderItem nơi IS NULL (chỉ lấy effectiveTo IS NULL = định mức hiện hành)

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/kdsx/sales-orders | Giờ nhận thêm wasteRecoveryRate, doubleTwistGcRate per item |
| PUT | /api/kdsx/sales-orders/[id] | Giờ nhận thêm doubleTwistGcRate per item |

### Known limitations

- Các HĐ đã nhập `wasteRecoveryRate` theo format cũ (USD/kg, VD: 0.18) sẽ bị tính sai với công thức mới — cần review lại thủ công
- Data migration chỉ copy từ RawMaterialRate vào SalesOrderItem nơi `wasteRecoveryRate IS NULL` — override cũ không bị ghi đè nhưng semantic đã thay đổi

---

## SCHEMA — SPEC 0: Migration gộp v2 (monthly_quota process scope + production_schedule processId)

**Status:** ✅ Completed 2026-05-28

### What was built

Gộp toàn bộ thay đổi schema của đợt cải tiến v2 vào 1 migration duy nhất (`20260528000001_v2_monthly_quota_process_scope`). Bổ sung scope công đoạn (`processId`) vào `MonthlyQuota` và `ProductionSchedule`, giúp phân biệt quota theo từng công đoạn (ống / sợi con). Đây là migration nền tảng — SPEC A/B/C sau đó chỉ cần code, không cần thêm migration.

### Files created/modified

```
prisma/schema.prisma                                                  — Thêm processId+process vào ProductionSchedule; thêm factoryId+processId+relations vào MonthlyQuota; thêm quan hệ ngược monthlyQuotas/productionSchedules vào Factory/Process
prisma/migrations/20260528000001_v2_monthly_quota_process_scope/      — Migration SQL idempotent (IF NOT EXISTS + DO block)
src/app/api/v2/monthly-quotas/route.ts                                — POST handler nhận thêm factoryId+processId, dùng compound unique key mới
src/app/api/v2/monthly-quotas/copy-from-previous/route.ts             — Propagate factoryId+processId từ sourceQuota khi copy
```

### Key business logic implemented

- `MonthlyQuota` có unique constraint mới: `(salesOrderItemId, factoryId, processId, yearMonth)` — 1 HĐ có thể có quota khác nhau cho từng công đoạn trong cùng tháng
- `ProductionSchedule.processId` nullable — schedule cũ chưa có processId; backfill cần chạy SQL riêng sau deploy
- Migration SQL được viết idempotent: `ADD COLUMN IF NOT EXISTS`, `DROP INDEX IF EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`, FK trong `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` để tránh lỗi P3018/42710 trên production
- Cột cũ `monthly_quotas_salesOrderItemId_yearMonth_key` được drop và thay bằng compound key 4 trường

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v2/monthly-quotas | Không đổi signature |
| POST | /api/v2/monthly-quotas | Nay yêu cầu thêm `factoryId` và `processId` trong body |
| POST | /api/v2/monthly-quotas/copy-from-previous | Tự động carry factoryId+processId từ source quota |

### Known limitations

- Các row `monthly_quotas` cũ (trước 2026-05-28) không có factoryId/processId → cần backfill thủ công bằng SQL (xem SPEC 0 mục BACKFILL)
- Shadow DB của Prisma không dùng được (`migrate dev`) vì migration cũ `20260520000002` bị P3006 — phải dùng `migrate deploy` khi tạo migration mới

### Data notes

- `factoryId` và `processId` trong `monthly_quotas` là NULLABLE trong DB (để tránh lỗi khi có data cũ) nhưng NOT NULL trong Prisma schema — API sẽ validate khi tạo/sửa

---

## KDSX — SPEC A: Nguồn sự thật duy nhất getMonthlyItemTotals + sửa logic ước tính

**Status:** ✅ Completed 2026-05-28

### What was built

Tạo hàm `getMonthlyItemTotals()` làm nguồn sự thật duy nhất cho "tổng SL tháng theo mặt hàng". Logic ước tính ngày chưa nhập chuyển từ benchmark cố định (per benchmark DB) sang trung bình thực tế per combo (machineId-itemId). Cả ba nơi tính trùng (allocation engine, ScheduleComparisonDashboard, ActualProductionGrid) nay được thống nhất về 1 nguồn.

### Files created/modified

```
src/lib/kdsx/monthly-item-totals.ts                                   — Hàm getMonthlyItemTotals() với 3 mode: PLAN/ACTUAL/ACTUAL_PROJECTED
src/app/api/kdsx/item-totals/route.ts                                 — GET wrapper: ?factoryId&processId&yearMonth&mode
src/lib/allocation-engine-v2.ts                                       — Thêm optional processId param; khi có processId dùng getMonthlyItemTotals thay addProjectedProduction
src/components/kdsx/ScheduleComparisonDashboard.tsx                   — Thêm factoryId/processId props, fetch từ /api/kdsx/item-totals cho thByItem; line chart giữ nguyên
src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx — Thêm processId vào Schedule interface, truyền xuống dashboard
```

### Key business logic implemented

- `getMonthlyItemTotals(factoryId, processId, yearMonth, mode)`: scope theo công đoạn → ống và sợi con TÁCH BIỆT
- Mode ACTUAL_PROJECTED: ước tính ngày chưa nhập = `combo.totalKg / combo.days.size × remainingDays` — trung bình thực tế PER COMBO (không phải per item toàn cục, tránh bug lệch ngày giữa máy)
- `addProjectedProduction()` giữ lại trong engine (backward compat khi không có processId), nhưng không còn là path chính
- `ScheduleComparisonDashboard` fallback về local khi `processId` không có (backward compat với schedule cũ chưa backfill)

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/kdsx/item-totals | ?factoryId&processId&yearMonth&mode=PLAN\|ACTUAL\|ACTUAL_PROJECTED |

### Known limitations

- Schedule cũ (processId = null): dashboard fallback về local benchmark — sẽ fix sau khi backfill processId (SPEC 0 backfill)
- Allocation engine callers (revenue dashboard, contracts/progress) chưa truyền processId → vẫn dùng path cũ toàn factory
- ActualProductionGrid totals (bottom row, rowTotal) vẫn dùng benchmark local — đây là visual display, không ảnh hưởng reporting

---

## KDSX — SPEC B: Monthly Quota API (kdsx namespace) + UI Update

**Status:** ✅ Completed 2026-05-28

### What was built

New `kdsx`-namespace API for monthly production quota management, scoped by `factoryId+processId`. Updated the quota UI page to add process selector and mode toggle (Actual / Dự báo), with production totals sourced from `getMonthlyItemTotals`.

### Files created/modified

```
src/app/api/kdsx/monthly-quotas/route.ts              — GET (groups with totalProductionKg) + POST (upsert quotas scoped by factoryId+processId)
src/app/api/kdsx/monthly-quotas/copy-from-previous/route.ts — Copy quotas from previous month, scoped to processId
src/app/kdsx/monthly-quotas/page.tsx                  — Added processId selector, mode Segmented (ACTUAL/ACTUAL_PROJECTED), uses new kdsx API
src/lib/allocation-engine-v2.ts                       — waterfallAllocate now accepts optional processId; scopes quota lookup to factoryId+processId when provided
```

### Key business logic implemented

- `GET /api/kdsx/monthly-quotas` returns `groups[]` each with `totalProductionKg` from `getMonthlyItemTotals` (single source of truth)
- Quota lookup in waterfall allocation now scoped by `{ yearMonth, factoryId, processId }` when processId is provided — prevents cross-process quota mixing
- `remainderQty = totalProductionKg - totalFixedQuota` (production-based, not contract-remaining-based)
- Copy-from-previous filters source quotas by `factoryId+processId` — each process manages its own quota history
- UI mode "Dự báo" (ACTUAL_PROJECTED) shows estimated full-month production; "Thực tế" (ACTUAL) shows only recorded data

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/kdsx/monthly-quotas?factoryId=&processId=&yearMonth=&mode= | Groups with production totals and per-contract allocation |
| POST   | /api/kdsx/monthly-quotas | Upsert quotas (factoryId+processId+yearMonth scoped) |
| POST   | /api/kdsx/monthly-quotas/copy-from-previous | Copy quotas from previous month for same process |

### Known limitations

- Old v2 GET endpoint (`/api/v2/monthly-quotas`) still doesn't scope by processId — existing callers (revenue dashboard) unaffected but get cross-process quota if any
- Allocation engine callers that don't pass processId still use the old path (backward compat)
- Copy-from-previous returns 409 if target month already has quotas for that process — no merge/overwrite support

---

## KDSX — SPEC C: Kéo-thả Segment + DT-LN Kế hoạch + Dọn dẹp V1

**Status:** ✅ Completed 2026-05-28

### What was built

Three improvements to the production schedule detail page: (1) drag-to-resize segment edges using pointer events API (no library), (2) a 4th tab "💰 DT-LN kế hoạch" that shows projected P&L using PLAN-mode allocation from schedule segments, and (3) cleanup of dead v1 code (pages, API, sidebar links, schema comments).

### Files created/modified

```
src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx  — drag handles + PlanPnLTab + Tab 4
src/app/api/kdsx/production-schedule/[id]/plan-pnl/route.ts               — GET: PLAN allocation → P&L
src/lib/allocation-engine-v2.ts                                            — mode extended to "PLAN"; PLAN path reads getMonthlyItemTotals
src/components/AdminLayout.tsx                                             — removed kdsx.plans and kdsx.actuals entries from PAGE_CONFIG
prisma/schema.prisma                                                       — added /// @deprecated Prisma docstring to 5 dead models
```

Deleted:
```
src/app/kdsx/plans/page.tsx                                                — v1 plans list page (deleted)
src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx                       — v1 plan detail page (deleted)
src/app/kdsx/actuals/page.tsx                                              — v1 actuals list page (deleted)
src/app/kdsx/actuals/[factoryId]/[yearMonth]/page.tsx                     — v1 actual detail page (deleted)
src/app/api/kdsx/production-schedule/[id]/sync-to-plan/route.ts           — sync-to-plan API (deleted)
```

### Key business logic implemented

- **PLAN mode** in `runAllocationFromProduction`: when `mode === "PLAN" && processId`, calls `getMonthlyItemTotals(factoryId, processId, yearMonth, "PLAN")` which sums segment `(toDay - fromDay + 1) * kgPerDay` as production quantities. Waterfall allocation proceeds identically to PROJECTION mode.
- **effectiveMode**: PLAN mode maps to "PROJECTION" for date math inside allocation engine; `meta.mode` records effectiveMode not "PLAN" (since AllocationResult.meta.mode type is `"REAL" | "PROJECTION"`).
- **Drag-to-resize**: Pointer events with `setPointerCapture`. Drag state lives in `dragStateRef` (no re-render per pixel); `dragPreview` state only updates on day-boundary change (38px threshold). Overlap check runs before calling API; conflict reverts to original.
- **Lazy PnL fetch**: Tab 4 triggers `fetchPlanPnl()` only when first selected; subsequent visits skip re-fetch unless error.
- **Deprecated models**: `MonthlyPlan`, `PlanLineItem`, `MonthlyActual`, `ActualLineItem`, `MonthlySummarySnapshot` marked with `/// @deprecated` triple-slash Prisma docstring — tables/columns kept in DB for backward compat, not referenced in new code.

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/kdsx/production-schedule/[id]/plan-pnl | PLAN-mode allocation + calculateRevenuePnL → PnLResult |

### Known limitations

- Drag is desktop-only (pointer events on mobile tablets may partially work but not officially supported)
- PnL tab does not auto-refresh when segments are modified via drag — user must re-click the tab or navigate away and back
- Old v1 API routes under `/api/kdsx/plans` and `/api/kdsx/actuals` were NOT deleted (only the UI pages and sync-to-plan) — they still respond but are orphaned
- `calculateRevenuePnL` receives `"PROJECTION"` (not `"PLAN"`) as mode so date math for pro-rating uses days-in-month correctly

### Data notes

- No schema migration needed — no new tables or columns
- DB tables for `MonthlyPlan`, `MonthlyActual` etc. remain intact and unmodified

---

## KDSX — Gỡ bỏ kéo-thả co giãn segment

**Status:** ✅ Completed 2026-05-28

### What was built

Removed the drag-to-resize segment edge functionality that was added in SPEC C Phần 1. The feature was too difficult to use with a mouse. Segments now return to static display — click to open modal for edit/create.

### Files created/modified

```
src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx  — removed all drag code
```

### Key business logic implemented

- Removed: `dragStateRef`, `lastDragRangeRef`, `dragPreview` state
- Removed: `computeDragRange`, `getEffectiveSeg`, `hasOverlapPreview`, `handleHandlePointerDown`, `handleHandlePointerMove`, `handleHandlePointerUp`, `handleDragCancel`
- Removed: two drag handle `<div>` elements (left/right edges of segment cells)
- Removed: `useRef` import (no longer used)
- Removed: `_actionLoading` stub state (leftover from SPEC C)
- Restored: day-cell segment lookup via `machineSegs.find(s => day >= s.fromDay && day <= s.toDay)` (direct, no drag preview)
- The segment PUT route (`/api/kdsx/production-schedule/[id]/segments/[segmentId]`) was NOT deleted — modal edit still uses it

### Known limitations

- No drag resize. Users must click a segment cell to open the edit modal and change fromDay/toDay there.

---

## KDSX — Liên kết Công đoạn vào Kế hoạch SX

**Status:** ✅ Completed 2026-05-28

### What was built

Added `processId` linkage to production schedules: form tạo mới bắt buộc chọn công đoạn (lọc theo nhà máy), bảng danh sách có cột Công đoạn, trang chi tiết hiển thị tên công đoạn ở header và có Alert backfill nếu schedule cũ chưa có processId. Modal thêm segment chỉ hiện máy thuộc công đoạn của schedule.

### Files created/modified

```
src/app/api/kdsx/production-schedule/route.ts           — GET: include process; POST: require+save processId
src/app/api/kdsx/production-schedule/[id]/route.ts      — GET: include process; PUT: accept processId
src/app/kdsx/production-schedule/page.tsx               — Process state+fetch, Form.Item processId, column Công đoạn
src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx — Select import, process in header, backfill Alert, machine filter
```

### Key business logic implemented

- Form factory selector → onValuesChange resets processId → processId Select shows only processes of selected factory (filter client-side by `factoryId`)
- POST validates `processId` required (400 if missing)
- PUT accepts `processId` via spread pattern `...(processId !== undefined && { processId })`
- Detail page: `machines` prop to ScheduleSegmentModal filtered by `schedule.processId` when set
- Backfill Alert: inline `<Select>` calls `PUT /api/kdsx/production-schedule/{id}` with `{ processId }` then calls `fetchSchedule()`
- SQL backfill ran: `UPDATE production_schedules SET processId = (SELECT m.processId FROM schedule_segments JOIN machines ...)` — existing schedules now have processId

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/kdsx/production-schedule | Now includes `process: { id, name }` in each schedule |
| POST   | /api/kdsx/production-schedule | Now requires `processId` in body |
| GET    | /api/kdsx/production-schedule/[id] | Now includes `process: { id, name }` |
| PUT    | /api/kdsx/production-schedule/[id] | Now accepts `processId` to update linkage |

### Known limitations

- No processId filter on the list page (only factory filter exists) — could be added later
- If a schedule has segments from multiple processes (unusual), backfill picks the first segment's machine's processId

---

## SẢN XUẤT — Đổi/Thêm/Bỏ mặt hàng giữa ca + Cùng mặt hàng khác lô

**Status:** ✅ Completed 2026-05-30

### What was built

Cho phép 1 máy đánh ống chạy cùng 1 mặt hàng từ 2 lô khác nhau (case NM1 chạy giùm NM2 — sợi cùng tên nhưng chi phí khác theo lô gốc). Sửa Bug 1 (trang mobile-winding giấu mặt hàng chưa nhập log) bằng cách merge logs ∪ assignments. Tách rõ 3 thao tác giữa ca: **Sửa sai** (✏️) / **Đổi** (🔄, bao gói nhập sản lượng MH cũ) / **Thêm song song** (➕). Chống lưu trùng (máy+ngày+ca+sợi+lô) ở cả 3 tầng DB/API/UI.

### Files created/modified

```
prisma/schema.prisma                              — bỏ @@unique của ProductionLog [machineId,recordDate,shift,itemId] và MachineItemAssignment [machineId,itemId]
prisma/migrations/20260530000001_shift_item_change_multi_lot/migration.sql — DROP 2 unique cũ + tạo 4 partial unique index
src/app/api/production/daily-input/route.ts       — POST: thay upsert bằng findFirst (key 5 cột có lotId) + update/create
src/app/api/production/daily-status/route.ts       — productionLogs.include thêm lot { id, lotNumber }
src/app/api/machines/[id]/assignments/route.ts    — PUT: validate trùng (item,lot) + "cùng item phải có lô"; XÓA handler PATCH
src/app/machines/page.tsx                          — handleSaveAssignments validate client trùng (item,lot)
src/app/production/mobile-winding/page.tsx         — buildMachineItems merge logs∪assignments; 3 modal thao tác; tag lô + dòng "đã dừng giữa ca"
src/app/production/winding-input/page.tsx          — thay PATCH (đã bỏ) bằng PUT thay-thế-toàn-bộ khi đổi item
```

### Key business logic implemented

- **Partial unique index thay unique 4 cột**: `prod_log_unique_with_lot` (machineId,recordDate,shift,itemId,lotId WHERE lotId IS NOT NULL) + `prod_log_unique_no_lot` (4 cột WHERE lotId IS NULL). Tương tự cho `machine_item_assignments` (`machine_assignment_unique_with_lot` / `machine_assignment_unique_no_lot`). Cho phép cùng item khác lô, vẫn chống dup khi lotId NULL.
- **daily-input POST không còn dùng upsert** (composite key 4 cột đã bị xóa) → `findFirst` tách 2 nhánh lotId==null vs lotId=số, rồi update/create. P2002 trả message tiếng Việt rõ.
- **buildMachineItems merge**: duyệt assignments theo sortOrder (match log theo (itemId,lotId) → ô đã nhập, không match → slot rỗng), rồi log còn lại không khớp assignment nào → dòng `isExtra` (MH đã đổi/dừng giữa ca). Fix Bug 1: máy 4 assignment + 2 log vẫn hiện đủ 4 ô.
- **Modal 🔄 Đổi bao gói nhập sản lượng MH cũ**: LƯU sản lượng MH cũ (POST) TRƯỚC khi PUT assignment — vì công nhân chốt cuối ca nhìn sổ nhập đủ cả MH đã dừng. Có 2 option: "Đổi sang MH khác" (map assignment) / "Dừng hẳn" (filter bỏ dòng).
- **Dòng isExtra**: vẫn sửa được outputKg (công nhân nhớ sai), khóa item/lot, không có ✏️/🔄, có 🗑️ xóa log, hiển thị mờ (opacity 0.75).
- **Validation 3 tầng chống trùng (item,lot)**: DB partial index → P2002; API PUT assignments → 400; UI (machines + mobile-winding modal) → message.error chặn save. Quy tắc: nhiều dòng cùng item BẮT BUỘC mỗi dòng phải có lô cụ thể.
- **PATCH /assignments đã bị xóa** (phụ thuộc composite unique cũ). mobile-winding và winding-input chuyển sang PUT thay-thế-toàn-bộ.

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST   | /api/production/daily-input | Upsert log theo key 5 cột (machineId,recordDate,shift,itemId,lotId) |
| GET    | /api/production/daily-status | Trả machine kèm todayLogs (giờ có lot) + itemAssignments |
| PUT    | /api/machines/[id]/assignments | Thay-thế-toàn-bộ; validate trùng (item,lot) + cùng item phải có lô |
| ~~PATCH~~ | ~~/api/machines/[id]/assignments~~ | **Đã xóa** — dùng PUT thay thế |

### Known limitations

- Modal mobile-winding chưa hard-require lô theo process.code (NM1/NM2 ống); chỉ ép chọn lô khi phát hiện trùng item với dòng khác (validation conflict). Đủ để chống dup, nhưng máy ống vẫn có thể để trống lô nếu chỉ chạy 1 dòng/item.
- winding-input (desktop) khi đổi item dùng PUT theo originalItemId — nếu máy có 2 dòng cùng item khác lô thì PUT match dòng đầu tiên (desktop chưa hỗ trợ phân biệt lô khi đổi item như mobile).
- Shadow DB không build lại được (migration cũ 20260520000002 lỗi cột fce.factoryId) → migration mới tạo thủ công + `migrate deploy`, không qua `migrate dev`.


---

## SẢN XUẤT — Xóa chức năng "Cọc từ - Cọc đến" (fromSpindle / toSpindle)

**Status:** ✅ Completed 2026-05-30

### What was built

Xóa hoàn toàn 2 field `fromSpindle` / `toSpindle` của `MachineItemAssignment` khỏi schema, API và UI (dữ liệu không cần thiết). **Giữ nguyên** `Machine.spindleCount` (field khác, dùng cho công thức tính sản lượng FormulaType=3).

### Files created/modified

```
prisma/schema.prisma                              — xóa fromSpindle / toSpindle khỏi MachineItemAssignment
prisma/migrations/20260530000002_remove_spindle_range_from_assignment/migration.sql — DROP COLUMN IF EXISTS x2
src/app/api/machines/[id]/assignments/route.ts    — bỏ field khỏi type body + createMany data
src/types/production.ts                            — MachineAssignment bỏ fromSpindle / toSpindle
src/app/machines/page.tsx                          — AssignmentData interface + openMultiItemModal setFieldsValue
src/app/production/winding-input/page.tsx          — bỏ field khi build PUT assignment
src/app/production/mobile-winding/page.tsx         — interfaces, buildMachineItems, 3 modal, state vars, input "Cọc từ/đến"
src/app/kd-daily-input/page.tsx                    — interfaces, mapping, bỏ note auto-gen "Cọc X-Y", bỏ tag hiển thị cọc
```

### Key business logic implemented

- Migration `DROP COLUMN IF EXISTS "fromSpindle"/"toSpindle"` — an toàn với cả trường hợp cột đã không còn.
- `daily-input` POST không còn auto-generate note "Cọc X-Y" (logic này nằm ở kd-daily-input, đã xóa).
- Assignment PUT body type giờ chỉ còn `{ itemId, lotId?, sortOrder? }`.

### Known limitations

- Không có. `Machine.spindleCount` giữ nguyên, không ảnh hưởng công thức tính sản lượng.

### Data notes

- Cột `fromSpindle` / `toSpindle` trong `machine_item_assignments` đã bị DROP — dữ liệu cũ (nếu có) bị xóa vĩnh viễn, không backfill.


---

## KD-SX — Cơ cấu NVL theo mặt hàng theo tháng (ItemMonthlyMaterial)

**Status:** ✅ Completed 2026-06-01

### What was built

Cho phép kế toán chọn đúng 1 loại bông + 1 loại xơ cho từng mặt hàng theo từng tháng. Calculator query đúng `MaterialPrice` theo lựa chọn này thay vì lấy `cottonPrices[0]`/`pePrices[0]` mặc định. Trang quản lý có các tiện ích thao tác hàng loạt (bulk apply, đặt tất cả, copy tháng trước, highlight ô khác đa số).

### Files created/modified

```
prisma/schema.prisma                                                  — thêm model ItemMonthlyMaterial + 2 relation ngược trên MaterialType, 1 relation trên Item
prisma/migrations/20260601000001_add_item_monthly_material/           — tạo bảng item_monthly_materials (idempotent SQL, 3 FK)
src/app/api/kdsx/item-monthly-materials/route.ts                      — GET list theo tháng + POST upsert nhiều dòng
src/app/api/kdsx/item-monthly-materials/copy-from-previous/route.ts   — POST copy cấu hình tháng trước (giữ nguyên dòng đã có)
src/app/kdsx/item-monthly-materials/page.tsx                          — UI bảng cấu hình NVL theo tháng
src/lib/kdsx/calculator-v2.ts                                         — query giá NVL theo cơ cấu từng mặt hàng + materialWarnings
src/components/AdminLayout.tsx                                        — thêm link sidebar "Cơ cấu NVL theo tháng"
prisma/seed-page-registry.js                                         — đăng ký page kdsx.item-monthly-materials (sortOrder 179)
src/app/kdsx/revenue/page.tsx                                        — banner cảnh báo mặt hàng chưa cấu hình NVL tháng
```

### Key business logic implemented

- Mỗi mặt hàng/tháng dùng ĐÚNG 1 loại bông + 1 loại xơ (không trộn). Unique `(itemId, yearMonth)`.
- Calculator: với mỗi itemId, query `ItemMonthlyMaterial` (fallback tháng gần nhất `yearMonth <= current`), rồi query `MaterialPrice` đúng `materialTypeId` đã chọn. Nếu mặt hàng chưa cấu hình → fallback giá bông/xơ gần nhất bất kỳ (backward compat, không break).
- Công thức GIỮ NGUYÊN: CP Cotton = qty × cottonRate × (cottonPrice + warehouseFee) × cottonRatio × ER; CP PE = qty × peRate × pePrice × (1 - cottonRatio) × ER. Chỉ đổi NGUỒN giá.
- `RawMaterialRate` KHÔNG bị sửa — vẫn là nguồn cottonRatio/cottonRate/peRate.
- Mặt hàng `cottonRatio >= 1.0` (sợi thuần) → cột Loại xơ bị vô hiệu, bulk PE bỏ qua.
- Calculator trả `materialWarnings[]` khi mặt hàng chưa cấu hình hoặc đang fallback cấu hình tháng cũ → dashboard revenue hiện banner.

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/kdsx/item-monthly-materials?yearMonth=YYYY-MM | List tất cả mặt hàng + định mức hiệu lực + cấu hình NVL tháng |
| POST   | /api/kdsx/item-monthly-materials | Upsert nhiều dòng { yearMonth, items[] } |
| POST   | /api/kdsx/item-monthly-materials/copy-from-previous | Copy cấu hình tháng trước (chỉ điền ô trống) |

### Known limitations

- Category NVL chỉ có "COTTON" và "PE" (Modal/PE gộp chung dropdown "Loại xơ" qua category PE). Nếu sau này tách category "MODAL" cần sửa logic lọc dropdown.
- Migration tạo thủ công (idempotent) do shadow DB project từng lỗi — không dùng `prisma migrate dev`.

### Data notes

- Bảng `item_monthly_materials` mới, chưa có seed data — kế toán nhập đầu mỗi tháng hoặc dùng "Copy tháng trước".
- FK cotton/pe `ON DELETE SET NULL`; FK item `ON DELETE CASCADE`.

---

## NVL & DASHBOARD — Bổ sung category VISCOSE + hiển thị doanh thu theo VNĐ

**Status:** ✅ Completed 2026-06-01

### What was built

Thêm loại NVL thứ 3 là **VISCOSE** vào danh mục/giá NVL (trước chỉ COTTON & PE). VISCOSE là xơ nhân tạo, dùng CHUNG slot "xơ" (peMaterialTypeId) trong công thức tính chi phí — KHÔNG thêm thành phần thứ 3, không đổi công thức. Đồng thời đổi dashboard doanh thu hiển thị doanh thu/chi phí/lợi nhuận theo VNĐ đầy đủ thay vì rút gọn "tỷ".

### Files created/modified

```
src/app/kdsx/revenue/page.tsx                          — thêm fmtVnd(), bỏ fmtTy(); DT/CP/LN hiển thị VNĐ đầy đủ
src/app/kdsx/material-types/page.tsx                    — thêm category VISCOSE (tag xanh lá, thẻ thống kê, dropdown)
src/app/kdsx/material-prices/page.tsx                   — thêm VISCOSE (tag, thống kê, nhóm dropdown chọn loại NVL)
src/app/api/kdsx/material-types/route.ts                — validation category chấp nhận COTTON|PE|VISCOSE
src/app/kdsx/item-monthly-materials/page.tsx           — slot "xơ" gộp PE + VISCOSE
src/lib/kdsx/calculator-v2.ts                           — fallback giá xơ: category in [PE, VISCOSE]
src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts    — fallback giá xơ: category in [PE, VISCOSE]
scripts/seed-material-types.ts                          — VISCOSE seed về category "VISCOSE"
```

### Key business logic implemented

- **VISCOSE dùng chung slot xơ với PE** — công thức chi phí NVL vẫn là blend 2 thành phần (cottonRatio + (1−cottonRatio)); mặt hàng dùng Viscose gán vào `peMaterialTypeId`. Không có viscoseRatio riêng.
- Mọi chỗ fallback "giá xơ gần nhất" đổi từ `category="PE"` sang `category in ["PE","VISCOSE"]`.
- `material-prices/by-month`: VISCOSE tự rơi vào nhánh `else` → nhóm `pe` (xơ), không cần sửa.
- `category` là field String (không phải enum Prisma) → KHÔNG cần migration.

### Known limitations / Data notes

- Row "Xơ Viscose" cũ trong DB đang có `category="PE"` (từ seed cũ). Category KHÔNG sửa được qua UI (chỉ set khi tạo mới). Nếu muốn nó hiện đúng nhóm VISCOSE, cần update trực tiếp DB hoặc tạo lại bản ghi.
- Dashboard "Chi phí PE" thực chất là "chi phí xơ" (gồm cả Viscose) — tên field `totalPeCostVnd` giữ nguyên (strictly additive).

### Bổ sung 2026-06-01 (fix giá xơ theo đúng loại pha)

- Sợi 2 thành phần = cotton + xơ (PE **hoặc** Viscose), pha theo `cottonRatio` (VD 70/30, 65/35). Yêu cầu: pha với loại nào nhận đúng giá loại đó.
- Fix branch fallback "không có kế hoạch" trong `monthly-actuals/[id]/sync/route.ts`: trước đây lấy giá xơ đầu tiên theo category (có thể nhầm PE↔Viscose). Nay đọc `ItemMonthlyMaterial.peMaterialTypeId` của mặt hàng để lấy ĐÚNG giá loại xơ đã gán; chỉ fallback category-default khi mặt hàng chưa cấu hình NVL. Khớp với logic calculator-v2 (dashboard) và branch "có kế hoạch" (dùng `planItem.pePriceUsd`).

---

## KDSX — Phân bổ quota tháng: hiện cả HĐ đã hoàn thành

**Status:** ✅ Completed 2026-06-01

### What was built
Thêm checkbox "Hiển thị cả HĐ đã hoàn thành" trên trang phân bổ quota tháng. Mặc định KHÔNG tick (giữ hành vi cũ: ẩn HĐ `remainingTotal <= 0` vào mục read-only). Khi tick → các HĐ đã "đóng" (rót đầy theo cam kết tổng) hiện inline trong card mặt hàng và cho phép nhập lại quota tháng.

### Files created/modified
```
src/app/kdsx/monthly-quotas/page.tsx — thêm state showCompleted + checkbox; useMemo bucketing dựa theo showCompleted; đánh dấu tag "Đã hoàn thành" + text xám cho HĐ remainingTotal<=0; nới max InputNumber cho HĐ đã hoàn thành
```

### Key business logic implemented
- Trạng thái "COMPLETED" của HĐ là tính on-the-fly (`remainingTotal <= 0`), KHÔNG lưu DB. Filter ẩn/hiện nằm hoàn toàn ở frontend (`useMemo` bucketing), API `/api/kdsx/monthly-quotas` vẫn trả về đầy đủ HĐ của order `ACTIVE`.
- Khi `showCompleted=true`: HĐ hoàn thành được coi là "visible" → đưa vào card multi/single để nhập quota; không đẩy vào mục read-only "đã hoàn thành" (tránh trùng).
- Nới `max` của InputNumber FIXED: HĐ có `remainingTotal<=0` (max=0) trước đây không nhập được → đổi thành `remainingTotal > 0 ? remainingTotal : undefined`.
- KHÔNG động đến allocation-engine-v2 hay calculator. Sau khi lưu quota mới, Dashboard `/kdsx/revenue` tính lại on-the-fly → HĐ quay về ACTIVE và chỉ được rót đúng quota, phần dư chảy sang HĐ ưu tiên kế tiếp.

### Known limitations
- Validate "mỗi mặt hàng phải có đúng 1 HĐ Cuối (REMAINDER)" vẫn áp dụng cho group multi (kể cả khi có HĐ hoàn thành) — giữ nguyên thiết kế engine.

---

## KDSX — Định mức Tiêu hao NVL — Versioning (không UPDATE record cũ)

**Status:** ✅ Completed 2026-06-02

### What was built

Chuyển trang Định mức Tiêu hao NVL từ cơ chế UPDATE-trực-tiếp sang VERSIONING: khi định mức thực tế thay đổi, phiên bản cũ được đóng lại (effectiveTo = ngày mới - 1) và phiên bản mới được tạo, đảm bảo số liệu DT/LN các tháng đã qua không bị lệch.

### Files created/modified

```
src/app/api/kdsx/raw-material-rates/[id]/route.ts     — PUT thêm check: nếu đã có ProductionLog dùng → từ chối 409
src/app/api/kdsx/raw-material-rates/new-version/route.ts — POST mới: transaction đóng cũ + tạo phiên bản mới
src/app/kdsx/raw-material-rates/page.tsx              — UI: 2 nút (Phiên bản mới / Sửa lỗi), bảng hiển thị lịch sử per item, rowSpan gộp tên mặt hàng
```

### Key business logic implemented

- PUT /[id]: kiểm tra `productionLog.count` với itemId + range effectiveFrom/effectiveTo của rate đó. Nếu usedCount > 0 → 409, bắt user dùng new-version
- POST /new-version: transaction `$transaction([update cũ effectiveTo = newDate-1, create mới effectiveTo=null])`
- UI phân biệt 2 thao tác: "Phiên bản mới" (active records) vs "Sửa lỗi nhập liệu" (mọi record)
- Cột "Trạng thái": isActive = record có id trùng với activeRateIdByItem[itemId] (effectiveTo=null + effectiveFrom lớn nhất)
- rowSpan gộp cột Mặt hàng / Nhóm sợi cho các versions cùng item
- Historical rows tô màu mờ qua `.rate-history-row` CSS class

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/kdsx/raw-material-rates | Lấy tất cả rates |
| POST   | /api/kdsx/raw-material-rates | Tạo rate đầu tiên cho item mới |
| PUT    | /api/kdsx/raw-material-rates/[id] | Sửa lỗi nhập liệu (từ chối nếu đã có ProductionLog) |
| DELETE | /api/kdsx/raw-material-rates/[id] | Xóa (ADMIN only) |
| POST   | /api/kdsx/raw-material-rates/new-version | Tạo phiên bản mới, đóng phiên bản cũ |

### Known limitations

- Check "đã được áp dụng" chỉ dựa trên ProductionLog — nếu dùng SalesOrderLineItemActual mà không có ProductionLog thì có thể bypass
- `effectiveTo` của new-version luôn = null (không hạn chế ngày kết thúc); user muốn đặt ngày kết thúc phải dùng Sửa lỗi sau đó

---

## KDSX — Production Schedule: hiển thị màu nền mặt hàng trong ma trận sản lượng

**Status:** ✅ Completed 2026-06-07

### What was built

Điều chỉnh UI ma trận sản lượng trên trang chi tiết kế hoạch sản xuất: màu mặt hàng chỉ dùng để tô nền ô, còn chữ trong các ô/tên mặt hàng luôn hiển thị màu đen. Nền theo màu mặt hàng được tăng độ đậm để dễ nhận diện hơn so với bản cũ.

### Files created/modified

```
src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx — đổi getBg() đậm hơn; chữ tên mặt hàng, số kg và header item trong ma trận/so sánh dùng màu đen
```

### Key business logic implemented

- Không thay đổi nghiệp vụ, API, schema hay dữ liệu lưu màu `itemColors`.
- Color picker vẫn cập nhật `itemColors` như cũ, nhưng màu được dùng làm nền ô thay vì đổi màu chữ.
- Ô sản lượng có nền theo mặt hàng rõ hơn (`alpha 66`) và chữ đen để tăng độ đọc.

### API endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| N/A | N/A | Không có endpoint mới hoặc thay đổi API |

### Known limitations / not yet implemented

- Chưa thay đổi style ở các component con nhận `itemColors` như `ActualProductionGrid` hoặc `ScheduleComparisonDashboard`.

### Data notes

- Không có seed data, migration hay format dữ liệu mới.

---

## KDSX — Sales Orders: lọc hợp đồng theo số HĐ và tên mặt hàng

**Status:** ✅ Completed 2026-06-07

### What was built

Bổ sung bộ lọc trên trang `/kdsx/sales-orders` để lọc danh sách hợp đồng theo `orderNo` và theo tên mặt hàng thuộc các dòng `sales_order_items`. API danh sách hợp đồng nhận thêm query `orderNo` và `itemName`, trả về các `sales_orders` có số hợp đồng khớp hoặc có ít nhất một dòng hàng liên kết tới `items.name` khớp từ khóa.

### Files created/modified

```
src/app/api/kdsx/sales-orders/route.ts        — GET nhận query orderNo/itemName và filter bằng Prisma where + relation items.some.item.name
src/app/kdsx/sales-orders/page.tsx            — thêm 2 ô lọc số HĐ và tên mặt hàng, ghép query bằng URLSearchParams cùng filter nhà máy
tests/test-kdsx-sales-orders-filters.sh       — curl test cho GET /api/kdsx/sales-orders với orderNo/itemName/factoryId
```

### Key business logic implemented

- `orderNo` dùng `contains` không phân biệt hoa/thường để lọc trực tiếp bảng `sales_orders`.
- `itemName` dùng `items.some.item.name contains` để chỉ lấy hợp đồng có ít nhất một dòng `sales_order_items` liên kết mặt hàng khớp tên.
- Các filter mới có thể kết hợp với filter nhà máy hiện có (`factoryId`) và các query cũ của API.

### API endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /api/kdsx/sales-orders?orderNo=... | Lọc hợp đồng theo số hợp đồng |
| GET | /api/kdsx/sales-orders?itemName=... | Lọc hợp đồng theo tên mặt hàng trong sales_order_items |
| GET | /api/kdsx/sales-orders?factoryId=...&orderNo=...&itemName=... | Kết hợp lọc nhà máy, số HĐ và tên mặt hàng |

### Known limitations / not yet implemented

- Hai ô text filter gọi lại API khi giá trị thay đổi; chưa thêm debounce riêng.
- Placeholder mới dùng tiếng Việt không dấu để tránh lệch encoding trong file hiện tại.

### Data notes

- Không có schema, migration hay seed data mới.

---

## KDSX — Số dư đầu kỳ hợp đồng cho phân bổ quota tháng

**Status:** ✅ Completed 2026-06-08

### What was built

Bổ sung cơ chế số dư đầu kỳ cho từng dòng hợp đồng để tách dữ liệu quá khứ chuyển đổi khỏi logic phân bổ MonthlyQuota từ tháng bắt đầu áp dụng phần mềm. Trang `/kdsx/monthly-quotas` có thêm cột nhập “Đã tính trước kỳ”, giúp mở lại các HĐ từng bị allocation cũ rót đầy và cho tháng 6/2026 nhập quota giống Excel.

### Files created/modified

```
prisma/schema.prisma                                              — thêm model ContractOpeningBalance và relations tới SalesOrderItem/Factory/Process
prisma/migrations/20260608000001_add_contract_opening_balance/    — tạo bảng contract_opening_balances + unique/index
src/lib/kdsx/contract-opening-balance.ts                          — helper tính remainingTotal theo số dư đầu kỳ nếu có
src/lib/allocation-engine-v2.ts                                   — dùng ContractOpeningBalance làm điểm cắt khi tính remainingQty trong waterfall/quota
src/app/api/kdsx/monthly-quotas/route.ts                          — GET trả openingBalance; POST upsert openingBalances cùng quota
src/app/kdsx/monthly-quotas/page.tsx                              — thêm cột “Đã tính trước Txx” và lưu số dư đầu kỳ
tests/test-kdsx-monthly-quotas-opening-balance.sh                 — curl test cho quota + opening balance
```

### Key business logic implemented

- Nếu có `ContractOpeningBalance` cho `salesOrderItemId + factoryId + processId + openingYearMonth <= yearMonth`, hệ thống tính lũy kế trước tháng hiện tại bằng `producedBeforeKg + OrderAllocation từ kỳ mở sổ đến trước tháng hiện tại`.
- Nếu chưa có số dư đầu kỳ, logic cũ giữ nguyên: `remainingTotal = plannedQty - deliveredQty - OrderAllocation trước tháng hiện tại`.
- MonthlyQuota tháng 6 có thể nhập lại theo Excel: FIXED cho HĐ có số cụ thể, REMAINDER cho HĐ cuối nhận phần dư, không cần xóa SalesOrder/SalesOrderItem cũ.

### API endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /api/kdsx/monthly-quotas | Trả danh sách HĐ theo item, gồm openingBalance và remainingTotal đã tính theo điểm cắt nếu có |
| POST | /api/kdsx/monthly-quotas | Upsert MonthlyQuota và ContractOpeningBalance trong cùng request |

### Known limitations / not yet implemented

- Chưa có import tự động từ file Excel `KD-SX NM3.xlsx`; số dư đầu kỳ vẫn nhập thủ công trên UI.
- Dashboard `/api/v2/dashboard/revenue` chưa truyền `processId`, nên số dư đầu kỳ phát huy đầy đủ trên luồng phân bổ quota theo công đoạn trước; dashboard tổng factory cần mở rộng process scope nếu muốn dùng cùng điểm cắt.

### Data notes

- Bảng mới `contract_opening_balances` lưu `openingYearMonth` dạng `"YYYY-MM"` và `producedBeforeKg` kg.
- Migration chỉ tạo bảng/index mới, không xóa hoặc sửa dữ liệu hợp đồng/production/allocation cũ.

---

## PRODUCTION INPUT — Ghi ngược chi số NE về điều phối máy

**Status:** ✅ Completed 2026-06-09

### What was built

Khi người dùng sửa trường chi số NE trên trang `/production/daily-input-grid` rồi lưu sản lượng, hệ thống ghi ngược giá trị đó về `Machine.currentNE` để trang `/machines` và các lần nhập sau dùng cùng chi số mới. Logic này chạy tương tự ghi ngược mặt hàng hiện tại, chỉ áp dụng cho máy dùng công thức có NE (`formulaType` 3 hoặc 4).

### Files created/modified

```
src/app/production/daily-input-grid/page.tsx     — Theo dõi originalInputNE và gọi /api/machines/batch khi NE thay đổi
src/app/api/machines/batch/route.ts              — Cho phép POST cập nhật currentNE tùy chọn cùng hoặc không cùng itemId
tests/test-machines-batch-current-ne.sh          — Curl test cho cập nhật currentNE, itemId, validation và auth
```

### Key business logic implemented

- Row nhập sản lượng lưu thêm `originalInputNE` để chỉ ghi ngược khi user thực sự sửa NE.
- Chỉ primary row của máy thường và `formulaType` 3/4 mới cập nhật `Machine.currentNE`; sub-row đổi mặt hàng giữa ca không ghi đè chi số máy.
- `/api/machines/batch` vẫn giữ quyền cũ: update nhiều máy chỉ dành cho Admin/Manager, update 1 máy từ trang nhập sản lượng cho phép user đã đăng nhập.
- `currentNE` phải là số dương; payload thiếu cả `itemId` và `currentNE` bị trả 400.

### API endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | /api/machines/batch | Cập nhật `currentItemId` và/hoặc `currentNE` cho danh sách máy |
| POST | /api/production/daily-input | Lưu production log với `inputNE` của từng bản ghi sản lượng |

### Known limitations / not yet implemented

- Script test curl cần app đang chạy và cookie đăng nhập thật để kiểm tra happy path.
- Trang `/production/daily-input` và `/production/mobile-input` chưa được mở rộng trong thay đổi này; yêu cầu hiện tại chỉ xử lý `/production/daily-input-grid`.

### Data notes

- Không có schema, migration hay seed data mới.
---

## PRODUCTION / KDSX — Phan tach doanh thu danh ong theo nguon soi

**Status:** ✅ Completed 2026-06-17

### What was built

Them truc nguon soi cho may danh ong de log san luong moi snapshot `sourceProcessId` tu cau hinh may, sau do Revenue Dashboard v2 nhom san luong theo `sourceProcess.revenueFactoryId` thay vi chi dua vao factory dia ly cua may. UI `/machines` va `/production/winding-input` cho xem/doi nguon soi cua may danh ong, con log cu chua co source van fallback theo `machine.process.factoryId`.

### Files created/modified

```
prisma/schema.prisma                                      — them Process.revenueFactoryId, Machine.currentSourceProcessId, ProductionLog.sourceProcessId va relations/index
prisma/migrations/20260617000001_add_source_process_for_revenue/ — migration additive them 3 cot nullable, FK va index
src/app/api/processes/source-options/route.ts             — GET danh sach process co revenueFactoryId de chon lam nguon soi
src/app/api/machines/route.ts                             — GET include currentSourceProcess; POST nhan currentSourceProcessId neu co
src/app/api/machines/[id]/route.ts                        — PUT partial-update an toan va validate currentSourceProcessId phai co revenueFactoryId
src/app/api/production/daily-status/route.ts              — tra currentSourceProcess cho man winding-input
src/app/api/production/daily-input/route.ts               — khi create ProductionLog moi, snapshot sourceProcessId tu Machine.currentSourceProcessId
src/app/machines/page.tsx                                 — hien cot/form Nguon soi cho may revenue process
src/app/production/winding-input/page.tsx                 — tag doi nguon soi tai cho tren dong may danh ong
src/lib/allocation-engine-v2.ts                           — group san luong theo sourceProcess.revenueFactoryId, fallback log cu theo factory dia ly, them warning missing_source
src/lib/kdsx/calculator-v2.ts                             — propagate allocationWarnings sang PnLResult
src/app/kdsx/revenue/page.tsx                             — hien banner neu log danh ong trong ky thieu sourceProcessId
tests/test-source-process-revenue.sh                      — curl smoke test cho source-options, machine partial PUT va daily-input snapshot
```

### Key business logic implemented

- `Process.revenueFactoryId` la nha may doanh thu quy uoc cua nguon soi; `Machine.currentSourceProcessId` la cau hinh sticky tren may danh ong; `ProductionLog.sourceProcessId` la snapshot tai thoi diem tao log.
- Log moi tao qua `/api/production/daily-input` tu dong copy `Machine.currentSourceProcessId`; frontend khong gui `sourceProcessId`, va log cu khi update khong bi ghi de source.
- Revenue v2 tinh san luong theo `sourceProcess.revenueFactoryId`; neu `sourceProcessId = null` thi fallback theo `machine.process.factoryId` de bao cao lich su khong hong.
- `PUT /api/machines/[id]` chuyen sang merge-update theo field duoc gui, tranh viec doi rieng nguon soi lam mat cac field cau hinh may khac.
- Dashboard canh bao `missing_source` khi trong ky co log revenue process chua co `sourceProcessId`.

### API endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /api/processes/source-options | Lay danh sach process co `revenueFactoryId` de chon lam nguon soi |
| PUT | /api/machines/[id] | Cap nhat partial may, bao gom `currentSourceProcessId` |
| GET | /api/machines | Include `currentSourceProcess` cho danh sach may |
| GET | /api/production/daily-status | Include `currentSourceProcess` cho man nhap danh ong |
| POST | /api/production/daily-input | Tao/cap nhat log san luong; log moi snapshot `sourceProcessId` tu may |
| GET | /api/v2/dashboard/revenue | Ket qua PnL co them `allocationWarnings` khi thieu nguon soi |

### Known limitations / not yet implemented

- Chua tao UI rieng de cau hinh `Process.revenueFactoryId`; hien can cap nhat truc tiep DB hoac API/script rieng neu muon set G33/TQ/G37 hang loat.
- DB dev hien chi co process ro ten `Soi con G37`; chua thay process G33/TQ theo ten nen chua backfill duoc mapping G33+TQ -> NM1, G37 -> NM2 mot cach chac chan.
- Projection mode dem may theo `Machine.currentSourceProcessId`; neu may danh ong chua gan nguon thi van fallback theo factory dia ly.

### Data notes

- Migration da apply tren local dev bang `npx prisma migrate deploy`; khong xoa/rename field/table nao.
- Cac cot moi deu nullable de bao toan du lieu lich su: `processes.revenueFactoryId`, `machines.currentSourceProcessId`, `production_logs.sourceProcessId`.

---

## PRODUCTION / KDSX — Fix cau hinh dropdown nguon soi danh ong

**Status:** ✅ Completed 2026-06-17

### What was built

Bo sung data migration cau hinh `Process.revenueFactoryId` cho cac process nguon soi hien co de dropdown "Nguon soi" khong con hien No data. Seed moi cung duoc cap nhat de DB khoi tao moi co san mapping doanh thu cho nguon soi.

### Files created/modified

```
prisma/migrations/20260617000002_configure_source_process_revenue/ — data migration set revenueFactoryId cho Soi con NM1/NM2/G37
prisma/seed.ts                                                    — seed source processes voi revenueFactoryId mac dinh
BUSINESS_LOGIC_CONTEXT.md                                        — ghi nhan fix cau hinh nguon soi
```

### Key business logic implemented

- `Soi con NM1` duoc quy ve doanh thu `Nha may Soi 1`.
- `Soi con NM2` duoc quy ve doanh thu `Nha may Soi 1` theo rule TQ -> NM1 trong spec.
- `Soi con G37` duoc quy ve doanh thu `Nha may Soi 2`.
- Dropdown `/api/processes/source-options` tiep tuc chi tra cac process da co `revenueFactoryId`, giu backend validation chat che.

### API endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /api/processes/source-options | Lay danh sach process nguon soi da cau hinh revenueFactoryId |

### Known limitations / not yet implemented

- Chua doi ten process hien co thanh G33/TQ; mapping tam dung ten seed hien tai `Soi con NM1` va `Soi con NM2`.

### Data notes

- Migration da apply vao DB hien tai va tra ve 3 option: `Soi con NM1 -> Nha may Soi 1`, `Soi con NM2 -> Nha may Soi 1`, `Soi con G37 -> Nha may Soi 2`.

---

## PRODUCTION MOBILE — Chon nguon soi tren mobile winding

**Status:** ✅ Completed 2026-06-17

### What was built

Bo sung thao tac chon/doi nguon soi truc tiep tren giao dien mobile `/production/mobile-winding`, dung cung logic voi desktop `/production/winding-input`. Nguoi nhap bam chip nguon soi duoi ten may, chon source process trong modal, sau do backend cap nhat `Machine.currentSourceProcessId` de cac log moi snapshot `sourceProcessId`.

### Files created/modified

```
src/app/production/mobile-winding/page.tsx — them source options, modal chon nguon soi va PUT /api/machines/[id]
BUSINESS_LOGIC_CONTEXT.md                  — ghi nhan mobile winding source selector
```

### Key business logic implemented

- Mobile winding chi doi cau hinh `Machine.currentSourceProcessId`; frontend khong gui `sourceProcessId` khi luu san luong.
- Log moi van do `/api/production/daily-input` snapshot source tu machine, giong desktop winding-input.
- Sau khi doi nguon soi, mobile reload lai danh sach may cua ngay/ca hien tai va giu may dang xem.
- Log da luu truoc do khong bi backfill hoac ghi de nguon soi.

### API endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /api/processes/source-options | Lay danh sach source process da cau hinh revenueFactoryId |
| PUT | /api/machines/[id] | Cap nhat currentSourceProcessId cho may danh ong |
| POST | /api/production/daily-input | Luu san luong; log moi snapshot sourceProcessId tu machine |

### Known limitations / not yet implemented

- Chua them offline/mobile cache cho danh sach source options; trang fetch truc tiep tu API khi user da dang nhap.

### Data notes

- Mobile dung lai mapping source process hien co trong DB: `Soi con NM1`, `Soi con NM2`, `Soi con G37` va revenue factory tu `Process.revenueFactoryId`.
