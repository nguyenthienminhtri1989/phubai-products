import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// ── helper ─────────────────────────────────────────────────────────────────
async function calcEstimatedDoneDate(
  itemId: number,
  factoryId: number,
  remainingQty: number,
): Promise<Date | null> {
  if (remainingQty <= 0) return null;

  const benchmark = await prisma.productivityBenchmark.findFirst({
    where: {
      itemId,
      process: { factoryId },
      version: { isActive: true },
    },
  });
  if (!benchmark) return null;

  const machineCount = await prisma.machine.count({
    where: {
      process: { factoryId },
      currentItemId: itemId,
      isActive: true,
    },
  });
  if (machineCount === 0) return null;

  const dailyOutput = benchmark.stdOutputPerShift * machineCount * 3; // 3 ca/ngày
  if (dailyOutput <= 0) return null;

  const daysNeeded = Math.ceil(remainingQty / dailyOutput);
  const estimated = new Date();
  estimated.setDate(estimated.getDate() + daysNeeded);
  return estimated;
}

// ── GET /api/sales-orders/progress ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const factoryId = searchParams.get("factoryId");
  const statusParam = searchParams.get("status") ?? "ACTIVE,OVERDUE";
  const month = searchParams.get("month"); // YYYY-MM

  if (!factoryId) {
    return NextResponse.json({ error: "factoryId là bắt buộc" }, { status: 400 });
  }

  const statusList = statusParam.split(",").map((s) => s.trim()) as any[];

  let deliveryDateFilter: Record<string, Date> | undefined;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    deliveryDateFilter = {
      gte: new Date(`${y}-${String(m).padStart(2, "0")}-01`),
      lt: new Date(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`),
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

      // Per-item enrichment
      const items = await Promise.all(
        order.items.map(async (item) => {
          const remainingQty = Math.max(0, item.plannedQty - item.allocatedQty);
          const progressPct = Math.min(
            100,
            item.plannedQty > 0 ? (item.allocatedQty / item.plannedQty) * 100 : 0,
          );
          const estimatedDoneDate = await calcEstimatedDoneDate(
            item.itemId,
            Number(factoryId),
            remainingQty,
          );
          return {
            itemId: item.itemId,
            itemName: item.item.name,
            qtyOrdered: item.plannedQty,
            allocatedQty: item.allocatedQty,
            remainingQty,
            progressPct: Math.round(progressPct * 10) / 10,
            estimatedDoneDate: estimatedDoneDate?.toISOString().split("T")[0] ?? null,
          };
        }),
      );

      // Tổng tiến độ HĐ = TB trọng số theo qty
      const totalQty = items.reduce((s, i) => s + i.qtyOrdered, 0);
      const totalAllocated = items.reduce((s, i) => s + i.allocatedQty, 0);
      const overallProgressPct = Math.min(
        100,
        totalQty > 0 ? Math.round((totalAllocated / totalQty) * 1000) / 10 : 0,
      );

      // isAtRisk = có ít nhất 1 item mà estimatedDoneDate > deliveryDate
      // Nếu không có benchmark → không flag risk (không đủ data)
      const isAtRisk = items.some((item) => {
        if (!item.estimatedDoneDate) return false; // không có benchmark → không flag
        return new Date(item.estimatedDoneDate) > deliveryDate;
      });

      return {
        id: order.id,
        contractCode: order.orderNo,
        customerName: order.customer.name,
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
