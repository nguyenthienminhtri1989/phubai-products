# TASK: Thêm field `model` vào bảng Machine

## Bối cảnh

Trang Kế hoạch SX tháng (`/kdsx/production-schedule/[id]`) có tính năng
auto-fill kg/ngày từ `ProductivityBenchmark.empiricalOutputPerDay`.
Logic tra cứu cần biết máy thuộc loại máy nào (machineModel như "G32",
"Murata Qpro-EX"...) để khớp với bảng `productivity_benchmarks`.
Hiện tại `Machine` chưa có field này nên auto-fill luôn thất bại.

## Thay đổi cần làm

### 1. Schema — thêm field vào model Machine

File: `prisma/schema.prisma`

Tìm model `Machine`, thêm 1 dòng (đặt sau field `currentNE`):

```prisma
model Machine {
  // ... các field hiện có ...
  currentNE Float?
  model     String?  // THÊM DÒNG NÀY — Loại máy VD: "G32", "Murata Qpro-EX", "Rieter RSB-D50"
  // ... relations ...
}
```

Chạy migration:

```bash
npx prisma migrate dev --name add_model_to_machine
npx prisma generate
```

---

### 2. API GET machines — trả thêm field `model`

Kiểm tra tất cả các route GET machines, đảm bảo `model` được include
trong response. Tìm file:

```powershell
Get-ChildItem -Recurse "src\app\api\machines" -Filter "route.ts" | Select-Object FullName
```

Trong mỗi query `prisma.machine.findMany()` hoặc `findUnique()`:

- Nếu dùng `select` → thêm `model: true`
- Nếu không dùng `select` (lấy all fields) → không cần sửa, Prisma tự trả

---

### 3. API PUT machine — nhận và lưu field `model`

File: `src/app/api/machines/[id]/route.ts` (hoặc tương đương)

Trong handler PUT, thêm `model` vào phần update:

```typescript
const {
  name,
  processId,
  formulaType,
  spindleCount,
  currentItemId,
  currentNE,
  model,
  isActive,
} = body;

await prisma.machine.update({
  where: { id },
  data: {
    // ... các field hiện có ...
    ...(model !== undefined && { model }),
  },
});
```

---

### 4. UI trang quản lý máy — thêm field nhập `model`

Tìm trang quản lý máy móc (thường là `/machines` hoặc `/dashboard/machines`).

Thêm field "Loại máy" vào form tạo/sửa máy:

```tsx
<Form.Item
  label="Loại máy"
  name="model"
  tooltip="Dùng để tra định mức năng suất. VD: G32, Murata Qpro-EX, Rieter RSB-D50"
>
  <Input placeholder="VD: G32" />
</Form.Item>
```

Thêm cột "Loại máy" vào bảng danh sách máy (optional, nhưng nên có để
admin biết máy nào đã được cấu hình):

```tsx
{
  title: "Loại máy",
  dataIndex: "model",
  key: "model",
  render: (v: string) => v
    ? <Tag>{v}</Tag>
    : <Text type="secondary">Chưa cấu hình</Text>,
}
```

---

### 5. Kiểm tra sau khi xong

```powershell
# Schema có field model chưa
Select-String -Pattern "model.*String" -LiteralPath "prisma\schema.prisma"

# Migration đã chạy
npx prisma migrate status

# API trả model không
Select-String -Pattern "model" -LiteralPath "src\app\api\machines\route.ts"
```

**Kết quả đúng:**

- Schema có dòng `model  String?` trong model Machine
- Migration status: "Database schema is up to date"
- API có xử lý field `model`

---

## Lưu ý

- Field `model` là `String?` (nullable) — máy cũ không bị ảnh hưởng
- Sau khi thêm field, admin cần vào trang quản lý máy để điền `model`
  cho từng máy → sau đó auto-fill trong Kế hoạch SX mới hoạt động
- KHÔNG sửa bất kỳ logic nào khác — strictly additive
