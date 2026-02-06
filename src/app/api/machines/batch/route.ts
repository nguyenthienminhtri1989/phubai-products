import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function POST(req: Request) {
  try {
    const session = await auth();
    // Chỉ Admin hoặc Manager mới được điều phối
    if (
      session?.user?.role !== "ADMIN" &&
      session?.user?.accessLevel !== "MANAGER"
    ) {
      return NextResponse.json(
        { error: "Không có quyền điều phối" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { machineIds, itemId } = body;

    if (!machineIds || machineIds.length === 0 || !itemId) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ" },
        { status: 400 },
      );
    }

    // 1. Lấy thông tin Mặt hàng để biết NE mặc định
    const item = await prisma.item.findUnique({
      where: { id: parseInt(itemId) },
    });
    if (!item)
      return NextResponse.json(
        { error: "Mặt hàng không tồn tại" },
        { status: 404 },
      );

    // 2. Cập nhật hàng loạt (Batch Update)
    // Cập nhật cả currentItemId và currentNE (lấy theo NE của mặt hàng)
    await prisma.machine.updateMany({
      where: {
        id: { in: machineIds },
      },
      data: {
        currentItemId: item.id,
        currentNE: item.ne || 0, // Tự động set NE theo mặt hàng để công nhân đỡ phải nhập
      },
    });

    return NextResponse.json({
      message: `Đã điều phối xong ${machineIds.length} máy!`,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}
