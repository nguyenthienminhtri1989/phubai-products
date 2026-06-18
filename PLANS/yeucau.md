# SPEC PATCH — Nguồn sợi theo từng mặt hàng cho máy multi-item

> **Phiên bản:** 1.0 — patch cho `SPEC_SOURCE_PROCESS_FOR_REVENUE`
> **Vai trò:** Cho phép máy multi-item gán nguồn sợi RIÊNG cho từng mặt hàng. Máy thường giữ nguyên (1 nguồn / máy như spec gốc).
> **Tham chiếu pattern:** giống cách `TASK_MULTI_ITEM_LOT_ASSIGNMENT` đã thêm `lotId` vào `MachineItemAssignment` trước đây.

---

## BỐI CẢNH

`SPEC_SOURCE_PROCESS_FOR_REVENUE` đã triển khai với giả định **1 máy = 1 nguồn sợi** qua `Machine.currentSourceProcessId`. Phát hiện trường hợp thực tế: có máy multi-item chạy đồng thời 2 mặt hàng với 2 nguồn sợi khác nhau (ví dụ: mặt hàng A từ G37, mặt hàng B từ TQ).

**Giải pháp:** thêm `sourceProcessId` vào bảng `MachineItemAssignment`. Logic resolve khi tạo `ProductionLog`:

| Loại máy                                               | Nguồn lấy từ đâu                                |
| ------------------------------------------------------ | ----------------------------------------------- |
| Máy thường (`allowMultiItemPerShift = false`)          | `Machine.currentSourceProcessId` (KHÔNG đổi)    |
| Máy multi-item, có assignment cho cặp (machine, item)  | Ưu tiên `MachineItemAssignment.sourceProcessId` |
| Máy multi-item, assignment có `sourceProcessId = NULL` | Fallback `Machine.currentSourceProcessId`       |

**Calculator v2 KHÔNG cần đổi** — vẫn đọc `sourceProcessId` từ `ProductionLog`. Spec này chỉ thay đổi _cách resolve_ nguồn khi tạo log, bản thân log vẫn chỉ có 1 field `sourceProcessId`.

---

## ĐỌC TRƯỚC KHI CODE

- `prisma/schema.prisma` (model `MachineItemAssignment` — đã có `lotId` từ TASK_MULTI_ITEM_LOT_ASSIGNMENT)
- `src/app/api/machines/[id]/assignments/route.ts` (GET/PUT assignments)
- `src/app/api/machines/route.ts` (GET danh sách máy — đã include `itemAssignments`)
- `src/app/machines/page.tsx` (modal "Phân công mặt hàng" — Form.List dòng mặt hàng + lô)
- `src/app/production/winding-input/page.tsx` (UI tag nguồn sợi đã có từ spec gốc)
- `src/app/api/production/winding/route.ts` (hoặc tên thực tế — file lưu log winding, có logic copy `sourceProcessId` từ `machine.currentSourceProcessId`)

---

## 1. SCHEMA

### 1.1 Thêm `sourceProcessId` vào `MachineItemAssignment`

```prisma
model MachineItemAssignment {
  id              Int      @id @default(autoincrement())
  machineId       Int
  machine         Machine  @relation(fields: [machineId], references: [id])
  itemId          Int
  item            Item     @relation(fields: [itemId], references: [id])
  lotId           Int?
  lot             Lot?     @relation(fields: [lotId], references: [id])

  sourceProcessId Int?                                  // ← THÊM MỚI
  sourceProcess   Process? @relation("AssignmentSourceProcess", fields: [sourceProcessId], references: [id])  // ← THÊM MỚI

  fromSpindle Int?
  toSpindle   Int?
  isActive    Boolean @default(true)
  sortOrder   Int     @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([machineId, itemId])
  @@index([machineId])
  @@index([sourceProcessId])
  @@map("machine_item_assignments")
}
```

### 1.2 Thêm relation ngược trong `Process`

