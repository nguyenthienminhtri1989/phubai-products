import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calculateLineItem, refreshSummarySnapshot } from "@/lib/kdsx/calculator";
import { SnapshotType } from "@prisma/client";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  const KDSX_EDIT_ROLES = ["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"];
  if (!userRole || !KDSX_EDIT_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const actual = await prisma.monthlyActual.findUnique({
    where: { id: Number(id) },
    include: { lineItems: true },
  });
  if (!actual) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { factoryId, yearMonth } = actual;
  const [year, month] = yearMonth.split("-").map(Number);
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  // GROUP BY itemId từ ProductionLog trong tháng/nhà máy
  const grouped = await prisma.productionLog.groupBy({
    by: ["itemId"],
    where: {
      machine: { process: { factoryId } },
      recordDate: { gte: startOfMonth, lte: endOfMonth },
    },
    _sum: { finalOutput: true },
  });

  // Lấy thông số tháng
  const inputParam = await prisma.monthlyInputParam.findUnique({
    where: { factoryId_yearMonth: { factoryId, yearMonth } },
  });

  let syncedCount = 0;

  for (const grp of grouped) {
    const qty = grp._sum.finalOutput ?? 0;
    const itemId = grp.itemId;

    // Tìm giá từ SalesOrderItem còn hiệu lực
    const soItem = await prisma.salesOrderItem.findFirst({
      where: {
        itemId,
        order: { factoryId, isActive: true },
      },
      orderBy: { id: "desc" },
    });
    const unitPriceUsd = soItem?.unitPrice ?? 0;

    // Lấy định mức
    const rate = await prisma.rawMaterialRate.findFirst({
      where: { itemId, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    });

    let calcResult = {
      revenueVnd: 0, cottonCostVnd: 0, peCostVnd: 0,
      sellingCostVnd: 0, gcDoubleTwistVnd: 0, wasteRecoveryVnd: 0, grossProfitVnd: 0,
    };

    if (inputParam && unitPriceUsd > 0) {
      calcResult = calculateLineItem({
        qty,
        unitPriceUsd,
        rates: {
          cottonRate: rate?.cottonRate ?? 0,
          peRate: rate?.peRate ?? 0,
          wasteRate: rate?.wasteRate ?? 0,
          sellingCostRate: rate?.sellingCostRate ?? 0,
          doubleTwistGcRate: rate?.doubleTwistGcRate ?? 0,
        },
        params: {
          exchangeRate: inputParam.exchangeRate,
          avgCottonPrice: inputParam.avgCottonPrice ?? 0,
          peBenmaPrice: inputParam.peBenmaPrice ?? 0,
          wastePrice: inputParam.wastePrice ?? 0,
        },
      });
    }

    // Upsert ActualLineItem
    const existing = actual.lineItems.find((li) => li.itemId === itemId);
    if (existing) {
      await prisma.actualLineItem.update({
        where: { id: existing.id },
        data: {
          qty,
          unitPriceUsd,
          salesOrderItemId: soItem?.id ?? null,
          ...calcResult,
        },
      });
    } else {
      await prisma.actualLineItem.create({
        data: {
          actualId: actual.id,
          itemId,
          qty,
          unitPriceUsd,
          salesOrderItemId: soItem?.id ?? null,
          ...calcResult,
        },
      });
    }
    syncedCount++;
  }

  await refreshSummarySnapshot(factoryId, yearMonth, SnapshotType.TH);

  return NextResponse.json({ success: true, syncedItems: syncedCount });
}
