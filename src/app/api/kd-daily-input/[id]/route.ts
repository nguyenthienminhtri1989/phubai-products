import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

type RouteParams = { params: Promise<{ id: string }> };

// ============================================================
// PUT — Cập nhật 1 bản ghi KdDailyInput
// Body: { outputKg?, note? }
// ============================================================
export async function PUT(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const recordId = parseInt(id);
  if (isNaN(recordId))
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  try {
    const body = await request.json();
    const { outputKg, note } = body;

    if (typeof outputKg !== "number" || outputKg < 0) {
      return NextResponse.json(
        { error: "outputKg phải là số >= 0" },
        { status: 400 }
      );
    }

    const updated = await prisma.kdDailyInput.update({
      where: { id: recordId },
      data: {
        outputKg,
        note: note ?? null,
        updatedAt: new Date(),
      },
      include: {
        machine: { include: { process: true } },
        item: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.code === "P2025")
      return NextResponse.json({ error: "Không tìm thấy bản ghi" }, { status: 404 });
    console.error("KdDailyInput PUT error:", error);
    return NextResponse.json({ error: "Lỗi cập nhật" }, { status: 500 });
  }
}

// ============================================================
// DELETE — Xóa 1 bản ghi KdDailyInput
// ============================================================
export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const recordId = parseInt(id);
  if (isNaN(recordId))
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  try {
    await prisma.kdDailyInput.delete({ where: { id: recordId } });
    return NextResponse.json({ success: true, message: "Đã xóa bản ghi" });
  } catch (error: any) {
    if (error.code === "P2025")
      return NextResponse.json({ error: "Không tìm thấy bản ghi" }, { status: 404 });
    console.error("KdDailyInput DELETE error:", error);
    return NextResponse.json({ error: "Lỗi xóa bản ghi" }, { status: 500 });
  }
}
