# TASK: Xây dựng trang UI Quản lý Định mức Tiêu hao NVL

## Bối cảnh

Module KD-SX đã có API backend CRUD cho `RawMaterialRate` (hoạt động đúng), nhưng **CHƯA CÓ trang UI** để nhập/sửa/xem định mức. Hậu quả: nếu bảng `raw_material_rates` trống, `calculateLineItem()` sẽ lấy `cottonRate = 0` → chi phí NVL tính ra = 0 → lợi nhuận kế hoạch sai hoàn toàn.

## Yêu cầu tạo mới

### 1. File mới: `src/app/kdsx/raw-material-rates/page.tsx`

**Stack**: Next.js App Router ("use client"), Ant Design, dayjs, fetch API.

**Chức năng:**

- Bảng danh sách tất cả định mức hiện có (Table Ant Design)
- Nút "Thêm định mức" → Modal form tạo mới
- Nút Sửa/Xóa từng dòng
- Lọc theo nhóm sợi (yarnCategory): COCD / COCM / CVCM / CRC / Tất cả
- Tìm kiếm theo tên mặt hàng
- Hiển thị cảnh báo mặt hàng chưa có định mức (Alert vàng)
- 4 card thống kê ở đầu trang: mỗi nhóm sợi hiển thị "đã cấu hình / tổng" + Progress bar

**Các cột trong bảng:**

| Cột          | Source                 | Format                                                        |
| ------------ | ---------------------- | ------------------------------------------------------------- |
| Mặt hàng     | rate.item.name         | Text, bold                                                    |
| Nhóm sợi     | rate.item.yarnCategory | Tag màu: COCD=blue, COCM=green, CVCM=orange, CRC=purple       |
| ĐM Cotton    | rate.cottonRate        | Number, 3 decimals. VD: 1.120                                 |
| ĐM PE/Benma  | rate.peRate            | Number, 2 decimals. Chỉ hiển thị nếu CVCM, còn lại hiện "—"   |
| Phế thu hồi  | rate.wasteRecoveryRate | Hiển thị dạng %. VD: 0.07 → "7%", 0.28 → "28%"                |
| CP Bán hàng  | rate.sellingCostRate   | Hiển thị dạng %. VD: 0.08 → "8%"                              |
| CP GC xe đôi | rate.gcDoubleTwistRate | Number, 2 decimals. Chỉ hiển thị nếu yarnPly ≥ 2, còn lại "—" |
| Hiệu lực từ  | rate.effectiveFrom     | Date format DD/MM/YYYY                                        |
| Đến          | rate.effectiveTo       | Date hoặc "Không thời hạn" (nếu null)                         |
| Thao tác     | —                      | Nút Sửa + Popconfirm Xóa                                      |

**Sort mặc định:** nhóm sợi (COCD → COCM → CVCM → CRC) rồi theo yarnCount tăng dần.

**Modal Form tạo/sửa:**

- Select mặt hàng (load từ `/api/items?all=true`). Khi tạo mới: chỉ hiện mặt hàng CHƯA CÓ định mức. Khi sửa: disabled.
- InputNumber "Định mức Cotton" — bắt buộc, step=0.001, placeholder="VD: 1.12"
- InputNumber "Định mức PE/Benma" — chỉ enable khi item.yarnCategory === "CVCM", step=0.01
- InputNumber "Hệ số Phế thu hồi" — bắt buộc, step=0.01, min=0, max=1, placeholder="VD: 0.07"
- InputNumber "Hệ số CP Bán hàng" — bắt buộc, step=0.01, min=0, max=1, placeholder="VD: 0.08"
- InputNumber "CP GC xe đôi (USD/kg)" — chỉ enable khi item.yarnPly ≥ 2, step=0.01
- DatePicker "Hiệu lực từ" — bắt buộc, mặc định = hôm nay
- DatePicker "Hiệu lực đến" — optional, để trống = không thời hạn

**Logic form thông minh:**

- Khi chọn mặt hàng → tự động detect yarnCategory và yarnPly từ item
- Nếu KHÔNG phải CVCM → disable + clear trường PE
- Nếu KHÔNG phải sợi xe đôi (yarnPly < 2) → disable + clear trường GC xe đôi
- Hiện preview: "= X%" bên cạnh trường nhập tỷ lệ (0.07 → "= 7%")

### 2. File sửa: `src/components/AdminLayout.tsx`

Thêm menu item vào nhóm **"KH Kinh doanh - SX"** (SubMenu kdsx):

```tsx
// Thêm sau menu item "Khách hàng" hoặc cuối nhóm KD-SX
{
  key: '/kdsx/raw-material-rates',
  icon: <ExperimentOutlined />,
  label: 'Định mức NVL',
}
```

