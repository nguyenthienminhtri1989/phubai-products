import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  calculateLineItem,
  refreshSummarySnapshot,
} from "@/lib/kdsx/calculator";
import { SnapshotType } from "@prisma/client";

export async function POST(
  _req: NextRequest,
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
  const planId = Number(id);

  // 1. Load plan + all lineItems (bao gồm snapshot giá NVL)
  const plan = await prisma.monthlyPlan.findUnique({
    where: { id: planId },
    include: { lineItems: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Chỉ cho phép tính lại khi plan còn DRAFT
  if (plan.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Chỉ có thể tính lại kế hoạch ở trạng thái Nháp (DRAFT)" },
      { status: 400 },
    );
  }

  // 2. Load inputParam cho (factoryId, yearMonth) — chỉ cần exchangeRate
  const inputParam = await prisma.monthlyInputParam.findUnique({
    where: {
      factoryId_yearMonth: {
        factoryId: plan.factoryId,
        yearMonth: plan.yearMonth,
      },
    },
  });
  if (!inputParam) {
    return NextResponse.json(
      {
        error: "Chưa có thông số tháng. Hãy nhập thông số trước khi tính lại.",
      },
      { status: 400 },
    );
  }

  let updated = 0;

  // 3. Với mỗi lineItem — tính lại dùng SNAPSHOT giá NVL (không tra MaterialPrice mới)
  for (const li of plan.lineItems) {
    // a. Tra RawMaterialRate mới nhất theo itemId
    const rate = await prisma.rawMaterialRate.findFirst({
      where: { itemId: li.itemId, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    });

    // b. Lấy sellingCostRate từ SalesOrderItem (nếu có) hoặc 0
    let sellingCostRate = 0;
    if (li.salesOrderItemId) {
      const soi = await prisma.salesOrderItem.findUnique({
        where: { id: li.salesOrderItemId },
        select: { sellingCostRate: true },
      });
      sellingCostRate = soi?.sellingCostRate ?? 0;
    }

    // c. Dùng snapshot cottonRatio từ lineItem nếu có, nếu không dùng từ rate
    const cottonRatioValue = li.cottonRatio ?? rate?.cottonRatio ?? 1.0;

    // d. Gọi calculateLineItem() — dùng SNAPSHOT giá (cottonPriceUsd, pePriceUsd)
    const calcResult = calculateLineItem({
      qty: li.qty,
      unitPriceUsd: li.unitPriceUsd,
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
        // Dùng snapshot giá đã lưu trong lineItem — KHÔNG tra MaterialPrice mới
        cottonPriceUsd: li.cottonPriceUsd ?? 0,
        pePriceUsd: li.pePriceUsd ?? 0,
      },
    });

    // e. Update lineItem với kết quả mới (giữ nguyên snapshot giá NVL)
    await prisma.planLineItem.update({
      where: { id: li.id },
      data: { ...calcResult },
    });

    updated++;
  }

  // 4. Refresh summary snapshot
  await refreshSummarySnapshot(plan.factoryId, plan.yearMonth, SnapshotType.KH);

  // 5. Trả về số dòng đã tính lại
  return NextResponse.json({ updated });
}
