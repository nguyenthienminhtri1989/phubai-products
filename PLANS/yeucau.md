# trang kdsx/sales-orders/

File: src/components/kdsx/ActualProductionGrid.tsx
Hiện tại danh sách máy chỉ lấy từ segments:
typescript// CŨ: chỉ lấy máy từ segments KH
const uniqueMachines = Array.from(
new Map(segments.map(s => [s.machineId, s.machine])).values()
).sort((a, b) => a.id - b.id);
Sửa thành: gộp máy từ segments KH VÀ máy từ grid thực tế:
typescript// MỚI: gộp máy từ cả KH và TH
const machineMap = new Map<number, { id: number; name: string; model?: string | null; processId: number }>();

// Từ segments KH
for (const s of segments) {
machineMap.set(s.machineId, s.machine);
}

// Từ grid thực tế — máy có SL nhưng không có trong KH
for (const machineIdStr of Object.keys(grid)) {
const machineId = parseInt(machineIdStr);
if (!machineMap.has(machineId)) {
// Lấy thông tin máy từ cell đầu tiên hoặc tạo placeholder
machineMap.set(machineId, {
id: machineId,
name: `Máy ${machineId}`,
model: null,
processId: 0,
});
}
}

const uniqueMachines = Array.from(machineMap.values()).sort((a, b) => a.id - b.id);
Tuy nhiên cách trên chỉ có machineId từ grid, không có name đầy đủ. Cần sửa thêm API actual để trả về thông tin máy.
File: src/app/api/kdsx/production-schedule/[id]/actual/route.ts
Thêm trả về danh sách máy đầy đủ:
typescript// Sau khi build grid, lấy thêm thông tin máy
const allMachineIds = [...new Set([
...schedule.segments.map(s => s.machineId),
...data.map(d => d.machineId),
])];

const machines = await prisma.machine.findMany({
where: { id: { in: allMachineIds } },
select: { id: true, name: true, model: true, processId: true },
});

return NextResponse.json({
grid,
source: actuals.length > 0 ? "KD_DAILY_INPUT" : "PRODUCTION_LOG",
machines, // THÊM
});
File: src/components/kdsx/ActualProductionGrid.tsx
Cập nhật để nhận machines từ API:
typescript// Trong useEffect fetch:
const data = await res.json();
const fetchedGrid = data.grid ?? {};
const fetchedMachines = data.machines ?? [];

// Gộp machines vào uniqueMachines

Ngoài ra, cần giải quyết vấn đề không sửa được benchmark đã active. Đưa thêm cho Claude Code:
File: API xóa/sửa BenchmarkVersion (tìm route tương ứng)
Cho phép thêm dòng mới vào version đang active (chỉ thêm, không sửa/xóa dòng cũ):
typescript// Khi thêm ProductivityBenchmark vào version active:
// Cho phép nếu chưa có benchmark cho combo (versionId, itemId, processId, machineModel)
// Tức là bổ sung mặt hàng còn thiếu — KHÔNG block
Và cho phép sửa benchmark trong version active nếu chưa có ScheduleSegment nào dùng (benchmarkId chưa được tham chiếu):
typescript// Khi sửa/xóa ProductivityBenchmark:
const usedInSchedule = await prisma.scheduleSegment.findFirst({
where: { benchmarkId: benchmark.id },
});
if (usedInSchedule) {
return error("Không thể sửa — đã được dùng trong KH SX tháng");
}
// Chưa dùng → cho sửa/xóa tự do
