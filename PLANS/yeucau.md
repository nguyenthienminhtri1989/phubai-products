**Dòng isAutoQty: hiển thị qty mới nhất trên UI, chỉ lưu DB khi bấm "Tính lại tất cả"**

Đọc files:

- `src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx`
- `src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts`

## File 1: `src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx`

### 1.1 Thêm state:

```typescript
const [projectedQtyByItem, setProjectedQtyByItem] = useState<
  Record<number, number>
>({});
```

### 1.2 Fetch projected qty (trong useEffect cùng chỗ fetchPlan):

```typescript
fetch(
  `/api/kdsx/production-schedule?factoryId=${factoryId}&yearMonth=${yearMonth}`,
)
  .then((r) => (r.ok ? r.json() : []))
  .then(async (schedules: any[]) => {
    if (schedules.length === 0) return;
    const res = await fetch(
      `/api/kdsx/production-schedule/${schedules[0].id}/actual`,
    );
    if (!res.ok) return;
    const data = await res.json();
    const grid = data.grid ?? {};
    const bm = data.benchmarkMap ?? {};

    const daysWithData = new Set<number>();
    for (const mid of Object.keys(grid)) {
      for (const dStr of Object.keys(grid[Number(mid)])) {
        const dd = grid[Number(mid)][Number(dStr)];
        if (dd && Object.values(dd).some((kg: any) => kg > 0))
          daysWithData.add(Number(dStr));
      }
    }

    const combos = new Map<
      string,
      { machineId: number; itemId: number; lastDay: number }
    >();
    for (const mid of Object.keys(grid)) {
      const machineId = Number(mid);
      for (const dStr of Object.keys(grid[machineId])) {
        const day = Number(dStr);
        for (const iid of Object.keys(grid[machineId][day])) {
          const itemId = Number(iid);
          if (grid[machineId][day][itemId] <= 0) continue;
          const key = `${machineId}-${itemId}`;
          const ex = combos.get(key);
          if (!ex) combos.set(key, { machineId, itemId, lastDay: day });
          else if (day > ex.lastDay) ex.lastDay = day;
        }
      }
    }
    const lastRowPerMachine = new Map<number, string>();
    for (const [key, c] of combos) {
      const ex = lastRowPerMachine.get(c.machineId);
      if (!ex || c.lastDay > (combos.get(ex)?.lastDay ?? 0))
        lastRowPerMachine.set(c.machineId, key);
    }

    const [y, m] = yearMonth.split("-").map(Number);
    const td = new Date(y, m, 0).getDate();
    const result: Record<number, number> = {};
    for (const [key, c] of combos) {
      const bmKg = bm[key] ?? 0;
      const isLast = lastRowPerMachine.get(c.machineId) === key;
      for (let day = 1; day <= td; day++) {
        const actual = grid[c.machineId]?.[day]?.[c.itemId] ?? 0;
        if (actual > 0) {
          result[c.itemId] = (result[c.itemId] ?? 0) + actual;
        } else if (
          bmKg > 0 &&
          !daysWithData.has(day) &&
          day > c.lastDay &&
          isLast
        ) {
          result[c.itemId] = (result[c.itemId] ?? 0) + bmKg;
        }
      }
    }
    setProjectedQtyByItem(result);
  })
  .catch(() => {});
```

### 1.3 Hiển thị qty mới nhất trên bảng (không lưu DB)

Tìm cột "SL (kg)" trong `lineItemColumns`, sửa render:

