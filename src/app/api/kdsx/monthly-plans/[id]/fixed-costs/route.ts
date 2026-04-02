import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { refreshSummarySnapshot } from "@/lib/kdsx/calculator";
import { SnapshotType } from "@prisma/client";

// PUT: Cập nhật 1 FixedCostEntry (amountVnd, note)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.role;
  const accessLevel = (session.user as any)?.accessLevel;
  if (userRole !== "ADMIN" && accessLevel !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { fixedCostId, amountVnd, note } = body;

  if (fixedCostId === undefined || amountVnd === undefined) {
    return NextResponse.json({ error: "Thiếu fixedCostId hoặc amountVnd" }, { status: 400 });
  }

  const updated = await prisma.fixedCostEntry.update({
    where: { id: Number(fixedCostId) },
    data: { amountVnd: Number(amountVnd), note: note ?? null },
  });

  // Lấy plan để refresh snapshot
  const plan = await prisma.monthlyPlan.findUnique({ where: { id: Number(id) } });
  if (plan) {
    await refreshSummarySnapshot(plan.factoryId, plan.yearMonth, SnapshotType.KH);
  }

  return NextResponse.json(updated);
}
