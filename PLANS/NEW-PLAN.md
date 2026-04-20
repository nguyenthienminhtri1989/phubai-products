# SPEC: Thêm deliveredQty vào SalesOrderItem

## Lý do

Khi bắt đầu sử dụng phần mềm giữa chừng (VD: từ tháng 4/2026), các hợp đồng
cũ đã giao 1 phần ở những tháng trước. Hệ thống cần biết "đã giao bao nhiêu
trước khi dùng phần mềm" để tính đúng "Còn lại".

Field `deliveredQty` chỉ cần nhập **1 lần khi tạo HĐ lần đầu**. Từ tháng sau,
Allocation Engine tự cộng dồn vào `allocatedQty`, không cần nhập tay nữa.

## Công thức mới

```
Còn lại = plannedQty − deliveredQty − allocatedQty
```

Hiện tại đang là: `Còn lại = plannedQty − allocatedQty` → sai khi HĐ cũ đã
giao 1 phần trước khi dùng phần mềm.

---

## Bước 1: Schema — thêm field deliveredQty

Mở `prisma/schema.prisma`, tìm model `SalesOrderItem`, thêm 1 dòng:

```diff
model SalesOrderItem {
  // ... fields hiện có giữ nguyên ...
  plannedQty       Float
  allocatedQty     Float     @default(0)
  sellingCostRate  Float?
+ deliveredQty     Float     @default(0)  // Số lượng đã giao TRƯỚC khi dùng phần mềm (kg)
  // ...
}
```

Chạy migration:

```bash
npx prisma migrate dev --name add_delivered_qty_to_sales_order_item
```

**Lưu ý:** `@default(0)` nên migration tự thêm cột với giá trị 0 cho tất cả
records cũ — không cần backfill.

---

## Bước 2: API tạo HĐ — nhận deliveredQty

### File: `src/app/api/kdsx/sales-orders/route.ts`

Trong handler **POST**, khi tạo `SalesOrderItem`, nhận thêm `deliveredQty`:

```typescript
// Tìm chỗ tạo SalesOrderItem, thêm field:
await prisma.salesOrderItem.create({
  data: {
    // ... fields hiện có ...
    deliveredQty: item.deliveredQty ?? 0, // THÊM DÒNG NÀY
  },
});
```

### File: `src/app/api/kdsx/sales-orders/[id]/route.ts`

Trong handler **PUT**, cho phép cập nhật `deliveredQty`:

```typescript
// Tìm chỗ update SalesOrderItem, thêm field:
deliveredQty: item.deliveredQty ?? 0,  // THÊM
```

Trong handler **GET**, đảm bảo include `deliveredQty` trong response
(nếu đang dùng `select` cụ thể thì thêm `deliveredQty: true`).

---

## Bước 3: UI form tạo/sửa HĐ — thêm ô nhập

### File: `src/app/kdsx/sales-orders/page.tsx`

Trong form tạo/sửa hợp đồng, ở phần nhập mỗi dòng mặt hàng (Form.List "items"),
**thêm 1 InputNumber** sau ô "Số lượng (kg)":

```tsx
<Form.Item
  {...restField}
  name={[name, "deliveredQty"]}
  label="Đã giao trước (kg)"
  tooltip="Chỉ nhập khi HĐ cũ đã giao 1 phần trước khi dùng phần mềm. HĐ mới để 0."
  initialValue={0}
>
  <InputNumber
    min={0}
    step={100}
    placeholder="0"
    style={{ width: "100%" }}
    addonAfter="kg"
  />
</Form.Item>
```

**Lưu ý UX:**

- `initialValue={0}` — mặc định luôn là 0, người dùng chỉ sửa khi cần
- Có tooltip giải thích rõ mục đích
- Không bắt buộc (không cần `required: true`)

### Khi mở form sửa HĐ (openEdit):

Load `deliveredQty` từ API:

