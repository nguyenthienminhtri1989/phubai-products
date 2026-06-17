# SPEC SOURCE PROCESS — Phân tách doanh thu đánh ống theo nguồn sợi

> **Phiên bản:** 1.0 — 2026-06-17
> **Vai trò:** Cho phép phân tách doanh thu/sản lượng công đoạn đánh ống theo nhà máy quy ước cho doanh thu (G33+TQ → NM1, G37 → NM2), trong khi `Factory` địa lý hiện tại giữ nguyên cho các thống kê vận hành khác.
> **Phụ thuộc:** Hệ thống đã có `Factory` (NM1/NM2/NM3), `Process` (gồm các process sợi con G33/TQ/G37 và process Đánh ống với `isRevenueProcess = true`), `Machine`, `ProductionLog`.

---

## BỐI CẢNH

Hiện tại `Factory` trong DB là vị trí địa lý: G33 thuộc NM1; TQ và G37 thuộc NM2. Máy ống đặt cố định ở NM1 hoặc NM2 nhưng dòng sợi chạy qua nó thay đổi linh hoạt — máy ống NM2 có khi quấn sợi TQ (vẫn thuộc NM2), có khi quấn sợi G37. Phòng KD muốn tách doanh thu theo nguồn sợi:

| Nguồn sợi của bản ghi đánh ống | Quy về nhà máy doanh thu |
| ------------------------------ | ------------------------ |
| G33                            | NM1                      |
| Trung Quốc                     | NM1                      |
| G37                            | NM2                      |

Không thể suy từ riêng vị trí máy ống vì cùng một máy ống NM2 có thể tạo doanh thu cho cả NM1 (khi quấn sợi TQ) và NM2 (khi quấn G37).

**Giải pháp:**

1. Thêm `Process.revenueFactoryId` — cấu hình một lần cho 3 process sợi con.
2. Thêm `Machine.currentSourceProcessId` — sticky qua ca, đổi tại `/machines` hoặc tại chỗ trên `/production/winding-input`.
3. Thêm `ProductionLog.sourceProcessId` — backend tự copy từ machine khi tạo log.
4. Calculator v2 đổi `GROUP BY` từ `machine.process.factoryId` → `sourceProcess.revenueFactoryId`.

Toàn bộ thay đổi **strictly additive** — không đụng dữ liệu cũ, không vỡ logic nào đang chạy.

---

## ĐỌC TRƯỚC KHI CODE

- `prisma/schema.prisma` (Process, Machine, ProductionLog, Factory)
- `src/app/machines/page.tsx` (form sửa máy, bảng máy)
- `src/app/api/machines/route.ts` (GET danh sách)
- `src/app/api/machines/[id]/route.ts` (PUT máy)
- `src/app/production/winding-input/page.tsx` — **QUAN TRỌNG**: đọc kỹ pattern đổi mặt hàng/lot tại chỗ đang có để follow đúng style (Modal hay Popconfirm hay inline edit)
- `src/app/api/production/winding/route.ts` (hoặc tên thực tế — file lưu ProductionLog từ winding-input)
- `src/lib/allocation-engine-v2.ts` (calculator chính)
- `src/lib/revenue-calculator-v2.ts` (nếu có) — hoặc tên thực tế của calculator doanh thu

---

## 1. SCHEMA

### 1.1 Process — thêm `revenueFactoryId`

```prisma
model Process {
  // ... giữ nguyên các field hiện có (id, name, factoryId, isRevenueProcess, ...) ...

  revenueFactoryId Int?     // Nhà máy quy ước cho doanh thu (NULL với process không phải sợi con)
  revenueFactory   Factory? @relation("ProcessRevenueFactory", fields: [revenueFactoryId], references: [id])

  // Relation ngược cho 2 model dưới:
  machinesAsSource Machine[]       @relation("MachineSourceProcess")
  logsAsSource     ProductionLog[] @relation("LogSourceProcess")
}
```

### 1.2 Machine — thêm `currentSourceProcessId`

