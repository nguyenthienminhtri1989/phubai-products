import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// 1. PUT: Cập nhật (Dựa vào ID trên URL)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }, // Lưu ý: Next.js 15+ params là Promise
) {
  try {
    const session = await auth();
    if (
      session?.user?.role !== "ADMIN" &&
      session?.user?.accessLevel !== "MANAGER"
    ) {
      return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
    }

    // Await params để lấy ID
    const { id } = await params;
    const itemId = parseInt(id);

    const body = await req.json();
    const { name, code, ne, composition, twist, weavingStyle, material } = body;

    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: {
        name,
        code,
        ne: ne ? parseInt(ne) : null,
        composition,
        twist: twist ? parseInt(twist) : null,
        weavingStyle,
        material,
      },
    });

    return NextResponse.json(updatedItem);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi cập nhật" }, { status: 500 });
  }
}

// 2. DELETE: Xóa (Dựa vào ID trên URL)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Chỉ Admin được xóa" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const itemId = parseInt(id);

    // Kiểm tra ràng buộc
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { _count: { select: { productionLogs: true } } },
    });

    if (item && item._count.productionLogs > 0) {
      return NextResponse.json(
        { error: "Mặt hàng này đã có dữ liệu sản xuất, không thể xóa!" },
        { status: 400 },
      );
    }

    await prisma.item.delete({ where: { id: itemId } });

    return NextResponse.json({ message: "Đã xóa thành công" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi xóa dữ liệu" }, { status: 500 });
  }
}
