Đưa cho Claude Code:

---

**Thêm field `yarnType` vào bảng Items, dùng để quyết định ẩn/hiện PE trong bảng Định mức**

## Bước 1: Schema

File `prisma/schema.prisma`, model `Item`, thêm:

```prisma
yarnType String @default("SINGLE") // "SINGLE" = 1 thành phần (chỉ cotton), "BLENDED" = sợi pha (cotton + PE)
```

Chạy: `npx prisma migrate dev --name add_yarn_type_to_item`

## Bước 2: UI Items — thêm field nhập

File `src/app/items/page.tsx`, trong Modal form thêm/sửa, thêm 1 Form.Item:

```tsx
<Form.Item name="yarnType" label="Loại sợi">
  <Select
    defaultValue="SINGLE"
    options={[
      { label: "Sợi một thành phần (cotton)", value: "SINGLE" },
      { label: "Sợi pha (cotton + PE)", value: "BLENDED" },
    ]}
  />
</Form.Item>
```

Cũng thêm cột hiển thị trong bảng items (optional).

## Bước 3: API Items — nhận + trả field mới

File `src/app/api/items/route.ts`: POST/PUT nhận `yarnType` từ body. GET đã trả tất cả fields nên không cần sửa.

## Bước 4: Bảng Định mức — dùng `yarnType` thay vì detect từ tên

File `src/app/kdsx/raw-material-rates/page.tsx`:

**Sửa hàm `hasPE`:**

```typescript
// CŨ: detect từ tên
function hasPE(name: string): boolean {
  return detectYarnGroup(name) === "CVCM";
}

// MỚI: dùng yarnType từ item data
function hasPE(item: ItemInfo): boolean {
  return (item as any).yarnType === "BLENDED";
}
```

**Cập nhật interface `ItemInfo`:**

```typescript
interface ItemInfo {
  id: number;
  name: string;
  code: string | null;
  ne: number | null;
  material: string | null;
  composition: string | null;
  yarnType?: string; // THÊM
}
```

**Sửa tất cả chỗ gọi `hasPE(r.item.name)` thành `hasPE(r.item)`** — có 3 chỗ trong file:

1. Cột "ĐM PE" trong bảng
2. Phần detected info trong modal
3. Biến `showPE` quyết định enable/disable ô PE

**Sửa tương tự cho `showPE`:**

```typescript
// CŨ:
const showPE = selectedItem ? hasPE(selectedItem.name) : false;

// MỚI:
const showPE = selectedItem ? hasPE(selectedItem) : false;
```

**Lưu ý:** Hàm `detectYarnGroup()` và `isDoubleTwist()` giữ nguyên — chỉ sửa `hasPE`.

## Không sửa gì khác

- `calculator.ts` — không ảnh hưởng, nó nhận `peRate` từ input
- `ActualProductionGrid` — không ảnh hưởng
- Các API khác — không ảnh hưởng