```prisma
model Process {
  // ... giữ nguyên các relation hiện có ...
  assignmentsAsSource MachineItemAssignment[] @relation("AssignmentSourceProcess")  // ← THÊM
}
```

### 1.3 Migration

```bash
npx prisma migrate dev --name add_source_process_to_assignment
```

**Nếu schema drift trên server (P3018/42710):**

```sql
ALTER TABLE machine_item_assignments
  ADD COLUMN IF NOT EXISTS "sourceProcessId" INTEGER REFERENCES processes(id);

CREATE INDEX IF NOT EXISTS "idx_assignments_source_process"
  ON machine_item_assignments("sourceProcessId");
```

Rồi `npx prisma migrate resolve --applied add_source_process_to_assignment`.

> **KHÔNG backfill dữ liệu cũ.** Assignments hiện có để `sourceProcessId = NULL` — chúng sẽ tự fallback về `machine.currentSourceProcessId`. Chỉ cần điều phối viên cập nhật assignment cho máy multi-item đang chạy 2 nguồn khác nhau.

---

## 2. API

### 2.1 GET `/api/machines/[id]/assignments` — include `sourceProcess`

**File:** `src/app/api/machines/[id]/assignments/route.ts`

Trong `findMany`:

```typescript
const assignments = await prisma.machineItemAssignment.findMany({
  where: { machineId: id, isActive: true },
  include: {
    item: { select: { id: true, name: true } },
    lot: { select: { id: true, lotNumber: true } },
    sourceProcess: {
      // ← THÊM
      select: {
        id: true,
        name: true,
        revenueFactory: { select: { id: true, code: true, name: true } },
      },
    },
  },
  orderBy: { sortOrder: "asc" },
});
```

### 2.2 PUT `/api/machines/[id]/assignments` — nhận thêm `sourceProcessId`

```typescript
// Body: { assignments: [{ itemId, lotId?, sourceProcessId?, fromSpindle?, toSpindle?, sortOrder }] }
await prisma.machineItemAssignment.deleteMany({ where: { machineId: id } });
await prisma.machineItemAssignment.createMany({
  data: body.assignments.map((a: any, i: number) => ({
    machineId: id,
    itemId: a.itemId,
    lotId: a.lotId ?? null,
    sourceProcessId: a.sourceProcessId ?? null, // ← THÊM
    fromSpindle: a.fromSpindle ?? null,
    toSpindle: a.toSpindle ?? null,
    sortOrder: a.sortOrder ?? i,
    isActive: true,
  })),
});
```

### 2.3 GET `/api/machines` — include `sourceProcess` trong `itemAssignments`

**File:** `src/app/api/machines/route.ts`

Cập nhật `include` của `itemAssignments`:

```typescript
itemAssignments: {
  where: { isActive: true },
  include: {
    item: { select: { id: true, name: true } },
    lot:  { select: { id: true, lotNumber: true } },
    sourceProcess: {                                    // ← THÊM
      select: {
        id: true, name: true,
        revenueFactory: { select: { id: true, code: true, name: true } }
      }
    },
  },
  orderBy: { sortOrder: "asc" },
}
```

### 2.4 API lưu log winding — sửa logic resolve `sourceProcessId`

**File:** `src/app/api/production/winding/route.ts` (hoặc tên thực tế)

Hiện tại đang copy thẳng `machine.currentSourceProcessId`. Sửa thành:

