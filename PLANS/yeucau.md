Tôi thấy vấn đề rồi. Có **2 chỗ khác** ngoài `ActualProductionGrid.tsx` cũng tính tổng TH nhưng chưa áp dụng logic `firstDay/lastDay`:

**Chỗ 1: `ProductionScheduleDetailClient.tsx`** — phần `actualSummaryByItem` (bảng so sánh KH/TH ở đầu trang):

```typescript
// Dòng khoảng 170-185: tính actualSummaryByItem
// Đang cộng MỌI ô có data, không phân biệt firstDay/lastDay
if (dayData && dayData[itemId] !== undefined) totalActualKg += dayData[itemId];
```

**Chỗ 2: `ScheduleComparisonDashboard.tsx`** — phần `thByItem` + `lineData`:

```typescript
// Đang cộng benchmark cho ngày chưa có data nhưng KHÔNG check firstDay/lastDay
const value = actual > 0 ? actual : daysWithActualData.has(day) ? 0 : bmKg;
```

Cả 2 chỗ này **không có thông tin `firstDay/lastDay` per row** nên không biết khi nào nên dừng điền định mức.

**Fix logic tổng TH trong 2 files — cần biết firstDay/lastDay của mỗi combo (machineId, itemId)**

## File 1: `src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx`

Phần tính `actualSummaryByItem` (khoảng dòng tính `totalActualKg`). Hiện tại chỉ cộng SL thực tế. Cần thêm logic cộng benchmark cho ngày tương lai, nhưng chỉ trong phạm vi `firstDay-lastDay` và chỉ khi cột ngày đó chưa có data.

Sửa đoạn tính `actualSummaryByItem`:

```typescript
const actualSummaryByItem = allItemIds
  .map((itemId) => {
    const machineIds = Array.from(
      new Set(
        schedule.segments
          .filter((s) => s.itemId === itemId)
          .map((s) => s.machineId),
      ),
    );

    // Xác định ngày nào đã có data thực tế (toàn bộ grid, không chỉ máy này)
    const daysWithData = new Set<number>();
    for (const mid of Object.keys(actualGrid).map(Number)) {
      for (const dayStr of Object.keys(actualGrid[mid] ?? {})) {
        const day = parseInt(dayStr);
        const dayData = actualGrid[mid][day];
        if (dayData && Object.values(dayData).some((kg) => kg > 0)) {
          daysWithData.add(day);
        }
      }
    }

    let totalActualKg = 0;
    for (const machineId of machineIds) {
      const machineGrid = actualGrid[machineId] ?? {};
      const bmKey = `${machineId}-${itemId}`;
      const bmKg = actualBenchmarkMap[bmKey] ?? 0;

      // Tìm firstDay/lastDay của combo này từ grid data
      let firstDay = totalDays + 1;
      let lastDay = 0;
      for (const dayStr of Object.keys(machineGrid)) {
        const day = parseInt(dayStr);
        if (machineGrid[day]?.[itemId] > 0) {
          if (day < firstDay) firstDay = day;
          if (day > lastDay) lastDay = day;
        }
      }

      for (let day = filterFrom; day <= filterTo; day++) {
        if (holidayArr.includes(day)) continue;
        const actual = machineGrid[day]?.[itemId] ?? 0;
        if (actual > 0) {
          totalActualKg += actual;
        } else if (
          bmKg > 0 &&
          !daysWithData.has(day) &&
          day >= firstDay &&
          day > lastDay
        ) {
          // Điền benchmark chỉ sau lastDay và khi cột ngày chưa có data
          totalActualKg += bmKg;
        }
      }
    }
    return {
      itemId,
      itemName: itemMap.get(itemId) ?? `Item ${itemId}`,
      totalActualKg,
      totalActualTons: totalActualKg / 1000,
    };
  })
  .filter((a) => a.totalActualKg > 0 || actualGridLoaded);
```

## File 2: `src/components/kdsx/ScheduleComparisonDashboard.tsx`

Phần tính `thByItem`. Cần biết `firstDay/lastDay` cho mỗi combo. Sửa:

```typescript
// Sau khi build rowCombos, tính firstDay/lastDay cho từng combo
const comboRange: Record<string, { firstDay: number; lastDay: number }> = {};
for (const combo of rowCombos) {
  const [machineIdStr, itemIdStr] = combo.split("-");
  const machineId = parseInt(machineIdStr);
  const itemId = parseInt(itemIdStr);
  let firstDay = totalDays + 1;
  let lastDay = 0;
  const machineGrid = grid[machineId] ?? {};
  for (const dayStr of Object.keys(machineGrid)) {
    const day = parseInt(dayStr);
    if ((machineGrid[day]?.[itemId] ?? 0) > 0) {
      if (day < firstDay) firstDay = day;
      if (day > lastDay) lastDay = day;
    }
  }
  comboRange[combo] = { firstDay, lastDay };
}

// Sửa vòng lặp tính thByItem:
for (const combo of rowCombos) {
  const [machineIdStr, itemIdStr] = combo.split("-");
  const machineId = parseInt(machineIdStr);
  const itemId = parseInt(itemIdStr);
  const bmKg = benchmarkMap[combo] ?? 0;
  const range = comboRange[combo] ?? { firstDay: totalDays + 1, lastDay: 0 };

  for (let day = 1; day <= totalDays; day++) {
    if (holidays.includes(day)) continue;
    const actual = grid[machineId]?.[day]?.[itemId] ?? 0;
    if (actual > 0) {
      thByItem[itemId] = (thByItem[itemId] ?? 0) + actual;
    } else if (
      bmKg > 0 &&
      !daysWithActualData.has(day) &&
      day >= range.firstDay &&
      day > range.lastDay
    ) {
      thByItem[itemId] = (thByItem[itemId] ?? 0) + bmKg;
    }
  }
}
```

Sửa tương tự cho `lineData` (phần tính `thCumul`):

```typescript
// CŨ:
if (!holidays.includes(day)) {
  for (const machineId in grid) {
    const dayData = grid[Number(machineId)]?.[day];
    if (dayData) {
      for (const kg of Object.values(dayData)) {
        thCumul += kg;
      }
    }
  }
}

// MỚI:
if (!holidays.includes(day)) {
  for (const combo of rowCombos) {
    const [machineIdStr, itemIdStr] = combo.split("-");
    const machineId = parseInt(machineIdStr);
    const itemId = parseInt(itemIdStr);
    const actual = grid[machineId]?.[day]?.[itemId] ?? 0;
    const bmKg = benchmarkMap[combo] ?? 0;
    const range = comboRange[combo] ?? { firstDay: totalDays + 1, lastDay: 0 };

    if (actual > 0) {
      thCumul += actual;
    } else if (
      bmKg > 0 &&
      !daysWithActualData.has(day) &&
      day >= range.firstDay &&
      day > range.lastDay
    ) {
      thCumul += bmKg;
    }
  }
}
```

---

Chỉ sửa 2 files. Logic giống nhau: benchmark chỉ điền khi `day >= firstDay && day > lastDay && !daysWithActualData.has(day)`.
