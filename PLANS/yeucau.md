**File: `src/components/kdsx/ActualProductionGrid.tsx`**

Tìm phần render ô ngày (trong `dayNumbers.map(day => {`), sửa logic `displayKg` và `hasAnyValue`:

```typescript
// CŨ:
const displayKg = hasActualData ? actualKg : benchmarkKg;
const hasAnyValue = displayKg > 0;
const isBenchmarkFill =
  !hasActualData &&
  benchmarkKg > 0 &&
  !daysWithActualData.has(day) &&
  day > row.lastDay;

// MỚI:
const isBenchmarkFill =
  !hasActualData &&
  benchmarkKg > 0 &&
  !daysWithActualData.has(day) &&
  day >= row.firstDay &&
  day > row.lastDay;

// displayKg: chỉ hiện benchmark khi isBenchmarkFill = true
const displayKg = hasActualData ? actualKg : isBenchmarkFill ? benchmarkKg : 0;
const hasAnyValue = displayKg > 0;
```

Chỉ sửa 3 dòng này. Logic: `displayKg` = 0 (trống) khi ô không có data thực tế VÀ không phải ô benchmark tương lai. Chỉ hiện benchmark khi `isBenchmarkFill = true`.

---

**File: `src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx`**

Phần `actualSummaryByItem` đã sửa đúng logic `day > lastDay` — giữ nguyên.

**File: `src/components/kdsx/ScheduleComparisonDashboard.tsx`**

Cần thêm điều kiện `day >= range.firstDay` vào logic tính `thByItem`. Tìm dòng:

```typescript
} else if (bmKg > 0 && !daysWithActualData.has(day) && lastDay > 0 && day > lastDay) {
```

Sửa thành:

```typescript
} else if (bmKg > 0 && !daysWithActualData.has(day) && day >= range.firstDay && day > range.lastDay) {
```

Trong đó `range` cần được tính trước cho mỗi combo giống như đã mô tả ở các prompt trước. Nếu `ScheduleComparisonDashboard` chưa có `comboRange`, thêm:

```typescript
// Trước vòng lặp tính thByItem:
const comboRange: Record<string, { firstDay: number; lastDay: number }> = {};
for (const combo of rowCombos) {
  const [machineIdStr, itemIdStr] = combo.split("-");
  const machineId = parseInt(machineIdStr);
  const itemId = parseInt(itemIdStr);
  let firstDay = totalDays + 1,
    lastDay = 0;
  const mg = grid[machineId] ?? {};
  for (const dayStr of Object.keys(mg)) {
    const d = parseInt(dayStr);
    if ((mg[d]?.[itemId] ?? 0) > 0) {
      if (d < firstDay) firstDay = d;
      if (d > lastDay) lastDay = d;
    }
  }
  comboRange[combo] = { firstDay, lastDay };
}
```

Rồi trong vòng lặp:

```typescript
const range = comboRange[combo];
const value =
  actual > 0
    ? actual
    : bmKg > 0 &&
        !daysWithActualData.has(day) &&
        range.lastDay > 0 &&
        day >= range.firstDay &&
        day > range.lastDay
      ? bmKg
      : 0;
```

---

Tóm tắt: lỗi gốc là `displayKg = benchmarkKg` kể cả khi ô không thuộc phạm vi benchmark. Sửa bằng cách chỉ gán `displayKg = benchmarkKg` khi `isBenchmarkFill = true`.
