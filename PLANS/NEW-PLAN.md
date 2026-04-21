# TASK: Danh mục Nguyên vật liệu + Giá theo tháng + Sửa công thức tính CP NVL

## Tổng quan thiết kế

### Vấn đề hiện tại

- Giá bông hard-code trong MonthlyInputParam (cottonUsaPrice, cottonBrazilPrice...)
- Chỉ có 1 avgCottonPrice cho cả tháng → sai khi có sợi dùng loại bông khác
- Không linh hoạt thêm loại bông/PE mới
- CP PE đang gộp tỷ lệ vào peRate → khó quản lý

### Giải pháp

- Tạo bảng danh mục `MaterialType` (thêm loại mới không cần sửa code)
- Tạo bảng `MaterialPrice` (giá theo tháng, lịch sử rõ ràng)
- Thêm `cottonRatio` vào `RawMaterialRate` (tỷ lệ thành phần, gắn theo mặt hàng)
- PlanLineItem lưu snapshot `cottonPriceUsd`, `pePriceUsd` (giữ lịch sử)
- UX: "NVL mặc định" cho kế hoạch, chỉ đổi dòng nào khác

---

## Phần 1: Schema Database

### 1.1. Thêm 2 model mới

```prisma
// Danh mục loại nguyên vật liệu (bông, PE, viscose...)
// Admin quản lý — thêm/sửa/xóa không cần sửa code
model MaterialType {
  id       Int     @id @default(autoincrement())
  code     String  @unique   // "AUS", "US_PVC", "BRA", "PE_INDO"...
  name     String            // "Bông Úc", "Bông Mỹ PVC", "PE Benma Indo"...
  category String            // "COTTON" hoặc "PE" — phân loại để filter
  isActive Boolean @default(true)
  note     String?

  prices MaterialPrice[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("material_types")
}

// Giá nguyên vật liệu theo tháng
// Kế toán nhập đầu mỗi tháng
model MaterialPrice {
  id             Int          @id @default(autoincrement())
  materialTypeId Int
  materialType   MaterialType @relation(fields: [materialTypeId], references: [id])
  yearMonth      String       // "2026-04"
  priceUsd       Float        // Giá USD/kg

  note String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([materialTypeId, yearMonth])
  @@index([materialTypeId])
  @@index([yearMonth])
  @@map("material_prices")
}
```

### 1.2. Thêm field vào RawMaterialRate

```prisma
model RawMaterialRate {
  // ... giữ nguyên các field hiện có ...

  // THÊM MỚI:
  cottonRatio Float @default(1.0)  // Tỷ lệ cotton (0-1). VD: 1.0=100% cotton, 0.6=60% cotton
  // peRatio tính tự động = 1 - cottonRatio, không cần lưu
}
```

### 1.3. Thêm fields vào PlanLineItem (snapshot giá — giữ lịch sử)

```prisma
model PlanLineItem {
  // ... giữ nguyên các field hiện có ...

  // THÊM MỚI: snapshot loại NVL + giá tại thời điểm tạo
  cottonMaterialTypeId Int?     // Loại bông đã chọn
  cottonPriceUsd       Float?   // Snapshot giá bông (USD/kg) lúc tạo
  cottonRatio          Float?   // Snapshot tỷ lệ cotton
  peMaterialTypeId     Int?     // Loại PE đã chọn (null nếu 100% cotton)
  pePriceUsd           Float?   // Snapshot giá PE (USD/kg) lúc tạo
  peRatio              Float?   // Snapshot tỷ lệ PE (= 1 - cottonRatio)
}
```

Tương tự thêm vào `ActualLineItem`.

### 1.4. Migration

```bash
npx prisma migrate dev --name add_material_type_and_price_system
```

### 1.5. Seed dữ liệu mẫu cho MaterialType

