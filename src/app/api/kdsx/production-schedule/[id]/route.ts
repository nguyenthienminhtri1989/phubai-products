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
  const { note, holidays, status, itemColors } = body;

  const existing = await prisma.productionSchedule.findUnique({
    where: { id },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Không tìm thấy kế hoạch" },
      { status: 404 },
    );
  }

  // Guard: APPROVED schedule không cho sửa trực tiếp
  if (existing.status === "APPROVED" && !status && !itemColors) {
    return NextResponse.json(
      { error: "Kế hoạch đã phê duyệt. Phải unapprove trước khi sửa." },
      { status: 403 },
    );
  }

  const updated = await prisma.productionSchedule.update({
    where: { id },
    data: {
      ...(note !== undefined && { note }),
      ...(holidays !== undefined && { holidays }),
      ...(status !== undefined && { status }),
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

  if (existing.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Chỉ được xóa kế hoạch ở trạng thái DRAFT" },
      { status: 403 },
    );
  }

  await prisma.productionSchedule.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
