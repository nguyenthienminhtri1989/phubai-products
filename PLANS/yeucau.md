# TASK: Module Quản lý Lô hàng (Lot Management)

## Đọc các file sau trước khi code:

- `prisma/schema.prisma` (model Machine, ProductionLog, Item, Factory, SalesOrderItem)
- `src/app/machines/page.tsx` (trang điều phối máy — thêm chọn lô)
- `src/app/production/daily-input/page.tsx` hoặc trang nhập SL mobile (để gán lotId tự động)
- `src/app/api/machines/route.ts` và `src/app/api/machines/[id]/route.ts`
- `src/app/api/production/daily-input/route.ts`
- `src/app/(erp)/layout.tsx` (sidebar menu — ALL_PAGES + SIDEBAR_GROUPS)

---

## 1. Schema

### 1.1 Thêm 2 enum mới:

```prisma
enum LotType {
  RAW_COTTON  // Lô bông (nguyên liệu tự nhiên)
  RAW_FIBER   // Lô xơ (nguyên liệu nhân tạo: PE, viscose...)
  YARN        // Lô sợi (thành phẩm)
}

enum LotStatus {
  OPEN     // Đang sản xuất / đang sử dụng
  CLOSED   // Đã đóng lô
  SHIPPED  // Đã giao hàng (chỉ dùng cho YARN)
}
```

### 1.2 Thêm model `Lot`:

```prisma
model Lot {
  id        Int       @id @default(autoincrement())
  lotNumber String    // Người dùng tự đặt, VD: "B2026-05-001", text tự do
  lotType   LotType   // RAW_COTTON / RAW_FIBER / YARN

  // Mặt hàng — bắt buộc với YARN, optional với NL
  itemId    Int?
  item      Item?     @relation(fields: [itemId], references: [id])

  // Nhà máy
  factoryId Int
  factory   Factory   @relation(fields: [factoryId], references: [id])

  // Gắn với HĐ (chỉ YARN, optional)
  salesOrderItemId Int?
  salesOrderItem   SalesOrderItem? @relation(fields: [salesOrderItemId], references: [id])

  status    LotStatus @default(OPEN)
  note      String?

  openedAt  DateTime  @default(now())
  closedAt  DateTime?

  // Relations — truy xuất NL
  rawMaterials LotMaterialLink[] @relation("YarnLot")  // Lô sợi này dùng NL từ lô nào
  usedInYarns  LotMaterialLink[] @relation("RawLot")   // Lô NL này được dùng cho lô sợi nào

  // Relations — dữ liệu SX
  productionLogs ProductionLog[]

  // Máy đang chạy lô này
  runningOnMachines Machine[] @relation("CurrentLot")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([lotType])
  @@index([factoryId])
  @@index([itemId])
  @@index([lotNumber])
  @@map("lots")
}
```

### 1.3 Thêm model `LotMaterialLink`:

```prisma
// Link lô sợi ↔ lô nguyên liệu (many-to-many)
// 1 lô sợi có thể dùng nhiều lô bông + tối đa 1 lô xơ
model LotMaterialLink {
  id        Int    @id @default(autoincrement())
  yarnLotId Int
  yarnLot   Lot    @relation("YarnLot", fields: [yarnLotId], references: [id])
  rawLotId  Int
  rawLot    Lot    @relation("RawLot", fields: [rawLotId], references: [id])
  note      String?

  @@unique([yarnLotId, rawLotId])
  @@index([yarnLotId])
  @@index([rawLotId])
  @@map("lot_material_links")
}
```

### 1.4 Thêm field vào model hiện có:

**Machine** — thêm `currentLotId`:

```prisma
currentLotId Int?
currentLot   Lot? @relation("CurrentLot", fields: [currentLotId], references: [id])
```

**ProductionLog** — thêm `lotId`:

```prisma
lotId Int?
lot   Lot? @relation(fields: [lotId], references: [id])
```

**Item** — thêm relation ngược:

```prisma
lots Lot[]
```

**Factory** — thêm relation ngược:

```prisma
lots Lot[]
```

**SalesOrderItem** — thêm relation ngược:

```prisma
lots Lot[]
```

### 1.5 Migration:

```bash
npx prisma migrate dev --name add_lot_management
```

---

## 2. API CRUD Lô hàng

### File mới: `src/app/api/lots/route.ts`

**GET** — Lấy danh sách lô, hỗ trợ filter:

