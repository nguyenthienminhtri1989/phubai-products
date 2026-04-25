# File sửa: src/app/api/kdsx/production-schedule/[id]/actual/route.ts

Thêm trả về bảng định mức benchmark cho tất cả combo (machineId, itemId) có trong grid:

// Sau khi build grid, lấy benchmark cho tất cả combo máy + mặt hàng
const combos = new Set<string>();
for (const row of data) {
combos.add(`${row.machineId}-${row.itemId}`);
}

// Lấy thông tin máy (cần processId + model để tra benchmark)
const machineDetails = await prisma.machine.findMany({
where: { id: { in: allMachineIds } },
select: { id: true, name: true, model: true, processId: true },
});

// Tìm benchmark version active cho factory này
const activeVersion = await prisma.benchmarkVersion.findFirst({
where: {
factoryId: schedule.factoryId,
isActive: true,
},
orderBy: { effectiveFrom: "desc" },
});

// Build map: "machineId-itemId" → kgPerDay (empiricalOutputPerDay)
const benchmarkMap: Record<string, number> = {};

if (activeVersion) {
for (const combo of combos) {
const [machineIdStr, itemIdStr] = combo.split("-");
const machineId = parseInt(machineIdStr);
const itemId = parseInt(itemIdStr);
const machine = machineDetails.find(m => m.id === machineId);
if (!machine?.model) continue;

    const benchmark = await prisma.productivityBenchmark.findFirst({
      where: {
        versionId: activeVersion.id,
        itemId,
        processId: machine.processId,
        machineModel: machine.model,
        benchmarkType: "EMPIRICAL",
      },
    });

    if (benchmark?.empiricalOutputPerDay) {
      benchmarkMap[combo] = benchmark.empiricalOutputPerDay;
    }

}
}

return NextResponse.json({ grid, source, machines, items, benchmarkMap });

# File sửa: src/components/kdsx/ActualProductionGrid.tsx

Nhận benchmarkMap từ API và dùng nó thay vì segments:

// Thêm state
const [benchmarkMap, setBenchmarkMap] = useState<Record<string, number>>({});

// Trong useEffect fetch, thêm:
setBenchmarkMap(data.benchmarkMap ?? {});

// Trong phần render ô ngày, thay logic tra định mức:

// CŨ:
const matchingSeg = segments.find(s => s.machineId === row.machineId && s.itemId === row.itemId);
// ...
const planKg = matchingSeg && day >= matchingSeg.fromDay && day <= matchingSeg.toDay
? matchingSeg.kgPerDay : 0;

// MỚI: ưu tiên benchmarkMap, fallback sang segment KH
const bmKey = `${row.machineId}-${row.itemId}`;
const benchmarkKg = benchmarkMap[bmKey] ?? 0;
const matchingSeg = segments.find(s => s.machineId === row.machineId && s.itemId === row.itemId);
const segKg = matchingSeg && day >= matchingSeg.fromDay && day <= matchingSeg.toDay
? matchingSeg.kgPerDay : 0;
const planKg = benchmarkKg || segKg; // ưu tiên benchmark, fallback segment
