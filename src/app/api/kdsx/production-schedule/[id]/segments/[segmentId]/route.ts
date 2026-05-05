import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

async function checkOverlap(
  scheduleId: number,
  machineId: number,
  itemId: number,
  fromDay: number,
  toDay: number,
  excludeSegmentId?: number
): Promise<boolean> {
  const conflicts = await prisma.scheduleSegment.findMany({
    where: {
      scheduleId,
      machineId,
      itemId, // Chỉ chặn khi cùng máy + cùng mặt hàng
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

  return { kgPerDay: benchmark.empiricalOutputPerDay, benchmarkId: benchmark.id };
}

// PUT /api/kdsx/production-schedule/[id]/segments/[segmentId]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  const { id: idStr, segmentId: segmentIdStr } = await params;
  const scheduleId = parseInt(idStr);
  const segmentId = parseInt(segmentIdStr);
  const body = await req.json();

  const segment = await prisma.scheduleSegment.findUnique({
    where: { id: segmentId },
    include: { schedule: true },
  });

  if (!segment || segment.scheduleId !== scheduleId) {
    return NextResponse.json({ error: "Không tìm thấy segment" }, { status: 404 });
  }

  const { itemId, fromDay, toDay, kgPerDay, note } = body;
  const finalItemId = itemId ?? segment.itemId;
  const finalFromDay = fromDay ?? segment.fromDay;
  const finalToDay = toDay ?? segment.toDay;

  const maxDay = daysInMonth(segment.schedule.yearMonth);
  if (finalFromDay < 1 || finalToDay > maxDay || finalFromDay > finalToDay) {
    return NextResponse.json(
      { error: `Ngày không hợp lệ (1 đến ${maxDay})` },
      { status: 400 }
    );
  }

  // Kiểm tra overlap (exclude chính nó, chỉ chặn cùng máy + cùng mặt hàng trùng ngày)
  const hasOverlap = await checkOverlap(
    scheduleId,
    segment.machineId,
    finalItemId,
    finalFromDay,
    finalToDay,
    segmentId
  );
  if (hasOverlap) {
    return NextResponse.json(
      { error: "Máy này đã có kế hoạch cho mặt hàng này trong khoảng ngày đã chọn" },
      { status: 409 }
    );
  }

  let finalKgPerDay = kgPerDay ?? segment.kgPerDay;
  let benchmarkId = segment.benchmarkId;
  let isManualKg = segment.isManualKg;

  // Nếu đổi item và không truyền kgPerDay → auto-fill lại
  if (itemId && itemId !== segment.itemId && !kgPerDay) {
    const filled = await autoFillKgPerDay(
      segment.machineId,
      finalItemId,
      segment.schedule.yearMonth,
      segment.schedule.factoryId
    );
    if (filled) {
      finalKgPerDay = filled.kgPerDay;
      benchmarkId = filled.benchmarkId;
      isManualKg = false;
    }
  } else if (kgPerDay) {
    isManualKg = true;
    benchmarkId = null;
  }

  if (finalKgPerDay <= 0) {
    return NextResponse.json({ error: "kgPerDay phải > 0" }, { status: 400 });
  }

  const updated = await prisma.scheduleSegment.update({
    where: { id: segmentId },
    data: {
      itemId: finalItemId,
      fromDay: finalFromDay,
      toDay: finalToDay,
      kgPerDay: finalKgPerDay,
      benchmarkId,
      isManualKg,
      ...(note !== undefined && { note }),
    },
    include: {
      machine: { select: { id: true, name: true, model: true } },
      item: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/kdsx/production-schedule/[id]/segments/[segmentId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> }
) {
  const { id: idStr, segmentId: segmentIdStr } = await params;
  const scheduleId = parseInt(idStr);
  const segmentId = parseInt(segmentIdStr);

  const segment = await prisma.scheduleSegment.findUnique({
    where: { id: segmentId },
    include: { schedule: true },
  });

  if (!segment || segment.scheduleId !== scheduleId) {
    return NextResponse.json({ error: "Không tìm thấy segment" }, { status: 404 });
  }

  await prisma.scheduleSegment.delete({ where: { id: segmentId } });
  return NextResponse.json({ success: true });
}
