Hãy đọc file: src/app/api/kdsx/production-schedule/[id]/actual/route.ts

- Thay phần query KdDailyInput bằng ProductionLog, group by (machineId, itemId, recordDate) và SUM(finalOutput):
  // CŨ: lấy từ KdDailyInput
  const actuals = await prisma.kdDailyInput.findMany({
  where: {
  recordDate: { gte: startDate, lte: endDate },
  },
  select: {
  machineId: true,
  itemId: true,
  recordDate: true,
  outputKg: true,
  },
  });

const data = actuals.map((a) => ({
machineId: a.machineId,
itemId: a.itemId,
recordDate: a.recordDate,
outputKg: a.outputKg,
}));
const source = "KD_DAILY_INPUT";

// MỚI: lấy từ ProductionLog, gộp 3 ca/ngày
const logs = await prisma.productionLog.groupBy({
by: ["machineId", "itemId", "recordDate"],
where: {
recordDate: { gte: startDate, lte: endDate },
},
\_sum: { finalOutput: true },
});

const data = logs.map((l) => ({
machineId: l.machineId,
itemId: l.itemId,
recordDate: l.recordDate,
outputKg: l.\_sum.finalOutput ?? 0,
}));
const source = "PRODUCTION_LOG";

Phần còn lại của file (build grid, machines, items, benchmarkMap) giữ nguyên — không cần sửa vì data vẫn cùng format { machineId, itemId, recordDate, outputKg }.
