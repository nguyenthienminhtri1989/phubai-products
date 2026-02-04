import { error } from "console";
// app/api/processes/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { message } from "antd";

// --- PUT. HÀM CẬP NHẬT ---
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> } // Cú pháp an toàn
) {
  try {
    const data = await params; // Đợi dữ liệu từ Promise params
    const idString = data.id; // Gán id dạng chuỗi cho idString
    const id = parseInt(idString); // Biến đổi chuỗi thành số
    const body = await request.json(); // Lấy dữ liệu từ Client gửi lên
    const { name, factoryId } = body; // Destructuring

    // Gọi Prisma ra cập nhật dữ liệu
    // Đồng thời gán dữ liệu mới update cho biến updated để báo về client
    const updated = await prisma.process.update({
      where: { id: id },
      data: {
        name: name,
        factoryId: parseInt(factoryId),
      },
      include: { factory: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: "Lỗi cập nhật: " + error },
      { status: 500 }
    );
  }
}

// --- DELETE. HÀM XÓA ---
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> } // Cú pháp an toàn
) {
  try {
    const data = await params;
    const idString = data.id;
    const id = parseInt(idString);

    await prisma.process.delete({
      where: { id: id },
    });

    return NextResponse.json(
      { message: "Đã xóa thành công!" },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Lỗi xóa dữ liệu ở server: " + error },
      { status: 500 }
    );
  }
}
