import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAllocationFromProduction } from "@/lib/allocation-engine-v2";

// ===== GET =====
// GET /api/v2/monthly-quotas?factoryId=1&yearMonth=2026-05&itemId=3
// Lấy danh sách quota cho factory+tháng, optional filter theo itemId
export async function GET(req: NextRequest) {
  const factoryId = Number(req.nextUrl.searchParams.get("factoryId"));
  const yearMonth = req.nextUrl.searchParams.get("yearMonth") ?? "";
  const itemIdParam = req.nextUrl.searchParams.get("itemId");
  const itemId = itemIdParam ? Number(itemIdParam) : undefined;

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

    // Lấy tất cả SalesOrderItem active của factory, kèm quota tháng này
    const orderItems = await prisma.salesOrderItem.findMany({
      where: {
        ...(itemId ? { itemId } : {}),
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
          where: { yearMonth },
        },
      },
    });

    // Chạy allocation engine để lấy producedThisMonth per contract
    let allocationByContractId = new Map<number, number>();
    try {
      const allocResult = await runAllocationFromProduction(factoryId, yearMonth, "REAL");
      for (const line of allocResult.allocations) {
        if (line.orderItemId) {
          allocationByContractId.set(
            line.orderItemId,
            (allocationByContractId.get(line.orderItemId) ?? 0) + line.allocatedQty
          );
        }
      }
    } catch {
      // fallback: không có production data
    }

    // Tính cumProducedPrevMonths từ OrderAllocation các tháng trước
    const quotas = await Promise.all(
      orderItems.map(async (oi) => {
        const prevAllocated = await prisma.orderAllocation.aggregate({
          where: {
            salesOrderItemId: oi.id,
            productionDate: { lt: firstDayOfMonth },
          },
          _sum: { allocatedQty: true },
        });
        const cumProducedPrevMonths = prevAllocated._sum?.allocatedQty ?? 0;
        const remainingTotal =
          oi.plannedQty - oi.deliveredQty - cumProducedPrevMonths;

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
          remainingTotal: Math.max(0, remainingTotal),
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
      })
    );

    // Nhóm theo itemId để tính itemSummary
    const itemGroups = new Map<
      number,
      { itemName: string; items: typeof quotas }
    >();
    for (const q of quotas) {
      if (!itemGroups.has(q.itemId)) {
        itemGroups.set(q.itemId, { itemName: q.itemName, items: [] });
      }
      itemGroups.get(q.itemId)!.items.push(q);
    }

    const itemSummaries = Array.from(itemGroups.entries()).map(
      ([iId, group]) => {
        const totalFixedQuota = group.items
          .filter((i) => i.quota && !i.quota.isRemainder)
          .reduce((sum, i) => sum + (i.quota?.quotaQty ?? 0), 0);
        const hasRemainder = group.items.some(
          (i) => i.quota?.isRemainder === true
        );
        return {
          itemId: iId,
          itemName: group.itemName,
          totalFixedQuota,
          hasRemainder,
          contractCount: group.items.length,
        };
      }
    );

    return NextResponse.json({
      factoryId,
      yearMonth,
      quotas,
      itemSummaries,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ===== POST =====
// POST /api/v2/monthly-quotas
// Upsert quota cho 1 tháng
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { yearMonth, quotas } = body as {
      yearMonth: string;
      quotas: Array<{
        salesOrderItemId: number;
        quotaQty: number | null;
        isRemainder: boolean;
        sortOrder?: number;
      }>;
    };

    if (!yearMonth || !Array.isArray(quotas)) {
      return NextResponse.json(
        { error: "yearMonth và quotas là bắt buộc" },
        { status: 400 }
      );
    }
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json(
        { error: "yearMonth phải có định dạng YYYY-MM" },
        { status: 400 }
      );
    }

    // Validation: isRemainder=true thì quotaQty phải null
    for (const q of quotas) {
      if (q.isRemainder && q.quotaQty !== null && q.quotaQty !== undefined) {
        return NextResponse.json(
          {
            error: `salesOrderItemId ${q.salesOrderItemId}: isRemainder=true thì quotaQty phải là null`,
          },
          { status: 400 }
        );
      }
      if (!q.isRemainder && (q.quotaQty === null || q.quotaQty === undefined)) {
        return NextResponse.json(
          {
            error: `salesOrderItemId ${q.salesOrderItemId}: isRemainder=false thì quotaQty phải có giá trị`,
          },
          { status: 400 }
        );
      }
      if (!q.isRemainder && q.quotaQty !== null && q.quotaQty! < 0) {
        return NextResponse.json(
          {
            error: `salesOrderItemId ${q.salesOrderItemId}: quotaQty không được âm`,
          },
          { status: 400 }
        );
      }
    }

    // Validation: tối đa 1 REMAINDER per item+yearMonth
    // Lấy itemId của từng salesOrderItemId để nhóm
    const orderItemIds = quotas.map((q) => q.salesOrderItemId);
    const orderItems = await prisma.salesOrderItem.findMany({
      where: { id: { in: orderItemIds } },
      select: { id: true, itemId: true, orderId: true },
    });

    if (orderItems.length !== orderItemIds.length) {
      const foundIds = new Set(orderItems.map((o) => o.id));
      const missing = orderItemIds.filter((id) => !foundIds.has(id));
      return NextResponse.json(
        { error: `salesOrderItemId không tồn tại: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const itemIdMap = new Map(orderItems.map((o) => [o.id, o.itemId]));
    // Nhóm quota theo itemId, check max 1 REMAINDER
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
            { status: 400 }
          );
        }
      }
    }

    // Upsert từng quota
    const results = await Promise.all(
      quotas.map((q) =>
        prisma.monthlyQuota.upsert({
          where: {
            salesOrderItemId_yearMonth: {
              salesOrderItemId: q.salesOrderItemId,
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
            yearMonth,
            quotaQty: q.quotaQty ?? null,
            isRemainder: q.isRemainder,
            sortOrder: q.sortOrder ?? 0,
          },
        })
      )
    );

    return NextResponse.json({
      saved: results.length,
      yearMonth,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
