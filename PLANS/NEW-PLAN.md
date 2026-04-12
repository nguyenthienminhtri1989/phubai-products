# PROMPT — Module Nhập Sản lượng Ngày cho Phòng Kinh doanh (KdDailyInput)

## Bối cảnh

Đọc `BUSINESS_LOGIC_CONTEXT.md` trước. Đây là module MỚI hoàn toàn.

**Vấn đề cần giải quyết:**
Phòng KD cần nhập sản lượng theo ngày (21 máy × 1 lần/ngày) để phục vụ
theo dõi hợp đồng và phân bổ sản lượng. Họ không nhập theo ca như công nhân.

**Nguyên tắc thiết kế:**

- `ProductionLog` (công nhân nhập theo ca) KHÔNG thay đổi gì
- `KdDailyInput` là bảng riêng, độc lập, dành cho phòng KD
- Allocation engine đọc từ `KdDailyInput` thay vì `ProductionLog`
- Strictly additive — không xóa, không sửa logic cũ

---

## TASK 1 — Schema mới

```prisma
model KdDailyInput {
  id          Int      @id @default(autoincrement())
  machineId   Int
  machine     Machine  @relation(fields: [machineId], references: [id])
  itemId      Int
  item        Item     @relation(fields: [itemId], references: [id])
  recordDate  DateTime @db.Date
  outputKg    Float    // sản lượng cả ngày (3 ca gộp) — KD tự tổng hợp
  note        String?
  createdById Int
  createdBy   User     @relation(fields: [createdById], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // 1 máy + 1 mặt hàng + 1 ngày = 1 dòng duy nhất
  // Máy chạy 2 mặt hàng → 2 dòng riêng
  @@unique([machineId, itemId, recordDate])
  @@index([recordDate])
  @@index([machineId])
  @@index([itemId])
  @@map("kd_daily_inputs")
}

// Thêm relation vào Machine và Item (strictly additive):
// Machine: kdDailyInputs KdDailyInput[]
// Item:    kdDailyInputs KdDailyInput[]
// User:    kdDailyInputs KdDailyInput[]
```

Chạy: `npx prisma migrate dev --name add_kd_daily_input`

---

## TASK 2 — API Routes

```
src/app/api/kd-daily-input/
  route.ts          GET list + POST upsert batch
  [id]/route.ts     PUT + DELETE
  summary/route.ts  GET tổng hợp theo ngày/tháng/mặt hàng
```

### GET + POST `/api/kd-daily-input`

```typescript
// GET — lấy danh sách theo ngày + nhà máy + công đoạn
// Query: factoryId, processId?, date (YYYY-MM-DD), itemId?
// Include: machine (với process), item
// Response: mảng KdDailyInput, mỗi dòng kèm machine.name, item.name

// POST — upsert batch (lưu nhiều máy cùng lúc)
// Body: {
//   date: string,        // YYYY-MM-DD
//   factoryId: number,
//   items: [{
//     machineId: number,
//     itemId: number,
//     outputKg: number,
//     note?: string,
//   }]
// }
// Logic: dùng prisma.$transaction + upsert cho mỗi item
//   upsert: where { machineId_itemId_recordDate: unique }
//           create { ...data }
//           update { outputKg, note, updatedAt }
// Validate: outputKg >= 0 (cho phép 0 = máy dừng)
// Sau khi lưu: gọi runAllocationKD(factoryId, date) — xem Task 3
```

### GET `/api/kd-daily-input/summary`

```typescript
// Query: factoryId, dateFrom, dateTo, itemId?
// Dùng để: xem tổng sản lượng theo mặt hàng trong khoảng thời gian
// Logic:
const summary = await prisma.kdDailyInput.groupBy({
  by: ["itemId"],
  where: {
    machine: { process: { factoryId } },
    recordDate: { gte: dateFrom, lte: dateTo },
  },
  _sum: { outputKg: true },
});
// Response: [{ itemId, itemName, totalKg }]
```

---

## TASK 3 — Sửa Allocation Engine

File: `src/lib/allocation-engine.ts`

Thêm hàm mới `runAllocationKD` — KHÔNG sửa `runAllocation` cũ:

```typescript
/**
 * Phân bổ sản lượng KD vào hợp đồng.
 * Đọc từ KdDailyInput thay vì ProductionLog.
 * Logic waterfall giống hệt runAllocation.
 */
export async function runAllocationKD(factoryId: number, date: Date) {
  // 1. Tổng sản lượng KD theo mặt hàng trong ngày
  const dailyOutput = await prisma.kdDailyInput.groupBy({
    by: ["itemId"],
    where: {
      machine: { process: { factoryId } },
      recordDate: date,
      outputKg: { gt: 0 }, // bỏ qua máy dừng (outputKg = 0)
    },
    _sum: { outputKg: true },
  });

  // 2. Phần còn lại: COPY NGUYÊN waterfall logic từ runAllocation
  //    Chỉ thay `productionLog.groupBy` → `kdDailyInput.groupBy` ở trên
  //    Tất cả logic xóa allocation cũ, waterfall, DONE, OVERDUE giữ nguyên
  for (const { itemId, _sum } of dailyOutput) {
    const totalProduced = _sum.outputKg ?? 0;
    if (totalProduced <= 0) continue;

    // Xóa allocation cũ của ngày này (idempotent)
    await prisma.orderAllocation.deleteMany({
      where: {
        productionDate: date,
        factoryId,
        itemId,
        source: "KD", // ← chỉ xóa allocation từ KD, không xóa từ Production
      },
    });

    // ... waterfall logic giống runAllocation ...
    // Khi tạo OrderAllocation, thêm field source: 'KD'
  }
}
```

**Lưu ý quan trọng:** Thêm field `source` vào `OrderAllocation` để phân biệt
allocation từ KD và từ Production (phòng khi sau này cần dùng cả 2):

```prisma
// Thêm vào model OrderAllocation:
source  String  @default("PRODUCTION")  // "KD" hoặc "PRODUCTION"
```

Migration thêm: `ALTER TABLE order_allocations ADD COLUMN source TEXT DEFAULT 'PRODUCTION'`

---

## TASK 4 — Sửa API Production daily-input

Trong `src/app/api/production/daily-input/route.ts`, bỏ lệnh gọi
`runAllocation` hiện tại (nếu có) — vì allocation giờ chỉ chạy từ KD:

```typescript
// XÓA hoặc comment out:
// await runAllocation(factoryId, recordDate)

// Thêm comment giải thích:
// Allocation engine đã chuyển sang đọc từ KdDailyInput
// Xem src/lib/allocation-engine.ts → runAllocationKD()
```

---

## TASK 5 — UI Màn hình nhập liệu cho phòng KD

File mới: `src/app/(erp)/kd-daily-input/page.tsx`

### Layout tổng thể

```
[Filter bar: Nhà máy | Công đoạn | Ngày] [Tải danh sách]

[Thanh tiến độ: Đã nhập X/21 máy | Tổng: XX,XXX kg]
[Nút: Nhập 0 cho máy dừng chưa nhập] [Lưu tất cả (X máy)]

[Bảng nhập liệu]
```

### Filter bar

```tsx
// State:
const [factoryId, setFactoryId] = useState<number>();
const [processId, setProcessId] = useState<number>();
const [date, setDate] = useState(dayjs()); // mặc định hôm nay

// Khi bấm "Tải danh sách":
// 1. Fetch machines: GET /api/machines?processId=X (lấy danh sách máy)
// 2. Fetch dữ liệu đã nhập: GET /api/kd-daily-input?factoryId=X&processId=X&date=YYYY-MM-DD
// 3. Merge: mỗi máy có outputKg từ dữ liệu đã nhập (nếu có)
```

### State quản lý dữ liệu bảng

```typescript
interface RowData {
  machineId: number;
  machineName: string;
  // Máy có thể chạy nhiều mặt hàng — lấy từ machine.currentItemId
  // Nếu máy đang chạy 2 mặt hàng → 2 rows riêng
  itemId: number;
  itemName: string;
  outputKg: number | null; // null = chưa nhập
  note: string;
  isDirty: boolean; // true nếu người dùng đã sửa
  existingId?: number; // có nghĩa là đã lưu trước đó
}

const [rows, setRows] = useState<RowData[]>([]);
```

### Bảng nhập liệu