```sql
INSERT INTO material_types (code, name, category, "isActive") VALUES
('AUS', 'Bông Úc (Australia)', 'COTTON', true),
('US_PVC', 'Bông Mỹ PVC', 'COTTON', true),
('BRA', 'Bông Brazil', 'COTTON', true),
('WEST_AFRICA', 'Bông Tây Phi', 'COTTON', true),
('PIMA', 'Bông Pima', 'COTTON', true),
('SUPIMA', 'Bông Supima', 'COTTON', true),
('CMIA', 'Bông CMIA', 'COTTON', true),
('PE_BENMA', 'PE Benma (Indo)', 'PE', true),
('PE_THAI', 'PE Thái Lan', 'PE', true),
('VISCOSE', 'Xơ Viscose', 'PE', true);
```

---

## Phần 2: API Routes mới

### 2.1. CRUD MaterialType

File mới: `src/app/api/kdsx/material-types/route.ts`

- GET: list tất cả (filter ?category=COTTON|PE, ?isActive=true)
- POST: tạo mới { code, name, category, note? }

File mới: `src/app/api/kdsx/material-types/[id]/route.ts`

- PUT: sửa name, note, isActive
- DELETE: chỉ xóa nếu chưa có MaterialPrice nào

### 2.2. CRUD MaterialPrice

File mới: `src/app/api/kdsx/material-prices/route.ts`

- GET: list (filter ?yearMonth=2026-04, ?category=COTTON|PE)
  - Response include materialType { code, name, category }
- POST: tạo/cập nhật giá { materialTypeId, yearMonth, priceUsd }
  - Upsert theo unique(materialTypeId, yearMonth)

### 2.3. API helper: lấy giá NVL cho 1 tháng

File mới: `src/app/api/kdsx/material-prices/by-month/route.ts`

- GET ?yearMonth=2026-04
- Response: danh sách tất cả loại NVL + giá tháng đó

```json
{
  "cotton": [
    { "id": 1, "code": "AUS", "name": "Bông Úc", "priceUsd": 1.73 },
    { "id": 2, "code": "US_PVC", "name": "Bông Mỹ PVC", "priceUsd": 1.79 }
  ],
  "pe": [{ "id": 4, "code": "PE_BENMA", "name": "PE Benma", "priceUsd": 1.11 }]
}
```

---

## Phần 3: Sửa công thức tính toán

### File: `src/lib/kdsx/calculator.ts`

Sửa interface CalcInput:

```typescript
export interface CalcInput {
  qty: number;
  unitPriceUsd: number;
  rates: {
    cottonRate?: number; // ĐM tiêu hao cotton (kg NL/kg TP) — từ RawMaterialRate
    peRate?: number; // ĐM tiêu hao PE (kg NL/kg TP) — từ RawMaterialRate
    cottonRatio?: number; // Tỷ lệ cotton (0-1) — từ RawMaterialRate
    wasteRate?: number; // Phế thu hồi (USD/kg) — từ RawMaterialRate
    sellingCostRate?: number; // CP bán hàng — từ SalesOrderItem
    doubleTwistGcRate?: number; // CP GC xe đôi — từ RawMaterialRate
  };
  params: {
    exchangeRate: number; // Tỷ giá VNĐ/USD — từ MonthlyInputParam
    cottonPriceUsd: number; // Giá bông đã chọn (USD/kg) — từ MaterialPrice
    pePriceUsd?: number; // Giá PE đã chọn (USD/kg) — từ MaterialPrice
  };
}
```

Sửa hàm calculateLineItem:

