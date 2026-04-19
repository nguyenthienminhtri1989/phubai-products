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
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // last day of month

  // Lấy danh sách máy từ segments
  const machineIds = [...new Set(schedule.segments.map((s) => s.machineId))];

  if (machineIds.length === 0) {
    return NextResponse.json({ grid: {}, source: "NONE" });
  }

  // Lấy sản lượng thực tế từ KdDailyInput
  const actuals = await prisma.kdDailyInput.findMany({
    where: {
      machineId: { in: machineIds },
      recordDate: { gte: startDate, lte: endDate },
    },
    select: {
      machineId: true,
      itemId: true,
      recordDate: true,
      outputKg: true,
    },
  });

  // Nếu KdDailyInput trống, fallback sang ProductionLog
  let data: {
    machineId: number;
    itemId: number;
    recordDate: Date;
    outputKg: number;
  }[] = actuals.map((a) => ({
    machineId: a.machineId,
    itemId: a.itemId,
    recordDate: a.recordDate,
    outputKg: a.outputKg,
  }));
  let source = "KD_DAILY_INPUT";

  if (actuals.length === 0) {
    const logs = await prisma.productionLog.groupBy({
      by: ["machineId", "itemId", "recordDate"],
      where: {
        machineId: { in: machineIds },
        recordDate: { gte: startDate, lte: endDate },
      },
      _sum: { finalOutput: true },
    });
    data = logs.map((l) => ({
      machineId: l.machineId,
      itemId: l.itemId,
      recordDate: l.recordDate,
      outputKg: l._sum.finalOutput ?? 0,
    }));
    source = "PRODUCTION_LOG";
  }

  // Format: { machineId: { day: { itemId, kg } } }
  const grid: Record<
    number,
    Record<number, { itemId: number; kg: number }>
  > = {};
  for (const row of data) {
    const day = new Date(row.recordDate).getDate();
    if (!grid[row.machineId]) grid[row.machineId] = {};
    if (!grid[row.machineId][day]) {
      grid[row.machineId][day] = { itemId: row.itemId, kg: 0 };
    }
    grid[row.machineId][day].kg += row.outputKg;
  }

  return NextResponse.json({ grid, source });
}
