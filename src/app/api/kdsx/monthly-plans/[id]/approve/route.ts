import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Chỉ ADMIN mới được duyệt kế hoạch" }, { status: 403 });
  }

  const { id } = await params;
  const plan = await prisma.monthlyPlan.findUnique({ where: { id: Number(id) } });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (plan.status !== "SUBMITTED") {
    return NextResponse.json({ error: "Chỉ có thể duyệt kế hoạch ở trạng thái SUBMITTED" }, { status: 400 });
  }

  const updated = await prisma.monthlyPlan.update({
    where: { id: Number(id) },
    data: { status: "APPROVED" },
  });
  return NextResponse.json(updated);
}
