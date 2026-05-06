Tôi hiểu rõ ý bạn. Logic đúng:

- **Ngày chưa có bất kỳ bản ghi SL nào** (chưa ai nhập cho bất kỳ máy/mặt hàng nào trong ngày đó) → điền định mức cho tất cả ô trong cột ngày đó
- **Ngày đã có ít nhất 1 bản ghi SL** (dù chỉ 1 máy 1 mặt hàng) → cột ngày đó chỉ hiện dữ liệu thực tế, ô nào trống thì để trống, **không điền định mức**

Vì ngày đã nhập liệu = ngày đã xảy ra trong thực tế → ô trống là do máy đó không chạy mặt hàng đó trong ngày đó, không nên giả định bằng định mức.

Đưa cho Claude Code:

---

**File: `src/components/kdsx/ActualProductionGrid.tsx`**

Thêm logic xác định ngày nào đã có dữ liệu thực tế. Tìm trước phần render `gridRows.map(...)`, thêm:

```typescript
// Xác định ngày nào đã có ít nhất 1 bản ghi SL thực tế
const daysWithActualData = new Set<number>();
for (const machineIdStr of Object.keys(grid)) {
  const machineGrid = grid[parseInt(machineIdStr)];
  for (const dayStr of Object.keys(machineGrid)) {
    const day = parseInt(dayStr);
    const dayData = machineGrid[day];
    if (dayData && Object.values(dayData).some((kg) => kg > 0)) {
      daysWithActualData.add(day);
    }
  }
}
```

Sau đó sửa phần render ô ngày — chỉ điền định mức khi **ngày đó chưa có bất kỳ data nào**:

```typescript
// CŨ:
const isBenchmarkFill = !hasActualData && benchmarkKg > 0;

// MỚI:
const isBenchmarkFill =
  !hasActualData && benchmarkKg > 0 && !daysWithActualData.has(day);
```

Sửa tương tự cho phần tính `rowTotal`:

```typescript
// CŨ:
rowTotal += actual > 0 ? actual : benchmarkKgForRow;

// MỚI:
rowTotal +=
  actual > 0 ? actual : daysWithActualData.has(day) ? 0 : benchmarkKgForRow;
```

Và `totalActualByDay`:

```typescript
// CŨ:
total += actual > 0 ? actual : (resolvedBenchmarkMap[bmKey] ?? 0);

// MỚI:
total +=
  actual > 0
    ? actual
    : daysWithActualData.has(day)
      ? 0
      : (resolvedBenchmarkMap[bmKey] ?? 0);
```

**Chỉ sửa 4 chỗ trong 1 file, không sửa gì khác.**

Cũng áp dụng logic tương tự trong `src/components/kdsx/ScheduleComparisonDashboard.tsx` nếu đang dùng cùng cách tính.
