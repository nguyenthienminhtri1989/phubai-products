**Fix isAutoQty: Frontend tính qty, backend chỉ nhận — bỏ logic tính từ ScheduleSegment**

**File: `src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts`**

Tìm đoạn `if (isAutoQty) {` (khoảng 15-20 dòng), **xóa toàn bộ block** từ `if (isAutoQty) {` đến `}` đóng (bao gồm cả phần query schedule, tính totalItemKg, tính otherQty, check autoQty === 0, gán qty = autoQty).

Thay bằng:

```typescript
// isAutoQty: frontend đã tính qty sẵn từ sản lượng giả định (actual + benchmark)
// Backend chỉ cần nhận qty đã tính, không cần tính lại
if (isAutoQty && (qty === undefined || qty === null)) {
  return NextResponse.json(
    { error: "isAutoQty=true nhưng thiếu qty. Frontend cần tính và gửi qty." },
    { status: 400 },
  );
}
```

**File: `src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx`**

### 1. Thêm state lưu tổng SL giả định per item:

```typescript
const [projectedQtyByItem, setProjectedQtyByItem] = useState<
  Record<number, number>
>({});
```

### 2. Trong useEffect fetch data, thêm fetch projected qty:

```typescript
// Thêm vào useEffect cùng chỗ fetchPlan, fetchActual, fetchItems
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

    // Build daysWithData
    const daysWithData = new Set<number>();
    for (const mid of Object.keys(grid)) {
      for (const dStr of Object.keys(grid[Number(mid)])) {
        const dd = grid[Number(mid)][Number(dStr)];
        if (dd && Object.values(dd).some((kg: any) => kg > 0))
          daysWithData.add(Number(dStr));
      }
    }

    // Build combos + lastRow per machine
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

    // Tính tổng per item
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

### 3. Sửa checkbox isAutoQty — tính qty ngay khi tick:

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
        message.warning("Chưa có dữ liệu sản lượng giả định cho mặt hàng này");
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

### 4. Ô qty: khi isAutoQty hiện giá trị nhưng readOnly:

```tsx
<Form.Item name="qty" label="Số lượng (kg)" rules={[{ required: true }]}>
  <InputNumber min={0} style={{ width: "100%" }} readOnly={isAutoQty} />
</Form.Item>
```

### 5. Cũng tính lại khi đổi itemId mà isAutoQty đang bật:

Tìm `<Select>` chọn loại sợi (name="itemId"), thêm onChange:

```tsx
<Select
  // ... existing props ...
  onChange={(val) => {
    if (isAutoQty && val) {
      const totalProjected = projectedQtyByItem[val] ?? 0;
      const otherQty = (plan?.lineItems ?? [])
        .filter((li) => li.itemId === val && li.id !== editingLineItem?.id)
        .reduce((s, li) => s + li.qty, 0);
      lineItemForm.setFieldValue(
        "qty",
        Math.max(0, Math.round(totalProjected - otherQty)),
      );
    }
  }}
/>
```

---

Tóm tắt: Backend bỏ logic tính autoQty từ ScheduleSegment — chỉ nhận qty từ frontend. Frontend fetch actual grid + benchmarkMap, tính `projectedQtyByItem`, khi tick isAutoQty → điền qty = tổng giả định − SL HĐ khác.Thấy lỗi rồi. Đoạn này trong API:

```typescript
if (isAutoQty) {
  // Tính totalItemKg từ ScheduleSegment (KH) — SAI nguồn dữ liệu
  const totalItemKg = schedule?.segments.filter(...).reduce(...) ?? 0;

  // Nếu autoQty = 0 thì báo lỗi
  if (totalItemKg > 0 && autoQty === 0) {
    return NextResponse.json({ error: "Tổng SL các HĐ khác đã đủ..." }, { status: 400 });
  }
  qty = autoQty;
}
```

**2 vấn đề:**

1. `totalItemKg` lấy từ `ScheduleSegment` (KH) thay vì lấy từ actual + benchmark (giả định)
2. Backend tự tính `qty` — nhưng frontend đã có thể tính sẵn và gửi xuống

Đưa cho Claude Code:

---

**Fix isAutoQty: Frontend tính qty, backend chỉ nhận — bỏ logic tính từ ScheduleSegment**

**File: `src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts`**

Tìm đoạn `if (isAutoQty) {` (khoảng 15-20 dòng), **xóa toàn bộ block** từ `if (isAutoQty) {` đến `}` đóng (bao gồm cả phần query schedule, tính totalItemKg, tính otherQty, check autoQty === 0, gán qty = autoQty).

Thay bằng:

```typescript
// isAutoQty: frontend đã tính qty sẵn từ sản lượng giả định (actual + benchmark)
// Backend chỉ cần nhận qty đã tính, không cần tính lại
if (isAutoQty && (qty === undefined || qty === null)) {
  return NextResponse.json(
    { error: "isAutoQty=true nhưng thiếu qty. Frontend cần tính và gửi qty." },
    { status: 400 },
  );
}
```

**File: `src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx`**

### 1. Thêm state lưu tổng SL giả định per item:

```typescript
const [projectedQtyByItem, setProjectedQtyByItem] = useState<
  Record<number, number>
>({});
```

### 2. Trong useEffect fetch data, thêm fetch projected qty:

```typescript
// Thêm vào useEffect cùng chỗ fetchPlan, fetchActual, fetchItems
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

    // Build daysWithData
    const daysWithData = new Set<number>();
    for (const mid of Object.keys(grid)) {
      for (const dStr of Object.keys(grid[Number(mid)])) {
        const dd = grid[Number(mid)][Number(dStr)];
        if (dd && Object.values(dd).some((kg: any) => kg > 0))
          daysWithData.add(Number(dStr));
      }
    }

    // Build combos + lastRow per machine
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

    // Tính tổng per item
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

### 3. Sửa checkbox isAutoQty — tính qty ngay khi tick:

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
        message.warning("Chưa có dữ liệu sản lượng giả định cho mặt hàng này");
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

### 4. Ô qty: khi isAutoQty hiện giá trị nhưng readOnly:

```tsx
<Form.Item name="qty" label="Số lượng (kg)" rules={[{ required: true }]}>
  <InputNumber min={0} style={{ width: "100%" }} readOnly={isAutoQty} />
</Form.Item>
```

### 5. Cũng tính lại khi đổi itemId mà isAutoQty đang bật:

Tìm `<Select>` chọn loại sợi (name="itemId"), thêm onChange:

```tsx
<Select
  // ... existing props ...
  onChange={(val) => {
    if (isAutoQty && val) {
      const totalProjected = projectedQtyByItem[val] ?? 0;
      const otherQty = (plan?.lineItems ?? [])
        .filter((li) => li.itemId === val && li.id !== editingLineItem?.id)
        .reduce((s, li) => s + li.qty, 0);
      lineItemForm.setFieldValue(
        "qty",
        Math.max(0, Math.round(totalProjected - otherQty)),
      );
    }
  }}
/>
```

---

Tóm tắt: Backend bỏ logic tính autoQty từ ScheduleSegment — chỉ nhận qty từ frontend. Frontend fetch actual grid + benchmarkMap, tính `projectedQtyByItem`, khi tick isAutoQty → điền qty = tổng giả định − SL HĐ khác.
