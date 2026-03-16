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

- **File:** `src/app/production/quick-input/page.tsx` *(trang cũ, vẫn còn hoạt động)*
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

| Route | Methods | Mô tả |
|-------|---------|-------|
| `/api/production/stop-categories` | GET, POST | Lấy danh sách / Tạo mới (Admin) |
| `/api/production/stop-categories/[id]` | PUT, DELETE | Sửa / Xóa (Admin, isDefault không xóa được) |
| `/api/production/machine-stops` | GET, POST | Lịch sử (phân trang, nhiều filter) / Tạo mới |
| `/api/production/machine-stops/[id]` | PUT, DELETE | Cập nhật (set endTime khi máy chạy lại) / Xóa |
| `/api/production/machine-stops/stats` | GET | Thống kê tổng hợp (count, downtime, top máy, by category) |

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

| Giá trị | Nhãn | Màu |
|---------|------|-----|
| `low` | Nhẹ | Xanh |
| `medium` | Trung bình | Cam |
| `high` | Nặng | Đỏ |
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
- Mặt hàng: chứa `mat hang`, `hang`, `item`, `san pham` *(optional)*
- Sản lượng: chứa `san luong`, `output`, `sl`, `quantity`

**Parse ngày** hỗ trợ 3 dạng: Excel serial number, `DD/MM/YYYY`, `YYYY-MM-DD`, `DD-MM-YYYY`.

**Xác định action:** Sau khi mapping đầy đủ, query `ProductionLog.findUnique` theo unique key → `INSERT` nếu chưa có, `UPDATE` nếu đã tồn tại.

**Row status:** `READY` | `NO_DATE` | `NO_SHIFT` | `NO_MACHINE` | `NO_ITEM`.

### 10.4. API Routes

| Route | Methods | Mô tả |
|-------|---------|-------|
| `/api/iot/sources` | GET, POST | Danh sách sources / Tạo mới |
| `/api/iot/sources/[id]` | PUT, DELETE | Sửa / Xóa (block nếu đã có import log) |
| `/api/iot/mapping` | GET, POST, DELETE | Xem mapping / Bulk upsert / Xóa từng entry |
| `/api/iot/parse-excel` | POST | Phân tích file Excel, trả về rows + unmapped lists |
| `/api/iot/import` | POST | Ghi vào ProductionLog, tạo IotImportLog |
| `/api/iot/import-logs` | GET | Lịch sử import (kèm tên người thực hiện) |

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

_Lưu ý cho AI: Khi nhận được file này, hãy đóng vai trò là Senior Backend/Software Architect, chỉ phát triển tính năng mới dựa trên nền tảng kiến trúc đã có, không thiết kế lại hệ thống._

---
_Cập nhật lần cuối: 2026-03-15 — Thêm Module 6: Import IoT Excel (IotSource, mapping, wizard 4 bước)_
