import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAllocationFromProduction } from "@/lib/allocation-engine-v2";
import {
  getMonthlyItemTotals,
  ItemTotalMode,
} from "@/lib/kdsx/monthly-item-totals";

// GET /api/kdsx/monthly-quotas?factoryId=3&processId=5&yearMonth=2026-05&mode=ACTUAL_PROJECTED
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const factoryId = parseInt(sp.get("factoryId") ?? "0");
  const processId = parseInt(sp.get("processId") ?? "0");
  const yearMonth = sp.get("yearMonth") ?? "";
  const mode = (sp.get("mode") ?? "ACTUAL") as ItemTotalMode;

  if (!factoryId || !processId || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { error: "factoryId, processId và yearMonth là bắt buộc" },
      { status: 400 },
    );
  }
  if (!["ACTUAL", "ACTUAL_PROJECTED"].includes(mode)) {
    return NextResponse.json(
      { error: "mode phải là ACTUAL hoặc ACTUAL_PROJECTED" },
      { status: 400 },
    );
  }

  try {
    const firstDayOfMonth = new Date(`${yearMonth}-01T00:00:00.000Z`);

    // 1. Tổng SL theo item từ nguồn sự thật duy nhất
    const itemTotals = await getMonthlyItemTotals(
      factoryId,
      processId,
      yearMonth,
      mode,
    );
    const productionByItemId = new Map(
      itemTotals.map((t) => [t.itemId, t.totalKg]),
    );

    // 2. Allocation per contract để lấy producedThisMonth
    const allocationByContractId = new Map<number, number>();
    try {
      const engineMode =
        mode === "ACTUAL_PROJECTED" ? "PROJECTION" : "REAL";
      const allocResult = await runAllocationFromProduction(
        factoryId,
        yearMonth,
        engineMode,
        processId,
      );
      for (const line of allocResult.allocations) {
        if (line.orderItemId) {
          allocationByContractId.set(
            line.orderItemId,
            (allocationByContractId.get(line.orderItemId) ?? 0) +
              line.allocatedQty,
          );
        }
      }
    } catch {
      // No production data yet — OK
    }

    // 3. Tất cả SalesOrderItem active của factory, quota scoped theo processId
    const orderItems = await prisma.salesOrderItem.findMany({
      where: {
        order: {
          factoryId,
          status: "ACTIVE",
          isActive: true,
        },
        OR: [
          { deferToMonth: null },
          { deferToMonth: { lte: yearMonth } },
        ],
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
        quotas: {
          where: { yearMonth, factoryId, processId },
        },
      },
    });

    // 4. Tính cumProducedPrevMonths và remainingTotal
    const contracts = await Promise.all(
      orderItems.map(async (oi) => {
        const prevAllocated = await prisma.orderAllocation.aggregate({
          where: {
            salesOrderItemId: oi.id,
            productionDate: { lt: firstDayOfMonth },
          },
          _sum: { allocatedQty: true },
        });
        const cumProducedPrevMonths =
          prevAllocated._sum?.allocatedQty ?? 0;
        const remainingTotal = Math.max(
          0,
          oi.plannedQty - oi.deliveredQty - cumProducedPrevMonths,
        );
        const quota = oi.quotas[0] ?? null;
        return {
          salesOrderItemId: oi.id,
          itemId: oi.item.id,
          itemName: oi.item.name,
          orderId: oi.order.id,
          orderNo: oi.order.orderNo,
          customerName: oi.order.customer?.name ?? null,
          plannedQty: oi.plannedQty,
          deliveredQty: oi.deliveredQty,
          note: oi.note,
          cumProducedPrevMonths,
          remainingTotal,
          producedThisMonth: allocationByContractId.get(oi.id) ?? 0,
          quota: quota
            ? {
                id: quota.id,
                quotaQty: quota.quotaQty,
                isRemainder: quota.isRemainder,
                sortOrder: quota.sortOrder,
              }
            : null,
        };
      }),
    );

    // 5. Group by item
    const groupMap = new Map<
      number,
      {
        itemId: number;
        itemName: string;
        contracts: (typeof contracts)[0][];
      }
    >();
    for (const c of contracts) {
      if (!groupMap.has(c.itemId)) {
        groupMap.set(c.itemId, {
          itemId: c.itemId,
          itemName: c.itemName,
          contracts: [],
        });
      }
      groupMap.get(c.itemId)!.contracts.push(c);
    }

    const groups = [...groupMap.values()].map((g) => ({
      itemId: g.itemId,
      itemName: g.itemName,
      totalProductionKg: productionByItemId.get(g.itemId) ?? 0,
      contracts: g.contracts,
    }));

    return NextResponse.json({ factoryId, processId, yearMonth, mode, groups });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/kdsx/monthly-quotas — same logic as /api/v2/monthly-quotas POST
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { factoryId, processId, yearMonth, quotas } = body as {
      factoryId: number;
      processId: number;
      yearMonth: string;
      quotas: Array<{
        salesOrderItemId: number;
        quotaQty: number | null;
        isRemainder: boolean;
        sortOrder?: number;
      }>;
    };

    if (!factoryId || !processId || !yearMonth || !Array.isArray(quotas)) {
      return NextResponse.json(
        { error: "factoryId, processId, yearMonth và quotas là bắt buộc" },
        { status: 400 },
      );
    }
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json(
        { error: "yearMonth phải có định dạng YYYY-MM" },
        { status: 400 },
      );
    }

    for (const q of quotas) {
      if (q.isRemainder && q.quotaQty !== null && q.quotaQty !== undefined) {
        return NextResponse.json(
          {
            error: `salesOrderItemId ${q.salesOrderItemId}: isRemainder=true thì quotaQty phải là null`,
          },
          { status: 400 },
        );
      }
      if (!q.isRemainder && (q.quotaQty === null || q.quotaQty === undefined)) {
        return NextResponse.json(
          {
            error: `salesOrderItemId ${q.salesOrderItemId}: isRemainder=false thì quotaQty phải có giá trị`,
          },
          { status: 400 },
        );
      }
      if (!q.isRemainder && q.quotaQty !== null && q.quotaQty! < 0) {
        return NextResponse.json(
          {
            error: `salesOrderItemId ${q.salesOrderItemId}: quotaQty không được âm`,
          },
          { status: 400 },
        );
      }
    }

    // Validate max 1 REMAINDER per item+yearMonth
    const orderItemIds = quotas.map((q) => q.salesOrderItemId);
    const orderItems = await prisma.salesOrderItem.findMany({
      where: { id: { in: orderItemIds } },
      select: { id: true, itemId: true },
    });

    if (orderItems.length !== orderItemIds.length) {
      const foundIds = new Set(orderItems.map((o) => o.id));
      const missing = orderItemIds.filter((id) => !foundIds.has(id));
      return NextResponse.json(
        { error: `salesOrderItemId không tồn tại: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const itemIdMap = new Map(orderItems.map((o) => [o.id, o.itemId]));
    const remainderByItem = new Map<number, number>();
    for (const q of quotas) {
      if (q.isRemainder) {
        const iId = itemIdMap.get(q.salesOrderItemId)!;
        remainderByItem.set(iId, (remainderByItem.get(iId) ?? 0) + 1);
        if ((remainderByItem.get(iId) ?? 0) > 1) {
          return NextResponse.json(
            {
              error: `itemId ${iId}: không được có quá 1 dòng REMAINDER trong cùng tháng`,
            },
            { status: 400 },
          );
        }
      }
    }

    const results = await Promise.all(
      quotas.map((q) =>
        prisma.monthlyQuota.upsert({
          where: {
            salesOrderItemId_factoryId_processId_yearMonth: {
              salesOrderItemId: q.salesOrderItemId,
              factoryId,
              processId,
              yearMonth,
            },
          },
          update: {
            quotaQty: q.quotaQty ?? null,
            isRemainder: q.isRemainder,
            sortOrder: q.sortOrder ?? 0,
          },
          create: {
            salesOrderItemId: q.salesOrderItemId,
            factoryId,
            processId,
            yearMonth,
            quotaQty: q.quotaQty ?? null,
            isRemainder: q.isRemainder,
            sortOrder: q.sortOrder ?? 0,
          },
        }),
      ),
    );

    return NextResponse.json({ saved: results.length, yearMonth });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
