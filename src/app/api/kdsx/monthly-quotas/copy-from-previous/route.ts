import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/kdsx/monthly-quotas/copy-from-previous
// Copy quota từ tháng nguồn sang tháng mới, scoped theo factoryId+processId
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { factoryId, processId, yearMonth, sourceYearMonth } = body as {
      factoryId: number;
      processId: number;
      yearMonth: string;
      sourceYearMonth: string;
    };

    if (!factoryId || !processId || !yearMonth || !sourceYearMonth) {
      return NextResponse.json(
        { error: "factoryId, processId, yearMonth và sourceYearMonth là bắt buộc" },
        { status: 400 },
      );
    }
    if (
      !/^\d{4}-\d{2}$/.test(yearMonth) ||
      !/^\d{4}-\d{2}$/.test(sourceYearMonth)
    ) {
      return NextResponse.json(
        { error: "yearMonth và sourceYearMonth phải có định dạng YYYY-MM" },
        { status: 400 },
      );
    }
    if (yearMonth <= sourceYearMonth) {
      return NextResponse.json(
        { error: "yearMonth phải sau sourceYearMonth" },
        { status: 400 },
      );
    }

    // Lấy quota tháng nguồn scoped theo factoryId+processId
    const sourceQuotas = await prisma.monthlyQuota.findMany({
      where: {
        yearMonth: sourceYearMonth,
        factoryId,
        processId,
        salesOrderItem: {
          order: {
            factoryId,
            status: "ACTIVE",
            isActive: true,
          },
        },
      },
      include: {
        salesOrderItem: {
          select: {
            id: true,
            plannedQty: true,
            deliveredQty: true,
            itemId: true,
            deferToMonth: true,
          },
        },
      },
    });

    if (sourceQuotas.length === 0) {
      return NextResponse.json(
        {
          error: `Không có quota nào tháng ${sourceYearMonth} cho factory ${factoryId} / process ${processId}`,
        },
        { status: 404 },
      );
    }

    const firstDayOfNewMonth = new Date(`${yearMonth}-01T00:00:00.000Z`);

    const quotasWithRemaining = await Promise.all(
      sourceQuotas.map(async (sq) => {
        const oi = sq.salesOrderItem;

        if (oi.deferToMonth && oi.deferToMonth > yearMonth) return null;

        const prevAllocated = await prisma.orderAllocation.aggregate({
          where: {
            salesOrderItemId: oi.id,
            productionDate: { lt: firstDayOfNewMonth },
          },
          _sum: { allocatedQty: true },
        });
        const cumProduced = prevAllocated._sum?.allocatedQty ?? 0;
        const remainingTotal =
          oi.plannedQty - oi.deliveredQty - cumProduced;

        if (remainingTotal <= 0) return null;

        let newQuotaQty = sq.quotaQty;
        if (
          !sq.isRemainder &&
          newQuotaQty !== null &&
          newQuotaQty > remainingTotal
        ) {
          newQuotaQty = remainingTotal;
        }

        return {
          salesOrderItemId: oi.id,
          factoryId,
          processId,
          yearMonth,
          quotaQty: newQuotaQty,
          isRemainder: sq.isRemainder,
          sortOrder: sq.sortOrder,
          remainingTotal,
        };
      }),
    );

    const validQuotas = quotasWithRemaining.filter(
      (q): q is NonNullable<typeof q> => q !== null,
    );

    if (validQuotas.length === 0) {
      return NextResponse.json({
        copied: 0,
        skippedDone: sourceQuotas.length,
        message: "Tất cả HĐ tháng nguồn đã hoàn thành hoặc bị defer",
        quotas: [],
      });
    }

    // Kiểm tra đã có quota tháng mới chưa (scoped theo factoryId+processId)
    const existing = await prisma.monthlyQuota.count({
      where: {
        yearMonth,
        factoryId,
        processId,
        salesOrderItemId: { in: validQuotas.map((q) => q.salesOrderItemId) },
      },
    });

    if (existing > 0) {
      return NextResponse.json(
        {
          error: `Tháng ${yearMonth} đã có ${existing} quota cho process này. Xóa trước hoặc dùng POST /kdsx/monthly-quotas để cập nhật từng dòng.`,
        },
        { status: 409 },
      );
    }

    await prisma.monthlyQuota.createMany({
      data: validQuotas.map((q) => ({
        salesOrderItemId: q.salesOrderItemId,
        factoryId: q.factoryId,
        processId: q.processId,
        yearMonth: q.yearMonth,
        quotaQty: q.quotaQty,
        isRemainder: q.isRemainder,
        sortOrder: q.sortOrder,
      })),
    });

    return NextResponse.json({
      copied: validQuotas.length,
      skippedDone: sourceQuotas.length - validQuotas.length,
      sourceYearMonth,
      targetYearMonth: yearMonth,
      quotas: validQuotas,
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
