**File: `src/components/kdsx/ActualProductionGrid.tsx`**

Sửa điều kiện `isBenchmarkFill`:

```typescript
// CŨ:
const isBenchmarkFill =
  !hasActualData &&
  benchmarkKg > 0 &&
  !daysWithActualData.has(day) &&
  day >= row.firstDay &&
  day <= row.lastDay;

// MỚI: chỉ điền định mức từ sau ngày cuối có SL thực tế trở đi
const isBenchmarkFill =
  !hasActualData &&
  benchmarkKg > 0 &&
  !daysWithActualData.has(day) &&
  day > row.lastDay;
```

Sửa tương tự cho `rowTotal`:

```typescript
// CŨ:
const inRange = day >= row.firstDay && day <= row.lastDay;
rowTotal +=
  actual > 0
    ? actual
    : !daysWithActualData.has(day) && inRange
      ? benchmarkKgForRow
      : 0;

// MỚI:
rowTotal +=
  actual > 0
    ? actual
    : !daysWithActualData.has(day) && day > row.lastDay
      ? benchmarkKgForRow
      : 0;
```

Và `totalActualByDay`:

```typescript
// Cần biết lastDay của mỗi row — tính ngoài vòng lặp
// Thay logic cũ bằng:
const totalActualByDay = dayNumbers.map((day) => {
  if (holidays.includes(day)) return 0;
  let total = 0;
  for (const row of gridRows) {
    const actual = grid[row.machineId]?.[day]?.[row.itemId] ?? 0;
    const bmKey = `${row.machineId}-${row.itemId}`;
    const bmKg = resolvedBenchmarkMap[bmKey] ?? 0;
    total +=
      actual > 0
        ? actual
        : !daysWithActualData.has(day) && day > row.lastDay
          ? bmKg
          : 0;
  }
  return total;
});
```

---

Chỉ sửa 3 chỗ trong 1 file. Logic: định mức chỉ xuất hiện **sau ngày cuối cùng có SL thực tế** (`day > row.lastDay`), không xuất hiện trong khoảng ngày đã hoạt động.
