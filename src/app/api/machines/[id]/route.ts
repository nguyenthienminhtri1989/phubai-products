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
        currentNE: body.currentNE !== undefined ? (body.currentNE === null || body.currentNE === '' ? null : parseFloat(body.currentNE)) : undefined,
        ...(body.model !== undefined && { model: body.model || null }),
        ...(body.allowMultiItemPerShift !== undefined && { allowMultiItemPerShift: body.allowMultiItemPerShift }),
        // Lô sợi đang sản xuất (null để xóa liên kết)
        ...(body.currentLotId !== undefined && {
          currentLotId: body.currentLotId ? parseInt(body.currentLotId) : null,
        }),
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
