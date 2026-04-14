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

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | /api/kdsx/customers | Danh sách / tạo khách hàng |
| GET/PUT/DELETE | /api/kdsx/customers/[id] | Sửa / xóa khách hàng |
| GET/POST | /api/kdsx/sales-orders | Danh sách / tạo đơn hàng |
| GET/PUT/DELETE | /api/kdsx/sales-orders/[id] | Sửa / xóa đơn hàng |
| GET/POST | /api/kdsx/input-params | Thông số tháng (giá NVL, tỷ giá) |
| GET/POST | /api/kdsx/raw-material-rates | Định mức tiêu hao NVL |
| GET/PUT/DELETE | /api/kdsx/raw-material-rates/[id] | Sửa / xóa định mức |
| GET/POST | /api/kdsx/monthly-plans | Danh sách / tạo kế hoạch tháng |
| GET/PUT/DELETE | /api/kdsx/monthly-plans/[id] | Chi tiết / sửa / xóa kế hoạch |
| GET/POST | /api/kdsx/monthly-plans/[id]/line-items | Dòng sợi trong kế hoạch |
| PUT/DELETE | /api/kdsx/monthly-plans/[id]/line-items/[lineItemId] | Sửa / xóa dòng sợi |
| GET/POST | /api/kdsx/monthly-plans/[id]/fixed-costs | Chi phí cố định kế hoạch |
| POST | /api/kdsx/monthly-plans/[id]/submit | DRAFT → SUBMITTED |
| POST | /api/kdsx/monthly-plans/[id]/approve | SUBMITTED → APPROVED |
| POST | /api/kdsx/monthly-plans/[id]/revert | SUBMITTED → DRAFT |
| POST | /api/kdsx/monthly-plans/[id]/unapprove | APPROVED → SUBMITTED |
| GET/POST | /api/kdsx/monthly-actuals | Danh sách / tạo thực hiện tháng |
| GET/PUT/DELETE | /api/kdsx/monthly-actuals/[id] | Chi tiết / sửa / xóa thực hiện |
| GET/POST | /api/kdsx/monthly-actuals/[id]/fixed-costs | Chi phí cố định thực hiện |
| POST | /api/kdsx/monthly-actuals/[id]/sync | Sync sản lượng từ ProductionLog |
| GET | /api/kdsx/summary | Dashboard tổng hợp 3 nhà máy |

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

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | /api/productivity-benchmark/versions | Danh sách / tạo phiên bản |
| GET/PUT/DELETE | /api/productivity-benchmark/versions/[id] | Chi tiết / sửa / xóa phiên bản |
| POST | /api/productivity-benchmark/versions/[id]/activate | Kích hoạt phiên bản |
| POST | /api/productivity-benchmark/versions/[id]/clone | Nhân bản phiên bản |
| GET/POST | /api/productivity-benchmark/benchmarks | Danh sách / tạo định mức |
| PUT/DELETE | /api/productivity-benchmark/benchmarks/[id] | Sửa / xóa định mức |
| POST | /api/productivity-benchmark/benchmarks/bulk | Nhập nhiều định mức cùng lúc |
| GET | /api/productivity-benchmark/capacity | Công suất thiết kế tổng hợp |
| GET | /api/productivity-benchmark/comparison | So sánh NS thực tế vs lý thuyết |

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

| Method | Path | Description |
|--------|------|-------------|
| (internal) | `src/lib/allocation-engine.ts` | `runAllocation(factoryId, date)` — tự gọi sau mỗi POST daily-input |
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

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/sales-orders | Danh sách HĐ (filter: factoryId, status, month, customerId) |
| POST | /api/sales-orders | Tạo HĐ mới |
| GET | /api/sales-orders/[id] | Chi tiết HĐ + remainingQty/progressPct/estimatedDoneDate per item |
| PUT | /api/sales-orders/[id] | Sửa deliveryDate/startDate/note (chỉ ACTIVE/OVERDUE) |
| DELETE | /api/sales-orders/[id] | Xóa HĐ (chỉ Admin, chỉ ACTIVE) |
| POST | /api/sales-orders/[id]/complete | Đánh dấu DONE thủ công |
| POST | /api/sales-orders/[id]/cancel | Hủy HĐ (body: { reason }) |
| POST | /api/sales-orders/recalculate | Tính lại toàn bộ phân bổ (Admin only) |
| GET | /api/sales-orders/progress | Tiến độ tổng hợp + isAtRisk (filter: factoryId, status, month) |

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

| Method | Path | Description |
|--------|------|-------------|
| (internal) | `src/lib/allocation-engine.ts` | `runAllocation(factoryId, date)` |
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

