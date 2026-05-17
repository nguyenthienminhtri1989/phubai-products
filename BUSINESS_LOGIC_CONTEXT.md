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
- Helpers: `getColor()`, `getBg()` (`+33` = alpha 20%), `getBorder()` (`+AA` = alpha 67%)
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
getBg(itemId)     → getColor(itemId) + "33"  // 20% opacity
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
