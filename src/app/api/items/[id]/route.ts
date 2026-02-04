import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT: Sửa tên
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idString } = await params;
    const id = parseInt(idString);
    const body = await request.json();

    const updatedItem = await prisma.item.update({
      where: { id: id },
      data: { name: body.name },
    });

    return NextResponse.json(updatedItem);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi cập nhật" }, { status: 500 });
  }
}

// DELETE: Xóa
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idString } = await params;
    const id = parseInt(idString);

    await prisma.item.delete({ where: { id: id } });
    return NextResponse.json({ message: "Đã xóa" });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Không thể xóa (Mặt hàng này đang được dùng trong sản xuất)" },
      { status: 500 },
    );
  }
}
