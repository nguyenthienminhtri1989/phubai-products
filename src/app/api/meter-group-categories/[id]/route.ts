import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

interface Params {
  params: Promise<{ id: string }>;
}

// PUT: Cập nhật (chỉ ADMIN, cho phép đổi cả groupCode)
export async function PUT(req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Không có quyền thực hiện thao tác này" }, { status: 403 });
    }

    const { id } = await params;
    const recordId = parseInt(id, 10);
    if (isNaN(recordId)) {
      return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
    }

    const body = await req.json();
    const { groupCode, groupName, note } = body as {
      groupCode?: string;
      groupName?: string;
      note?: string;
    };

    if (!groupCode || !groupName) {
      return NextResponse.json({ error: "Mã nhóm và Tên nhóm là bắt buộc" }, { status: 400 });
    }

    const trimmedCode = groupCode.trim().toUpperCase();
    const trimmedName = groupName.trim();

    // Kiểm tra trùng mã với record khác
    const existingCode = await prisma.meterGroupCategory.findFirst({
      where: { groupCode: trimmedCode, NOT: { id: recordId } },
    });
    if (existingCode) {
      return NextResponse.json({ error: "Mã nhóm đã tồn tại" }, { status: 409 });
    }

    // Kiểm tra trùng tên với record khác
    const existingName = await prisma.meterGroupCategory.findFirst({
      where: { groupName: trimmedName, NOT: { id: recordId } },
    });
    if (existingName) {
      return NextResponse.json({ error: "Tên nhóm đã tồn tại" }, { status: 409 });
    }

    const updated = await prisma.meterGroupCategory.update({
      where: { id: recordId },
      data: { groupCode: trimmedCode, groupName: trimmedName, note: note?.trim() || null },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2025") {
      return NextResponse.json({ error: "Không tìm thấy nhóm đồng hồ" }, { status: 404 });
    }
    return NextResponse.json({ error: "Lỗi cập nhật nhóm đồng hồ" }, { status: 500 });
  }
}

// DELETE: Xóa (chỉ ADMIN)
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Không có quyền thực hiện thao tác này" }, { status: 403 });
    }

    const { id } = await params;
    const recordId = parseInt(id, 10);
    if (isNaN(recordId)) {
      return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
    }

    await prisma.meterGroupCategory.delete({ where: { id: recordId } });

    return NextResponse.json({ message: "Đã xóa nhóm đồng hồ thành công" });
  } catch (error) {
    console.error(error);
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2025") {
      return NextResponse.json({ error: "Không tìm thấy nhóm đồng hồ" }, { status: 404 });
    }
    return NextResponse.json({ error: "Lỗi xóa nhóm đồng hồ" }, { status: 500 });
  }
}
