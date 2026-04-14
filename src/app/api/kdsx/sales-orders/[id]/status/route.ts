import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/kdsx/sales-orders/[id]/status
// Body: { status: "ACTIVE" | "DONE" | "CANCELLED" }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  const KDSX_EDIT_ROLES = ["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"];
  if (!userRole || !KDSX_EDIT_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { status } = body;

  const ALLOWED = ["ACTIVE", "DONE", "CANCELLED"];
  if (!ALLOWED.includes(status)) {
    return NextResponse.json(
      { error: `status phải là một trong: ${ALLOWED.join(", ")}` },
      { status: 400 },
    );
  }

  const order = await prisma.salesOrder.findUnique({ where: { id: Number(id) } });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Không cho chuyển từ CANCELLED sang trạng thái khác
  if (order.status === "CANCELLED" && status !== "CANCELLED") {
    return NextResponse.json(
      { error: "Không thể thay đổi trạng thái đơn đã huỷ" },
      { status: 400 },
    );
  }

  const updated = await prisma.salesOrder.update({
    where: { id: Number(id) },
    data: {
      status: status as any,
      completedDate: status === "DONE" ? new Date() : status === "ACTIVE" ? null : undefined,
    },
  });

  return NextResponse.json(updated);
}
