// app/api/factories/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 1. HÀM PUT: Cập nhật thông tin
export async function PUT(
  request: Request,
  // Sửa kiểu dữ liệu của params thành Promise
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // --- KHẮC PHỤC LỖI Ở ĐÂY ---
    // Phải await params trước khi lấy id
    const data = await params;
    const idString = data.id; // Lấy giá trị của 'id' nhưng gán vào biến tên là 'idString'
    const id = parseInt(idString);
    // ---------------------------

    const body = await request.json();
    const { name, note } = body;

    const updatedFactory = await prisma.factory.update({
      where: { id: id },
      data: { name, note },
    });

    return NextResponse.json(updatedFactory);
  } catch (error) {
    // Log lỗi ra terminal để dễ debug
    console.error("Lỗi PUT:", error);
    return NextResponse.json({ error: "Lỗi cập nhật" }, { status: 500 });
  }
}

// 2. HÀM DELETE: Xóa nhà máy
export async function DELETE(
  request: Request,
  // Sửa kiểu dữ liệu của params thành Promise
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // --- KHẮC PHỤC LỖI Ở ĐÂY ---
    const { id: idString } = await params;
    const id = parseInt(idString);
    // ---------------------------

    await prisma.factory.delete({
      where: { id: id },
    });
    return NextResponse.json({ message: "Xóa thành công" }, { status: 200 });
  } catch (error) {
    console.error("Lỗi DELETE:", error);
    return NextResponse.json(
      { error: "Không xóa được, có thể do ràng buộc dữ liệu" },
      { status: 500 }
    );
  }
}
