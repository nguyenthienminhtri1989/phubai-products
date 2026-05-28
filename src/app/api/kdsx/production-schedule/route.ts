import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Validate yearMonth format YYYY-MM
function isValidYearMonth(ym: string): boolean {
  return /^\d{4}-\d{2}$/.test(ym);
}

// GET /api/kdsx/production-schedule?factoryId=&yearMonth=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const factoryId = searchParams.get("factoryId");
  const yearMonth = searchParams.get("yearMonth");

  const where: any = {};
  if (factoryId) where.factoryId = parseInt(factoryId);
  if (yearMonth) where.yearMonth = yearMonth;

  const schedules = await prisma.productionSchedule.findMany({
    where,
    include: {
      factory: { select: { id: true, name: true } },
      process: { select: { id: true, name: true } },
      _count: { select: { segments: true } },
    },
    orderBy: [{ yearMonth: "desc" }, { createdAt: "desc" }],
  });

  // Tính tổng kg cho mỗi schedule
  const result = await Promise.all(
    schedules.map(async (s) => {
      const segments = await prisma.scheduleSegment.findMany({
        where: { scheduleId: s.id },
        select: { fromDay: true, toDay: true, kgPerDay: true },
      });
      const holidays: number[] = Array.isArray(s.holidays) ? (s.holidays as number[]) : [];
      let totalKg = 0;
      for (const seg of segments) {
        let days = seg.toDay - seg.fromDay + 1;
        const holidaysInRange = holidays.filter(
          (h) => h >= seg.fromDay && h <= seg.toDay
        ).length;
        days -= holidaysInRange;
        totalKg += Math.max(0, days) * seg.kgPerDay;
      }
      return {
        ...s,
        totalKg,
        totalTons: Math.round(totalKg / 100) / 10,
        segmentCount: s._count.segments,
      };
    })
  );

  return NextResponse.json(result);
}

// POST /api/kdsx/production-schedule
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { factoryId, processId, yearMonth, name = "", note } = body;

  if (!factoryId || !yearMonth) {
    return NextResponse.json(
      { error: "Thiếu factoryId hoặc yearMonth" },
      { status: 400 }
    );
  }

  if (!processId) {
    return NextResponse.json(
      { error: "Thiếu công đoạn (processId)" },
      { status: 400 }
    );
  }

  if (!isValidYearMonth(yearMonth)) {
    return NextResponse.json(
      { error: "yearMonth phải có dạng YYYY-MM" },
      { status: 400 }
    );
  }

  // Kiểm tra trùng (factoryId, yearMonth, name)
  const existing = await prisma.productionSchedule.findUnique({
    where: { factoryId_yearMonth_name: { factoryId, yearMonth, name } },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: `Đã có kế hoạch tên "${name || "(không tên)"}" cho nhà máy này trong tháng ${yearMonth}`,
      },
      { status: 409 }
    );
  }

  // Schedule đầu tiên trong tháng → tự động làm primary
  const existingInMonth = await prisma.productionSchedule.count({
    where: { factoryId, yearMonth },
  });
  const isPrimary = existingInMonth === 0;

  const schedule = await prisma.productionSchedule.create({
    data: { factoryId, processId, yearMonth, name, note: note || null, isPrimary },
    include: {
      factory: { select: { id: true, name: true } },
      process: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(schedule, { status: 201 });
}
