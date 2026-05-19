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
    const [year, month] = yearMonth.split("-").map(Number);
    const firstDayOfMonth = new Date(year, month - 1, 1);

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

      let status: "ACTIVE" | "COMPLETED" | "DEFERRED";
      if (soi.deferToMonth && soi.deferToMonth > yearMonth) {
        status = "DEFERRED";
      } else if (remainingQty <= 0) {
        status = "COMPLETED";
      } else {
        status = "ACTIVE";
      }

      const deadline = soi.deliveryDate ?? soi.order.deliveryDate;

      return {
        salesOrderItemId: soi.id,
        orderId: soi.order.id,
        orderNo: soi.order.orderNo,
        customerName: soi.order.customer?.name ?? null,
        itemId: soi.item.id,
        itemName: soi.item.name,
        totalQty: soi.plannedQty,
        deliveredQty: soi.deliveredQty,
        allocatedThisMonth,
        allocatedPreviousMonths,
        remainingQty,
        progressPct: Math.round(progressPct * 10) / 10,
        unitPriceUsd: soi.unitPrice,
        revenueVnd: allocatedThisMonth * soi.unitPrice, // DT tháng này (VNĐ tính khi có tỷ giá)
        deadline: deadline?.toISOString().split("T")[0] ?? null,
        priorityOverride: soi.priorityOverride,
        deferToMonth: soi.deferToMonth,
        status,
      };
    });

    // Sort: ACTIVE trước, COMPLETED sau, DEFERRED cuối; trong mỗi nhóm sort theo deadline
    contracts.sort((a, b) => {
      const statusOrder = { ACTIVE: 0, COMPLETED: 1, DEFERRED: 2 };
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