```typescript
items: o.items.map((it) => ({
  // ... fields hiện có ...
  deliveredQty: it.deliveredQty ?? 0,  // THÊM
})),
```

---

## Bước 4: Sửa Allocation Engine — tính "Còn lại" đúng

### File: `src/lib/allocation-engine.ts`

Trong hàm `runAllocation()` và `runAllocationKD()`, tìm chỗ tính `stillNeeded`:

```typescript
// CŨ:
const stillNeeded = orderItem.plannedQty - orderItem.allocatedQty;

// MỚI:
const stillNeeded =
  orderItem.plannedQty - (orderItem.deliveredQty ?? 0) - orderItem.allocatedQty;
```

**Tìm tất cả chỗ có pattern tương tự** trong file này và sửa hết:

```bash
Select-String -Pattern "plannedQty.*allocatedQty" -Path "src/lib/allocation-engine.ts"
```

### Cũng kiểm tra hàm checkAllItemsDone (nếu có):

```typescript
// CŨ:
return items.every((item) => item.allocatedQty >= item.plannedQty);

// MỚI:
return items.every(
  (item) => item.allocatedQty + (item.deliveredQty ?? 0) >= item.plannedQty,
);
```

---

## Bước 5: Sửa UI hiển thị tiến độ — tính "Còn lại" đúng

### Tìm tất cả file tính "Còn lại" hoặc "remaining" hoặc "progress":

```bash
Select-String -Pattern "plannedQty.*allocatedQty|còn lại|remaining|progress" -Path "src/**/*.tsx" -Recurse
```

Các file có thể cần sửa:

- `src/app/kdsx/order-progress/page.tsx` — dashboard tiến độ
- `src/app/kdsx/sales-orders/[id]/page.tsx` — chi tiết HĐ, tab tiến độ
- `src/app/kdsx/page.tsx` — executive dashboard
- `src/lib/estimate-completion.ts` — ước tính ngày hoàn thành

**Pattern sửa giống nhau ở tất cả các file:**

```typescript
// CŨ:
const remaining = item.plannedQty - item.allocatedQty;
const progress = (item.allocatedQty / item.plannedQty) * 100;

// MỚI:
const totalDelivered = (item.deliveredQty ?? 0) + item.allocatedQty;
const remaining = item.plannedQty - totalDelivered;
const progress = (totalDelivered / item.plannedQty) * 100;
```

---

## Bước 6: Sửa estimate-completion

### File: `src/lib/estimate-completion.ts`

Hàm `calcEstimatedDoneDate()` cũng cần tính đúng:

```typescript
// CŨ:
const remainingQty = item.plannedQty - item.allocatedQty;

// MỚI:
const remainingQty =
  item.plannedQty - (item.deliveredQty ?? 0) - item.allocatedQty;
```

---

## Checklist

- [ ] Migration chạy thành công
- [ ] API POST /api/kdsx/sales-orders nhận `deliveredQty` trong mỗi item
- [ ] API PUT /api/kdsx/sales-orders/[id] cho phép cập nhật `deliveredQty`
- [ ] API GET /api/kdsx/sales-orders/[id] trả về `deliveredQty`
- [ ] Form tạo HĐ có ô "Đã giao trước (kg)" với default = 0 và tooltip
- [ ] Form sửa HĐ load đúng giá trị `deliveredQty`
- [ ] Allocation engine: `stillNeeded = plannedQty − deliveredQty − allocatedQty`
- [ ] checkAllItemsDone: `(allocatedQty + deliveredQty) >= plannedQty`
- [ ] Trang order-progress hiển thị đúng tiến độ
- [ ] Trang chi tiết HĐ hiển thị đúng "Còn lại"
- [ ] estimate-completion tính đúng
- [ ] TypeScript compile clean
- [ ] Cập nhật `BUSINESS_LOGIC_CONTEXT.md` sau khi xong

## Sau khi xong

Commit: `feat: add deliveredQty to SalesOrderItem for initial data migration`
