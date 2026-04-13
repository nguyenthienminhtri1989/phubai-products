import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function POST(req: Request) {
  try {
    const session = await auth();
    // Yêu cầu đăng nhập, không phân biệt role — operator cũng cần cập nhật điều phối khi nhập liệu
    if (!session?.user) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    const body = await req.json();
    const { machineIds, itemId } = body;

    // Batch update nhiều máy (từ trang Machines) chỉ dành cho ADMIN/MANAGER
    // Còn update 1 máy (từ trang nhập sản lượng) thì ai cũng được
    const isAdmin = (session.user as any).role === "ADMIN";
    const isManager = (session.user as any).accessLevel === "MANAGER";
    if (machineIds.length > 1 && !isAdmin && !isManager) {
      return NextResponse.json(
        { error: "Chỉ Admin hoặc Manager mới được điều phối hàng loạt" },
        { status: 403 },
      );
    }

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
    // Chỉ cập nhật currentItemId, không tự động thay đổi currentNE
    await prisma.machine.updateMany({
      where: {
        id: { in: machineIds },
      },
      data: {
        currentItemId: item.id,
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
