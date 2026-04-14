import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Chỉ Admin mới được hoàn trả kế hoạch" }, { status: 403 });
  }

  const { id } = await params;
  const plan = await prisma.monthlyPlan.findUnique({ where: { id: Number(id) } });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (plan.status !== "SUBMITTED") {
    return NextResponse.json(
      { error: "Chỉ kế hoạch ở trạng thái Đã nộp mới có thể hoàn trả" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { reason } = body;
  if (!reason || String(reason).trim().length < 10) {
    return NextResponse.json({ error: "Lý do hoàn trả phải có ít nhất 10 ký tự" }, { status: 400 });
  }

  const date = new Date().toLocaleDateString("vi-VN");
  const notePrefix = `[Hoàn trả ${date}] ${String(reason).trim()}`;
  const newNote = plan.note
    ? `${notePrefix}\n${plan.note}`
    : notePrefix;

  const updated = await prisma.monthlyPlan.update({
    where: { id: Number(id) },
    data: { status: "DRAFT", note: newNote },
  });
  return NextResponse.json(updated);
}
