import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Helper: số ngày trong tháng
function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// Helper: kiểm tra overlap segment cùng máy
async function checkOverlap(
  scheduleId: number,
  machineId: number,
  fromDay: number,
  toDay: number,
  excludeSegmentId?: number
): Promise<boolean> {
  const conflicts = await prisma.scheduleSegment.findMany({
    where: {
      scheduleId,
      machineId,
      id: excludeSegmentId ? { not: excludeSegmentId } : undefined,
      OR: [
        { AND: [{ fromDay: { lte: fromDay } }, { toDay: { gte: fromDay } }] },
        { AND: [{ fromDay: { lte: toDay } }, { toDay: { gte: toDay } }] },
        { AND: [{ fromDay: { gte: fromDay } }, { toDay: { lte: toDay } }] },
      ],
    },
  });
  return conflicts.length > 0;
}

// Auto-fill kg/ngày từ EMPIRICAL benchmark
async function autoFillKgPerDay(
  machineId: number,
  itemId: number,
  yearMonth: string,
  factoryId: number
): Promise<{ kgPerDay: number; benchmarkId: number } | null> {
  const machine = await prisma.machine.findUnique({
    where: { id: machineId },
    select: { processId: true, model: true },
  });
  if (!machine?.model) return null;

  const planDate = new Date(yearMonth + "-01");

  const version = await prisma.benchmarkVersion.findFirst({
    where: {
      factoryId,
      effectiveFrom: { lte: planDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: planDate } }],
      isActive: true,
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!version) return null;

  const benchmark = await prisma.productivityBenchmark.findFirst({
    where: {
      versionId: version.id,
      itemId,
      processId: machine.processId,
      machineModel: machine.model,
      benchmarkType: "EMPIRICAL",
    },
  });

  if (!benchmark || benchmark.empiricalOutputPerDay == null) return null;

  return {
    kgPerDay: benchmark.empiricalOutputPerDay,
    benchmarkId: benchmark.id,
  };
}

// POST /api/kdsx/production-schedule/[id]/segments
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const scheduleId = parseInt(idStr);
  const body = await req.json();
  const { machineId, itemId, fromDay, toDay, kgPerDay, autoFill = true, note } = body;

  // Lấy thông tin schedule
  const schedule = await prisma.productionSchedule.findUnique({
    where: { id: scheduleId },
  });
  if (!schedule) {
    return NextResponse.json({ error: "Không tìm thấy kế hoạch" }, { status: 404 });
  }

  // Validate ngày
  const maxDay = daysInMonth(schedule.yearMonth);
  if (!fromDay || !toDay || fromDay < 1 || toDay > maxDay || fromDay > toDay) {
    return NextResponse.json(
      { error: `Ngày không hợp lệ (1 đến ${maxDay}, fromDay <= toDay)` },
      { status: 400 }
    );
  }

  // Kiểm tra overlap
  const hasOverlap = await checkOverlap(scheduleId, machineId, fromDay, toDay);
  if (hasOverlap) {
    return NextResponse.json(
      { error: "Máy này đã có kế hoạch trong khoảng ngày đã chọn" },
      { status: 409 }
    );
  }

  // Auto-fill kg/ngày
  let finalKgPerDay: number = kgPerDay;
  let benchmarkId: number | null = null;
  let isManualKg = false;

  if (autoFill && !kgPerDay) {
    const filled = await autoFillKgPerDay(machineId, itemId, schedule.yearMonth, schedule.factoryId);
    if (!filled) {
      return NextResponse.json(
        {
          error:
            "Chưa có định mức EMPIRICAL cho máy + mặt hàng này. Vui lòng nhập kg/ngày thủ công hoặc cấu hình định mức thực nghiệm trước.",
          code: "NO_BENCHMARK",
        },
        { status: 400 }
      );
    }
    finalKgPerDay = filled.kgPerDay;
    benchmarkId = filled.benchmarkId;
  } else {
    if (!kgPerDay || kgPerDay <= 0) {
      return NextResponse.json(
        { error: "kgPerDay phải > 0" },
        { status: 400 }
      );
    }
    isManualKg = true;
  }

  const segment = await prisma.scheduleSegment.create({
    data: {
      scheduleId,
      machineId,
      itemId,
      fromDay,
      toDay,
      kgPerDay: finalKgPerDay,
      benchmarkId,
      isManualKg,
      note: note || null,
    },
    include: {
      machine: { select: { id: true, name: true, model: true } },
      item: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(segment, { status: 201 });
}