```typescript
{
  title: "SL (kg)", dataIndex: "qty", key: "qty",
  render: (v: number, r: PlanLineItem) => {
    if (!r.isAutoQty) return <span>{fmtQty(v)}</span>;

    // Tính qty mới nhất từ projected
    const totalProjected = projectedQtyByItem[r.itemId] ?? 0;
    const otherQty = (plan?.lineItems ?? [])
      .filter(li => li.itemId === r.itemId && li.id !== r.id)
      .reduce((s, li) => s + li.qty, 0);
    const liveQty = Math.max(0, Math.round(totalProjected - otherQty));
    const changed = Math.abs(liveQty - v) > 1;

    return (
      <Space size={4}>
        {changed ? (
          <Tooltip title={`Đã lưu: ${fmtQty(v)} kg — Bấm "Tính lại tất cả" để cập nhật`}>
            <span style={{ color: "#fa8c16", fontWeight: 700 }}>{fmtQty(liveQty)}</span>
          </Tooltip>
        ) : (
          <span>{fmtQty(v)}</span>
        )}
        <Tag color="blue" style={{ fontSize: 10, padding: "0 4px" }}>AUTO</Tag>
        {changed && <Tag color="orange" style={{ fontSize: 10, padding: "0 4px" }}>⚡ Đã thay đổi</Tag>}
      </Space>
    );
  },
},
```

### 1.4 Sửa checkbox isAutoQty trong modal — tính qty ngay khi tick:

Tìm `<Checkbox` có text "Tự tính SL", sửa onChange:

```tsx
<Checkbox
  onChange={(e) => {
    const checked = e.target.checked;
    setIsAutoQty(checked);
    if (checked) {
      const itemId = lineItemForm.getFieldValue("itemId");
      if (!itemId) {
        message.warning("Chọn loại sợi trước");
        setIsAutoQty(false);
        lineItemForm.setFieldValue("isAutoQty", false);
        return;
      }
      const totalProjected = projectedQtyByItem[itemId] ?? 0;
      if (totalProjected === 0) {
        message.warning("Chưa có dữ liệu sản lượng cho mặt hàng này");
      }
      const otherQty = (plan?.lineItems ?? [])
        .filter((li) => li.itemId === itemId && li.id !== editingLineItem?.id)
        .reduce((s, li) => s + li.qty, 0);
      const autoQty = Math.max(0, Math.round(totalProjected - otherQty));
      lineItemForm.setFieldValue("qty", autoQty);
    } else {
      lineItemForm.setFieldValue("qty", undefined);
    }
  }}
>
  Tự tính SL từ sản lượng giả định (TH + định mức)
</Checkbox>
```

### 1.5 Ô qty readOnly khi isAutoQty:

```tsx
<Form.Item name="qty" label="Số lượng (kg)" rules={[{ required: true }]}>
  <InputNumber min={0} style={{ width: "100%" }} readOnly={isAutoQty} />
</Form.Item>
```

### 1.6 Khi đổi itemId mà isAutoQty đang bật:

Tìm `<Select` cho itemId, thêm onChange:

```tsx
onChange={(val) => {
  if (isAutoQty && val) {
    const totalProjected = projectedQtyByItem[val] ?? 0;
    const otherQty = (plan?.lineItems ?? [])
      .filter(li => li.itemId === val && li.id !== editingLineItem?.id)
      .reduce((s, li) => s + li.qty, 0);
    lineItemForm.setFieldValue("qty", Math.max(0, Math.round(totalProjected - otherQty)));
  }
}}
```

## File 2: `src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts`

Tìm block `if (isAutoQty) {` (khoảng 15-20 dòng tính từ ScheduleSegment). **Xóa toàn bộ**, thay bằng:

```typescript
if (isAutoQty && (qty === undefined || qty === null)) {
  return NextResponse.json(
    { error: "isAutoQty=true nhưng thiếu qty. Frontend cần tính và gửi qty." },
    { status: 400 },
  );
}
```

## File 3: `src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts`

Đọc file này. Tìm phần xử lý lineItem có `isAutoQty = true`. Sửa để tính qty từ actual grid + benchmarkMap thay vì ScheduleSegment. Logic tính giống frontend ở bước 1.2:

- Fetch schedule → actual logs → build grid
- Fetch benchmarkMap
- Tính projectedQtyByItem (actual + benchmark cho lastRow mỗi máy)
- Với mỗi lineItem có `isAutoQty`: `qty = projectedQtyByItem[itemId] - otherQty`

---

Tóm tắt: UI hiện số mới nhất (màu cam + tag "Đã thay đổi" nếu khác DB). Bấm "Tính lại tất cả" → lưu DB. Cuối tháng bấm tính lại → trình duyệt → khóa.