```typescript
export function calculateLineItem(input: CalcInput): CalcOutput {
  const { qty, unitPriceUsd, rates, params } = input;
  const { exchangeRate, cottonPriceUsd, pePriceUsd = 0 } = params;
  const {
    cottonRate = 0,
    peRate = 0,
    cottonRatio = 1.0, // mặc định 100% cotton
    wasteRate = 0,
    sellingCostRate = 0,
    doubleTwistGcRate = 0,
  } = rates;

  const peRatio = 1 - cottonRatio; // tự tính

  const revenueVnd = qty * unitPriceUsd * exchangeRate;

  // CP Cotton = tỷ giá × sản lượng × giá bông × định mức × tỷ lệ cotton
  const cottonCostVnd =
    exchangeRate * qty * cottonPriceUsd * cottonRate * cottonRatio;

  // CP PE = tỷ giá × sản lượng × giá PE × định mức PE × tỷ lệ PE
  const peCostVnd =
    peRatio > 0 ? exchangeRate * qty * pePriceUsd * peRate * peRatio : 0;

  const sellingCostVnd = qty * sellingCostRate * exchangeRate;
  const gcDoubleTwistVnd = qty * doubleTwistGcRate * exchangeRate;

  // Phế thu hồi × 0.95
  const wasteRecoveryVnd = qty * wasteRate * exchangeRate * 0.95;

  const grossProfitVnd =
    revenueVnd -
    cottonCostVnd -
    peCostVnd -
    sellingCostVnd -
    gcDoubleTwistVnd +
    wasteRecoveryVnd;

  return {
    revenueVnd,
    cottonCostVnd,
    peCostVnd,
    sellingCostVnd,
    gcDoubleTwistVnd,
    wasteRecoveryVnd,
    grossProfitVnd,
  };
}
```

### File: `src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts`

Sửa handler POST — thay đổi cách truyền params:

```typescript
// CŨ: dùng avgCottonPrice từ MonthlyInputParam
// MỚI: dùng cottonPriceUsd + pePriceUsd từ body (đã tra từ MaterialPrice phía frontend)

const {
  itemId,
  salesOrderItemId,
  qty,
  unitPriceUsd,
  note,
  cottonMaterialTypeId,
  cottonPriceUsd,
  peMaterialTypeId,
  pePriceUsd,
} = body;

// Lấy định mức
const rate = await prisma.rawMaterialRate.findFirst({
  where: { itemId: Number(itemId), effectiveTo: null },
  orderBy: { effectiveFrom: "desc" },
});

// Lấy sellingCostRate từ SalesOrderItem
let sellingCostRate = 0;
if (salesOrderItemId) {
  const soi = await prisma.salesOrderItem.findUnique({
    where: { id: Number(salesOrderItemId) },
  });
  sellingCostRate = soi?.sellingCostRate ?? 0;
} else {
  sellingCostRate = body.sellingCostRate ?? 0;
}

const calcResult = calculateLineItem({
  qty: Number(qty),
  unitPriceUsd: Number(unitPriceUsd),
  rates: {
    cottonRate: rate?.cottonRate ?? 0,
    peRate: rate?.peRate ?? 0,
    cottonRatio: rate?.cottonRatio ?? 1.0,
    wasteRate: rate?.wasteRate ?? 0,
    sellingCostRate,
    doubleTwistGcRate: rate?.doubleTwistGcRate ?? 0,
  },
  params: {
    exchangeRate: inputParam.exchangeRate,
    cottonPriceUsd: Number(cottonPriceUsd) || 0, // từ body, đã tra MaterialPrice
    pePriceUsd: Number(pePriceUsd) || 0, // từ body
  },
});

// Lưu snapshot vào PlanLineItem
const lineItem = await prisma.planLineItem.create({
  data: {
    planId,
    itemId: Number(itemId),
    salesOrderItemId: salesOrderItemId ? Number(salesOrderItemId) : null,
    qty: Number(qty),
    unitPriceUsd: Number(unitPriceUsd),
    cottonMaterialTypeId: cottonMaterialTypeId
      ? Number(cottonMaterialTypeId)
      : null,
    cottonPriceUsd: Number(cottonPriceUsd) || null,
    cottonRatio: rate?.cottonRatio ?? 1.0,
    peMaterialTypeId: peMaterialTypeId ? Number(peMaterialTypeId) : null,
    pePriceUsd: Number(pePriceUsd) || null,
    peRatio: rate?.cottonRatio != null ? 1 - rate.cottonRatio : null,
    note: note || null,
    ...calcResult,
  },
});
```

---

