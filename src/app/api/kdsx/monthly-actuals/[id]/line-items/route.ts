import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  calculateLineItem,
  refreshSummarySnapshot,
} from "@/lib/kdsx/calculator";
import { SnapshotType } from "@prisma/client";

/**
 * POST /api/kdsx/monthly-actuals/[id]/line-items
 * Thêm HĐ phát sinh (isAdHoc = true) vào MonthlyActual
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  const KDSX_EDIT_ROLES = ["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"];
  if (!userRole || !KDSX_EDIT_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const actual = await prisma.monthlyActual.findUnique({
    where: { id: Number(id) },
  });
  if (!actual)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const {
    itemId,
    salesOrderItemId,
    qty,
    unitPriceUsd,
    note,
    cottonMaterialTypeId,
    cottonPriceUsd,
    peMaterialTypeId,
    pePriceUsd,
  } = body;

  if (!itemId || qty === undefined || unitPriceUsd === undefined) {
    return NextResponse.json(
      { error: "Thiếu itemId, qty hoặc unitPriceUsd" },
      { status: 400 },
    );
  }

  const inputParam = await prisma.monthlyInputParam.findUnique({
    where: {
      factoryId_yearMonth: {
        factoryId: actual.factoryId,
        yearMonth: actual.yearMonth,
      },
    },
  });
  if (!inputParam) {
    return NextResponse.json(
      { error: "Chưa có thông số tháng" },
      { status: 400 },
    );
  }

  const rate = await prisma.rawMaterialRate.findFirst({
    where: { itemId: Number(itemId), effectiveTo: null },
    orderBy: { effectiveFrom: "desc" },
  });

  let sellingCostRate = 0;
  if (salesOrderItemId) {
    const soi = await prisma.salesOrderItem.findUnique({
      where: { id: Number(salesOrderItemId) },
    });
    sellingCostRate = soi?.sellingCostRate ?? 0;
  }

  const cottonPrice = Number(cottonPriceUsd) || 0;
  const pePrice = Number(pePriceUsd) || 0;
  const cottonRatioValue = rate?.cottonRatio ?? 1.0;
  const peRatioValue = cottonRatioValue < 1.0 ? 1 - cottonRatioValue : 0;

  const calcResult = calculateLineItem({
    qty: Number(qty),
    unitPriceUsd: Number(unitPriceUsd),
    rates: {
      cottonRate: rate?.cottonRate ?? 0,
      peRate: rate?.peRate ?? 0,
      cottonRatio: cottonRatioValue,
      wasteRate: rate?.wasteRate ?? 0,
      sellingCostRate,
      doubleTwistGcRate: rate?.doubleTwistGcRate ?? 0,
    },
    params: {
      exchangeRate: inputParam.exchangeRate,
      cottonPriceUsd: cottonPrice,
      pePriceUsd: pePrice,
    },
  });

  const lineItem = await prisma.actualLineItem.create({
    data: {
      actualId: actual.id,
      itemId: Number(itemId),
      salesOrderItemId: salesOrderItemId ? Number(salesOrderItemId) : null,
      qty: Number(qty),
      unitPriceUsd: Number(unitPriceUsd),
      cottonMaterialTypeId: cottonMaterialTypeId
        ? Number(cottonMaterialTypeId)
        : null,
      cottonPriceUsd: cottonPrice || null,
      cottonRatio: cottonRatioValue,
      peMaterialTypeId: peMaterialTypeId ? Number(peMaterialTypeId) : null,
      pePriceUsd: pePrice || null,
      peRatio: peRatioValue || null,
      isAdHoc: true,
      isAutoQty: false,
      note: note || null,
      ...calcResult,
    },
    include: {
      item: { select: { id: true, name: true, code: true } },
      salesOrderItem: {
        include: { order: { select: { id: true, orderNo: true } } },
      },
    },
  });

  await refreshSummarySnapshot(
    actual.factoryId,
    actual.yearMonth,
    SnapshotType.TH,
  );

  return NextResponse.json(lineItem, { status: 201 });
}
