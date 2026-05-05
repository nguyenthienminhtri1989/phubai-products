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
    const userRole = (session?.user as any)?.userRole as string | undefined;
    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới được sửa mặt hàng" }, { status: 403 });
    }

    // Await params để lấy ID
    const { id } = await params;
    const itemId = parseInt(id);

    const body = await req.json();
    const { name, code, ne, composition, twist, weavingStyle, material, yarnType } = body;

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
        ...(yarnType !== undefined ? { yarnType } : {}),
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
    const userRole2 = (session?.user as any)?.userRole as string | undefined;
    if (userRole2 !== "ADMIN") {
      return NextResponse.json(
        { error: "Chỉ Admin được xóa" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const itemId = parseInt(id);

    if (isNaN(itemId)) {
      return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
    }

    // Kiểm tra toàn bộ ràng buộc trước khi xóa
    const counts = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        _count: {
          select: {
            productionLogs: true,
            productionLines: true,
            iotMaps: true,
            salesOrderItems: true,
            rawMaterialRates: true,
            planLineItems: true,
            actualLineItems: true,
            productivityBenchmarks: true,
            kdDailyInputs: true,
            runningOnMachines: true,
          },
        },
      },
    });

    if (!counts) {
      return NextResponse.json({ error: "Không tìm thấy mặt hàng" }, { status: 404 });
    }

    const blockers: string[] = [];
    const c = counts._count;
    if (c.productionLogs > 0)          blockers.push(`${c.productionLogs} bản ghi sản xuất`);
    if (c.kdDailyInputs > 0)           blockers.push(`${c.kdDailyInputs} bản ghi nhập liệu KD`);
    if (c.productivityBenchmarks > 0)  blockers.push(`${c.productivityBenchmarks} dòng định mức năng suất`);
    if (c.planLineItems > 0)           blockers.push(`${c.planLineItems} dòng kế hoạch KD-SX`);
    if (c.actualLineItems > 0)         blockers.push(`${c.actualLineItems} dòng thực tế KD-SX`);
    if (c.salesOrderItems > 0)         blockers.push(`${c.salesOrderItems} dòng đơn hàng`);
    if (c.rawMaterialRates > 0)        blockers.push(`${c.rawMaterialRates} dòng định mức tiêu hao`);
    if (c.productionLines > 0)         blockers.push(`${c.productionLines} dòng sản xuất`);
    if (c.iotMaps > 0)                 blockers.push(`${c.iotMaps} mapping IoT`);
    if (c.runningOnMachines > 0)       blockers.push(`${c.runningOnMachines} máy đang chạy`);

    if (blockers.length > 0) {
      return NextResponse.json(
        { error: `Không thể xóa — mặt hàng đang được dùng ở: ${blockers.join(", ")}` },
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
