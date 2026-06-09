import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

interface SessionUser {
  userRole?: string;
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    const body = await req.json();
    const { machineIds, itemId, currentNE } = body;
    const hasItemUpdate = itemId !== undefined && itemId !== null && itemId !== "";
    const hasNeUpdate = currentNE !== undefined && currentNE !== null && currentNE !== "";

    if (!Array.isArray(machineIds) || machineIds.length === 0 || (!hasItemUpdate && !hasNeUpdate)) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ" },
        { status: 400 },
      );
    }

    const machineIdNumbers = machineIds
      .map((id: unknown) => parseInt(String(id), 10))
      .filter(Number.isFinite);
    if (machineIdNumbers.length !== machineIds.length) {
      return NextResponse.json(
        { error: "Danh sách máy không hợp lệ" },
        { status: 400 },
      );
    }

    // Batch update nhiều máy từ trang Machines chỉ dành cho Admin/Manager.
    // Update 1 máy từ trang nhập sản lượng thì operator cũng được.
    const userRole = (session.user as SessionUser)?.userRole;
    const isAdmin = userRole === "ADMIN";
    const isManager = [
      "ADMIN",
      "DIRECTOR",
      "FACTORY_MANAGER",
      "STATISTICIAN",
    ].includes(userRole ?? "");
    if (machineIdNumbers.length > 1 && !isAdmin && !isManager) {
      return NextResponse.json(
        { error: "Chỉ Admin hoặc Manager mới được điều phối hàng loạt" },
        { status: 403 },
      );
    }

    const dataToUpdate: { currentItemId?: number; currentNE?: number } = {};

    if (hasItemUpdate) {
      const parsedItemId = parseInt(String(itemId), 10);
      if (!Number.isFinite(parsedItemId)) {
        return NextResponse.json(
          { error: "Mặt hàng không hợp lệ" },
          { status: 400 },
        );
      }

      const item = await prisma.item.findUnique({
        where: { id: parsedItemId },
      });
      if (!item) {
        return NextResponse.json(
          { error: "Mặt hàng không tồn tại" },
          { status: 404 },
        );
      }

      dataToUpdate.currentItemId = item.id;
    }

    if (hasNeUpdate) {
      const parsedNE = parseFloat(String(currentNE));
      if (!Number.isFinite(parsedNE) || parsedNE <= 0) {
        return NextResponse.json(
          { error: "Chi số NE không hợp lệ" },
          { status: 400 },
        );
      }

      dataToUpdate.currentNE = parsedNE;
    }

    await prisma.machine.updateMany({
      where: {
        id: { in: machineIdNumbers },
      },
      data: dataToUpdate,
    });

    return NextResponse.json({
      message: `Đã điều phối xong ${machineIdNumbers.length} máy!`,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}
