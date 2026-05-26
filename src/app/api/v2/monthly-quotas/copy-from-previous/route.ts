import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/v2/monthly-quotas/copy-from-previous
// Copy quota từ tháng nguồn sang tháng mới (chỉ HĐ còn active)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { factoryId, yearMonth, sourceYearMonth } = body as {
      factoryId: number;
      yearMonth: string;
      sourceYearMonth: string;
    };

    if (!factoryId || !yearMonth || !sourceYearMonth) {
      return NextResponse.json(
        { error: "factoryId, yearMonth và sourceYearMonth là bắt buộc" },
        { status: 400 }
      );
    }
    if (!/^\d{4}-\d{2}$/.test(yearMonth) || !/^\d{4}-\d{2}$/.test(sourceYearMonth)) {
      return NextResponse.json(
        { error: "yearMonth và sourceYearMonth phải có định dạng YYYY-MM" },
        { status: 400 }
      );
    }
    if (yearMonth <= sourceYearMonth) {
      return NextResponse.json(
        { error: "yearMonth phải sau sourceYearMonth" },
        { status: 400 }
      );
    }

    // Lấy tất cả quota tháng nguồn của factory này
    const sourceQuotas = await prisma.monthlyQuota.findMany({
      where: {
        yearMonth: sourceYearMonth,
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
        { error: `Không có quota nào tháng ${sourceYearMonth} cho factory ${factoryId}` },
        { status: 404 }
      );
    }

    const firstDayOfNewMonth = new Date(`${yearMonth}-01T00:00:00.000Z`);

    // Tính remainingTotal cho tháng mới
    const quotasWithRemaining = await Promise.all(
      sourceQuotas.map(async (sq) => {
        const oi = sq.salesOrderItem;

        // Bỏ qua HĐ bị defer sang tháng sau tháng mới
        if (oi.deferToMonth && oi.deferToMonth > yearMonth) {
          return null;
        }

        const prevAllocated = await prisma.orderAllocation.aggregate({
          where: {
            salesOrderItemId: oi.id,
            productionDate: { lt: firstDayOfNewMonth },
          },
          _sum: { allocatedQty: true },
        });
        const cumProduced = prevAllocated._sum?.allocatedQty ?? 0;
        const remainingTotal = oi.plannedQty - oi.deliveredQty - cumProduced;

        // Bỏ qua HĐ đã hoàn thành
        if (remainingTotal <= 0) return null;

        // Điều chỉnh quotaQty: không vượt quá remainingTotal mới
        let newQuotaQty = sq.quotaQty;
        if (!sq.isRemainder && newQuotaQty !== null && newQuotaQty > remainingTotal) {
          newQuotaQty = remainingTotal;
        }

        return {
          salesOrderItemId: oi.id,
          yearMonth,
          quotaQty: newQuotaQty,
          isRemainder: sq.isRemainder,
          sortOrder: sq.sortOrder,
          remainingTotal,
        };
      })
    );

    const validQuotas = quotasWithRemaining.filter(
      (q): q is NonNullable<typeof q> => q !== null
    );

    if (validQuotas.length === 0) {
      return NextResponse.json({
        copied: 0,
        skippedDone: sourceQuotas.length,
        message: "Tất cả HĐ tháng nguồn đã hoàn thành hoặc bị defer",
        quotas: [],
      });
    }

    // Upsert quotas mới (không ghi đè nếu đã tồn tại → 409)
    const existing = await prisma.monthlyQuota.count({
      where: {
        yearMonth,
        salesOrderItemId: { in: validQuotas.map((q) => q.salesOrderItemId) },
      },
    });

    if (existing > 0) {
      return NextResponse.json(
        {
          error: `Tháng ${yearMonth} đã có ${existing} quota. Xóa trước hoặc dùng POST /monthly-quotas để cập nhật từng dòng.`,
        },
        { status: 409 }
      );
    }

    await prisma.monthlyQuota.createMany({
      data: validQuotas.map((q) => ({
        salesOrderItemId: q.salesOrderItemId,
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
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
