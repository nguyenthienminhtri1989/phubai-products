Tìm ra lỗi rồi! Dashboard đang dùng **cấu trúc grid CŨ** `{ itemId: number; kg: number }` nhưng API đã trả về **cấu trúc MỚI** `{ [itemId]: kg }`.

Nhìn vào code:

```typescript
// Interface sai — vẫn dùng cấu trúc cũ:
interface ActualGrid {
  [machineId: number]: {
    [day: number]: { itemId: number; kg: number }; // ← SAI
  };
}

// Phần tính tổng TH cũng sai:
const cell = machGrid[Number(day)];
thByItem[cell.itemId] += cell.kg; // ← cell giờ là { [itemId]: kg }, không có .itemId
```

Đưa cho Claude Code:

---

**File: `src/components/kdsx/ScheduleComparisonDashboard.tsx`**

**Sửa 1 — Interface ActualGrid:**

```typescript
// CŨ:
interface ActualGrid {
  [machineId: number]: {
    [day: number]: { itemId: number; kg: number };
  };
}

// MỚI:
interface ActualGrid {
  [machineId: number]: {
    [day: number]: { [itemId: number]: number };
  };
}
```

**Sửa 2 — Tính tổng TH theo itemId (khoảng dòng 85-92):**

```typescript
// CŨ:
const thByItem: Record<number, number> = {};
for (const machineId in grid) {
  const machGrid = grid[Number(machineId)];
  for (const day in machGrid) {
    const cell = machGrid[Number(day)];
    if (!thByItem[cell.itemId]) thByItem[cell.itemId] = 0;
    thByItem[cell.itemId] += cell.kg;
  }
}

// MỚI:
const thByItem: Record<number, number> = {};
for (const machineId in grid) {
  const machGrid = grid[Number(machineId)];
  for (const day in machGrid) {
    const dayData = machGrid[Number(day)];
    for (const [itemIdStr, kg] of Object.entries(dayData)) {
      const itemId = parseInt(itemIdStr);
      thByItem[itemId] = (thByItem[itemId] ?? 0) + kg;
    }
  }
}
```

**Sửa 3 — Line chart tích lũy TH (khoảng dòng 110-115):**

```typescript
// CŨ:
for (const machineId in grid) {
  const cell = grid[Number(machineId)]?.[day];
  if (cell && !holidays.includes(day)) {
    thCumul += cell.kg;
  }
}

// MỚI:
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
```

---

Tóm tắt: 3 chỗ trong file đang đọc grid theo cấu trúc cũ `{ itemId, kg }` → sửa sang cấu trúc mới `{ [itemId]: kg }`. Chỉ sửa 1 file này.
