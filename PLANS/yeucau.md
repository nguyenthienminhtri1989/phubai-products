File: src/app/api/kdsx/production-schedule/[id]/actual/route.ts
Thêm filter machineId trong query ProductionLog — chỉ lấy máy có trong segments KH:
// CŨ: lấy tất cả máy
const logs = await prisma.productionLog.groupBy({
by: ["machineId", "itemId", "recordDate"],
where: {
recordDate: { gte: startDate, lte: endDate },
},
\_sum: { finalOutput: true },
});

// MỚI: chỉ lấy máy có trong KH
const segmentMachineIds = [...new Set(schedule.segments.map((s) => s.machineId))];

const logs = await prisma.productionLog.groupBy({
by: ["machineId", "itemId", "recordDate"],
where: {
machineId: { in: segmentMachineIds },
recordDate: { gte: startDate, lte: endDate },
},
\_sum: { finalOutput: true },
});
