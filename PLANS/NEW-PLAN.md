# TASK: Chuyển sellingCostRate từ RawMaterialRate sang SalesOrderItem

## Lý do thay đổi

Từ file Excel gốc, cùng 1 loại sợi (VD: 40/2 COCD) nhưng CP bán hàng khác nhau theo từng hợp đồng:

- HĐ 60PB26 → 10%
- HĐ 83PB26 → 8%
- HĐ 100PB26 → 14%
- HĐ 93PB26 → 10%

→ `sellingCostRate` thuộc **hợp đồng**, KHÔNG thuộc mặt hàng. Giữ nó trong `RawMaterialRate` là sai nghiệp vụ.

## Nguyên tắc: Chỉ sửa chỗ cần sửa

Trang Định mức NVL (`/kdsx/raw-material-rates`) đã build xong — KHÔNG viết lại. Chỉ cần:

1. Bỏ cột/field `sellingCostRate` khỏi trang đó
2. Thêm field `sellingCostRate` vào SalesOrderItem + UI tạo HĐ
3. Sửa logic tính toán để lấy sellingCostRate từ đúng nguồn

---

## Bước 1: Sửa Schema Prisma

Mở `prisma/schema.prisma`:

**a) Model RawMaterialRate — BỎ field sellingCostRate (nếu có):**

Tìm model `RawMaterialRate`, xóa dòng `sellingCostRate`:

```diff
model RawMaterialRate {
  ...
  cottonRate          Float?
  peRate              Float?
  wasteRecoveryRate   Float?
- sellingCostRate     Float?    // XÓA DÒNG NÀY
  gcDoubleTwistRate   Float?
  ...
}
```

**b) Model SalesOrderItem — THÊM field sellingCostRate:**

Tìm model `SalesOrderItem`, thêm:

```diff
model SalesOrderItem {
  ...
  plannedQty       Float
  allocatedQty     Float     @default(0)
+ sellingCostRate  Float?    // Hệ số CP bán hàng (0.08 = 8%), nhập khi tạo/sửa HĐ
  ...
}
```

**c) Chạy migration:**

```bash
npx prisma migrate dev --name move_selling_cost_rate_to_sales_order_item
```

---

## Bước 2: Sửa trang Định mức NVL

File: `src/app/kdsx/raw-material-rates/page.tsx`

**Chỉ cần bỏ những phần liên quan đến sellingCostRate:**

- Xóa cột "CP Bán hàng" trong bảng (Table columns)
- Xóa field "Hệ số CP Bán hàng" trong Modal Form
- Xóa sellingCostRate khỏi payload khi gọi POST/PUT API
- Xóa sellingCostRate khỏi bảng tham khảo (nếu có hiển thị)

Tìm theo keyword `sellingCostRate` hoặc `CP Bán hàng` hoặc `bán hàng` để xóa hết.

---

## Bước 3: Sửa API raw-material-rates

File: `src/app/api/kdsx/raw-material-rates/route.ts` và `[id]/route.ts`

- Bỏ `sellingCostRate` khỏi phần parse body trong handler POST và PUT
- Không cần sửa GET (Prisma tự bỏ field nếu schema đã xóa)

---

## Bước 4: Sửa API tạo/sửa HĐ — thêm sellingCostRate

**File: `src/app/api/kdsx/sales-orders/route.ts`**

Trong handler POST, khi tạo `SalesOrderItem`, nhận thêm `sellingCostRate` từ body:

```typescript
// Tìm chỗ tạo SalesOrderItem, thêm field:
await prisma.salesOrderItem.create({
  data: {
    ...
    sellingCostRate: item.sellingCostRate ?? null,  // THÊM DÒNG NÀY
  },
});
```

**File: `src/app/api/kdsx/sales-orders/[id]/route.ts`**

Trong handler PUT, cho phép cập nhật `sellingCostRate` của từng item.

---

## Bước 5: Sửa UI tạo/sửa HĐ

File: `src/app/kdsx/sales-orders/page.tsx`

Trong form tạo/sửa hợp đồng, ở phần nhập mỗi dòng mặt hàng (items), **thêm 1 InputNumber**:

