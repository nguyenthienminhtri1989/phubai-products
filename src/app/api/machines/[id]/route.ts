import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Xử lý update từng trường một để an toàn
    const updated = await prisma.machine.update({
      where: { id: parseInt(id) },
      data: {
        name: body.name,
        processId: parseInt(body.processId),
        formulaType: parseInt(body.formulaType),
        spindleCount: body.spindleCount,
        isActive: body.isActive,
        // Không update currentItemId ở đây, dùng API Batch kia chuyên nghiệp hơn
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: "Lỗi cập nhật" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    // Check ràng buộc: Máy đã sản xuất chưa?
    const count = await prisma.productionLog.count({
      where: { machineId: parseInt(id) },
    });
    if (count > 0)
      return NextResponse.json(
        {
          error:
            "Máy đã có dữ liệu sản xuất, chỉ được phép Tắt hoạt động (Disable) chứ không thể Xóa!",
        },
        { status: 400 },
      );

    await prisma.machine.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ message: "Đã xóa" });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi xóa" }, { status: 500 });
  }
}
