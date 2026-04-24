import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calcEstimatedDoneDate } from "@/lib/estimate-completion";

// GET /api/kdsx/sales-orders/progress
// Params: factoryId (required), status (comma-sep, default "ACTIVE,OVERDUE"), month (YYYY-MM optional)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const factoryId = searchParams.get("factoryId");
  const statusParam = searchParams.get("status") ?? "ACTIVE,OVERDUE";
  const month = searchParams.get("month"); // YYYY-MM

  if (!factoryId) {
    return NextResponse.json(
      { error: "factoryId là bắt buộc" },
      { status: 400 },
    );
  }

  const statusList = statusParam.split(",").map((s) => s.trim()) as any[];

  let deliveryDateFilter: Record<string, Date> | undefined;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    deliveryDateFilter = {
      gte: new Date(`${y}-${String(m).padStart(2, "0")}-01`),
      lt:
        m === 12
          ? new Date(`${y + 1}-01-01`)
          : new Date(`${y}-${String(m + 1).padStart(2, "0")}-01`),
    };
  }

  const orders = await prisma.salesOrder.findMany({
    where: {
      factoryId: Number(factoryId),
      status: { in: statusList },
      ...(deliveryDateFilter ? { deliveryDate: deliveryDateFilter } : {}),
    },
    include: {
      customer: { select: { id: true, name: true } },
      items: {
        include: { item: { select: { id: true, name: true, code: true } } },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { deliveryDate: "asc" },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await Promise.all(
    orders.map(async (order) => {
      const deliveryDate = new Date(order.deliveryDate);
      deliveryDate.setHours(0, 0, 0, 0);
      const daysUntilDeadline = Math.ceil(
        (deliveryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      const items = await Promise.all(
        order.items.map(async (item) => {
          const totalDelivered = (item.deliveredQty ?? 0) + item.allocatedQty;
          const remainingQty = Math.max(0, item.plannedQty - totalDelivered);
          const progressPct = Math.min(
            100,
            item.plannedQty > 0
              ? Math.round((totalDelivered / item.plannedQty) * 1000) / 10
              : 0,
          );
          const estimatedDoneDate = await calcEstimatedDoneDate(
            item.itemId,
            Number(factoryId),
            remainingQty,
          );
          return {
            itemId: item.itemId,
            itemName: item.item.name,
            itemCode: item.item.code,
            plannedQty: item.plannedQty,
            allocatedQty: totalDelivered,
            remainingQty,
            progressPct,
            estimatedDoneDate:
              estimatedDoneDate?.toISOString().split("T")[0] ?? null,
          };
        }),
      );

      const totalQty = items.reduce((s, i) => s + i.plannedQty, 0);
      const totalAllocated = items.reduce((s, i) => s + i.allocatedQty, 0);
      const overallProgressPct = Math.min(
        100,
        totalQty > 0 ? Math.round((totalAllocated / totalQty) * 1000) / 10 : 0,
      );

      // isAtRisk = có item nào estimatedDoneDate > deliveryDate (chỉ flag nếu có benchmark)
      const isAtRisk = items.some((item) => {
        if (!item.estimatedDoneDate) return false;
        return new Date(item.estimatedDoneDate) > deliveryDate;
      });

      return {
        id: order.id,
        orderNo: order.orderNo,
        customerName: order.customer?.name ?? null,
        deliveryDate: order.deliveryDate.toISOString().split("T")[0],
        status: order.status,
        daysUntilDeadline,
        overallProgressPct,
        isAtRisk,
        items,
      };
    }),
  );

  return NextResponse.json(result);
}