| Method | Path                                          | Description                              |
| ------ | --------------------------------------------- | ---------------------------------------- |
| GET    | /api/kdsx/sales-orders                        | List with status filter + progress fields |
| GET    | /api/kdsx/sales-orders/[id]                   | Detail with allocations + per-item progress |
| PATCH  | /api/kdsx/sales-orders/[id]/status            | Update status (ACTIVE/DONE/CANCELLED)    |
| POST   | /api/kdsx/sales-orders/recalculate            | Recalculate allocation (Admin only)      |
| GET    | /api/kdsx/sales-orders/progress               | Progress summary list with isAtRisk      |

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

| Method | Path                                          | Used by                      |
| ------ | --------------------------------------------- | ---------------------------- |
| GET    | /api/kdsx/sales-orders                        | List page                    |
| GET    | /api/kdsx/sales-orders/[id]                   | Detail page + OrderProgressTab |
| PUT    | /api/kdsx/sales-orders/[id]                   | Edit form (now + deliveryDate) |
| PATCH  | /api/kdsx/sales-orders/[id]/status            | Complete/Cancel buttons      |
| POST   | /api/kdsx/sales-orders/recalculate            | Recalculate button           |
| GET    | /api/kdsx/sales-orders/progress               | Dashboard card grid          |

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

| Method | Path                                      | Description                          |
| ------ | ----------------------------------------- | ------------------------------------ |
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

| Method | Path | Description |
|--------|------|-------------|
| PUT | /api/users | Thêm department/extraModules vào payload |
| POST | /api/users | Thêm department/extraModules vào payload |

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

| Method | Path                       | Description                     |
| ------ | -------------------------- | ------------------------------- |
| GET    | /api/kdsx/customers        | Lấy danh sách kèm _count orders |
| POST   | /api/kdsx/customers        | Tạo khách hàng mới (8 trường)   |
| PUT    | /api/kdsx/customers/[id]   | Cập nhật khách hàng (8 trường)  |
| DELETE | /api/kdsx/customers/[id]   | Xóa (chỉ ADMIN)                 |

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

| | L? thuy?t (THEORY) | Th?c nghi?m (EMPIRICAL) |
|---|---|---|
| Ngu?n g?c | T�nh t? c�ng th?c v?t l? | Ng�?i d�ng t? nh?p t? kinh nghi?m |
| ��n v? l�u | kg/ca/m�y (stdOutputPerShift) | kg/ng�y/lo?i m�y (empiricalOutputPerDay) |
| Th�ng s? c?n nh?p | Nm, Ne, twist, speed, hi?u su?t, s? c?c | Ch? c?n: lo?i m�y + m?t h�ng + kg/ng�y |
| D�ng �? | ��nh gi� m�y c� ��ng thi?t k? kh�ng | L?p k? ho?ch v� ��m ph�n v?i kh�ch |

### Schema thay �?i

`prisma
enum BenchmarkType {
  THEORY    // �?nh m?c l? thuy?t
  EMPIRICAL // �?nh m?c th?c nghi?m
}

model ProductivityBenchmark {
  // ... fields c? gi? nguy�n ...
  benchmarkType         BenchmarkType @default(THEORY)
  empiricalOutputPerDay Float?        // kg/ng�y � ch? d�ng khi EMPIRICAL
  empiricalNote         String?       // ngu?n s? li?u
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

| API | Param m?i | Gi� tr? |
|---|---|---|
| GET /capacity | enchmarkType | THEORY (default) ho?c EMPIRICAL |
| GET /comparison | enchmarkType | THEORY (default) ho?c EMPIRICAL |
| POST /benchmarks | enchmarkType | THEORY (default) ho?c EMPIRICAL |
| POST /benchmarks | empiricalOutputPerDay | Float (kg/ng�y, b?t bu?c n?u EMPIRICAL) |
| POST /benchmarks | empiricalNote | String (optional) |

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

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/iot/parse-excel | Dispatcher: đọc fileFormat của source, gọi sub-parser |
| POST | /api/iot/sources | Nhận thêm fileFormat |
| PUT | /api/iot/sources/:id | Nhận thêm fileFormat |

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

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/machines/batch | Cập nhật điều phối 1 máy (machineIds.length=1, operator được phép) |
| GET | /api/items?all=true | Tải danh sách mặt hàng cho dropdown |

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

| Method | Path | Description |
|--------|------|-------------|
| DELETE | /api/production/daily-input?id=X | Xóa ProductionLog theo id |

### Known limitations

- Không xóa được log có `status = APPROVED` (không có trường này trong ProductionLog — không áp dụng)
- Sau khi xóa, `machine.currentItemId` không được rollback (còn giữ item của ca bị xóa)
- Chưa có audit log khi xóa (ai xóa, khi nào)

### Data notes

- `ProductionLog.id` là auto-increment int, unique — đủ để identify chính xác bản ghi cần xóa
- Xóa log không ảnh hưởng đến bảng `KdDailyInput` (hai bảng độc lập)
