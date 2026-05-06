# TASK: Máy ống chạy nhiều mặt hàng song song

## Đọc các file sau trước khi code:

- `prisma/schema.prisma` (model Machine, ProductionLog)
- `src/app/machines/page.tsx` (trang điều phối)
- `src/app/kd-daily-input/page.tsx` (trang nhập SL mobile)
- `src/app/api/machines/route.ts` và `src/app/api/machines/[id]/route.ts`
- `src/app/api/production/daily-input/route.ts`

---

## 1. Schema

### 1.1 Thêm field vào Machine:

```prisma
allowMultiItemPerShift Boolean @default(false)
```

### 1.2 Thêm model mới:

```prisma
model MachineItemAssignment {
  id          Int     @id @default(autoincrement())
  machineId   Int
  machine     Machine @relation(fields: [machineId], references: [id])
  itemId      Int
  item        Item    @relation(fields: [itemId], references: [id])
  fromSpindle Int?
  toSpindle   Int?
  isActive    Boolean @default(true)
  sortOrder   Int     @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([machineId, itemId])
  @@index([machineId])
  @@map("machine_item_assignments")
}
```

Thêm relation ngược trong Machine và Item:

```prisma
// Machine:
itemAssignments MachineItemAssignment[]

// Item:
machineAssignments MachineItemAssignment[]
```

Migration: `npx prisma migrate dev --name add_multi_item_assignment`

---

## 2. API mới: CRUD assignments

### File mới: `src/app/api/machines/[id]/assignments/route.ts`

**GET**: lấy assignments của máy

```typescript
const assignments = await prisma.machineItemAssignment.findMany({
  where: { machineId: id, isActive: true },
  include: { item: { select: { id: true, name: true } } },
  orderBy: { sortOrder: "asc" },
});
```

**PUT**: nhận array assignments, xóa cũ tạo mới (replace all)

```typescript
// Body: { assignments: [{ itemId, fromSpindle?, toSpindle?, sortOrder }] }
await prisma.machineItemAssignment.deleteMany({ where: { machineId: id } });
await prisma.machineItemAssignment.createMany({
  data: body.assignments.map((a, i) => ({
    machineId: id,
    itemId: a.itemId,
    fromSpindle: a.fromSpindle ?? null,
    toSpindle: a.toSpindle ?? null,
    sortOrder: a.sortOrder ?? i,
    isActive: true,
  })),
});
```

---

## 3. UI Machines — modal điều phối cho máy multi-item

File: `src/app/machines/page.tsx`

### 3.1 Thêm field `allowMultiItemPerShift` vào form tạo/sửa máy:

```tsx
<Form.Item
  name="allowMultiItemPerShift"
  valuePropName="checked"
  label="Chạy nhiều MH/ca"
>
  <Switch checkedChildren="Có" unCheckedChildren="Không" />
</Form.Item>
```

### 3.2 Thêm nút "Điều phối chi tiết" cho máy có `allowMultiItemPerShift = true`

Cột Hành động, thêm nút bên cạnh nút Sửa:

```tsx
{
  r.allowMultiItemPerShift && (
    <Button
      size="small"
      icon={<ThunderboltOutlined />}
      onClick={() => openMultiItemModal(r)}
    />
  );
}
```

### 3.3 Modal điều phối chi tiết (mới)

Form dạng `Form.List` cho phép thêm/xóa dòng:

```tsx
// Mỗi dòng:
// [Select mặt hàng] [Cọc từ (number)] [Cọc đến (number)] [Xóa]
// [+ Thêm mặt hàng]
// [Lưu]
```

Khi mở modal: fetch `GET /api/machines/{id}/assignments` để load assignments hiện có.
Khi lưu: gọi `PUT /api/machines/{id}/assignments` với toàn bộ danh sách.

### 3.4 Cập nhật interface MachineData:

```typescript
allowMultiItemPerShift?: boolean;
```

### 3.5 API PUT machine nhận field mới:

Đọc `src/app/api/machines/[id]/route.ts`, thêm `allowMultiItemPerShift` vào update data.

---

## 4. Mobile input — render nhiều ô cho máy multi-item

File: `src/app/kd-daily-input/page.tsx`

### 4.1 Khi load máy, fetch assignments nếu `allowMultiItemPerShift`:

```typescript
// Sau khi load machines, với mỗi máy multi-item:
if (machine.allowMultiItemPerShift) {
  const res = await fetch(`/api/machines/${machine.id}/assignments`);
  const assignments = await res.json();
  // Lưu vào state: machineAssignments[machineId] = assignments
}
```

### 4.2 Render UI theo loại máy:

**Máy thường** (`allowMultiItemPerShift = false`): giữ nguyên UI hiện tại (1 ô, startIndex/endIndex).

**Máy multi-item** (`allowMultiItemPerShift = true`): render N ô nhập, mỗi ô 1 mặt hàng:

```tsx
// Thay vì 1 form startIndex/endIndex, render:
{
  assignments.map((a) => (
    <div key={a.itemId}>
      <div>
        {a.item.name} {a.fromSpindle && `(cọc ${a.fromSpindle}-${a.toSpindle})`}
      </div>
      <InputNumber
        placeholder="Sản lượng (kg)"
        value={multiInputStates[machine.id]?.[a.itemId]}
        onChange={(v) => updateMultiInput(machine.id, a.itemId, v)}
        style={{ width: "100%", height: 56, fontSize: 24 }}
        inputMode="decimal"
      />
    </div>
  ));
}
```

### 4.3 Lưu nhiều records:

Khi bấm "Lưu", với máy multi-item, tạo 1 ProductionLog per assignment:

```typescript
for (const a of assignments) {
  const kg = multiInputStates[machine.id]?.[a.itemId] ?? 0;
  if (kg <= 0) continue;
  await fetch("/api/production/daily-input", {
    method: "POST",
    body: JSON.stringify({
      recordDate: dateStr,
      shift: selectedShift,
      machineId: machine.id,
      itemId: a.itemId,
      startIndex: 0,
      endIndex: 0,
      inputNE: 0,
      finalOutput: kg,
      note: a.fromSpindle ? `Cọc ${a.fromSpindle}-${a.toSpindle}` : null,
    }),
  });
}
```

### 4.4 Load phiên trước cho máy multi-item:

Khi load previous indexes, với máy multi-item: query tất cả ProductionLog cho máy đó trong ca+ngày, group by itemId → fill vào multiInputStates.

### 4.5 Nút "Đổi hàng giữa ca" vẫn giữ cho máy thường. Máy multi-item không cần (đã có nhiều ô sẵn).

---

## 5. Verify

```powershell
# Schema
Select-String -Pattern "allowMultiItemPerShift|MachineItemAssignment" -LiteralPath "prisma\schema.prisma" | Select-Object -First 5

# API
Test-Path "src\app\api\machines\[id]\assignments\route.ts"

# UI
Select-String -Pattern "allowMultiItemPerShift|multiItem|assignments" -LiteralPath "src\app\machines\page.tsx" | Select-Object -First 5
Select-String -Pattern "allowMultiItemPerShift|multiInput|assignments" -LiteralPath "src\app\kd-daily-input\page.tsx" | Select-Object -First 5
```