```typescript
// Query params: ?lotType=YARN&status=OPEN&factoryId=1&search=keyword
const lots = await prisma.lot.findMany({
  where: {
    ...(lotType && { lotType }),
    ...(status && { status }),
    ...(factoryId && { factoryId: parseInt(factoryId) }),
    ...(search && {
      OR: [
        { lotNumber: { contains: search, mode: "insensitive" } },
        { note: { contains: search, mode: "insensitive" } },
      ],
    }),
  },
  include: {
    item: { select: { id: true, name: true } },
    factory: { select: { id: true, name: true } },
    salesOrderItem: {
      select: {
        id: true,
        salesOrder: { select: { id: true, contractNumber: true } },
      },
    },
    rawMaterials: {
      include: {
        rawLot: { select: { id: true, lotNumber: true, lotType: true } },
      },
    },
  },
  orderBy: { createdAt: "desc" },
});
```

**POST** — Tạo lô mới:

```typescript
// Body: { lotNumber, lotType, itemId?, factoryId, salesOrderItemId?, note?, rawLotIds?: number[] }
// Nếu lotType === "YARN" và có rawLotIds → tạo LotMaterialLink đồng thời
await prisma.$transaction(async (tx) => {
  const lot = await tx.lot.create({
    data: { lotNumber, lotType, itemId, factoryId, salesOrderItemId, note },
  });

  // Nếu là lô sợi → link nguyên liệu
  if (lotType === "YARN" && rawLotIds?.length > 0) {
    await tx.lotMaterialLink.createMany({
      data: rawLotIds.map((rawLotId) => ({
        yarnLotId: lot.id,
        rawLotId,
      })),
    });
  }

  return lot;
});
```

### File mới: `src/app/api/lots/[id]/route.ts`

**GET** — Chi tiết 1 lô (bao gồm material links + production logs liên quan)

**PUT** — Cập nhật lô:

```typescript
// Body: { lotNumber?, status?, note?, salesOrderItemId?, rawLotIds?: number[] }
// Nếu rawLotIds có → xóa link cũ, tạo link mới (replace all)
// Nếu status = "CLOSED" → set closedAt = now()
```

**DELETE** — Xóa lô (chỉ cho phép nếu chưa có ProductionLog nào link tới)

---

## 3. UI Trang quản lý danh mục lô

### File mới: `src/app/lots/page.tsx`

Trang CRUD danh mục lô — layout tương tự các trang danh mục khác.

### 3.1 Bảng chính (Table):

| Cột        | Mô tả                                                              |
| ---------- | ------------------------------------------------------------------ |
| Số lô      | lotNumber                                                          |
| Loại       | lotType — hiện tag màu: BÔNG (xanh lá), XƠ (tím), SỢI (xanh dương) |
| Mặt hàng   | item.name (chỉ YARN)                                               |
| Nhà máy    | factory.name                                                       |
| Hợp đồng   | salesOrderItem → contractNumber (chỉ YARN)                         |
| NL sử dụng | Danh sách lô NL link (chỉ YARN) — hiện dạng tags                   |
| Trạng thái | status — tag: OPEN (xanh), CLOSED (xám), SHIPPED (vàng)            |
| Ngày tạo   | openedAt                                                           |
| Hành động  | Sửa / Xóa                                                          |

### 3.2 Filter bar:

- Filter theo lotType (Radio: Tất cả / Bông / Xơ / Sợi)
- Filter theo status (Radio: Tất cả / Đang mở / Đã đóng / Đã giao)
- Filter theo nhà máy (Select)
- Search theo số lô (Input.Search)

### 3.3 Modal tạo/sửa lô:

```
Form fields:
- Số lô (*): Input text — bắt buộc
- Loại lô (*): Radio group — RAW_COTTON / RAW_FIBER / YARN
- Nhà máy (*): Select — danh sách Factory
- Mặt hàng: Select — danh sách Item (hiện khi lotType = YARN, bắt buộc)
- Hợp đồng: Select — danh sách SalesOrderItem (hiện khi lotType = YARN, optional)
- Trạng thái: Select — OPEN / CLOSED / SHIPPED
- Ghi chú: TextArea

--- Phần link nguyên liệu (chỉ hiện khi lotType = YARN) ---
- "Lô bông sử dụng": Checkbox list — lấy từ Lot WHERE lotType=RAW_COTTON AND status=OPEN
- "Lô xơ sử dụng": Checkbox list — lấy từ Lot WHERE lotType=RAW_FIBER AND status=OPEN
  (Lưu ý: cho phép chọn nhiều lô bông, nhưng GHI CHÚ cho user rằng thường chỉ dùng 1 lô xơ.
   Không cần enforce ở backend — chỉ hiện warning nếu chọn > 1 lô xơ.)
```

### 3.4 Nút nhanh "Đóng lô":

Bên cạnh nút Sửa, thêm nút "Đóng lô" (confirm dialog) → PUT status=CLOSED.

---

## 4. Gắn lô vào điều phối máy

### File sửa: `src/app/machines/page.tsx`

### 4.1 Thêm field `currentLotId` vào interface MachineData

### 4.2 Trong form sửa máy HOẶC modal điều phối:

Thêm Select chọn lô sợi đang chạy — **TÙY CHỌN, không bắt buộc** (allowClear):