## Phần 4: UI

### 4.1. Trang quản lý Danh mục NVL

File mới: `src/app/kdsx/material-types/page.tsx`

Bảng đơn giản: code, tên, loại (COTTON/PE), trạng thái, nút thêm/sửa/xóa.
Thêm menu sidebar trong nhóm KD-SX: "Danh mục NVL" (icon: ExperimentOutlined)

### 4.2. Nhập giá NVL theo tháng

Có 2 lựa chọn:

- Tích hợp vào modal "Thông số tháng" hiện có — thêm section "Giá NVL" với bảng nhập giá
- Hoặc trang riêng `/kdsx/material-prices`

Recommend: tích hợp vào modal "Thông số tháng" cho tiện.

### 4.3. Sửa form tạo dòng sợi trong KH tháng

File: `src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx`

**a) Thêm panel "NVL mặc định" ở đầu trang (trên tab Dòng sợi):**

```tsx
<Card
  size="small"
  title="⚙ NVL mặc định cho kế hoạch này"
  style={{ marginBottom: 16 }}
>
  <Space wrap>
    <span>Loại bông:</span>
    <Select
      value={defaultCottonTypeId}
      onChange={handleDefaultCottonChange}
      options={cottonTypes.map((t) => ({
        label: `${t.name} (${t.priceUsd} USD)`,
        value: t.id,
      }))}
      style={{ width: 250 }}
    />
    <span>Loại PE:</span>
    <Select
      value={defaultPeTypeId}
      onChange={handleDefaultPeChange}
      options={peTypes.map((t) => ({
        label: `${t.name} (${t.priceUsd} USD)`,
        value: t.id,
      }))}
      style={{ width: 250 }}
      allowClear
      placeholder="Không dùng PE"
    />
    <Button type="primary" onClick={applyDefaultToAll}>
      Áp dụng cho tất cả dòng chưa thiết lập
    </Button>
  </Space>
</Card>
```

**b) Khi tạo dòng sợi mới → tự động fill từ mặc định:**

- `cottonMaterialTypeId` = defaultCottonTypeId
- `cottonPriceUsd` = giá tương ứng trong MaterialPrice
- `cottonRatio` = từ RawMaterialRate.cottonRatio
- Nếu cottonRatio < 1.0 (sợi pha) → tự fill peMaterialTypeId + pePriceUsd từ default PE

**c) Dòng nào cần khác → click icon bên cạnh tên bông để đổi:**

Trong bảng dòng sợi, cột NVL hiển thị:

```tsx
<span>Bông Úc 1.73</span> <EditOutlined onClick={openNvlPicker} />
```

Click EditOutlined → mở popup nhỏ cho chọn loại bông khác.

### 4.4. Sửa bảng Định mức NVL

File: `src/app/kdsx/raw-material-rates/page.tsx`

Thêm cột + field "Tỷ lệ cotton (%)" trong bảng và form:

- Mặc định 100%
- Sợi CVCM nhập 60%
- Hiển thị: "100%" hoặc "60% cotton / 40% PE"

---

## Phần 5: Sửa API recalculate

File: `src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts`

Khi tính lại tất cả line items, phải dùng `cottonPriceUsd` và `pePriceUsd`
đã snapshot trong PlanLineItem (KHÔNG tra lại MaterialPrice — để giữ lịch sử).

```typescript
for (const li of plan.lineItems) {
  const rate = await prisma.rawMaterialRate.findFirst({
    where: { itemId: li.itemId, effectiveTo: null },
    orderBy: { effectiveFrom: "desc" },
  });

  const calcResult = calculateLineItem({
    qty: li.qty,
    unitPriceUsd: li.unitPriceUsd,
    rates: {
      cottonRate: rate?.cottonRate ?? 0,
      peRate: rate?.peRate ?? 0,
      cottonRatio: li.cottonRatio ?? rate?.cottonRatio ?? 1.0,
      wasteRate: rate?.wasteRate ?? 0,
      sellingCostRate: li.sellingCostVnd ? /* derive from snapshot */ 0 : 0,
      doubleTwistGcRate: rate?.doubleTwistGcRate ?? 0,
    },
    params: {
      exchangeRate: inputParam.exchangeRate,
      cottonPriceUsd: li.cottonPriceUsd ?? inputParam.avgCottonPrice ?? 0, // dùng snapshot
      pePriceUsd: li.pePriceUsd ?? inputParam.peBenmaPrice ?? 0, // dùng snapshot
    },
  });

  await prisma.planLineItem.update({
    where: { id: li.id },
    data: calcResult,
  });
}
```