Điều kiện hiển thị: `canViewModule('kdsx')` — giống các menu khác trong nhóm KD-SX.

### 3. KHÔNG cần sửa API — Các endpoint đã có sẵn

| Method | Path                                | Mô tả                            |
| ------ | ----------------------------------- | -------------------------------- |
| GET    | `/api/kdsx/raw-material-rates`      | Lấy danh sách, include item info |
| POST   | `/api/kdsx/raw-material-rates`      | Tạo mới                          |
| GET    | `/api/kdsx/raw-material-rates/[id]` | Chi tiết                         |
| PUT    | `/api/kdsx/raw-material-rates/[id]` | Cập nhật                         |
| DELETE | `/api/kdsx/raw-material-rates/[id]` | Xóa                              |
| GET    | `/api/items?all=true`               | Lấy danh sách mặt hàng (đã có)   |

**Payload POST/PUT** (dự kiến theo Prisma model):

```json
{
  "itemId": 7,
  "cottonRate": 1.12,
  "peRate": null,
  "wasteRecoveryRate": 0.07,
  "sellingCostRate": 0.08,
  "gcDoubleTwistRate": null,
  "effectiveFrom": "2026-01-01",
  "effectiveTo": null
}
```

**Response GET list** (dự kiến):

```json
[
  {
    "id": 1,
    "itemId": 7,
    "cottonRate": 1.12,
    "peRate": null,
    "wasteRecoveryRate": 0.07,
    "sellingCostRate": 0.08,
    "gcDoubleTwistRate": null,
    "effectiveFrom": "2026-01-01T00:00:00.000Z",
    "effectiveTo": null,
    "item": {
      "id": 7,
      "name": "40/1 COCD",
      "yarnCategory": "COCD",
      "yarnCount": "40",
      "yarnPly": 1
    }
  }
]
```

> **LƯU Ý QUAN TRỌNG:** Trước khi code, hãy mở file `src/app/api/kdsx/raw-material-rates/route.ts` để xác nhận chính xác field names và response format. Nếu API GET chưa include `item` relation, cần thêm `include: { item: true }` vào Prisma query.

### 4. Dữ liệu tham khảo từ file Excel gốc (NM3 T4/2026)

Bảng này dùng để hiển thị ở cuối trang như panel tham khảo (optional):

| Nhóm            | Cotton (tp) | Cotton (đx) | Phế | Benma |
| --------------- | ----------- | ----------- | --- | ----- |
| 16, 20 COCD     | 1.111       | —           | 7%  | —     |
| 26 COCD         | 1.12        | —           | 7%  | —     |
| 30 COCD         | 1.12        | 1.13        | 7%  | —     |
| 40 COCD         | 1.12        | 1.13        | 7%  | —     |
| 20 COCM PVC     | 1.35        | —           | 28% | —     |
| 30 COCM         | 1.33        | 1.34        | 28% | —     |
| 40 COCM         | 1.33        | 1.34        | 28% | —     |
| 30, 32, 40 CVCM | 1.33        | —           | 18% | 1.02  |
| 32 CRC          | 1.35        | —           | —   | —     |

CP Bán hàng (sellingCostRate) theo Excel:

- COCD chải kỹ: 0.08 ~ 0.10 (30CD=0.08~0.10, 40CD=0.08, 16CD=0.10, 20CD=0.10)
- COCD xe đôi 20/2: 0.14 ~ 0.25
- COCM chải thô: 0.08 ~ 0.16
- CVCM: 0.14
- Giá trị khác nhau theo từng HĐ, nhưng hệ số mặc định nên lấy từ bảng trên

CP GC xe đôi (gcDoubleTwistRate) theo Excel:

- 20/2 COCD: 0.30 USD/kg
- 30/2 COCD, 40/2 COCD: 0.45 USD/kg
- 30/2 COCM: 0.35 USD/kg
- 40/2 COCM: 0.45 USD/kg

### 5. Seed data (optional nhưng recommended)

Nếu bảng `raw_material_rates` đang trống, sau khi build UI xong nên seed dữ liệu cơ bản. Có thể tạo script `prisma/seed-rates.ts` hoặc nhập thủ công qua UI mới.

## ⚠️ QUAN TRỌNG: Kiểm tra tích hợp backend TRƯỚC KHI build UI

Trước khi xây UI, phải xác nhận rằng `calculateLineItem()` thực sự đọc từ bảng `RawMaterialRate`. Nếu không thì dù nhập định mức qua UI vẫn vô nghĩa.

### Bước kiểm tra (PHẢI LÀM TRƯỚC):

**Bước 1:** Mở `src/lib/kdsx/calculator.ts`, xem signature của `calculateLineItem()`:

