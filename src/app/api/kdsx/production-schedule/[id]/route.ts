import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/kdsx/production-schedule/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);

  const schedule = await prisma.productionSchedule.findUnique({
    where: { id },
    include: {
      segments: {
        include: {
          machine: {
            select: { id: true, name: true, model: true, processId: true },
          },
          item: { select: { id: true, name: true } },
        },
        orderBy: [{ machineId: "asc" }, { fromDay: "asc" }],
      },
      factory: { select: { id: true, name: true } },
    },
  });

  if (!schedule) {
    return NextResponse.json(
      { error: "Không tìm thấy kế hoạch" },
      { status: 404 },
    );
  }

  // Gắn thêm empiricalOutputPerDay từ ProductivityBenchmark vào từng segment
  // (benchmarkId là FK số thuần, không có relation Prisma)
  const benchmarkIds = Array.from(
    new Set(
      schedule.segments
        .map((s) => s.benchmarkId)
        .filter((id): id is number => id !== null),
    ),
  );
  const benchmarkMap = new Map<number, number | null>();
  if (benchmarkIds.length > 0) {
    const benchmarks = await prisma.productivityBenchmark.findMany({
      where: { id: { in: benchmarkIds } },
      select: { id: true, empiricalOutputPerDay: true },
    });
    benchmarks.forEach((b) => benchmarkMap.set(b.id, b.empiricalOutputPerDay));
  }

  const segmentsWithBenchmark = schedule.segments.map((s) => ({
    ...s,
    benchmark:
      s.benchmarkId !== null
        ? { empiricalOutputPerDay: benchmarkMap.get(s.benchmarkId) ?? null }
        : null,
  }));

  return NextResponse.json({ ...schedule, segments: segmentsWithBenchmark });
}

// PUT /api/kdsx/production-schedule/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);
  const body = await req.json();
  const { note, holidays, itemColors } = body;

  const existing = await prisma.productionSchedule.findUnique({
    where: { id },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Không tìm thấy kế hoạch" },
      { status: 404 },
    );
  }

  const updated = await prisma.productionSchedule.update({
    where: { id },
    data: {
      ...(note !== undefined && { note }),
      ...(holidays !== undefined && { holidays }),
      ...(itemColors !== undefined && { itemColors }),
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/kdsx/production-schedule/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);

  const existing = await prisma.productionSchedule.findUnique({
    where: { id },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Không tìm thấy kế hoạch" },
      { status: 404 },
    );
  }

  await prisma.productionSchedule.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
