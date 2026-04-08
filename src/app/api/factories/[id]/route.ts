// app/api/factories/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// 1. HÀM PUT: Cập nhật thông tin (chỉ ADMIN)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới được sửa nhà máy" }, { status: 403 });
    }

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

// 2. HÀM DELETE: Xóa nhà máy (chỉ ADMIN)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới được xóa nhà máy" }, { status: 403 });
    }

    const { id: idString } = await params;
    const id = parseInt(idString);

    // Kiểm tra dữ liệu liên kết trước khi xóa
    const [processCount, substationCount, powerMeterCount] = await Promise.all([
      prisma.process.count({ where: { factoryId: id } }),
      prisma.substation.count({ where: { factoryId: id } }),
      prisma.powerMeter.count({ where: { factoryId: id } }),
    ]);

    if (processCount + substationCount + powerMeterCount > 0) {
      const parts = [
        processCount > 0 ? `${processCount} công đoạn` : "",
        substationCount > 0 ? `${substationCount} trạm điện` : "",
        powerMeterCount > 0 ? `${powerMeterCount} đồng hồ điện` : "",
      ].filter(Boolean).join(", ");
      return NextResponse.json(
        { error: `Không thể xóa: nhà máy đang có ${parts} liên kết. Hãy xóa các mục đó trước.` },
        { status: 400 }
      );
    }

    await prisma.factory.delete({ where: { id } });
    return NextResponse.json({ message: "Xóa thành công" }, { status: 200 });
  } catch (error) {
    console.error("Lỗi DELETE:", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ khi xóa nhà máy" },
      { status: 500 }
    );
  }
}
