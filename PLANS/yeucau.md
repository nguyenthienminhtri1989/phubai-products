**File: `src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx`**

### 1. Fetch thêm dữ liệu sản lượng giả định (actual + benchmark) từ ProductionSchedule

Thêm state:

```typescript
const [projectedQtyByItem, setProjectedQtyByItem] = useState<
  Record<number, number>
>({});
```

Trong `useEffect` fetch dữ liệu, thêm fetch sản lượng giả định:

```typescript
// Fetch schedule → actual grid → tính projected qty per item
fetch(
  `/api/kdsx/production-schedule?factoryId=${factoryId}&yearMonth=${yearMonth}`,
)
  .then((r) => (r.ok ? r.json() : []))
  .then(async (schedules: any[]) => {
    if (schedules.length === 0) return;
    const scheduleId = schedules[0].id;
    const res = await fetch(
      `/api/kdsx/production-schedule/${scheduleId}/actual`,
    );
    if (!res.ok) return;
    const data = await res.json();
    const grid = data.grid ?? {};
    const benchmarkMap = data.benchmarkMap ?? {};

    // Tính projected qty per item (giống logic ActualProductionGrid)
    const daysWithData = new Set<number>();
    for (const mid of Object.keys(grid)) {
      for (const dayStr of Object.keys(grid[Number(mid)])) {
        const dayData = grid[Number(mid)][Number(dayStr)];
        if (dayData && Object.values(dayData).some((kg: any) => kg > 0)) {
          daysWithData.add(Number(dayStr));
        }
      }
    }

    // Tìm tất cả combo (machineId-itemId)
    const combos = new Map<
      string,
      { machineId: number; itemId: number; lastDay: number }
    >();
    for (const mid of Object.keys(grid)) {
      const machineId = Number(mid);
      for (const dayStr of Object.keys(grid[machineId])) {
        const day = Number(dayStr);
        const dayData = grid[machineId][day];
        for (const iid of Object.keys(dayData)) {
          const itemId = Number(iid);
          if (dayData[itemId] <= 0) continue;
          const key = `${machineId}-${itemId}`;
          const existing = combos.get(key);
          if (!existing) combos.set(key, { machineId, itemId, lastDay: day });
          else if (day > existing.lastDay) existing.lastDay = day;
        }
      }
    }

    // Tìm lastRow per machine
    const lastRowPerMachine = new Map<number, string>();
    for (const [key, combo] of combos) {
      const existing = lastRowPerMachine.get(combo.machineId);
      if (!existing || combo.lastDay > (combos.get(existing)?.lastDay ?? 0)) {
        lastRowPerMachine.set(combo.machineId, key);
      }
    }

    // Tính tổng per item
    const [, month] = yearMonth.split("-").map(Number);
    const totalDays = new Date(
      Number(yearMonth.split("-")[0]),
      month,
      0,
    ).getDate();
    const qtyByItem: Record<number, number> = {};

    for (const [key, combo] of combos) {
      const bmKg = benchmarkMap[key] ?? 0;
      const isLastRow = lastRowPerMachine.get(combo.machineId) === key;

      for (let day = 1; day <= totalDays; day++) {
        const actual = grid[combo.machineId]?.[day]?.[combo.itemId] ?? 0;
        if (actual > 0) {
          qtyByItem[combo.itemId] = (qtyByItem[combo.itemId] ?? 0) + actual;
        } else if (
          bmKg > 0 &&
          !daysWithData.has(day) &&
          day > combo.lastDay &&
          isLastRow
        ) {
          qtyByItem[combo.itemId] = (qtyByItem[combo.itemId] ?? 0) + bmKg;
        }
      }
    }

    setProjectedQtyByItem(qtyByItem);
  })
  .catch(() => {});
```

### 2. Khi tick "Tự tính SL" → tính qty ngay ở frontend

Sửa checkbox `isAutoQty`:

```tsx
<Checkbox
  onChange={(e) => {
    const checked = e.target.checked;
    setIsAutoQty(checked);
    if (checked) {
      const itemId = lineItemForm.getFieldValue("itemId");
      if (itemId && projectedQtyByItem[itemId]) {
        // Tổng SL giả định của mặt hàng này
        const totalProjected = projectedQtyByItem[itemId] ?? 0;
        // Trừ đi SL các HĐ khác cùng mặt hàng (đã có trong plan)
        const otherQty = (plan?.lineItems ?? [])
          .filter((li) => li.itemId === itemId && li.id !== editingLineItem?.id)
          .reduce((s, li) => s + li.qty, 0);
        const autoQty = Math.max(0, Math.round(totalProjected - otherQty));
        lineItemForm.setFieldValue("qty", autoQty);
      } else {
        lineItemForm.setFieldValue("qty", 0);
        message.warning("Chưa có dữ liệu sản lượng giả định cho mặt hàng này");
      }
    }
  }}
>
  Tự tính SL từ sản lượng giả định (TH + định mức)
</Checkbox>
```

### 3. Ô qty: khi isAutoQty thì vẫn hiện giá trị nhưng readonly (không disable hoàn toàn)

```tsx
<Form.Item name="qty" label="Số lượng (kg)" rules={[{ required: true }]}>
  <InputNumber
    min={0}
    style={{ width: "100%" }}
    readOnly={isAutoQty}
    placeholder={isAutoQty ? "Đã tự tính" : ""}
  />
</Form.Item>
```

### 4. Khi save: gửi qty đã tính sẵn, backend KHÔNG cần tính lại

Trong `handleSaveLineItem`, body đã có `qty` từ form → gửi thẳng. Backend chỉ cần nhận `qty` + `isAutoQty` flag mà không cần tính lại từ ScheduleSegment.

---

Tóm tắt: Frontend fetch actual grid + benchmarkMap → tính `projectedQtyByItem` → khi tick "Tự tính SL" → điền `qty` = tổng giả định − SL các HĐ khác → gửi `qty` đã tính xuống API. Không sửa backend API.