- Nếu hàm nhận tham số như `cottonRate`, `peRate`, `wasteRecoveryRate`, `sellingCostRate`, `gcDoubleTwistRate` trực tiếp → nghĩa là caller phải truyền vào, hàm KHÔNG tự query DB
- Nếu hàm nhận `itemId` và bên trong có `prisma.rawMaterialRate.findFirst(...)` → OK, đã tích hợp

**Bước 2:** Mở `src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts`, xem handler POST:

- Tìm xem có đoạn nào gọi `prisma.rawMaterialRate.findFirst()` hoặc import `RawMaterialRate` không
- Nếu KHÔNG CÓ → nghĩa là route đang nhận rates từ request body (frontend truyền thẳng) → bảng `RawMaterialRate` bị bỏ qua hoàn toàn

### Nếu phát hiện chưa tích hợp — Cách fix:

Sửa handler POST trong `line-items/route.ts` để **tự động tra định mức** từ `RawMaterialRate` thay vì nhận từ request body:

```typescript
// THÊM vào handler POST, SAU khi parse body lấy được itemId
const planDate = plan.yearMonth + "-01"; // hoặc lấy effectiveFrom phù hợp

const rate = await prisma.rawMaterialRate.findFirst({
  where: {
    itemId: body.itemId,
    effectiveFrom: { lte: new Date(planDate) },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(planDate) } }],
  },
  orderBy: { effectiveFrom: "desc" },
});

if (!rate) {
  return NextResponse.json(
    {
      error: `Chưa có định mức tiêu hao cho mặt hàng này. Vui lòng vào "Định mức NVL" để cấu hình.`,
    },
    { status: 400 },
  );
}

// Truyền rates vào calculateLineItem
const lineData = calculateLineItem({
  qty: body.qty,
  unitPriceUsd: body.unitPriceUsd,
  cottonRate: rate.cottonRate ?? 0,
  peRate: rate.peRate ?? 0,
  wasteRecoveryRate: rate.wasteRecoveryRate ?? 0,
  sellingCostRate: rate.sellingCostRate ?? 0,
  gcDoubleTwistRate: rate.gcDoubleTwistRate ?? 0,
  // ... các params khác từ MonthlyInputParam (tỷ giá, giá bông...)
});
```

**Tương tự cho handler PUT** (sửa line item) — cũng phải tra lại `RawMaterialRate` nếu `itemId` thay đổi.

**Tương tự cho `monthly-actuals/[id]/sync/route.ts`** — khi sync thực hiện tháng, cũng phải dùng rates từ DB.

### Kiểm tra tương tự cho các fields mới

Bảng `RawMaterialRate` trong Prisma schema hiện tại có thể CHƯA CÓ các fields:

- `sellingCostRate` (hệ số CP bán hàng)
- `gcDoubleTwistRate` (CP GC xe đôi)

Mở `prisma/schema.prisma`, tìm model `RawMaterialRate` và xác nhận. Nếu chưa có, cần thêm migration:

```prisma
model RawMaterialRate {
  id                  Int       @id @default(autoincrement())
  itemId              Int
  cottonRate          Float?    // Định mức tiêu hao cotton (kg NL / kg TP)
  peRate              Float?    // Định mức tiêu hao PE/Benma (chỉ CVCM)
  wasteRecoveryRate   Float?    // Hệ số phế thu hồi (0.07 = 7%)
  sellingCostRate     Float?    // Hệ số CP bán hàng (0.08 = 8%)     ← KIỂM TRA CÓ CHƯA
  gcDoubleTwistRate   Float?    // CP GC xe đôi USD/kg (chỉ sợi /2)  ← KIỂM TRA CÓ CHƯA
  effectiveFrom       DateTime
  effectiveTo         DateTime?

  item                Item      @relation(fields: [itemId], references: [id])

  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  @@map("raw_material_rates")
}
```

Nếu thiếu fields → chạy: `npx prisma migrate dev --name add_selling_gc_rates_to_raw_material_rate`

## Lưu ý kỹ thuật

1. **Strictly additive** — không sửa model/field cũ, chỉ thêm trang UI mới
2. **Phân quyền**: Trang này chỉ dành cho ADMIN + department ACCOUNTING/SALES/MANAGEMENT (hoặc có extraModules chứa 'kdsx'). Dùng `canAccessKdsx(session)` từ `src/lib/permissions.ts`
3. **Pattern code**: Tham khảo `src/app/kdsx/customers/page.tsx` — cùng pattern CRUD với Ant Design Table + Modal Form
4. **effectiveFrom/effectiveTo**: Lưu dạng Date (ISO string), UI dùng DatePicker của Ant Design + dayjs
5. **Unique constraint**: Mỗi itemId chỉ nên có 1 bản ghi active (effectiveTo = null). Khi tạo mới cho item đã có → cảnh báo "Mặt hàng này đã có định mức. Bạn có muốn tạo phiên bản mới không?"
