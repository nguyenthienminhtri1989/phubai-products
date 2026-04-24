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

  // Chỉ dùng KdDailyInput (production_logs sẽ được tích hợp sau nếu cần)
  const data = actuals.map((a) => ({
    machineId: a.machineId,
    itemId: a.itemId,
    recordDate: a.recordDate,
    outputKg: a.outputKg,
  }));
  const source = "KD_DAILY_INPUT";

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
