import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

interface Params {
  params: Promise<{ code: string }>;
}

// PUT: Cập nhật (chỉ ADMIN, cho phép đổi cả code)
export async function PUT(req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Không có quyền thực hiện thao tác này" }, { status: 403 });
    }

    const { code: oldCode } = await params;
    const body = await req.json();
    const { code: newCode, name, note } = body as { code?: string; name?: string; note?: string };

    if (!newCode || !name) {
      return NextResponse.json({ error: "Mã loại điện và Tên loại điện là bắt buộc" }, { status: 400 });
    }

    const trimmedCode = newCode.trim().toUpperCase();
    const trimmedName = name.trim();

    // Kiểm tra trùng tên với record khác
    const existingName = await prisma.energyTypeCategory.findFirst({
      where: { name: trimmedName, NOT: { code: oldCode } },
    });
    if (existingName) {
      return NextResponse.json({ error: "Tên loại điện đã tồn tại" }, { status: 409 });
    }

    let result;

    if (trimmedCode !== oldCode) {
      // Code thay đổi: kiểm tra trùng code mới, rồi xóa cũ + tạo mới trong transaction
      const existingCode = await prisma.energyTypeCategory.findUnique({ where: { code: trimmedCode } });
      if (existingCode) {
        return NextResponse.json({ error: "Mã loại điện đã tồn tại" }, { status: 409 });
      }

      const [created] = await prisma.$transaction([
        prisma.energyTypeCategory.create({
          data: { code: trimmedCode, name: trimmedName, note: note?.trim() || null },
        }),
        prisma.energyTypeCategory.delete({ where: { code: oldCode } }),
      ]);
      result = created;
    } else {
      // Chỉ sửa name/note
      result = await prisma.energyTypeCategory.update({
        where: { code: oldCode },
        data: { name: trimmedName, note: note?.trim() || null },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2025") {
      return NextResponse.json({ error: "Không tìm thấy loại điện năng" }, { status: 404 });
    }
    return NextResponse.json({ error: "Lỗi cập nhật loại điện năng" }, { status: 500 });
  }
}

// DELETE: Xóa (chỉ ADMIN)
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Không có quyền thực hiện thao tác này" }, { status: 403 });
    }

    const { code } = await params;

    await prisma.energyTypeCategory.delete({ where: { code } });

    return NextResponse.json({ message: "Đã xóa loại điện năng thành công" });
  } catch (error) {
    console.error(error);
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2025") {
      return NextResponse.json({ error: "Không tìm thấy loại điện năng" }, { status: 404 });
    }
    return NextResponse.json({ error: "Lỗi xóa loại điện năng" }, { status: 500 });
  }
}
