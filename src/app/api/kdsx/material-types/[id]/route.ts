import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// PUT: sửa name, note, isActive
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRole = (session.user as any)?.userRole as string | undefined;
  if (userRole !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden — chỉ Admin mới được sửa loại NVL" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = await req.json();
  const { name, note, isActive } = body;

  const mt = await prisma.materialType.update({
    where: { id: Number(id) },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(note !== undefined ? { note: note || null } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  });

  return NextResponse.json(mt);
}

// DELETE: chỉ xóa nếu chưa có MaterialPrice nào
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRole = (session.user as any)?.userRole as string | undefined;
  if (userRole !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden — chỉ Admin mới được xóa loại NVL" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const priceCount = await prisma.materialPrice.count({
    where: { materialTypeId: Number(id) },
  });

  if (priceCount > 0) {
    return NextResponse.json(
      { error: `Không thể xóa — đã có ${priceCount} bản ghi giá liên quan` },
      { status: 409 },
    );
  }

  await prisma.materialType.delete({ where: { id: Number(id) } });
  return NextResponse.json({ success: true });
}
