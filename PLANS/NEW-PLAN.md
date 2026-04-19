# FIX: Thêm ô nhập CP bán hàng (%) vào form tạo hợp đồng

## File: `src/app/kdsx/sales-orders/page.tsx`

### 1. Trong Form.List "items" (phần tạo mới — khoảng dòng có `<Form.List name="items">`)

Thêm 1 Form.Item cho `sellingCostRate` vào mỗi dòng, sau ô "Giá (USD/kg)":

```tsx
<Form.Item
  {...restField}
  name={[name, "sellingCostRate"]}
  rules={[{ required: true, message: "Nhập %" }]}
>
  <InputNumber
    placeholder="CP BH (%)"
    min={0}
    max={100}
    step={1}
    style={{ width: 110 }}
  />
</Form.Item>
```

### 2. Trong hàm handleSave — chuyển đổi % sang thập phân trước khi gửi API

Tìm chỗ tạo payload, sửa items:

```typescript
const payload = {
  ...values,
  signedDate: values.signedDate ? values.signedDate.format("YYYY-MM-DD") : null,
  deliveryDate: values.deliveryDate
    ? values.deliveryDate.format("YYYY-MM-DD")
    : null,
  startDate: values.startDate ? values.startDate.format("YYYY-MM-DD") : null,
  items: values.items?.map((item: any) => ({
    ...item,
    sellingCostRate:
      item.sellingCostRate != null ? item.sellingCostRate / 100 : null,
  })),
};
```

### 3. Trong bảng expanded row (expandedRowRender) — hiển thị CP BH

Thêm 1 cột vào mảng `cols`:

```typescript
{
  title: "CP BH (%)",
  key: "sellingCostRate",
  render: (_: unknown, r: SalesOrderItem) =>
    r.sellingCostRate != null ? `${(r.sellingCostRate * 100).toFixed(0)}%` : "-",
},
```

### 4. Cập nhật interface SalesOrderItem — thêm field

```typescript
interface SalesOrderItem {
  id: number;
  itemId: number;
  item: Item;
  plannedQty: number;
  unitPrice: number;
  sellingCostRate: number | null; // THÊM
  note: string | null;
}
```

### 5. Trong openEdit — load sellingCostRate khi sửa HĐ (hiển thị dạng %)

```typescript
items: o.items.map((it) => ({
  itemId: it.itemId,
  plannedQty: it.plannedQty,
  unitPrice: it.unitPrice,
  sellingCostRate: it.sellingCostRate != null ? it.sellingCostRate * 100 : null,  // THÊM
  note: it.note,
})),
```

### 6. API backend — kiểm tra nhận sellingCostRate

File `src/app/api/kdsx/sales-orders/route.ts`, handler POST:
Tìm chỗ tạo SalesOrderItem, đảm bảo có:

```typescript
sellingCostRate: item.sellingCostRate ?? null,
```

## Lưu ý

- User nhập dạng phần trăm (8, 10, 14...) → lưu DB dạng thập phân (0.08, 0.10, 0.14)
- Hiển thị ra lại dạng phần trăm
- Giá trị phổ biến: 8%, 10%, 14%, 15%, 16%, 25%
