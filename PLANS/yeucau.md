Tôi thấy vấn đề. Máy con G37 số 1 chạy 2 mặt hàng:

- **26/1 CVCm 60/40**: ngày 1-5 (có SL thực tế ngày 1-3, định mức ngày 4-5)
- **40/1 CVCm 60/40**: ngày 4-5 (có SL thực tế ngày 4-5)

Ô ngày 4-5 dòng 26/1 CVCm **phải trống** vì máy đã đổi sang 40/1 CVCm. Nhưng hiện tại đang hiện định mức (1,110) và (530) ở những ô đó.

Vấn đề: logic `daysWithActualData` chưa đủ — cần kết hợp thêm điều kiện **dòng nào thuộc khoảng ngày nào**.

Đưa cho Claude Code:

---

**File: `src/components/kdsx/ActualProductionGrid.tsx`**

Logic hiện tại điền định mức cho tất cả ngày chưa có data ở dòng đó. Nhưng khi máy đổi mặt hàng, dòng cũ phải **dừng** tại ngày cuối cùng có SL thực tế.

Sửa điều kiện `isBenchmarkFill` — chỉ điền định mức khi ngày nằm trong khoảng `firstDay` đến `lastDay` của dòng đó VÀ ngày chưa có bất kỳ data nào:

```typescript
// CŨ:
const isBenchmarkFill =
  !hasActualData && benchmarkKg > 0 && !daysWithActualData.has(day);

// MỚI: chỉ điền định mức nếu:
// 1. Ô này chưa có SL thực tế
// 2. Có định mức benchmark
// 3. Ngày này chưa có bất kỳ bản ghi SL nào (cả tháng)
// 4. Ngày nằm trong khoảng firstDay-lastDay của dòng này
const isBenchmarkFill =
  !hasActualData &&
  benchmarkKg > 0 &&
  !daysWithActualData.has(day) &&
  day >= row.firstDay &&
  day <= row.lastDay;
```

Sửa tương tự cho `rowTotal`:

```typescript
// CŨ:
rowTotal +=
  actual > 0 ? actual : daysWithActualData.has(day) ? 0 : benchmarkKgForRow;

// MỚI:
const inRange = day >= row.firstDay && day <= row.lastDay;
rowTotal +=
  actual > 0
    ? actual
    : !daysWithActualData.has(day) && inRange
      ? benchmarkKgForRow
      : 0;
```

---

Chỉ sửa 2 chỗ. Logic: ô chỉ được điền định mức khi nằm trong **khoảng ngày hoạt động** của dòng đó (`firstDay` đến `lastDay` — đã có sẵn trong `row`).
