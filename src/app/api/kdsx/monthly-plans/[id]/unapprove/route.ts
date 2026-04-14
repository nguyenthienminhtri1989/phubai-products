import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as any)?.userRole !== "ADMIN") {
    return NextResponse.json({ error: "Chỉ Admin mới được hủy duyệt" }, { status: 403 });
  }

  const body = await req.json();
  const { reason } = body;
  if (!reason || String(reason).trim().length < 5) {
    return NextResponse.json(
      { error: "Vui lòng nhập lý do hủy duyệt (tối thiểu 5 ký tự)" },
      { status: 400 }
    );
  }

  const { id } = await params;
  const plan = await prisma.monthlyPlan.findUnique({ where: { id: Number(id) } });
  if (!plan) return NextResponse.json({ error: "Không tìm thấy kế hoạch" }, { status: 404 });

  if (plan.status !== "APPROVED") {
    return NextResponse.json(
      { error: `Kế hoạch đang ở trạng thái "${plan.status}", không cần hủy duyệt` },
      { status: 400 }
    );
  }

  const timestamp = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const username = (session.user as any)?.username ?? "admin";
  const auditNote = `[Hủy duyệt lúc ${timestamp} bởi ${username}] ${String(reason).trim()}`;
  const newNote = plan.note ? `${auditNote}\n---\n${plan.note}` : auditNote;

  await prisma.monthlyPlan.update({
    where: { id: Number(id) },
    data: { status: "DRAFT", note: newNote },
  });

  return NextResponse.json({ success: true });
}
