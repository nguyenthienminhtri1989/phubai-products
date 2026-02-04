import { error } from "console";
// app/api/machines/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { message } from "antd";

// HÀM CẬP NHẬT THÔNG TIN MÁY
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const data = await params; // Đợi dữ liệu từ Promise params
    const idString = data.id; // Gán id dạng chuỗi cho idString
    const id = parseInt(idString); // Đỗi chuỗi thành số
    const body = await request.json(); // Lấy dữ liệu từ Client gửi lên

    const updatedMachine = await prisma.machine.update({
      where: { id: id },
      data: {
        name: body.name,
        isActive: body.isActive,
        processId: parseInt(body.processId),
        formulaType: parseInt(body.formulaType),
        spindleCount: body.spindleCount ? parseInt(body.spindleCount) : null,
        currentItemId: body.currentItemId ? parseInt(body.currentItemId) : null,
        currentNE: body.currentNE ? parseFloat(body.currentNE) : null,
      },
    });

    return NextResponse.json(updatedMachine);
  } catch (error) {
    return NextResponse.json(
      { error: "Lỗi cập nhật: " + error },
      { status: 500 }
    );
  }
}

// HÀM XÓA MÁY
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const data = await params; // Đợi dữ liệu từ Promise params
    const idString = data.id; // Gán id dạng chuỗi cho idString
    const id = parseInt(idString); // Đỗi chuỗi thành số

    await prisma.machine.delete({
      where: { id: id },
    });

    return NextResponse.json({ message: "Đã xóa xong" }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Không thể xóa (Có dữ liệu sản xuất liên quan): " + error },
      { status: 500 }
    );
  }
}
