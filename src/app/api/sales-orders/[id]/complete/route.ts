import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.role;
  const accessLevel = (session.user as any)?.accessLevel;
  if (userRole !== "ADMIN" && accessLevel !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const order = await prisma.salesOrder.findUnique({ where: { id: Number(id) } });
  if (!order) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });

  if (order.status !== "ACTIVE" && order.status !== "OVERDUE") {
    return NextResponse.json(
      { error: "Chỉ có thể đánh dấu DONE khi trạng thái là ACTIVE hoặc OVERDUE" },
      { status: 400 },
    );
  }

  const updated = await prisma.salesOrder.update({
    where: { id: Number(id) },
    data: { status: "DONE", completedDate: new Date() },
  });

  return NextResponse.json(updated);
}
