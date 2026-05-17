import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/kdsx/production-schedule/[id]/set-primary
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);

  const schedule = await prisma.productionSchedule.findUnique({
    where: { id },
  });
  if (!schedule) {
    return NextResponse.json(
      { error: "Không tìm thấy kế hoạch" },
      { status: 404 },
    );
  }

  await prisma.$transaction([
    prisma.productionSchedule.updateMany({
      where: {
        factoryId: schedule.factoryId,
        yearMonth: schedule.yearMonth,
        id: { not: id },
      },
      data: { isPrimary: false },
    }),
    prisma.productionSchedule.update({
      where: { id },
      data: { isPrimary: true },
    }),
  ]);

  return NextResponse.json({ success: true });
}