---

## Phần 6: Verify sau khi xong

```powershell
# Schema
Select-String -Pattern "MaterialType|MaterialPrice|cottonRatio|cottonPriceUsd|pePriceUsd|peMaterialTypeId|cottonMaterialTypeId" -LiteralPath "prisma\schema.prisma" | Select-Object -First 15

# API routes
Get-ChildItem -Recurse "src\app\api\kdsx\material-types" -Filter "route.ts"
Get-ChildItem -Recurse "src\app\api\kdsx\material-prices" -Filter "route.ts"

# Calculator
Select-String -Pattern "cottonPriceUsd|cottonRatio|pePriceUsd|peRatio" -LiteralPath "src\lib\kdsx\calculator.ts"

# UI
Test-Path "src\app\kdsx\material-types\page.tsx"
Select-String -Pattern "cottonRatio|materialType|NVL mặc định" -LiteralPath "src\app\kdsx\raw-material-rates\page.tsx"
```

---

## Tóm tắt thay đổi

| Loại    | File                        | Nội dung                                                                                  |
| ------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| Schema  | prisma/schema.prisma        | +2 model mới, +cottonRatio vào RawMaterialRate, +6 fields vào PlanLineItem/ActualLineItem |
| API mới | material-types/             | CRUD danh mục NVL                                                                         |
| API mới | material-prices/            | CRUD giá NVL theo tháng                                                                   |
| API sửa | calculator.ts               | Đổi công thức: tách cottonPriceUsd, pePriceUsd, cottonRatio                               |
| API sửa | line-items/route.ts         | Nhận + lưu snapshot giá NVL                                                               |
| API sửa | recalculate/route.ts        | Dùng snapshot giá khi tính lại                                                            |
| UI mới  | material-types/page.tsx     | Trang quản lý danh mục NVL                                                                |
| UI sửa  | raw-material-rates/page.tsx | Thêm cột "Tỷ lệ cotton"                                                                   |
| UI sửa  | plans/.../page.tsx          | Panel "NVL mặc định" + picker cho từng dòng                                               |
| Sidebar | AdminLayout.tsx             | Thêm menu "Danh mục NVL"                                                                  |

## Phần 7: Dọn dẹp code cũ — bỏ những gì không còn phù hợp

### 7.1. MonthlyInputParam — bỏ các field giá NVL cũ

Các field này đã được thay thế bởi bảng `MaterialPrice`:

```prisma
// XÓA khỏi model MonthlyInputParam:
cottonUsaPrice      Float?    // ← thay bằng MaterialPrice
cottonBrazilPrice   Float?    // ← thay bằng MaterialPrice
cottonAusPrice      Float?    // ← thay bằng MaterialPrice
cottonPimaPrice     Float?    // ← thay bằng MaterialPrice
cottonSupimaPrice   Float?    // ← thay bằng MaterialPrice
cottonCmiaPrice     Float?    // ← thay bằng MaterialPrice
peBenmaPrice        Float?    // ← thay bằng MaterialPrice
lenzingViscosePrice Float?    // ← thay bằng MaterialPrice
livaEcoPrice        Float?    // ← thay bằng MaterialPrice
cottonUsaRatio      Float?    // ← không dùng nữa (tỷ lệ phối trộn)
cottonBrazilRatio   Float?    // ← không dùng nữa
cottonAusRatio      Float?    // ← không dùng nữa
warehouseFee        Float?    // ← không dùng nữa
avgCottonPrice      Float?    // ← thay bằng cottonPriceUsd trong PlanLineItem
wastePrice          Float?    // ← không dùng nữa (phế = wasteRate × exchangeRate)

// GIỮ LẠI trong MonthlyInputParam:
exchangeRate  Float   // Tỷ giá VNĐ/USD — vẫn cần, dùng chung cho cả tháng
note          String?
```

