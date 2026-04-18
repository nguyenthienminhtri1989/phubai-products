import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/kdsx/production-schedule/[id]/summary
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const scheduleId = parseInt(idStr);

  const schedule = await prisma.productionSchedule.findUnique({
    where: { id: scheduleId },
    select: { id: true, yearMonth: true, holidays: true },
  });

  if (!schedule) {
    return NextResponse.json(
      { error: "Không tìm thấy kế hoạch" },
      { status: 404 },
    );
  }

  const holidays: number[] = Array.isArray(schedule.holidays)
    ? (schedule.holidays as number[])
    : [];

  const segments = await prisma.scheduleSegment.findMany({
    where: { scheduleId },
    include: {
      item: { select: { id: true, name: true } },
      machine: { select: { id: true } },
    },
  });

  // Group by itemId
  const itemMap = new Map<
    number,
    {
      itemId: number;
      itemName: string;
      totalKg: number;
      totalDays: number;
      segmentCount: number;
      machinesInvolved: Set<number>;
    }
  >();

  for (const seg of segments) {
    let days = seg.toDay - seg.fromDay + 1;
    const holidaysInRange = holidays.filter(
      (h) => h >= seg.fromDay && h <= seg.toDay,
    ).length;
    days = Math.max(0, days - holidaysInRange);
    const kg = days * seg.kgPerDay;

    if (!itemMap.has(seg.itemId)) {
      itemMap.set(seg.itemId, {
        itemId: seg.itemId,
        itemName: seg.item.name,
        totalKg: 0,
        totalDays: 0,
        segmentCount: 0,
        machinesInvolved: new Set(),
      });
    }
    const entry = itemMap.get(seg.itemId)!;
    entry.totalKg += kg;
    entry.totalDays += days;
    entry.segmentCount += 1;
    entry.machinesInvolved.add(seg.machineId);
  }

  const result = Array.from(itemMap.values()).map((entry) => ({
    itemId: entry.itemId,
    itemName: entry.itemName,
    totalKg: Math.round(entry.totalKg),
    totalTons: Math.round(entry.totalKg / 100) / 10,
    totalDays: entry.totalDays,
    segmentCount: entry.segmentCount,
    machinesInvolved: Array.from(entry.machinesInvolved),
  }));

  // Sắp xếp theo totalKg giảm dần
  result.sort((a, b) => b.totalKg - a.totalKg);

  return NextResponse.json(result);
}
