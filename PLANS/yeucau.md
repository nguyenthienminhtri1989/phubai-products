File: src/app/api/kdsx/production-schedule/[id]/actual/route.ts
Grid hiện tại chỉ lưu 1 itemId per (machineId, day). Khi máy chạy 2 mặt hàng trong 1 ngày, data bị mất. Sửa cấu trúc grid:
typescript// CŨ: 1 cell per (machineId, day) → mất data khi đổi MH giữa ngày
const grid: Record<number, Record<number, { itemId: number; kg: number }>> = {};

// MỚI: nhiều cells per (machineId, day), key bằng itemId
const grid: Record<number, Record<number, Record<number, number>>> = {};
// grid[machineId][day][itemId] = kg

for (const row of data) {
const day = new Date(row.recordDate).getDate();
if (!grid[row.machineId]) grid[row.machineId] = {};
if (!grid[row.machineId][day]) grid[row.machineId][day] = {};
grid[row.machineId][day][row.itemId] = (grid[row.machineId][day][row.itemId] ?? 0) + row.outputKg;
}
File: src/components/kdsx/ActualProductionGrid.tsx
Cập nhật interface và logic render theo cấu trúc mới:
typescript// CŨ:
export interface ActualGrid {
[machineId: number]: {
[day: number]: { itemId: number; kg: number };
};
}

// MỚI:
export interface ActualGrid {
[machineId: number]: {
[day: number]: { [itemId: number]: number }; // itemId → kg
};
}
Trong phần render ô ngày:
typescript// CŨ:
const cell = machineGrid[day];
const cellMatchesSeg = cell && cell.itemId === seg.itemId;
const actualKg = cellMatchesSeg ? cell.kg : 0;
const hasData = !!cellMatchesSeg;

// MỚI:
const dayData = machineGrid[day]; // { [itemId]: kg }
const actualKg = dayData?.[seg.itemId] ?? 0;
const hasData = actualKg > 0;
Trong segTotalActual:
typescript// CŨ:
function segTotalActual(seg: Segment): number {
const machineGrid = grid[seg.machineId] ?? {};
let total = 0;
for (const day of dayNumbers) {
if (holidays.includes(day)) continue;
const cell = machineGrid[day];
if (cell && cell.itemId === seg.itemId) total += cell.kg;
}
return total;
}

// MỚI:
function segTotalActual(seg: Segment): number {
const machineGrid = grid[seg.machineId] ?? {};
let total = 0;
for (const day of dayNumbers) {
if (holidays.includes(day)) continue;
total += machineGrid[day]?.[seg.itemId] ?? 0;
}
return total;
}
Trong totalActualByDay:
typescript// CŨ:
const cell = grid[mid]?.[day];
if (cell) total += cell.kg;

// MỚI:
const dayData = grid[mid]?.[day];
if (dayData) {
for (const kg of Object.values(dayData)) {
total += kg;
}
}
Virtual segments (nếu có) cũng cần cập nhật tương tự.

Tóm tắt: cấu trúc grid cũ chỉ lưu 1 itemId per ô → mất data khi máy đổi MH trong ngày. Đổi sang grid[machineId][day][itemId] = kg giải quyết hoàn toàn.
