import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/kdsx/production-schedule/[id]/sync-to-plan
// Đồng bộ sản lượng kế hoạch SX sang MonthlyPlan → PlanLineItem
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const scheduleId = parseInt(idStr);

  const schedule = await prisma.productionSchedule.findUnique({
    where: { id: scheduleId },
    select: {
      id: true,
      factoryId: true,
      yearMonth: true,
      status: true,
      holidays: true,
    },
  });

  if (!schedule) {
    return NextResponse.json({ error: "Không tìm thấy kế hoạch" }, { status: 404 });
  }

  // Chỉ sync khi APPROVED
  if (schedule.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Chỉ được đồng bộ khi kế hoạch đã được phê duyệt (APPROVED)" },
      { status: 403 }
    );
  }

  const holidays: number[] = Array.isArray(schedule.holidays)
    ? (schedule.holidays as number[])
    : [];

  // Tính summary theo itemId
  const segments = await prisma.scheduleSegment.findMany({
    where: { scheduleId },
    select: {
      itemId: true,
      fromDay: true,
      toDay: true,
      kgPerDay: true,
    },
  });

  const itemTotals = new Map<number, number>();
  for (const seg of segments) {
    let days = seg.toDay - seg.fromDay + 1;
    const holidaysInRange = holidays.filter(
      (h) => h >= seg.fromDay && h <= seg.toDay
    ).length;
    days = Math.max(0, days - holidaysInRange);
    const kg = days * seg.kgPerDay;
    itemTotals.set(seg.itemId, (itemTotals.get(seg.itemId) ?? 0) + kg);
  }

  if (itemTotals.size === 0) {
    return NextResponse.json(
      { error: "Kế hoạch chưa có segment nào" },
      { status: 400 }
    );
  }

  // Tìm hoặc tạo MonthlyPlan cho (factoryId, yearMonth)
  let plan = await prisma.monthlyPlan.findUnique({
    where: {
      factoryId_yearMonth: {
        factoryId: schedule.factoryId,
        yearMonth: schedule.yearMonth,
      },
    },
  });

  if (!plan) {
    plan = await prisma.monthlyPlan.create({
      data: {
        factoryId: schedule.factoryId,
        yearMonth: schedule.yearMonth,
        note: `Tạo tự động từ kế hoạch SX #${scheduleId}`,
      },
    });
  }

  const syncedItems: { itemId: number; qty: number; action: string }[] = [];

  // Upsert từng itemId → PlanLineItem
  for (const [itemId, totalKg] of itemTotals.entries()) {
    // Tìm item để lấy thông tin
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) continue;

    // Tìm PlanLineItem hiện có (itemId + planId, không có salesOrderItemId = DP)
    const existingLine = await prisma.planLineItem.findFirst({
      where: {
        planId: plan.id,
        itemId,
        salesOrderItemId: null,
      },
    });

    const roundedQty = Math.round(totalKg);

    if (existingLine) {
      await prisma.planLineItem.update({
        where: { id: existingLine.id },
        data: { qty: roundedQty },
      });
      syncedItems.push({ itemId, qty: roundedQty, action: "UPDATED" });
    } else {
      await prisma.planLineItem.create({
        data: {
          planId: plan.id,
          itemId,
          qty: roundedQty,
          unitPriceUsd: 0, // User cần cập nhật sau
          note: `Auto từ kế hoạch SX #${scheduleId}`,
        },
      });
      syncedItems.push({ itemId, qty: roundedQty, action: "CREATED" });
    }
  }

  return NextResponse.json({
    success: true,
    planId: plan.id,
    syncedItems,
    message: `Đã đồng bộ ${syncedItems.length} mặt hàng vào kế hoạch DT tháng ${schedule.yearMonth}`,
  });
}
