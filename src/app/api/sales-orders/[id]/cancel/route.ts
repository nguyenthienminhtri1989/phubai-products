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

  if (order.status === "DONE") {
    return NextResponse.json({ error: "Không thể hủy hợp đồng đã DONE" }, { status: 400 });
  }
  if (order.status === "CANCELLED") {
    return NextResponse.json({ error: "Hợp đồng đã bị hủy trước đó" }, { status: 400 });
  }

  const body = await req.json();
  const { reason } = body;
  if (!reason || String(reason).trim().length < 5) {
    return NextResponse.json(
      { error: "Lý do hủy là bắt buộc (tối thiểu 5 ký tự)" },
      { status: 400 },
    );
  }

  // Ghi reason vào note, giữ nguyên OrderAllocation để audit
  const cancelNote = `[HỦY ${new Date().toISOString().split("T")[0]}] ${reason.trim()}${order.note ? `\n---\n${order.note}` : ""}`;

  const updated = await prisma.salesOrder.update({
    where: { id: Number(id) },
    data: { status: "CANCELLED", note: cancelNote },
  });

  return NextResponse.json(updated);
}
