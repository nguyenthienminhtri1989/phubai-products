import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAllocationFromProduction } from "@/lib/allocation-engine-v2";

export async function GET(req: NextRequest) {
  const factoryId = Number(req.nextUrl.searchParams.get("factoryId"));
  const yearMonth = req.nextUrl.searchParams.get("yearMonth") ?? "";

  if (!factoryId || !yearMonth) {
    return NextResponse.json(
      { error: "factoryId và yearMonth là bắt buộc" },
      { status: 400 }
    );
  }

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { error: "yearMonth phải có định dạng YYYY-MM" },
      { status: 400 }
    );
  }

  try {
    const firstDayOfMonth = new Date(`${yearMonth}-01T00:00:00.000Z`);

    // Lấy allocation kết quả tháng này
    const allocation = await runAllocationFromProduction(
      factoryId,
      yearMonth,
      "REAL"
    );

    // Group allocation by orderItemId
    const allocMap = new Map<number, number>();
    for (const line of allocation.allocations) {
      if (line.orderItemId == null) continue;
      allocMap.set(
        line.orderItemId,
        (allocMap.get(line.orderItemId) ?? 0) + line.allocatedQty
      );
    }

    // Lấy tất cả HĐ active của factory này
    const salesOrderItems = await prisma.salesOrderItem.findMany({
      where: {
        order: {
          factoryId,
          status: "ACTIVE",
          isActive: true,
        },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            deliveryDate: true,
            signedDate: true,
            customer: { select: { name: true } },
          },
        },
        item: { select: { id: true, name: true } },
        quotas: { where: { yearMonth } },
      },
    });

    // Tính allocation các tháng trước (từ OrderAllocation)
    const prevAllocMap = new Map<number, number>();
    const prevAllocs = await prisma.orderAllocation.groupBy({
      by: ["salesOrderItemId"],
      where: {
        salesOrderItemId: {
          in: salesOrderItems.map((s) => s.id),
        },
        productionDate: { lt: firstDayOfMonth },
      },
      _sum: { allocatedQty: true },
    });
    for (const pa of prevAllocs) {
      prevAllocMap.set(
        pa.salesOrderItemId,
        pa._sum?.allocatedQty ?? 0
      );
    }

    const contracts = salesOrderItems.map((soi) => {
      const allocatedThisMonth = allocMap.get(soi.id) ?? 0;
      const allocatedPreviousMonths = prevAllocMap.get(soi.id) ?? 0;
      const totalAllocated =
        soi.deliveredQty + allocatedPreviousMonths + allocatedThisMonth;
      const remainingQty = Math.max(0, soi.plannedQty - totalAllocated);
      const progressPct =
        soi.plannedQty > 0
          ? Math.min(100, (totalAllocated / soi.plannedQty) * 100)
          : 0;

      let status: "ACTIVE" | "NEAR_COMPLETE" | "COMPLETED" | "DEFERRED";
      if (soi.deferToMonth && soi.deferToMonth > yearMonth) {
        status = "DEFERRED";
      } else if (remainingQty <= 0) {
        status = "COMPLETED";
      } else if (progressPct >= 80) {
        status = "NEAR_COMPLETE";
      } else {
        status = "ACTIVE";
      }

      // completedThisMonth: đạt 100% trong tháng này (tháng trước chưa đạt)
      const progressBeforeThisMonth =
        soi.plannedQty > 0
          ? Math.min(100, ((soi.deliveredQty + allocatedPreviousMonths) / soi.plannedQty) * 100)
          : 0;
      const completedThisMonth = progressBeforeThisMonth < 100 && progressPct >= 100;

      const deadline = soi.deliveryDate ?? soi.order.deliveryDate;

      const quota = soi.quotas[0] ?? null;

      return {
        salesOrderItemId: soi.id,
        orderId: soi.order.id,
        orderNo: soi.order.orderNo,
        customerName: soi.order.customer?.name ?? null,
        itemId: soi.item.id,
        itemName: soi.item.name,
        note: soi.note ?? null,
        totalQty: soi.plannedQty,
        deliveredQty: soi.deliveredQty,
        allocatedThisMonth,
        allocatedPreviousMonths,
        remainingQty,
        progressPct: Math.round(progressPct * 10) / 10,
        unitPriceUsd: soi.unitPrice,
        revenueVnd: allocatedThisMonth * soi.unitPrice,
        deadline: deadline?.toISOString().split("T")[0] ?? null,
        priorityOverride: soi.priorityOverride,
        deferToMonth: soi.deferToMonth,
        quotaThisMonth: quota?.quotaQty ?? null,
        isRemainder: quota?.isRemainder ?? false,
        status,
        completedThisMonth,
      };
    });

    // Sort: ACTIVE/NEAR_COMPLETE trước, COMPLETED sau, DEFERRED cuối; trong mỗi nhóm sort theo deadline
    contracts.sort((a, b) => {
      const statusOrder = { ACTIVE: 0, NEAR_COMPLETE: 1, COMPLETED: 2, DEFERRED: 3 };
      const sDiff = statusOrder[a.status] - statusOrder[b.status];
      if (sDiff !== 0) return sDiff;
      if (a.deadline && b.deadline) {
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return 0;
    });

    return NextResponse.json({ contracts });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
