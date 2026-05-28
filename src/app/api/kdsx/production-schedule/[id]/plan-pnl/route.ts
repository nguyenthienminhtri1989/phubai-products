import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAllocationFromProduction } from "@/lib/allocation-engine-v2";
import { calculateRevenuePnL } from "@/lib/kdsx/calculator-v2";

// GET /api/kdsx/production-schedule/[id]/plan-pnl
// Tính DT-LN kế hoạch: dùng SL từ ScheduleSegment (PLAN mode) + phân bổ waterfall → P&L
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const scheduleId = parseInt(idStr);

  const schedule = await prisma.productionSchedule.findUnique({
    where: { id: scheduleId },
    select: { id: true, factoryId: true, processId: true, yearMonth: true },
  });

  if (!schedule) {
    return NextResponse.json(
      { error: "Không tìm thấy lịch sản xuất" },
      { status: 404 },
    );
  }

  if (!schedule.processId) {
    return NextResponse.json(
      {
        error:
          "Lịch sản xuất chưa liên kết công đoạn (processId). Cần cập nhật trước khi tính DT-LN kế hoạch.",
      },
      { status: 400 },
    );
  }

  try {
    const allocation = await runAllocationFromProduction(
      schedule.factoryId,
      schedule.yearMonth,
      "PLAN",
      schedule.processId,
    );

    const pnl = await calculateRevenuePnL(
      allocation,
      schedule.factoryId,
      schedule.yearMonth,
      "PROJECTION",
    );

    return NextResponse.json(pnl);
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
