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
      process: { select: { id: true, name: true } },
    },
  });

  if (!schedule) {
    return NextResponse.json(
      { error: "Không tìm thấy kế hoạch" },
      { status: 404 },
    );
  }

  return NextResponse.json(schedule);
}

// PUT /api/kdsx/production-schedule/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);
  const body = await req.json();
  const { note, holidays, itemColors, name, isPrimary, processId } = body;

  const existing = await prisma.productionSchedule.findUnique({
    where: { id },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Không tìm thấy kế hoạch" },
      { status: 404 },
    );
  }

  // Nếu set isPrimary = true → bỏ primary của các schedule khác cùng nhà máy cùng tháng
  if (isPrimary === true) {
    await prisma.productionSchedule.updateMany({
      where: {
        factoryId: existing.factoryId,
        yearMonth: existing.yearMonth,
        id: { not: id },
      },
      data: { isPrimary: false },
    });
  }

  const updated = await prisma.productionSchedule.update({
    where: { id },
    data: {
      ...(note !== undefined && { note }),
      ...(holidays !== undefined && { holidays }),
      ...(itemColors !== undefined && { itemColors }),
      ...(name !== undefined && { name }),
      ...(isPrimary !== undefined && { isPrimary }),
      ...(processId !== undefined && { processId }),
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
