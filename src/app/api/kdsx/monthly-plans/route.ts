import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { refreshSummarySnapshot, ALL_FIXED_COST_TYPES } from "@/lib/kdsx/calculator";
import { SnapshotType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const factoryId = searchParams.get("factoryId");
  const yearMonth = searchParams.get("yearMonth");

  const plans = await prisma.monthlyPlan.findMany({
    where: {
      ...(factoryId ? { factoryId: Number(factoryId) } : {}),
      ...(yearMonth ? { yearMonth } : {}),
    },
    include: {
      factory: { select: { id: true, name: true } },
      _count: { select: { lineItems: true, fixedCosts: true } },
    },
    orderBy: [{ yearMonth: "desc" }, { factoryId: "asc" }],
  });
  return NextResponse.json(plans);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.role;
  const accessLevel = (session.user as any)?.accessLevel;
  if (userRole !== "ADMIN" && accessLevel !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { factoryId, yearMonth, note } = body;
  if (!factoryId || !yearMonth) {
    return NextResponse.json({ error: "Cần factoryId và yearMonth" }, { status: 400 });
  }

  // Tạo plan + 14 FixedCostEntry mặc định trong 1 transaction
  const plan = await prisma.$transaction(async (tx) => {
    const newPlan = await tx.monthlyPlan.create({
      data: {
        factoryId: Number(factoryId),
        yearMonth,
        note: note || null,
        fixedCosts: {
          create: ALL_FIXED_COST_TYPES.map((costType) => ({
            costType,
            amountVnd: 0,
          })),
        },
      },
      include: {
        factory: { select: { id: true, name: true } },
        fixedCosts: true,
        _count: { select: { lineItems: true } },
      },
    });
    return newPlan;
  });

  await refreshSummarySnapshot(Number(factoryId), yearMonth, SnapshotType.KH);

  return NextResponse.json(plan, { status: 201 });
}