```typescript
const machine = await prisma.machine.findUnique({
  where: { id: machineId },
  select: {
    allowMultiItemPerShift: true,
    currentSourceProcessId: true,
  },
});

// Resolve sourceProcessId theo loại máy
let resolvedSourceProcessId: number | null = null;

if (machine?.allowMultiItemPerShift && itemId) {
  // Máy multi-item: ưu tiên assignment cho cặp (machine, item)
  const assignment = await prisma.machineItemAssignment.findUnique({
    where: { machineId_itemId: { machineId, itemId } },
    select: { sourceProcessId: true },
  });
  resolvedSourceProcessId = assignment?.sourceProcessId ?? null;
}

// Fallback machine-level (cho máy thường, hoặc multi-item chưa gán assignment)
if (!resolvedSourceProcessId) {
  resolvedSourceProcessId = machine?.currentSourceProcessId ?? null;
}

await prisma.productionLog.create({
  data: {
    // ... các field hiện có ...
    sourceProcessId: resolvedSourceProcessId,
  },
});
```

> **Lưu ý unique constraint:** `MachineItemAssignment` có `@@unique([machineId, itemId])` nên dùng được `findUnique` với compound key `machineId_itemId`. Prisma sẽ generate đúng key này tự động.

---

## 3. UI `/machines` — Modal "Phân công mặt hàng"

**File:** `src/app/machines/page.tsx`

### 3.1 Cập nhật interface `AssignmentData`

```typescript
interface AssignmentData {
  id?: number;
  itemId: number;
  lotId?: number | null;
  sourceProcessId?: number | null; // ← THÊM
  fromSpindle?: number | null;
  toSpindle?: number | null;
  sortOrder?: number;
  item?: { id: number; name: string };
  lot?: { id: number; lotNumber: string } | null;
  sourceProcess?: {
    // ← THÊM
    id: number;
    name: string;
    revenueFactory?: { id: number; code: string; name: string } | null;
  } | null;
}
```

### 3.2 State `sourceOptions` đã có sẵn từ spec gốc

Modal điều phối chi tiết tái dùng state `sourceOptions` đã load ở mount component (từ `/api/processes/source-options`). Nếu modal đang là component con không share state, fetch riêng trong modal.

### 3.3 `Form.List` thêm Select "Nguồn sợi" mỗi dòng

Trong modal "Điều phối chi tiết", mỗi dòng trong `Form.List` hiện có cấu trúc: Mặt hàng + Lô + Cọc từ + Cọc đến. Thêm Select "Nguồn sợi":

```tsx
<Form.List name="assignments">
  {(fields, { add, remove }) => (
    <>
      {fields.map(({ key, name, ...rest }) => (
        <Space
          key={key}
          align="baseline"
          style={{ display: "flex", marginBottom: 8 }}
        >
          {/* Mặt hàng — giữ nguyên */}
          <Form.Item
            {...rest}
            name={[name, "itemId"]}
            rules={[{ required: true }]}
          >
            <Select
              style={{ width: 180 }}
              options={itemOptions}
              placeholder="Mặt hàng"
            />
          </Form.Item>

          {/* Lô — giữ nguyên */}
          <Form.Item
            shouldUpdate={/* ... logic lọc lô theo itemId hiện có ... */}
            noStyle
          >
            {/* ... Select lô ... */}
          </Form.Item>

          {/* Nguồn sợi — THÊM MỚI */}
          <Form.Item {...rest} name={[name, "sourceProcessId"]}>
            <Select
              allowClear
              style={{ width: 160 }}
              placeholder="Nguồn sợi"
              options={sourceOptions.map((p) => ({
                label: `${p.name} → ${p.revenueFactory?.code || "?"}`,
                value: p.id,
              }))}
            />
          </Form.Item>

          {/* Cọc từ, cọc đến, nút xóa — giữ nguyên */}
          {/* ... */}
        </Space>
      ))}
      <Button onClick={() => add()}>+ Thêm mặt hàng</Button>
    </>
  )}
</Form.List>
```

### 3.4 Khi load assignments để mở modal — set `sourceProcessId` vào form

Hàm `openMultiItemModal` (hoặc tương đương) đang setFieldsValue với `assignments` từ API. Vì API GET đã trả `sourceProcessId` (mục 2.1), `form.setFieldsValue` tự fill — KHÔNG cần sửa code load.