```tsx
<Table
  dataSource={rows}
  size="middle"
  pagination={false}
  rowKey={(r) => `${r.machineId}-${r.itemId}`}
  columns={[
    { title: "STT", width: 50, render: (_, __, i) => i + 1 },
    {
      title: "Máy",
      dataIndex: "machineName",
      width: 100,
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: "Mặt hàng đang chạy",
      dataIndex: "itemName",
      render: (v, r) => (
        <>
          <Tag>{v}</Tag>
          {/* Nếu máy chạy 2 MH trong ngày → hiện badge cảnh báo */}
          {rows.filter((row) => row.machineId === r.machineId).length > 1 && (
            <Tag color="warning" style={{ fontSize: 11 }}>
              Đổi MH
            </Tag>
          )}
        </>
      ),
    },
    {
      title: "Sản lượng cả ngày (kg)",
      width: 180,
      render: (_, r, i) => (
        <InputNumber
          style={{
            width: 130,
            borderColor:
              r.outputKg !== null ? "var(--color-border-success)" : undefined,
          }}
          min={0}
          step={10}
          value={r.outputKg ?? undefined}
          placeholder="Nhập kg..."
          onChange={(v) => {
            const next = [...rows];
            next[i] = { ...next[i], outputKg: v ?? null, isDirty: true };
            setRows(next);
          }}
          addonAfter="kg"
        />
      ),
    },
    {
      title: "Ghi chú",
      render: (_, r, i) => (
        <Input
          value={r.note}
          placeholder="Máy dừng, lý do..."
          onChange={(e) => {
            const next = [...rows];
            next[i] = { ...next[i], note: e.target.value, isDirty: true };
            setRows(next);
          }}
          style={{ width: 160 }}
        />
      ),
    },
    {
      title: "Trạng thái",
      width: 100,
      render: (_, r) =>
        r.outputKg !== null ? (
          <Tag color="success">Đã nhập</Tag>
        ) : (
          <Tag color="default">Chưa nhập</Tag>
        ),
    },
  ]}
/>
```

### Nút "Nhập 0 cho máy dừng chưa nhập"

```typescript
// Click → set outputKg = 0 cho tất cả rows có outputKg = null
const handleFillZero = () => {
  setRows(
    rows.map((r) =>
      r.outputKg === null ? { ...r, outputKg: 0, isDirty: true } : r,
    ),
  );
  message.info(
    `Đã điền 0 cho ${rows.filter((r) => r.outputKg === null).length} máy chưa nhập`,
  );
};
```

### Nút "Lưu tất cả"

```typescript
const handleSave = async () => {
  const dirty = rows.filter((r) => r.isDirty && r.outputKg !== null);
  if (dirty.length === 0) {
    message.warning("Không có thay đổi nào để lưu");
    return;
  }

  setLoading(true);
  try {
    await fetch("/api/kd-daily-input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: date.format("YYYY-MM-DD"),
        factoryId,
        items: dirty.map((r) => ({
          machineId: r.machineId,
          itemId: r.itemId,
          outputKg: r.outputKg,
          note: r.note,
        })),
      }),
    });
    message.success(`Đã lưu ${dirty.length} máy và cập nhật tiến độ hợp đồng`);
    // Reset isDirty
    setRows(rows.map((r) => ({ ...r, isDirty: false })));
  } finally {
    setLoading(false);
  }
};
```

### Thanh tổng kết trên bảng

```tsx
<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  }}
>
  <Space>
    <Statistic
      title="Đã nhập"
      value={rows.filter((r) => r.outputKg !== null).length}
      suffix={`/ ${rows.length} máy`}
      valueStyle={{ fontSize: 18, color: "var(--color-text-success)" }}
    />
    <Divider type="vertical" />
    <Statistic
      title="Tổng sản lượng hôm nay"
      value={rows
        .reduce((s, r) => s + (r.outputKg ?? 0), 0)
        .toLocaleString("vi-VN")}
      suffix="kg"
      valueStyle={{ fontSize: 18 }}
    />
  </Space>
  <Space>
    <Button onClick={handleFillZero}>Nhập 0 cho máy dừng chưa nhập</Button>
    <Button
      type="primary"
      loading={loading}
      disabled={!rows.some((r) => r.isDirty)}
      onClick={handleSave}
    >
      Lưu tất cả ({rows.filter((r) => r.isDirty && r.outputKg !== null).length}{" "}
      máy)
    </Button>
  </Space>
</div>
```

---

## TASK 6 — Menu sidebar

Thêm vào `AdminLayout.tsx` — nhóm Kinh doanh:

```tsx
{
  key: 'kd-daily-input',
  label: 'Nhập sản lượng ngày (KD)',
  icon: <EditOutlined />,
  onClick: () => router.push('/kd-daily-input'),
}
```

Phân quyền: Admin + Manager + accessLevel MANAGER.

---

## Checklist

- [ ] Migration tạo `kd_daily_inputs` chạy thành công
- [ ] Thêm field `source` vào `OrderAllocation` (migration nhỏ)
- [ ] `runAllocationKD` đọc từ `KdDailyInput`, không đụng `runAllocation` cũ
- [ ] API POST `/api/kd-daily-input` dùng upsert — lưu lại sẽ update, không tạo duplicate
- [ ] `outputKg = 0` hợp lệ (máy dừng) — không validate > 0
- [ ] Màn hình KD: chọn nhà máy → lọc công đoạn → tải máy theo công đoạn
- [ ] Máy chạy 2 mặt hàng → 2 dòng riêng trong bảng, badge "Đổi MH"
- [ ] Nút "Lưu tất cả" disabled khi không có thay đổi (isDirty = false)
- [ ] Sau khi lưu: `runAllocationKD` chạy tự động (non-blocking, try/catch)
- [ ] `runAllocation` cũ (đọc ProductionLog) KHÔNG bị xóa hay sửa
- [ ] TypeScript compile clean
- [ ] Cập nhật `BUSINESS_LOGIC_CONTEXT.md` sau khi xong

