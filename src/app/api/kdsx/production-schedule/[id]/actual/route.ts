import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/kdsx/production-schedule/[id]/actual
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const schedule = await prisma.productionSchedule.findUnique({
    where: { id: parseInt(id) },
    include: { segments: true },
  });
  if (!schedule)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { yearMonth } = schedule;
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = new Date(`${yearMonth}-01T00:00:00.000Z`);
  const endDate = new Date(`${yearMonth}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`);

  // Lấy danh sách máy từ segments
  const segmentMachineIds = [
    ...new Set(schedule.segments.map((s) => s.machineId)),
  ];

  // Lấy sản lượng thực tế từ ProductionLog, gộp 3 ca/ngày thành 1 tổng
  // Chỉ lấy máy có trong segments KH để tránh kéo dữ liệu thừa
  const logs = await prisma.productionLog.groupBy({
    by: ["machineId", "itemId", "recordDate"],
    where: {
      machineId: { in: segmentMachineIds },
      recordDate: { gte: startDate, lte: endDate },
    },
    _sum: { finalOutput: true },
  });

  const data = logs.map((l) => ({
    machineId: l.machineId,
    itemId: l.itemId,
    recordDate: l.recordDate,
    outputKg: l._sum.finalOutput ?? 0,
  }));
  const source = "PRODUCTION_LOG";

  // Format mới: grid[machineId][day][itemId] = kg — hỗ trợ máy chạy nhiều mặt hàng trong 1 ngày
  const grid: Record<number, Record<number, Record<number, number>>> = {};
  for (const row of data) {
    const day = new Date(row.recordDate).getUTCDate();
    if (!grid[row.machineId]) grid[row.machineId] = {};
    if (!grid[row.machineId][day]) grid[row.machineId][day] = {};
    grid[row.machineId][day][row.itemId] =
      (grid[row.machineId][day][row.itemId] ?? 0) + row.outputKg;
  }

  if (segmentMachineIds.length === 0 && Object.keys(grid).length === 0) {
    return NextResponse.json({ grid: {}, source: "NONE", machines: [] });
  }

  // Gộp tất cả machineId từ segments và từ dữ liệu thực tế
  const allMachineIds = [
    ...new Set([...segmentMachineIds, ...Object.keys(grid).map(Number)]),
  ];

  const machines = await prisma.machine.findMany({
    where: { id: { in: allMachineIds } },
    select: { id: true, name: true, model: true, processId: true },
  });

  // Lấy tên item cho tất cả itemId có trong grid thực tế
  const allItemIds = [...new Set(data.map((d) => d.itemId))];
  const items = await prisma.item.findMany({
    where: { id: { in: allItemIds } },
    select: { id: true, name: true },
  });

  // ── Build benchmarkMap cho tất cả combo (machineId, itemId) trong grid ──
  const combos = new Set<string>();
  for (const row of data) {
    combos.add(`${row.machineId}-${row.itemId}`);
  }

  const activeVersion = await prisma.benchmarkVersion.findFirst({
    where: {
      factoryId: schedule.factoryId,
      isActive: true,
    },
    orderBy: { effectiveFrom: "desc" },
  });

  const benchmarkMap: Record<string, number> = {};

  if (activeVersion) {
    for (const combo of combos) {
      const [machineIdStr, itemIdStr] = combo.split("-");
      const machineId = parseInt(machineIdStr);
      const itemId = parseInt(itemIdStr);
      const machine = machines.find((m) => m.id === machineId);
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
}