### 3.5 Khi `handleSaveAssignments` gửi PUT — bao gồm `sourceProcessId`

Form.List tự gom field `sourceProcessId` vào `values.assignments[i]`. PUT API đã nhận field này (mục 2.2). **Không cần sửa hàm save** — chỉ verify body request có `sourceProcessId` bằng console.log nếu nghi ngờ.

### 3.6 (TÙY CHỌN) Cột bảng máy hiển thị nhiều nguồn cho multi-item

Cột "Nguồn sợi" trong bảng máy ở spec gốc đang render `currentSourceProcess` (mức máy). Với máy multi-item, có thể render danh sách nguồn từ assignments:

```tsx
{
  title: "Nguồn sợi",
  key: "source",
  width: 160,
  render: (_: any, r: MachineData) => {
    if (!r.process?.isRevenueProcess) return null;

    // Máy multi-item: hiển thị nguồn từ assignments
    if (r.allowMultiItemPerShift && r.itemAssignments?.length) {
      const sources = r.itemAssignments
        .filter(a => a.sourceProcess)
        .map(a => a.sourceProcess!);

      if (sources.length === 0) {
        // Tất cả assignment chưa gán → hiển thị nguồn cấp máy (fallback)
        return r.currentSourceProcess
          ? <Tag color="cyan">{r.currentSourceProcess.name} <span style={{ fontSize: 10 }}>(mặc định)</span></Tag>
          : <Tag color="red">Chưa gán</Tag>;
      }

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sources.map((sp, i) => (
            <Tag key={`${sp.id}-${i}`} color="cyan" style={{ fontSize: 11, margin: 0 }}>
              {sp.name} → {sp.revenueFactory?.code || '?'}
            </Tag>
          ))}
        </div>
      );
    }

    // Máy thường: giữ logic spec gốc
    return r.currentSourceProcess
      ? <Tag color="cyan" style={{ fontWeight: 600 }}>
          {r.currentSourceProcess.name}
          {r.currentSourceProcess.revenueFactory?.code &&
            <span style={{ marginLeft: 4, fontWeight: 400, fontSize: 11 }}>
              →{r.currentSourceProcess.revenueFactory.code}
            </span>
          }
        </Tag>
      : <Tag color="red">Chưa gán</Tag>;
  }
}
```

---

## 4. UI `/production/winding-input` — Tag nguồn theo từng mặt hàng (chỉ cho máy multi-item)

**File:** `src/app/production/winding-input/page.tsx`

### 4.1 Hiện trạng theo spec gốc

Mỗi dòng máy có 1 tag "Nguồn: ..." clickable ở mức máy → click mở UI đổi `Machine.currentSourceProcessId`. **Logic này GIỮ NGUYÊN cho máy thường.**

### 4.2 Với máy multi-item — tag riêng cho từng mặt hàng

Máy multi-item render N ô nhập (mỗi ô 1 mặt hàng theo `MachineItemAssignment`). Tag nguồn sợi phải gắn theo **từng ô**, không phải theo cả máy.

