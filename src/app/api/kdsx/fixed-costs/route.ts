import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { refreshSummarySnapshot, ALL_FIXED_COST_TYPES } from "@/lib/kdsx/calculator";
import { FixedCostType, SnapshotType } from "@prisma/client";

// GET /api/kdsx/fixed-costs?monthlyPlanId=X | monthlyActualId=Y
// Luôn trả về đủ 14 dòng (dòng chưa có → amountVnd: 0)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const monthlyPlanId = searchParams.get("monthlyPlanId");
  const monthlyActualId = searchParams.get("monthlyActualId");

  if (!monthlyPlanId && !monthlyActualId) {
    return NextResponse.json({ error: "Cần monthlyPlanId hoặc monthlyActualId" }, { status: 400 });
  }

  const where = monthlyPlanId
    ? { monthlyPlanId: parseInt(monthlyPlanId) }
    : { monthlyActualId: parseInt(monthlyActualId!) };

  const existing = await prisma.fixedCostEntry.findMany({ where, orderBy: { id: "asc" } });
  const existingMap = new Map(existing.map((e) => [e.costType as string, e]));

  const result = ALL_FIXED_COST_TYPES.map((costType) => {
    const entry = existingMap.get(costType);
    return entry ?? {
      id: null,
      costType,
      amountVnd: 0,
      note: null,
    };
  });

  return NextResponse.json(result);
}

// POST /api/kdsx/fixed-costs — upsert toàn bộ 14 khoản trong 1 request
// Body: { monthlyPlanId?, monthlyActualId?, entries: [{ costType, amountVnd, note? }] }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Phân quyền theo hệ thống mới (UserRole)
  const userRole = (session.user as any)?.userRole as string | undefined;
  const ALLOWED_ROLES = ["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"];
  if (!userRole || !ALLOWED_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { monthlyPlanId, monthlyActualId, entries } = body;

  // Validate XOR
  if ((!monthlyPlanId && !monthlyActualId) || (monthlyPlanId && monthlyActualId)) {
    return NextResponse.json(
      { error: "Cần đúng 1 trong 2: monthlyPlanId hoặc monthlyActualId" },
      { status: 400 }
    );
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "entries không được rỗng" }, { status: 400 });
  }

  const planIdNum = monthlyPlanId ? parseInt(monthlyPlanId) : undefined;
  const actualIdNum = monthlyActualId ? parseInt(monthlyActualId) : undefined;
  const where = planIdNum ? { monthlyPlanId: planIdNum } : { monthlyActualId: actualIdNum! };

  // Lấy các entry hiện có để biết cái nào update / create
  const existing = await prisma.fixedCostEntry.findMany({ where });
  const existingMap = new Map(existing.map((e) => [e.costType as string, e]));

  // Transaction: update existing hoặc create mới
  const ops = (entries as Array<{ costType: string; amountVnd: number; note?: string }>).map((entry) => {
    const ex = existingMap.get(entry.costType);
    if (ex) {
      return prisma.fixedCostEntry.update({
        where: { id: ex.id },
        data: { amountVnd: Number(entry.amountVnd), note: entry.note ?? null },
      });
    }
    return prisma.fixedCostEntry.create({
      data: {
        costType: entry.costType as FixedCostType,
        amountVnd: Number(entry.amountVnd),
        note: entry.note ?? null,
        ...(planIdNum ? { monthlyPlanId: planIdNum } : { monthlyActualId: actualIdNum }),
      },
    });
  });

  const saved = await prisma.$transaction(ops);

  // Refresh summary snapshot
  if (planIdNum) {
    const plan = await prisma.monthlyPlan.findUnique({ where: { id: planIdNum } });
    if (plan) await refreshSummarySnapshot(plan.factoryId, plan.yearMonth, SnapshotType.KH);
  } else if (actualIdNum) {
    const actual = await prisma.monthlyActual.findUnique({ where: { id: actualIdNum } });
    if (actual) await refreshSummarySnapshot(actual.factoryId, actual.yearMonth, SnapshotType.TH);
  }

  return NextResponse.json({ saved: saved.length });
}