```tsx
<Form.Item name="currentLotId" label="Lô đang SX">
  <Select
    allowClear
    showSearch
    optionFilterProp="label"
    placeholder="Chọn lô sợi (không bắt buộc)..."
    options={yarnLots.map((l) => ({
      value: l.id,
      label: `${l.lotNumber} — ${l.item?.name}`,
    }))}
  />
</Form.Item>
```

Dữ liệu: fetch `GET /api/lots?lotType=YARN&status=OPEN` khi mở form.

### 4.3 API PUT machine nhận field mới:

Đọc `src/app/api/machines/[id]/route.ts`, thêm `currentLotId` vào update data.

### 4.4 API GET machines trả thêm currentLot:

```typescript
include: {
  currentLot: { select: { id: true, lotNumber: true } },
}
```

### 4.5 Hiển thị lô hiện tại trên bảng máy:

Thêm cột "Lô đang SX" hiện `machine.currentLot?.lotNumber` (hoặc "—" nếu null).

---

## 5. Tự động gán lotId khi nhập sản lượng

### File sửa: `src/app/api/production/daily-input/route.ts`

Khi tạo ProductionLog, tự động lấy `lotId` từ máy:

```typescript
// Trong POST handler, trước khi create ProductionLog:
const machine = await prisma.machine.findUnique({
  where: { id: machineId },
  select: { currentLotId: true },
});

await prisma.productionLog.create({
  data: {
    machineId,
    recordDate,
    shift,
    itemId,
    startIndex,
    endIndex,
    inputNE,
    finalOutput,
    note,
    createdById,
    lotId: machine?.currentLotId ?? null, // Tự động từ máy — null nếu máy chưa gán lô
  },
});
```

**Lưu ý quan trọng:**

- Công nhân KHÔNG cần chọn lô — hệ thống tự lấy từ `Machine.currentLotId`
- Nếu điều phối máy **có chọn lô** → ProductionLog tự có `lotId`
- Nếu điều phối máy **không chọn lô** → ProductionLog.lotId = null
- UI nhập liệu **KHÔNG CẦN SỬA** — không thêm dropdown chọn lô

---

## 6. Sidebar & Page Registry

### 6.1 Thêm vào `ALL_PAGES` trong layout:

```typescript
{ pageKey: "catalog.lots", pageGroup: "DANH MỤC", path: "/lots", label: "Danh mục lô hàng", icon: <TagsOutlined /> },
```

### 6.2 Thêm vào `SIDEBAR_GROUPS` → nhóm `group-catalog` → `pageKeys`:

```typescript
pageKeys: [
  "catalog.factories", "catalog.processes", "catalog.items", "catalog.lots",
  // ... giữ nguyên các key khác
],
```

### 6.3 Seed PageRegistry:

```sql
INSERT INTO page_registry ("pageKey", "pageName", "pageGroup", "path", "sortOrder")
VALUES ('catalog.lots', 'Danh mục lô hàng', 'DANH MỤC', '/lots', 35);
```

---

## 7. API tra cứu lô theo ProductionLog (truy xuất nguồn gốc)

### File mới: `src/app/api/lots/[id]/traceability/route.ts`

**GET** — Truy xuất nguồn gốc 1 lô sợi:

```typescript
// Response:
{
  lot: { id, lotNumber, lotType, item, factory, salesOrderItem },
  rawMaterials: [
    { lotNumber: "B2026-05-001", lotType: "RAW_COTTON" },
    { lotNumber: "B2026-05-002", lotType: "RAW_COTTON" },
    { lotNumber: "X2026-05-001", lotType: "RAW_FIBER" },
  ],
  productionSummary: {
    totalKg: 1500,
    machines: ["Máy ống 1", "Máy ống 3"],
    dateRange: { from: "2026-05-01", to: "2026-05-15" },
    shifts: [1, 2, 3],
  }
}
```

---

## 8. Verify

```powershell
# Schema
Select-String -Pattern "LotType|LotStatus|model Lot |LotMaterialLink|currentLotId|lotId" -LiteralPath "prisma\schema.prisma" | Select-Object -First 10

# API
Test-Path "src\app\api\lots\route.ts"
Test-Path "src\app\api\lots\[id]\route.ts"
Test-Path "src\app\api\lots\[id]\traceability\route.ts"

# UI
Test-Path "src\app\lots\page.tsx"

# Sidebar
Select-String -Pattern "catalog.lots" -LiteralPath "src\app\(erp)\layout.tsx" | Select-Object -First 3

# Machine integration
Select-String -Pattern "currentLotId|currentLot" -LiteralPath "src\app\machines\page.tsx" | Select-Object -First 3

# ProductionLog integration
Select-String -Pattern "lotId|currentLotId" -LiteralPath "src\app\api\production\daily-input\route.ts" | Select-Object -First 3
```