```tsx
{
  /* Máy multi-item: render N ô */
}
{
  machine.allowMultiItemPerShift &&
    machine.itemAssignments?.map((a) => (
      <div key={a.itemId} style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <Tag color="purple">{a.item?.name}</Tag>
          {a.lot && <Tag color="orange">{a.lot.lotNumber}</Tag>}

          {/* Tag NGUỒN SỢI — clickable, mỗi mặt hàng riêng */}
          <Popconfirm
            title={`Đổi nguồn sợi cho mặt hàng "${a.item?.name}"`}
            description={
              <div style={{ minWidth: 220, paddingTop: 8 }}>
                <Select
                  style={{ width: "100%" }}
                  placeholder="Chọn nguồn sợi mới"
                  value={pendingAssignmentSource[`${machine.id}-${a.itemId}`]}
                  onChange={(v) =>
                    setPendingAssignmentSource((prev) => ({
                      ...prev,
                      [`${machine.id}-${a.itemId}`]: v,
                    }))
                  }
                  options={sourceOptions.map((p) => ({
                    label: `${p.name} → ${p.revenueFactory?.code || "?"}`,
                    value: p.id,
                  }))}
                />
                <div style={{ marginTop: 8, fontSize: 11, color: "#888" }}>
                  Chỉ áp dụng cho mặt hàng "{a.item?.name}" trên máy này. Các
                  bản ghi từ giờ sẽ áp dụng nguồn mới.
                </div>
              </div>
            }
            onConfirm={() =>
              handleChangeAssignmentSource(
                machine.id,
                a.itemId,
                pendingAssignmentSource[`${machine.id}-${a.itemId}`],
              )
            }
            okText="Xác nhận"
            cancelText="Hủy"
          >
            <Tag color="cyan" style={{ cursor: "pointer" }}>
              Nguồn:{" "}
              {a.sourceProcess?.name ||
                machine.currentSourceProcess?.name ||
                "Chưa gán"}
              <DownOutlined style={{ marginLeft: 4, fontSize: 10 }} />
            </Tag>
          </Popconfirm>
        </div>

        {/* Ô nhập sản lượng cho mặt hàng a — giữ logic hiện có */}
        <InputNumber
          placeholder="Sản lượng (kg)"
          value={multiInputStates[machine.id]?.[a.itemId]}
          onChange={(v) => updateMultiInput(machine.id, a.itemId, v)}
          style={{ width: "100%" }}
        />
      </div>
    ));
}

{
  /* Máy thường: giữ logic spec gốc — tag nguồn ở mức máy */
}
{
  !machine.allowMultiItemPerShift && (
    <>{/* ... UI hiện có, bao gồm tag nguồn mức máy ... */}</>
  );
}
```

### 4.3 State `pendingAssignmentSource` — key theo cặp (machineId, itemId)

```typescript
const [pendingAssignmentSource, setPendingAssignmentSource] = useState<
  Record<string, number | undefined>
>({});
```

Key dạng `"${machineId}-${itemId}"` để phân biệt từng mặt hàng trong máy multi-item.

### 4.4 Handler `handleChangeAssignmentSource` — gọi PUT assignments

Cách 1 (đơn giản, an toàn): gọi `PUT /api/machines/[id]/assignments` với toàn bộ danh sách, chỉ thay đổi `sourceProcessId` của 1 dòng:

```typescript
const handleChangeAssignmentSource = async (
  machineId: number,
  itemId: number,
  newSourceProcessId?: number,
) => {
  if (!newSourceProcessId) {
    message.warning("Vui lòng chọn nguồn sợi");
    return;
  }

  // Lấy assignments hiện tại (từ state machine đã load)
  const machine = machines.find((m) => m.id === machineId);
  if (!machine?.itemAssignments) return;

  // Tạo payload assignments mới với sourceProcessId thay đổi cho 1 dòng
  const newAssignments = machine.itemAssignments.map((a) => ({
    itemId: a.itemId,
    lotId: a.lotId ?? null,
    sourceProcessId:
      a.itemId === itemId ? newSourceProcessId : (a.sourceProcessId ?? null),
    fromSpindle: a.fromSpindle ?? null,
    toSpindle: a.toSpindle ?? null,
    sortOrder: a.sortOrder ?? 0,
  }));

  const res = await fetch(`/api/machines/${machineId}/assignments`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignments: newAssignments }),
  });

  if (!res.ok) {
    message.error("Đổi nguồn sợi thất bại");
    return;
  }

  message.success(`Đã đổi nguồn sợi cho mặt hàng. Bản ghi từ giờ sẽ áp dụng.`);
  setPendingAssignmentSource((prev) => ({
    ...prev,
    [`${machineId}-${itemId}`]: undefined,
  }));
  await refetchMachines();
};
```

