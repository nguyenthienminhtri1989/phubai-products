import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { refreshSummarySnapshot } from "@/lib/kdsx/calculator";
import { SnapshotType } from "@prisma/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const plan = await prisma.monthlyPlan.findUnique({
    where: { id: Number(id) },
    include: {
      factory: { select: { id: true, name: true } },
      lineItems: {
        include: {
          item: { select: { id: true, name: true, code: true } },
          salesOrderItem: {
            include: { order: { select: { id: true, orderNo: true } } },
          },
        },
        orderBy: { id: "asc" },
      },
      fixedCosts: { orderBy: { id: "asc" } },
    },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(plan);
}

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
  const { note } = body;

  const plan = await prisma.monthlyPlan.update({
    where: { id: Number(id) },
    data: { note: note ?? null },
  });
  return NextResponse.json(plan);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.role;
  const accessLevel = (session.user as any)?.accessLevel;
  const isAdmin = userRole === "ADMIN";
  const isManager = accessLevel === "MANAGER";

  const { id } = await params;
  const plan = await prisma.monthlyPlan.findUnique({ where: { id: Number(id) } });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (plan.status === "APPROVED") {
    return NextResponse.json(
      { error: "Kế hoạch đã duyệt không thể xóa" },
      { status: 403 }
    );
  }
  if (plan.status === "SUBMITTED" && !isAdmin) {
    return NextResponse.json(
      { error: "Chỉ Admin mới được xóa kế hoạch đang chờ duyệt" },
      { status: 403 }
    );
  }
  if (!isAdmin && !isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.fixedCostEntry.deleteMany({ where: { monthlyPlanId: Number(id) } }),
    prisma.planLineItem.deleteMany({ where: { planId: Number(id) } }),
    prisma.monthlyPlan.delete({ where: { id: Number(id) } }),
  ]);
  await refreshSummarySnapshot(plan.factoryId, plan.yearMonth, SnapshotType.KH);

  return NextResponse.json({ success: true });
}
