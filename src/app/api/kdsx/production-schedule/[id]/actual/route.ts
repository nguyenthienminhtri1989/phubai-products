import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/kdsx/production-schedule/[id]/actual
// Query params:
//   processIds (optional): "1,2,3" — lọc theo công đoạn thay vì từ segments
//   Nếu không truyền processIds → fallback về segment machines (backward compat)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Parse optional processIds query param
  const url = new URL(req.url);
  const processIdsParam = url.searchParams.get("processIds");
  const filterProcessIds = processIdsParam
    ? processIdsParam.split(",").map(Number).filter((n) => !isNaN(n) && n > 0)
    : [];

  const schedule = await prisma.productionSchedule.findUnique({
    where: { id: parseInt(id) },
    include: { segments: true },
  });
  if (!schedule)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { yearMonth, factoryId } = schedule;
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = new Date(`${yearMonth}-01T00:00:00.000Z`);
  const endDate = new Date(`${yearMonth}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`);

  // ── Xác định danh sách machineId cần query ──
  // Ưu tiên 1: filterProcessIds được truyền từ UI → lấy tất cả máy active trong công đoạn đó
  // Ưu tiên 2: Fallback về segment machines (backward compat — khi không truyền processIds)
  let machineIdsToQuery: number[];

  if (filterProcessIds.length > 0) {
    // User đã chọn công đoạn cụ thể → lấy tất cả máy active của các công đoạn đó
    // Hoàn toàn độc lập với segments — không cần có KH trước
    const processedMachines = await prisma.machine.findMany({
      where: { processId: { in: filterProcessIds }, isActive: true },
      select: { id: true },
    });
    machineIdsToQuery = processedMachines.map((m) => m.id);
  } else {
    // Fallback: lấy từ segments (backward compatibility)
    machineIdsToQuery = [...new Set(schedule.segments.map((s) => s.machineId))];
  }

  // Không có máy nào → trả về rỗng
  if (machineIdsToQuery.length === 0) {
    return NextResponse.json({ grid: {}, source: "NONE", machines: [], items: [], benchmarkMap: {} });
  }

  // Lấy sản lượng thực tế từ ProductionLog, gộp 3 ca/ngày thành 1 tổng
  const logs = await prisma.productionLog.groupBy({
    by: ["machineId", "itemId", "recordDate"],
    where: {
      machineId: { in: machineIdsToQuery },
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

  // Format grid[machineId][day][itemId] = kg
  const grid: Record<number, Record<number, Record<number, number>>> = {};
  for (const row of data) {
    const day = new Date(row.recordDate).getUTCDate();
    if (!grid[row.machineId]) grid[row.machineId] = {};
    if (!grid[row.machineId][day]) grid[row.machineId][day] = {};
    grid[row.machineId][day][row.itemId] =
      (grid[row.machineId][day][row.itemId] ?? 0) + row.outputKg;
  }

  // Gộp tất cả machineId từ query list và từ dữ liệu thực tế
  const allMachineIds = [
    ...new Set([...machineIdsToQuery, ...Object.keys(grid).map(Number)]),
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
    where: { factoryId, isActive: true },
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
