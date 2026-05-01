File: src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx
Sửa 1 — Thêm state lưu benchmarkMap:
typescript// Tìm dòng:
const [actualItems, setActualItems] = useState<{ id: number; name: string }[]>([]);

// Thêm ngay bên dưới:
const [actualBenchmarkMap, setActualBenchmarkMap] = useState<Record<string, number>>({});
Sửa 2 — Lưu benchmarkMap khi fetch:
typescript// Tìm hàm fetchActualGrid, sửa:
const fetchActualGrid = useCallback(async () => {
try {
const res = await fetch(`/api/kdsx/production-schedule/${scheduleId}/actual`);
if (res.ok) {
const data = await res.json();
setActualGrid(data.grid ?? {});
setActualItems(data.items ?? []);
setActualBenchmarkMap(data.benchmarkMap ?? {}); // THÊM DÒNG NÀY
}
} catch { /_ ignore _/ }
setActualGridLoaded(true);
}, [scheduleId]);
Sửa 3 — Truyền benchmarkMap xuống ActualProductionGrid:
typescript// Tìm <ActualProductionGrid, thêm prop:
<ActualProductionGrid
scheduleId={scheduleId}
segments={schedule.segments}
holidays={holidayArr}
totalDays={totalDays}
itemColors={itemColors}
yearMonth={yearMonth}
externalGrid={actualGridLoaded ? actualGrid : undefined}
externalItems={actualItems}
externalBenchmarkMap={actualBenchmarkMap} // THÊM DÒNG NÀY
/>
File: src/components/kdsx/ActualProductionGrid.tsx
Sửa 4 — Nhận prop mới:
typescript// Thêm vào interface ActualProductionGridProps:
externalBenchmarkMap?: Record<string, number>;

// Trong function params:
export default function ActualProductionGrid({
...
externalBenchmarkMap,
}: ActualProductionGridProps) {
Sửa 5 — Dùng externalBenchmarkMap nếu có:
typescript// Tìm dòng:
const grid = externalGrid ?? internalGrid;

// Thêm bên dưới:
const resolvedBenchmarkMap = externalBenchmarkMap ?? benchmarkMap;
Sửa 6 — Dùng resolvedBenchmarkMap trong render:
typescript// Tìm:
const benchmarkKg = benchmarkMap[bmKey] ?? 0;

// Đổi thành:
const benchmarkKg = resolvedBenchmarkMap[bmKey] ?? 0;