---

## TASK 7 — Paste từ Excel (Ctrl+V)

### Mô tả tính năng

Người dùng bôi đen cột sản lượng trong Excel → Ctrl+C → click vào ô
InputNumber đầu tiên trong bảng → Ctrl+V → hệ thống tự điền xuống
các ô bên dưới theo thứ tự.

### Cách hoạt động

Khi copy từ Excel, clipboard chứa text dạng:

```
874\n891\n856\n583\n...
```

Mỗi dòng = 1 giá trị của 1 máy, phân cách bằng `\n`.

### Implementation

Thêm vào component bảng nhập liệu — gắn event `onPaste` vào wrapper div
bao ngoài Table:

```tsx
const handlePaste = useCallback(
  (e: React.ClipboardEvent, startIndex: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\n") && !text.includes("\t")) return; // paste 1 giá trị bình thường

    e.preventDefault(); // chặn paste mặc định vào ô input

    // Parse clipboard — hỗ trợ cả copy 1 cột lẫn nhiều cột từ Excel
    const lines = text
      .split("\n")
      .map((line) => line.split("\t")[0].trim()) // lấy cột đầu tiên nếu copy nhiều cột
      .filter((line) => line !== "");

    const values = lines.map((line) => {
      // Xử lý số có dấu phẩy hàng nghìn: "1,234" → 1234
      const cleaned = line.replace(/,/g, "").replace(/\./g, "");
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    });

    if (values.length === 0) return;

    // Điền vào rows bắt đầu từ startIndex
    setRows((prev) => {
      const next = [...prev];
      values.forEach((val, i) => {
        const targetIndex = startIndex + i;
        if (targetIndex < next.length && val !== null) {
          next[targetIndex] = {
            ...next[targetIndex],
            outputKg: val,
            isDirty: true,
          };
        }
      });
      return next;
    });

    // Thông báo kết quả
    const filled = values.filter((v) => v !== null).length;
    const skipped = values.filter((v) => v === null).length;
    message.success(
      `Đã dán ${filled} giá trị` +
        (skipped > 0 ? ` (bỏ qua ${skipped} ô không hợp lệ)` : ""),
    );
  },
  [rows],
);
```

### Gắn vào từng ô InputNumber trong bảng

```tsx
// Trong column "Sản lượng cả ngày":
render: (_, r, i) => (
  <InputNumber
    style={{
      width: 130,
      borderColor: r.outputKg !== null
        ? 'var(--color-border-success)'
        : undefined,
    }}
    min={0}
    step={10}
    value={r.outputKg ?? undefined}
    placeholder="Nhập kg..."
    onChange={v => {
      const next = [...rows]
      next[i] = { ...next[i], outputKg: v ?? null, isDirty: true }
      setRows(next)
    }}
    // Thêm onPaste:
    onPaste={e => handlePaste(e, i)}
    addonAfter="kg"
  />
),
```

### Hướng dẫn sử dụng — hiển thị trong UI

Thêm dòng gợi ý nhỏ phía trên bảng:

```tsx
<div
  style={{
    fontSize: 12,
    color: "var(--color-text-tertiary)",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 6,
  }}
>
  <KeyboardOutlined style={{ fontSize: 13 }} />
  Mẹo: Bôi đen cột sản lượng trong Excel → Ctrl+C → Click vào ô đầu tiên →
  Ctrl+V để dán nhanh toàn bộ
</div>
```

### Checklist Task 7

- [ ] `handlePaste` nhận đúng `startIndex` = index của ô đang paste
- [ ] Hỗ trợ số có dấu phẩy: "1,234" parse thành 1234
- [ ] Hỗ trợ copy nhiều cột từ Excel: chỉ lấy cột đầu tiên (trước `\t`)
- [ ] Nếu paste nhiều hơn số máy còn lại → dừng ở máy cuối, không báo lỗi
- [ ] Ô có giá trị không hợp lệ (chữ, ký tự lạ) → bỏ qua, thông báo số ô bị skip
- [ ] Sau khi paste: `isDirty = true` cho tất cả ô được điền
- [ ] Nút "Lưu tất cả" tự động enable sau khi paste
