import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/kdsx/production-schedule/[id]/actual-summary-by-item
 *
 * Trả về tổng SL theo mặt hàng, kết hợp KH + TH:
 *   - Ngày đã có SL thực tế (KdDailyInput) → dùng thực tế
 *   - Ngày chưa có → giữ giá trị KH (kgPerDay từ ScheduleSegment)
 *
 * Response: [{ itemId, khKg, thKg }]
 */
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
  const endDate = new Date(year, month, 0); // ngày cuối tháng

  const holidays: number[] = (schedule.holidays as number[]) ?? [];

  // Lấy SL thực tế từ KdDailyInput
  const machineIds = [...new Set(schedule.segments.map((s) => s.machineId))];

  const actuals =
    machineIds.length > 0
      ? await prisma.kdDailyInput.findMany({
          where: {
            machineId: { in: machineIds },
            recordDate: { gte: startDate, lte: endDate },
          },
          select: {
            machineId: true,
            recordDate: true,
            outputKg: true,
          },
        })
      : [];

  // Build map: machineId → day → outputKg (tổng nếu nhiều record cùng ngày)
  const actualMap: Record<number, Record<number, number>> = {};
  for (const a of actuals) {
    const day = new Date(a.recordDate).getDate();
    if (!actualMap[a.machineId]) actualMap[a.machineId] = {};
    actualMap[a.machineId][day] =
      (actualMap[a.machineId][day] ?? 0) + a.outputKg;
  }

  // Tính tổng SL theo mặt hàng: KH + TH kết hợp
  const itemTotals: Record<
    number,
    { itemId: number; khKg: number; thKg: number }
  > = {};

  for (const seg of schedule.segments) {
    if (!itemTotals[seg.itemId]) {
      itemTotals[seg.itemId] = { itemId: seg.itemId, khKg: 0, thKg: 0 };
    }

    for (let day = seg.fromDay; day <= seg.toDay; day++) {
      if (holidays.includes(day)) continue;

      const khKg = seg.kgPerDay;
      const actualKg = actualMap[seg.machineId]?.[day];
      // Ngày có SL thực tế → dùng TH; ngày chưa nhập → dùng KH
      const thKg = actualKg !== undefined ? actualKg : khKg;

      itemTotals[seg.itemId].khKg += khKg;
      itemTotals[seg.itemId].thKg += thKg;
    }
  }

  return NextResponse.json(Object.values(itemTotals));
}