> **Lý do dùng PUT replace-all thay vì PATCH 1 dòng:** API `assignments` hiện tại là replace-all (xóa hết rồi tạo lại — xem mục 2.2 spec gốc TASK_MULTI_ITEM_LOT_ASSIGNMENT). Tái dùng pattern này thay vì tạo endpoint PATCH mới.

### 4.5 Hiển thị nguồn sợi khi chưa gán riêng — fallback xuống máy

Trong UI tag nguồn (mục 4.2), thứ tự ưu tiên hiển thị:

1. `a.sourceProcess?.name` (assignment đã gán)
2. `machine.currentSourceProcess?.name` (fallback mức máy)
3. `'Chưa gán'`

Như vậy điều phối viên nhìn vào UI luôn thấy nguồn thực tế sẽ áp dụng khi tạo log, không bị nhầm.

---

## 5. VERIFY

### 5.1 Schema

- [ ] Migration chạy OK trên dev + production
- [ ] `\d machine_item_assignments` (psql) thấy cột `sourceProcessId` và index `idx_assignments_source_process`
- [ ] Assignments cũ có `sourceProcessId = NULL` (chưa backfill, đúng kế hoạch)

### 5.2 UI `/machines` — Modal điều phối chi tiết

- [ ] Mở modal "Phân công mặt hàng" của máy multi-item → mỗi dòng có Select "Nguồn sợi" với 3 options (G33/TQ/G37)
- [ ] Gán mặt hàng A → G37, mặt hàng B → TQ → lưu → reload trang → giá trị giữ đúng
- [ ] Bảng máy multi-item: cột "Nguồn sợi" hiển thị nhiều tag (mỗi mặt hàng 1 tag), kèm code revenueFactory

### 5.3 UI `/production/winding-input`

- [ ] Máy thường: tag "Nguồn: ..." vẫn ở mức máy (như spec gốc), click đổi → PUT `/api/machines/[id]` (không đổi gì)
- [ ] Máy multi-item: mỗi mặt hàng có tag "Nguồn: ..." riêng
- [ ] Click tag mặt hàng A → đổi sang TQ → xác nhận → tag cập nhật, các bản ghi tiếp theo cho mặt hàng A có `sourceProcessId = TQ`
- [ ] Trong khi đó, mặt hàng B trên cùng máy đó vẫn giữ `sourceProcessId = G37`
- [ ] Assignment chưa gán `sourceProcessId` → UI hiển thị nguồn của Machine (fallback)

### 5.4 Backend resolve `sourceProcessId`

- [ ] Tạo log cho máy multi-item, mặt hàng A có `assignment.sourceProcessId = G37` → SQL kiểm tra log có `sourceProcessId = G37`
- [ ] Tạo log cho máy multi-item, mặt hàng B trên CÙNG máy, có `assignment.sourceProcessId = TQ` → log có `sourceProcessId = TQ`
- [ ] Tạo log cho máy multi-item, mặt hàng C có `assignment.sourceProcessId = NULL`, `machine.currentSourceProcessId = G33` → log có `sourceProcessId = G33` (fallback)
- [ ] Tạo log cho máy thường → log có `sourceProcessId = machine.currentSourceProcessId` (không đổi từ spec gốc)

### 5.5 Calculator (không cần đổi code, chỉ verify output)

- [ ] Máy multi-item chạy 2 mặt hàng cùng máy: mặt hàng A (G37, 500kg) và mặt hàng B (TQ, 300kg) trong cùng 1 ca
- [ ] Dashboard doanh thu: 500kg vào nhóm NM2, 300kg vào nhóm NM1 — tách đúng dù chung 1 máy

---

## 6. TỔNG KẾT THAY ĐỔI

