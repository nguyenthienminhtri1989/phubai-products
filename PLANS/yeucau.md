**Ô chưa có SL thực tế → tự điền giá trị định mức benchmark, nền xám nhạt, tính vào tổng**

## Nguyên tắc

- Ô đã nhập SL thực tế → hiện SL thực tế + màu mặt hàng (như hiện tại)
- Ô chưa nhập SL → hiện giá trị định mức từ `benchmarkMap` + nền xám nhạt `#f0f0f0`
- Tổng dòng + Tổng ngày = thực tế + định mức gộp lại
- Không lưu DB — chỉ hiển thị trên UI

## File 1: `src/components/kdsx/ActualProductionGrid.tsx`

### Sửa phần render ô ngày

Tìm đoạn render từng ô ngày trong `dayNumbers.map(day => {`:

```typescript
// CŨ:
const actualKg = machineGrid[day]?.[row.itemId] ?? 0;
const hasData = actualKg > 0;
// ...
// Ô không có data hiện "·"

// MỚI:
const actualKg = machineGrid[day]?.[row.itemId] ?? 0;
const hasActualData = actualKg > 0;
const bmKey = `${row.machineId}-${row.itemId}`;
const benchmarkKg = resolvedBenchmarkMap[bmKey] ?? 0;
// Giá trị hiển thị: ưu tiên thực tế, fallback định mức
const displayKg = hasActualData ? actualKg : benchmarkKg;
const hasAnyValue = displayKg > 0;
const isBenchmarkFill = !hasActualData && benchmarkKg > 0; // ô giả định
```

Sửa phần render `<td>`:

```tsx
return (
  <td
    key={day}
    style={{
      ...tdStyle,
      background: isHoliday
        ? "#ffebe8"
        : isBenchmarkFill
          ? "#f0f0f0" // xám nhạt cho ô định mức
          : hasActualData
            ? getBg(row.itemId, itemColors)
            : undefined,
      borderLeft: "1px solid #d0d0d0",
    }}
  >
    {hasAnyValue ? (
      <div>
        <span
          style={{
            color: isBenchmarkFill
              ? "#aaa" // xám cho định mức
              : benchmarkKg > 0
                ? compareColor(actualKg, benchmarkKg)
                : "#595959",
            fontSize: 11,
            fontWeight: isBenchmarkFill ? 400 : 800,
            fontStyle: isBenchmarkFill ? "italic" : "normal",
          }}
        >
          {displayKg.toLocaleString()}
        </span>
        {hasActualData && benchmarkKg > 0 && (
          <div style={{ fontSize: 9, color: "#666", fontWeight: 500 }}>
            ({benchmarkKg.toLocaleString()})
          </div>
        )}
      </div>
    ) : (
      <span style={{ color: "#d9d9d9", fontSize: 13 }}>·</span>
    )}
  </td>
);
```

### Sửa tổng dòng (rowTotal) — cộng cả định mức cho ngày chưa nhập

```typescript
// CŨ:
let rowTotal = 0;
for (const day of dayNumbers) {
  if (!holidays.includes(day)) rowTotal += machineGrid[day]?.[row.itemId] ?? 0;
}

// MỚI:
const bmKey = `${row.machineId}-${row.itemId}`;
const benchmarkKgForRow = resolvedBenchmarkMap[bmKey] ?? 0;
let rowTotal = 0;
for (const day of dayNumbers) {
  if (holidays.includes(day)) continue;
  const actual = machineGrid[day]?.[row.itemId] ?? 0;
  rowTotal += actual > 0 ? actual : benchmarkKgForRow; // thực tế hoặc định mức
}
```

### Sửa tổng ngày (totalActualByDay) — cộng cả định mức

Cần biết mỗi ngày, máy nào + mặt hàng nào chưa có data → dùng benchmark. Sửa:

```typescript
const totalActualByDay = dayNumbers.map((day) => {
  if (holidays.includes(day)) return 0;
  let total = 0;
  for (const row of gridRows) {
    const actual = grid[row.machineId]?.[day]?.[row.itemId] ?? 0;
    if (actual > 0) {
      total += actual;
    } else {
      // Chưa có thực tế → cộng định mức
      const bmKey = `${row.machineId}-${row.itemId}`;
      total += resolvedBenchmarkMap[bmKey] ?? 0;
    }
  }
  return total;
});
```

## File 2: `src/components/kdsx/ScheduleComparisonDashboard.tsx`

### Sửa tính tổng TH theo itemId — cộng cả định mức cho ngày chưa nhập

Tìm phần tính `thByItem`, sửa:

```typescript
// CŨ: chỉ cộng data thực tế
const thByItem: Record<number, number> = {};
for (const machineId in grid) { ... }

// MỚI: cộng thực tế + benchmark cho ngày trống
// Cần thêm props: benchmarkMap, segments vào component (đã có segments)
// Hoặc đơn giản hơn: tính giống ActualProductionGrid

const thByItem: Record<number, number> = {};
// Build gridRows giống ActualProductionGrid
const rowCombos = new Set<string>();
// Từ grid data
for (const machineIdStr in grid) {
  const machineId = parseInt(machineIdStr);
  for (const dayStr in grid[machineId]) {
    const dayData = grid[machineId][parseInt(dayStr)];
    for (const itemIdStr in dayData) {
      rowCombos.add(`${machineId}-${itemIdStr}`);
    }
  }
}
// Từ segments KH (để có benchmark cho máy chưa nhập ngày nào)
for (const seg of segments) {
  rowCombos.add(`${seg.machineId}-${seg.itemId}`);
}

for (const combo of rowCombos) {
  const [machineIdStr, itemIdStr] = combo.split("-");
  const machineId = parseInt(machineIdStr);
  const itemId = parseInt(itemIdStr);
  const bmKg = benchmarkMap[combo] ?? 0;

  for (let day = 1; day <= totalDays; day++) {
    if (holidays.includes(day)) continue;
    const actual = grid[machineId]?.[day]?.[itemId] ?? 0;
    const value = actual > 0 ? actual : bmKg;
    if (value > 0) {
      thByItem[itemId] = (thByItem[itemId] ?? 0) + value;
    }
  }
}
```

### Thêm prop benchmarkMap vào ScheduleComparisonDashboard

Interface thêm:

```typescript
interface ScheduleComparisonDashboardProps {
  // ... existing props ...
  benchmarkMap?: Record<string, number>; // THÊM
}
```

### File parent truyền benchmarkMap

File `ProductionScheduleDetailClient.tsx`, tìm `<ScheduleComparisonDashboard`, thêm prop:

```tsx
<ScheduleComparisonDashboard
  // ... existing props ...
  benchmarkMap={actualBenchmarkMap} // THÊM
/>
```

---

Tóm tắt: ô chưa nhập → hiện định mức (chữ xám nghiêng, nền xám nhạt), tính vào tổng. Sửa 3 files, không thay đổi DB hay API.
