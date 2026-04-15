import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calculateLineItem, refreshSummarySnapshot } from "@/lib/kdsx/calculator";
import { SnapshotType } from "@prisma/client";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  const KDSX_EDIT_ROLES = ["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"];
  if (!userRole || !KDSX_EDIT_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const planId = Number(id);
  const plan = await prisma.monthlyPlan.findUnique({ where: { id: planId } });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { itemId, salesOrderItemId, qty, unitPriceUsd, note } = body;
  if (!itemId || qty === undefined || unitPriceUsd === undefined) {
    return NextResponse.json({ error: "Thiếu itemId, qty hoặc unitPriceUsd" }, { status: 400 });
  }

  // Lấy thông số tháng
  const inputParam = await prisma.monthlyInputParam.findUnique({
    where: { factoryId_yearMonth: { factoryId: plan.factoryId, yearMonth: plan.yearMonth } },
  });
  if (!inputParam) {
    return NextResponse.json({ error: "Chưa có thông số tháng. Hãy nhập thông số trước." }, { status: 400 });
  }

  // Lấy định mức mới nhất cho item
  const rate = await prisma.rawMaterialRate.findFirst({
    where: {
      itemId: Number(itemId),
      effectiveTo: null,
    },
    orderBy: { effectiveFrom: "desc" },
  });

  // Lấy sellingCostRate từ SalesOrderItem (không phải RawMaterialRate)
  let sellingCostRate = 0;
  if (salesOrderItemId) {
    const soi = await prisma.salesOrderItem.findUnique({
      where: { id: Number(salesOrderItemId) },
    });
    sellingCostRate = soi?.sellingCostRate ?? 0;
  } else {
    sellingCostRate = body.sellingCostRate ?? 0;
  }

  const calcResult = calculateLineItem({
    qty: Number(qty),
    unitPriceUsd: Number(unitPriceUsd),
    rates: {
      cottonRate: rate?.cottonRate ?? 0,
      peRate: rate?.peRate ?? 0,
      wasteRate: rate?.wasteRate ?? 0,
      sellingCostRate,
      doubleTwistGcRate: rate?.doubleTwistGcRate ?? 0,
    },
    params: {
      exchangeRate: inputParam.exchangeRate,
      avgCottonPrice: inputParam.avgCottonPrice ?? 0,
      peBenmaPrice: inputParam.peBenmaPrice ?? 0,
      wastePrice: inputParam.wastePrice ?? 0,
    },
  });

  const lineItem = await prisma.planLineItem.create({
    data: {
      planId,
      itemId: Number(itemId),
      salesOrderItemId: salesOrderItemId ? Number(salesOrderItemId) : null,
      qty: Number(qty),
      unitPriceUsd: Number(unitPriceUsd),
      note: note || null,
      ...calcResult,
    },
    include: {
      item: { select: { id: true, name: true, code: true } },
      salesOrderItem: { include: { order: { select: { id: true, orderNo: true } } } },
    },
  });

  await refreshSummarySnapshot(plan.factoryId, plan.yearMonth, SnapshotType.KH);

  return NextResponse.json(lineItem, { status: 201 });
}