```prisma
model Machine {
  // ... giữ nguyên ...

  currentSourceProcessId Int?
  currentSourceProcess   Process? @relation("MachineSourceProcess", fields: [currentSourceProcessId], references: [id])
}
```

### 1.3 ProductionLog — thêm `sourceProcessId`

```prisma
model ProductionLog {
  // ... giữ nguyên ...

  sourceProcessId Int?
  sourceProcess   Process? @relation("LogSourceProcess", fields: [sourceProcessId], references: [id])

  @@index([sourceProcessId])
}
```

### 1.4 Factory — thêm relation ngược

```prisma
model Factory {
  // ... giữ nguyên ...

  processesForRevenue Process[] @relation("ProcessRevenueFactory")
}
```

### 1.5 Migration

```bash
npx prisma migrate dev --name add_source_process_for_revenue
```

**Nếu schema drift trên server (P3018/42710):**

```sql
ALTER TABLE processes        ADD COLUMN IF NOT EXISTS "revenueFactoryId"       INTEGER REFERENCES factories(id);
ALTER TABLE machines         ADD COLUMN IF NOT EXISTS "currentSourceProcessId" INTEGER REFERENCES processes(id);
ALTER TABLE production_logs  ADD COLUMN IF NOT EXISTS "sourceProcessId"        INTEGER REFERENCES processes(id);

CREATE INDEX IF NOT EXISTS "idx_production_logs_source_process" ON production_logs("sourceProcessId");
CREATE INDEX IF NOT EXISTS "idx_machines_source_process"        ON machines("currentSourceProcessId");
```

Rồi `npx prisma migrate resolve --applied add_source_process_for_revenue`.

---

## 2. CẤU HÌNH BAN ĐẦU (chạy 1 lần ngay sau migration)

### 2.1 Verify mã/tên Factory và Process trước khi UPDATE

```sql
-- Kiểm tra tên thật của Factory
SELECT id, code, name FROM factories;

-- Kiểm tra tên thật của 3 process sợi con
SELECT id, name, "factoryId"
FROM processes
WHERE name ILIKE '%G33%' OR name ILIKE '%G37%' OR name ILIKE '%Trung Quốc%' OR name ILIKE '%TQ%';
```

> ⚠ Điều chỉnh WHERE clause ở bước 2.2 và 2.3 cho khớp với tên thực tế nếu khác.

### 2.2 Set `revenueFactoryId` cho 3 process sợi con

```sql
-- G33 + TQ → NM1
UPDATE processes
SET "revenueFactoryId" = (SELECT id FROM factories WHERE code = 'NM1' LIMIT 1)
WHERE name ILIKE '%G33%' OR name ILIKE '%Trung Quốc%' OR name ILIKE '%TQ%';

-- G37 → NM2
UPDATE processes
SET "revenueFactoryId" = (SELECT id FROM factories WHERE code = 'NM2' LIMIT 1)
WHERE name ILIKE '%G37%';

-- Verify
SELECT p.id, p.name,
       p."factoryId" AS location_factory_id,
       p."revenueFactoryId" AS revenue_factory_id,
       rf.code AS revenue_factory_code
FROM processes p
LEFT JOIN factories rf ON p."revenueFactoryId" = rf.id
WHERE p."revenueFactoryId" IS NOT NULL;
```

### 2.3 Backfill `Machine.currentSourceProcessId` cho máy ống NM1

Máy ống ở NM1 chỉ có một nguồn khả dĩ (G33) → gán mặc định. Máy ống ở NM2 có 2 nguồn (TQ/G37) → để NULL, điều phối viên gán tay.

```sql
UPDATE machines m
SET "currentSourceProcessId" = (SELECT id FROM processes WHERE name ILIKE '%G33%' LIMIT 1)
FROM processes p
WHERE m."processId" = p.id
  AND p."isRevenueProcess" = true
  AND p."factoryId" = (SELECT id FROM factories WHERE code = 'NM1' LIMIT 1);

-- Verify máy ống nào còn thiếu nguồn
SELECT m.id, m.name, p.name AS process, f.code AS location_factory,
       m."currentSourceProcessId", sp.name AS source_process
FROM machines m
JOIN processes p ON m."processId" = p.id
JOIN factories f ON p."factoryId" = f.id
LEFT JOIN processes sp ON m."currentSourceProcessId" = sp.id
WHERE p."isRevenueProcess" = true
ORDER BY f.code, m.name;
```

