import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  if ((session.user as any)?.userRole !== "ADMIN") {
    return NextResponse.json({ error: "Chỉ Admin mới được thực hiện thao tác này" }, { status: 403 });
  }

  const { id } = await params;
  const categoryId = parseInt(id);
  const body = await request.json();
  const { name, color, isActive } = body;

  const existing = await prisma.stopCategory.findUnique({ where: { id: categoryId } });
  if (!existing) {
    return NextResponse.json({ error: "Không tìm thấy danh mục" }, { status: 404 });
  }

  // Danh mục mặc định không được tắt
  if (existing.isDefault && isActive === false) {
    return NextResponse.json({ error: "Không được tắt danh mục mặc định" }, { status: 400 });
  }

  const updated = await prisma.stopCategory.update({
    where: { id: categoryId },
    data: {
      ...(name !== undefined && { name }),
      ...(color !== undefined && { color }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  if ((session.user as any)?.userRole !== "ADMIN") {
    return NextResponse.json({ error: "Chỉ Admin mới được thực hiện thao tác này" }, { status: 403 });
  }

  const { id } = await params;
  const categoryId = parseInt(id);

  const existing = await prisma.stopCategory.findUnique({
    where: { id: categoryId },
    include: { _count: { select: { stopLogs: true } } },
  });

  if (!existing) {
    return NextResponse.json({ error: "Không tìm thấy danh mục" }, { status: 404 });
  }
  if (existing.isDefault) {
    return NextResponse.json({ error: "Không được xóa danh mục mặc định" }, { status: 400 });
  }
  if (existing._count.stopLogs > 0) {
    return NextResponse.json(
      { error: `Danh mục đang có ${existing._count.stopLogs} bản ghi dừng máy. Hãy tắt thay vì xóa.` },
      { status: 400 }
    );
  }

  await prisma.stopCategory.delete({ where: { id: categoryId } });
  return NextResponse.json({ success: true });
}