```tsx
<Form.Item
  label="CP bán hàng (%)"
  name={[field.name, "sellingCostRate"]}
  rules={[{ required: true, message: "Nhập hệ số CP bán hàng" }]}
>
  <InputNumber
    min={0}
    max={100}
    step={1}
    placeholder="VD: 8"
    addonAfter="%"
    style={{ width: "100%" }}
  />
</Form.Item>
```

**Lưu ý chuyển đổi:** UI nhập dạng phần trăm (8, 10, 14...), khi gửi API chuyển sang thập phân:

- Gửi API: `sellingCostRate: formValue / 100` (8 → 0.08)
- Hiển thị: `value * 100` (0.08 → 8%)

Trong bảng danh sách HĐ, thêm cột hiển thị CP BH cho mỗi item (optional).

---

## Bước 6: Sửa logic tính toán

**File: `src/lib/kdsx/calculator.ts`**

Hàm `calculateLineItem()` vẫn nhận `sellingCostRate` như tham số — KHÔNG cần sửa signature. Chỉ cần đảm bảo caller truyền đúng nguồn.

**File: `src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts`**

Trong handler POST (tạo dòng sợi trong kế hoạch), sửa chỗ lấy `sellingCostRate`:

```typescript
// CŨ (sai): lấy từ RawMaterialRate
// const sellingCostRate = rate.sellingCostRate ?? 0;

// MỚI (đúng): lấy từ SalesOrderItem
let sellingCostRate = 0;
if (body.salesOrderItemId) {
  // Dòng gắn HĐ → lấy từ SalesOrderItem
  const soi = await prisma.salesOrderItem.findUnique({
    where: { id: body.salesOrderItemId },
  });
  sellingCostRate = soi?.sellingCostRate ?? 0;
} else {
  // Dòng Dự phòng (DP) → lấy từ body (user nhập tay)
  sellingCostRate = body.sellingCostRate ?? 0;
}
```

Tương tự cho handler PUT nếu có.

---

## Bước 7: Sửa UI tạo dòng sợi trong Kế hoạch tháng

File: `src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx`

Khi user tạo dòng sợi:

- Nếu gắn HĐ → `sellingCostRate` tự động lấy từ SalesOrderItem, hiển thị read-only
- Nếu dòng DP (checkbox Dự phòng) → hiện InputNumber cho user nhập `sellingCostRate` thủ công

```tsx
{
  isDP && (
    <Form.Item
      label="CP bán hàng (%)"
      name="sellingCostRate"
      rules={[{ required: true }]}
    >
      <InputNumber
        min={0}
        max={100}
        step={1}
        placeholder="VD: 8"
        addonAfter="%"
      />
    </Form.Item>
  );
}

{
  !isDP && selectedSalesOrderItem && (
    <Descriptions.Item label="CP bán hàng">
      {(selectedSalesOrderItem.sellingCostRate * 100).toFixed(0)}%
      <Text type="secondary"> (theo HĐ)</Text>
    </Descriptions.Item>
  );
}
```

---

## Tóm tắt files cần sửa

| File                                                      | Thay đổi                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| `prisma/schema.prisma`                                    | Xóa sellingCostRate khỏi RawMaterialRate, thêm vào SalesOrderItem |
| `src/app/kdsx/raw-material-rates/page.tsx`                | Xóa cột + field sellingCostRate                                   |
| `src/app/api/kdsx/raw-material-rates/route.ts`            | Bỏ sellingCostRate khỏi POST/PUT body                             |
| `src/app/api/kdsx/raw-material-rates/[id]/route.ts`       | Bỏ sellingCostRate khỏi PUT body                                  |
| `src/app/api/kdsx/sales-orders/route.ts`                  | Thêm sellingCostRate khi tạo SalesOrderItem                       |
| `src/app/api/kdsx/sales-orders/[id]/route.ts`             | Thêm sellingCostRate khi sửa SalesOrderItem                       |
| `src/app/kdsx/sales-orders/page.tsx`                      | Thêm InputNumber CP bán hàng trong form item                      |
| `src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts` | Lấy sellingCostRate từ SalesOrderItem thay vì RawMaterialRate     |
| `src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx`     | Hiện sellingCostRate theo HĐ hoặc cho nhập tay nếu DP             |

## KHÔNG sửa

- `src/lib/kdsx/calculator.ts` — hàm `calculateLineItem()` giữ nguyên signature
- Các trang khác (dashboard, actuals, customers...) — không liên quan