| File                                                         | Thay đổi                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prisma/schema.prisma`                                       | Thêm `sourceProcessId` + relation `sourceProcess` vào `MachineItemAssignment`. Thêm `@@index` và relation ngược `assignmentsAsSource` trong `Process`.                                                                         |
| Migration `add_source_process_to_assignment`                 | DDL 1 cột + 1 index.                                                                                                                                                                                                           |
| `src/app/api/machines/[id]/assignments/route.ts`             | GET: include `sourceProcess`. PUT: nhận và lưu `sourceProcessId`.                                                                                                                                                              |
| `src/app/api/machines/route.ts`                              | GET: thêm `sourceProcess` vào `include` của `itemAssignments`.                                                                                                                                                                 |
| `src/app/api/production/winding/route.ts` (hoặc tên thực tế) | Sửa logic resolve `sourceProcessId`: ưu tiên `MachineItemAssignment.sourceProcessId` cho máy multi-item, fallback `Machine.currentSourceProcessId`.                                                                            |
| `src/app/machines/page.tsx`                                  | Interface `AssignmentData` thêm `sourceProcessId`/`sourceProcess`. Modal Form.List thêm Select "Nguồn sợi". Cột bảng máy multi-item render nhiều tag nguồn (tùy chọn).                                                         |
| `src/app/production/winding-input/page.tsx`                  | Máy multi-item: render tag "Nguồn: ..." cho TỪNG mặt hàng. State `pendingAssignmentSource` key theo `${machineId}-${itemId}`. Handler `handleChangeAssignmentSource` gọi PUT assignments (replace-all). Máy thường: KHÔNG đổi. |
| `src/lib/allocation-engine-v2.ts`                            | **KHÔNG đổi** — vẫn đọc `sourceProcessId` từ `ProductionLog`.                                                                                                                                                                  |
| `src/lib/revenue-calculator-v2.ts` (nếu có)                  | **KHÔNG đổi**.                                                                                                                                                                                                                 |

---

## 7. GHI CHÚ CHO CLAUDE CODE

1. **ĐỌC TRƯỚC** `TASK_MULTI_ITEM_LOT_ASSIGNMENT.md` để hiểu pattern thêm field vào `MachineItemAssignment` đã làm cho `lotId`. Spec này lặp lại y pattern đó, chỉ đổi field thành `sourceProcessId`.

2. **PUT assignments là replace-all** — xóa hết rồi tạo lại. Khi đổi nguồn tại winding-input, FE phải gửi đầy đủ array assignments hiện tại (chỉ thay đổi `sourceProcessId` của 1 dòng). Nếu không gửi đủ, các dòng khác sẽ mất.

3. **Logic resolve có thứ tự ưu tiên rõ ràng** (mục 2.4):

   ```
   if (multi-item && có assignment) → assignment.sourceProcessId
   else → machine.currentSourceProcessId
   ```

   Cả 2 đều có thể NULL → log có `sourceProcessId = NULL` → calculator fallback theo `machine.process.factoryId` (như spec gốc đã xử lý).

4. **KHÔNG sửa calculator** — đây là điều thiết kế tốt: cả máy thường và máy multi-item đều ghi `sourceProcessId` lên `ProductionLog`. Calculator chỉ đọc field này mà không biết nguồn đến từ Machine hay từ Assignment. Tách concern sạch.

5. **KHÔNG backfill** assignments cũ. Để `sourceProcessId = NULL` → fallback xuống Machine tự nhiên. Chỉ điều phối viên thấy "máy này đang chạy 2 nguồn" mới vào modal gán riêng.

6. **Tag fallback hiển thị rõ** ở winding-input (mục 4.5) — nếu assignment chưa gán nguồn, tag vẫn hiện nguồn mức máy với chữ "(mặc định)" hoặc tương đương để người dùng biết đây là fallback chứ không phải gán riêng.

7. **Verify mục 5.4 với log thực tế** — đặc biệt test case 2 mặt hàng cùng máy nhưng khác nguồn (case sinh ra spec này). Đây là kịch bản gốc cần được đảm bảo hoạt động.

8. **KHÔNG audit log** trong patch này.