---

## 3. API

### 3.1 `GET /api/machines` — include source process

**File:** `src/app/api/machines/route.ts`

Thêm vào `include` của `findMany`:

```typescript
include: {
  // ... giữ nguyên các include hiện có ...
  currentSourceProcess: {
    select: {
      id: true, name: true,
      revenueFactory: { select: { id: true, code: true, name: true } }
    }
  },
}
```

### 3.2 `PUT /api/machines/[id]` — nhận `currentSourceProcessId`

**File:** `src/app/api/machines/[id]/route.ts`

Trong destructure body và update data:

```typescript
const { /* ... */ currentSourceProcessId /* ... */ } = body;

await prisma.machine.update({
  where: { id },
  data: {
    // ... các field hiện có ...
    currentSourceProcessId: currentSourceProcessId ?? null,
  },
});
```

> **Pattern đổi tại chỗ ở `/production/winding-input` TÁI DÙNG PUT này** — không tạo endpoint riêng, để đồng nhất với cách đổi mặt hàng/lot hiện tại. Nếu code base hiện tại có pattern khác cho đổi tại chỗ (ví dụ PATCH riêng), follow theo cách đó.

### 3.3 `GET /api/processes/source-options` — list 3 nguồn sợi cho Select

**File mới:** `src/app/api/processes/source-options/route.ts`

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const processes = await prisma.process.findMany({
    where: { revenueFactoryId: { not: null } },
    select: {
      id: true,
      name: true,
      revenueFactory: { select: { id: true, code: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(processes);
}
```

Trả về (ví dụ):

```json
[
  {
    "id": 7,
    "name": "Sợi con G33",
    "revenueFactory": { "id": 1, "code": "NM1", "name": "Nhà máy 1" }
  },
  {
    "id": 8,
    "name": "Sợi con G37",
    "revenueFactory": { "id": 2, "code": "NM2", "name": "Nhà máy 2" }
  },
  {
    "id": 9,
    "name": "Sợi con Trung Quốc",
    "revenueFactory": { "id": 1, "code": "NM1", "name": "Nhà máy 1" }
  }
]
```

### 3.4 API lưu log winding — backend tự copy `sourceProcessId`

**File:** `src/app/api/production/winding/route.ts` (hoặc tên thực tế — Claude Code xác định)

Khi tạo `ProductionLog`, đọc `currentSourceProcessId` từ Machine và copy vào log:

```typescript
const machine = await prisma.machine.findUnique({
  where: { id: machineId },
  select: { currentSourceProcessId: true },
});

await prisma.productionLog.create({
  data: {
    // ... các field hiện có (recordDate, shift, machineId, itemId, lotId, finalOutput, ...) ...
    sourceProcessId: machine?.currentSourceProcessId ?? null,
  },
});
```

> Frontend KHÔNG cần truyền `sourceProcessId` — đây là field do backend tự xử lý từ cấu hình Machine.

---

## 4. UI `/machines`

**File:** `src/app/machines/page.tsx`

### 4.1 Cập nhật interface

```typescript
interface MachineData {
  // ... giữ nguyên ...
  currentSourceProcessId?: number | null;
  currentSourceProcess?: {
    id: number;
    name: string;
    revenueFactory?: { id: number; code: string; name: string } | null;
  } | null;
}

interface SourceOption {
  id: number;
  name: string;
  revenueFactory?: { id: number; code: string; name: string } | null;
}
```

### 4.2 State + load options

```typescript
const [sourceOptions, setSourceOptions] = useState<SourceOption[]>([]);

useEffect(() => {
  fetch("/api/processes/source-options")
    .then((r) => r.json())
    .then((d) => setSourceOptions(Array.isArray(d) ? d : []))
    .catch(() => setSourceOptions([]));
}, []);
```

### 4.3 Form sửa máy — thêm `Select` "Nguồn sợi"

Chỉ hiển thị khi máy thuộc công đoạn đánh ống (process có `isRevenueProcess = true`). Đặt sau Select mặt hàng/lô:

```tsx
{
  /* Chỉ hiển thị cho máy đánh ống */
}
{
  editingMachine?.process?.isRevenueProcess && (
    <Form.Item
      name="currentSourceProcessId"
      label="Nguồn sợi"
      tooltip="Sợi đang được quấn đến từ máy con nào — dùng để tính doanh thu theo nhà máy"
    >
      <Select
        allowClear
        placeholder="Chọn nguồn sợi..."
        options={sourceOptions.map((p) => ({
          label: `${p.name} → ${p.revenueFactory?.code || "?"}`,
          value: p.id,
        }))}
      />
    </Form.Item>
  );
}
```

### 4.4 PUT body — gửi field mới

Trong hàm submit form, đảm bảo `currentSourceProcessId` từ form đi vào body PUT:

```typescript
await fetch(`/api/machines/${editingMachine.id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    // ... các field hiện có ...
    currentSourceProcessId: values.currentSourceProcessId ?? null,
  }),
});
```

### 4.5 Cột "Nguồn sợi" trong bảng máy

```tsx
{
  title: "Nguồn sợi",
  key: "source",
  width: 140,
  render: (_: any, r: MachineData) => {
    if (!r.process?.isRevenueProcess) return null;
    return r.currentSourceProcess
      ? (
        <Tag color="cyan" style={{ fontWeight: 600 }}>
          {r.currentSourceProcess.name}
          {r.currentSourceProcess.revenueFactory?.code &&
            <span style={{ marginLeft: 4, fontWeight: 400, fontSize: 11 }}>
              →{r.currentSourceProcess.revenueFactory.code}
            </span>
          }
        </Tag>
      )
      : <Tag color="red">Chưa gán</Tag>;
  }
}
```

---

## 5. UI `/production/winding-input` — đổi nguồn tại chỗ

**File:** `src/app/production/winding-input/page.tsx`

> ⚠ **CLAUDE CODE PHẢI ĐỌC FILE NÀY TRƯỚC.** Pattern đổi nguồn sợi tại chỗ phải follow đúng pattern đổi mặt hàng/lot đang có (nếu hiện tại dùng Modal → dùng Modal; nếu dùng Popconfirm → dùng Popconfirm; nếu inline Select → dùng inline Select). KHÔNG phát minh pattern mới. Code dưới đây là gợi ý theo Popconfirm — điều chỉnh cho khớp style thực tế.

### 5.1 State + load options

```typescript
const [sourceOptions, setSourceOptions] = useState<SourceOption[]>([]);
const [pendingSource, setPendingSource] = useState<
  Record<number, number | undefined>
>({});

useEffect(() => {
  fetch("/api/processes/source-options")
    .then((r) => r.json())
    .then((d) => setSourceOptions(Array.isArray(d) ? d : []))
    .catch(() => setSourceOptions([]));
}, []);
```

### 5.2 Tag clickable trên dòng mỗi máy

Đặt cạnh tag mặt hàng/lô đang hiển thị (theo style trang hiện tại):

```tsx
<Popconfirm
  title="Đổi nguồn sợi cho máy này"
  description={
    <div style={{ minWidth: 220, paddingTop: 8 }}>
      <Select
        style={{ width: "100%" }}
        placeholder="Chọn nguồn sợi mới"
        value={pendingSource[machine.id]}
        onChange={(v) =>
          setPendingSource((prev) => ({ ...prev, [machine.id]: v }))
        }
        options={sourceOptions.map((p) => ({
          label: `${p.name} → ${p.revenueFactory?.code || "?"}`,
          value: p.id,
        }))}
      />
      <div style={{ marginTop: 8, fontSize: 11, color: "#888" }}>
        Các bản ghi sản lượng nhập sau khi đổi sẽ áp dụng nguồn mới. Bản ghi cũ
        giữ nguyên.
      </div>
    </div>
  }
  onConfirm={() => handleChangeSource(machine.id, pendingSource[machine.id])}
  okText="Xác nhận"
  cancelText="Hủy"
>
  <Tag color="cyan" style={{ cursor: "pointer" }}>
    Nguồn: {machine.currentSourceProcess?.name || "Chưa gán"}
    <DownOutlined style={{ marginLeft: 4, fontSize: 10 }} />
  </Tag>
</Popconfirm>
```

### 5.3 Handler đổi nguồn — gọi PUT, refresh

```typescript
const handleChangeSource = async (
  machineId: number,
  newSourceProcessId?: number,
) => {
  if (!newSourceProcessId) {
    message.warning("Vui lòng chọn nguồn sợi");
    return;
  }

  const res = await fetch(`/api/machines/${machineId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentSourceProcessId: newSourceProcessId }),
  });

  if (!res.ok) {
    message.error("Đổi nguồn sợi thất bại");
    return;
  }

  message.success("Đã đổi nguồn sợi. Các bản ghi từ giờ sẽ áp dụng nguồn mới.");
  setPendingSource((prev) => ({ ...prev, [machineId]: undefined }));
  await refetchMachines(); // hoặc tên hàm refresh thực tế
};
```

> **CHÚ Ý**: nếu PUT `/api/machines/[id]` hiện đang **yêu cầu** một số field bắt buộc (vd: `name`, `processId`), thân PUT chỉ truyền `currentSourceProcessId` sẽ lỗi. Phải gửi đầy đủ payload tối thiểu, hoặc backend phải xử lý partial update. Claude Code đọc API hiện tại để xác định — nếu PUT là replace-all thì cần đổi sang merge-update hoặc tạo endpoint PATCH riêng `/api/machines/[id]/source-process`.

### 5.4 Khi lưu sản lượng — KHÔNG cần gửi `sourceProcessId`

Frontend gọi API save log như hiện tại. Backend (mục 3.4) tự copy `sourceProcessId` từ machine. **Không sửa code save log của frontend.**

---

## 6. CALCULATOR V2 — đổi GROUP BY

### 6.1 Allocation Engine v2

**File:** `src/lib/allocation-engine-v2.ts`

Tìm query lấy ProductionLog của công đoạn ống. Đổi điều kiện lọc theo nhà máy từ `machine.process.factoryId` sang `sourceProcess.revenueFactoryId`:

```typescript
// CŨ
const logs = await prisma.productionLog.findMany({
  where: {
    machine: { process: { factoryId } },
    recordDate: { gte: monthStartUTC, lte: monthEndUTC },
    process: { isRevenueProcess: true },
  },
  // ...
});

// MỚI
const logs = await prisma.productionLog.findMany({
  where: {
    OR: [
      // Log mới (có sourceProcessId): theo revenueFactory
      { sourceProcess: { revenueFactoryId: factoryId } },
      // Log cũ (chưa có sourceProcessId): fallback theo machine.process.factoryId
      // — chỉ áp dụng cho dữ liệu trước ngày deploy
      {
        sourceProcessId: null,
        machine: { process: { factoryId } },
      },
    ],
    recordDate: { gte: monthStartUTC, lte: monthEndUTC },
    process: { isRevenueProcess: true },
  },
  include: {
    sourceProcess: { include: { revenueFactory: true } },
    // ... các include hiện có ...
  },
});
```

> **UTC**: theo memory dự án, query date range phải dùng UTC để tránh log tháng trước bị kéo vào. Giữ pattern UTC như engine hiện tại đang dùng.

### 6.2 Cảnh báo trên dashboard nếu có log thiếu `sourceProcessId` **trong tháng hiện tại**

Sau khi tính, kiểm tra:

```typescript
const orphanLogs = await prisma.productionLog.count({
  where: {
    sourceProcessId: null,
    process: { isRevenueProcess: true },
    recordDate: { gte: monthStartUTC, lte: monthEndUTC },
  },
});

if (orphanLogs > 0) {
  warnings.push({
    type: "missing_source",
    message: `Có ${orphanLogs} bản ghi đánh ống trong tháng chưa gán nguồn sợi — kiểm tra cấu hình ở /machines`,
  });
}
```

Hiển thị banner cảnh báo trên dashboard (theo pattern banner ở `SPEC_ITEM_MONTHLY_MATERIAL` hoặc tương đương).

### 6.3 Revenue Calculator v2 (nếu tồn tại file riêng)

Nếu doanh thu được tính bởi file riêng (vd `src/lib/revenue-calculator-v2.ts`), áp dụng cùng logic GROUP BY: nhóm log theo `sourceProcess.revenueFactoryId` thay vì `machine.process.factoryId`.

---

## 7. VERIFY

### 7.1 Schema & cấu hình

- [ ] Migration chạy OK trên dev (`npx prisma migrate dev`) và production (qua workaround DDL nếu drift)
- [ ] `SELECT * FROM processes WHERE "revenueFactoryId" IS NOT NULL` → trả đúng 3 dòng (G33→NM1, TQ→NM1, G37→NM2)
- [ ] `SELECT COUNT(*) FROM machines WHERE "currentSourceProcessId" IS NOT NULL` → cho thấy máy ống NM1 đã được backfill, máy ống NM2 chưa
- [ ] Index `idx_production_logs_source_process` tồn tại (`\d production_logs` trên psql)

### 7.2 UI `/machines`

- [ ] Form sửa máy ống (process `isRevenueProcess = true`) hiển thị Select "Nguồn sợi" với đúng 3 options
- [ ] Form sửa máy sợi con / công đoạn khác KHÔNG hiển thị Select này
- [ ] Bảng máy có cột "Nguồn sợi" hiển thị tag (chỉ cho máy ống)
- [ ] Đổi nguồn → reload trang → giá trị mới giữ nguyên
- [ ] Máy NM2 chưa gán nguồn → tag "Chưa gán" màu đỏ rõ ràng

### 7.3 UI `/production/winding-input`

- [ ] Trên mỗi dòng máy ống, có tag "Nguồn: ..." clickable
- [ ] Click tag → mở UI chọn nguồn (Popconfirm / Modal / Select inline tùy pattern hiện có)
- [ ] Xác nhận đổi → toast hiện ra, tag cập nhật giá trị mới
- [ ] Sau khi đổi, bản ghi sản lượng tiếp theo có `sourceProcessId` mới (kiểm tra bằng SQL)
- [ ] Bản ghi đã lưu trước khi đổi: `sourceProcessId` GIỮ NGUYÊN giá trị cũ

### 7.4 Backend tự copy `sourceProcessId`

- [ ] Tạo log test cho máy có `currentSourceProcessId = G37` → SQL kiểm tra log mới có `sourceProcessId = G37`
- [ ] Set `Machine.currentSourceProcessId = null` → tạo log → log mới có `sourceProcessId = null` (không lỗi)

### 7.5 Calculator

- [ ] Tạo log test: máy ống bất kỳ, nguồn G37 → Calculator trả log vào nhóm doanh thu NM2
- [ ] Đổi nguồn log thành TQ (UPDATE thủ công bằng SQL) → log nhảy vào nhóm NM1
- [ ] Dashboard hiển thị 2 cột doanh thu NM1 và NM2, tổng kg khớp với SUM(`finalOutput`) GROUP BY revenueFactory
- [ ] Log cũ trước migration (`sourceProcessId = NULL`) vẫn được tính theo fallback (`machine.process.factoryId`) — báo cáo tháng cũ không lỗi
- [ ] Banner cảnh báo hiển thị khi có log đánh ống trong tháng hiện tại thiếu `sourceProcessId`

---

## 8. TỔNG KẾT THAY ĐỔI

| File                                             | Thay đổi                                                                                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                           | Thêm `Process.revenueFactoryId` + relation, `Machine.currentSourceProcessId` + relation, `ProductionLog.sourceProcessId` + relation + index. Relation ngược trong `Factory` và `Process`. |
| Migration `add_source_process_for_revenue`       | DDL cho 3 cột + 2 index.                                                                                                                                                                  |
| SQL cấu hình ban đầu                             | Set `revenueFactoryId` cho 3 process sợi con. Backfill `currentSourceProcessId` cho máy ống NM1.                                                                                          |
| `src/app/api/machines/route.ts`                  | GET: include `currentSourceProcess` với `revenueFactory`.                                                                                                                                 |
| `src/app/api/machines/[id]/route.ts`             | PUT: nhận và lưu `currentSourceProcessId`.                                                                                                                                                |
| `src/app/api/processes/source-options/route.ts`  | **File mới** — GET list 3 process có `revenueFactoryId`.                                                                                                                                  |
| `src/app/api/production/winding/route.ts`        | Khi tạo `ProductionLog`, đọc `machine.currentSourceProcessId` và copy vào field `sourceProcessId` của log.                                                                                |
| `src/app/machines/page.tsx`                      | Interface + state + Select "Nguồn sợi" trong form (chỉ máy đánh ống) + cột "Nguồn sợi" trong bảng.                                                                                        |
| `src/app/production/winding-input/page.tsx`      | Tag "Nguồn: ..." clickable + UI đổi nguồn tại chỗ + handler PUT + refresh. KHÔNG truyền `sourceProcessId` khi save log.                                                                   |
| `src/lib/allocation-engine-v2.ts`                | Đổi điều kiện lọc theo nhà máy: `sourceProcess.revenueFactoryId` cho log mới, fallback `machine.process.factoryId` cho log cũ. Thêm cảnh báo orphan logs.                                 |
| `src/lib/revenue-calculator-v2.ts` (nếu tồn tại) | Tương tự — áp dụng cùng logic GROUP BY.                                                                                                                                                   |

---

## 9. GHI CHÚ CHO CLAUDE CODE

1. **ĐỌC TRƯỚC** các file ở phần "ĐỌC TRƯỚC KHI CODE" để hiểu pattern hiện có. Đặc biệt:
   - `src/app/production/winding-input/page.tsx` — pattern đổi mặt hàng/lot tại chỗ phải giống nhau
   - `src/app/api/machines/[id]/route.ts` — xác định PUT là replace-all hay partial update (quyết định cách gửi body khi đổi từ winding-input)

2. **KHÔNG đụng `Process.factoryId` cũ** — trục địa lý giữ nguyên. Chỉ thêm `revenueFactoryId` là trục mới song song.

3. **Index trên `ProductionLog.sourceProcessId`** quan trọng cho hiệu năng — calculator sẽ JOIN qua field này thường xuyên.

4. **UTC timezone** khi query log theo tháng — dùng pattern UTC date range như allocation-engine-v2 hiện có. Không dùng `new Date(year, month-1, 1)`.

5. **Tên `Factory` thực tế**: chạy `SELECT code, name FROM factories` trước khi viết WHERE SQL ở mục 2.2 và 2.3. Có thể là `'NM1'/'NM2'` hoặc `'Nhà máy 1'/'Nhà máy 2'` — điều chỉnh cho khớp.

6. **Validate khi đổi nguồn ở backend** (tùy chọn nâng cao): kiểm tra process được chọn phải có `revenueFactoryId IS NOT NULL` — tránh user chọn nhầm process đánh ống làm "nguồn sợi". Có thể bỏ qua nếu UI đã giới hạn options chỉ trong `/api/processes/source-options`.

7. **KHÔNG audit log** trong phase này (không tạo bảng `MachineSourceChangeLog`). Đợi yêu cầu thêm.

8. **KHÔNG cập nhật ngược log lịch sử** khi đổi `currentSourceProcessId` ở Machine. Chỉ log tạo từ thời điểm đổi trở đi mới áp dụng giá trị mới. Đây là quan trọng — log cũ là sự thật lịch sử.

9. **Verify đầy đủ checklist mục 7** trước khi báo hoàn thành.