Chạy migration sau khi xóa: `npx prisma migrate dev --name cleanup_monthly_input_params`

### 7.2. UI Modal "Thông số tháng" — đơn giản hóa

File sửa: tìm modal/trang nhập thông số tháng (có thể trong `plans/.../page.tsx` hoặc `input-params/`)

**Bỏ:** Tất cả input fields cho giá bông, giá PE, tỷ lệ phối trộn, warehouseFee, avgCottonPrice, wastePrice

**Giữ lại:** Chỉ còn `exchangeRate` (tỷ giá) + `note`

**Thêm:** Section hiển thị "Giá NVL tháng này" — đọc từ `MaterialPrice` theo yearMonth, read-only hoặc link tới trang quản lý giá NVL

### 7.3. Calculator — bỏ tham số cũ

File: `src/lib/kdsx/calculator.ts`

Trong interface `CalcInput.params`:

```typescript
// XÓA:
avgCottonPrice: number;   // ← thay bằng cottonPriceUsd
peBenmaPrice?: number;    // ← thay bằng pePriceUsd
wastePrice?: number;      // ← không dùng nữa

// GIỮ:
exchangeRate: number;
cottonPriceUsd: number;   // đã thêm ở Phần 3
pePriceUsd?: number;      // đã thêm ở Phần 3
```

### 7.4. API line-items/route.ts — bỏ reference cũ

Tìm tất cả chỗ đang đọc `inputParam.avgCottonPrice`, `inputParam.peBenmaPrice`, `inputParam.wastePrice` → thay bằng `cottonPriceUsd`, `pePriceUsd` từ body request.

### 7.5. API monthly-actuals sync — cập nhật tương tự

File: `src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts`

Cùng logic: dùng `cottonPriceUsd`, `pePriceUsd` thay vì `avgCottonPrice`, `peBenmaPrice`.

### 7.6. Trang Thông số tháng (nếu có trang riêng)

```powershell
Get-ChildItem -Recurse "src/app/kdsx/" -Filter "*.tsx" | Select-String -Pattern "avgCottonPrice|peBenmaPrice|wastePrice|cottonUsaPrice|cottonBrazilPrice"
```

Chạy lệnh trên để tìm tất cả file UI còn reference đến fields cũ → xóa hết.

### 7.7. Bảng Định mức NVL — bỏ peRate đã nhân tỷ lệ

Sau khi có `cottonRatio`, `peRate` trong `RawMaterialRate` nhập giá trị GỐC:

- CŨ: peRate = 0.408 (đã nhân 0.4)
- MỚI: peRate = 1.02 (giá trị gốc), cottonRatio = 0.6 → hệ thống tự tính peRatio = 0.4

Cập nhật placeholder/tooltip trong UI bảng Định mức:

```
CŨ: "ĐM PE (đã bao gồm tỷ lệ)"
MỚI: "ĐM PE (kg NL/kg TP) — VD: 1.02"
```

## Lưu ý quan trọng

1. **Backward compatible**: cottonRatio default = 1.0, các field mới nullable
   → dữ liệu cũ không bị ảnh hưởng
2. **Snapshot giá** lưu trong PlanLineItem → đổi giá tháng mới KHÔNG ảnh hưởng lịch sử
3. **peRate trong RawMaterialRate**: nhập giá trị GỐC (1.02), KHÔNG nhân tỷ lệ
   → code tự nhân peRatio khi tính
4. **Nút "Tính lại tất cả"** dùng snapshot giá đã lưu → an toàn
