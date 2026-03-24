import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

interface Params {
  params: Promise<{ code: string }>;
}

// PUT: Cập nhật ca làm việc (chỉ ADMIN, không cho đổi code)
export async function PUT(req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Không có quyền thực hiện thao tác này" }, { status: 403 });
    }

    const { code } = await params;
    const body = await req.json();
    const { name, note } = body as { name?: string; note?: string };

    if (!name) {
      return NextResponse.json({ error: "Tên ca là bắt buộc" }, { status: 400 });
    }

    // Kiểm tra trùng tên với ca khác
    const existingName = await prisma.shiftCategory.findFirst({
      where: { name: name.trim(), NOT: { code } },
    });
    if (existingName) {
      return NextResponse.json({ error: "Tên ca đã tồn tại" }, { status: 409 });
    }

    const updated = await prisma.shiftCategory.update({
      where: { code },
      data: { name: name.trim(), note: note?.trim() || null },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2025") {
      return NextResponse.json({ error: "Không tìm thấy ca làm việc" }, { status: 404 });
    }
    return NextResponse.json({ error: "Lỗi cập nhật ca làm việc" }, { status: 500 });
  }
}

// DELETE: Xóa ca làm việc (chỉ ADMIN)
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Không có quyền thực hiện thao tác này" }, { status: 403 });
    }

    const { code } = await params;

    await prisma.shiftCategory.delete({ where: { code } });

    return NextResponse.json({ message: "Đã xóa ca làm việc thành công" });
  } catch (error) {
    console.error(error);
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2025") {
      return NextResponse.json({ error: "Không tìm thấy ca làm việc" }, { status: 404 });
    }
    return NextResponse.json({ error: "Lỗi xóa ca làm việc" }, { status: 500 });
  }
}
