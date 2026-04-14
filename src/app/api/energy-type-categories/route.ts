import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// GET: Lấy danh sách tất cả loại điện năng (mọi user)
export async function GET() {
  try {
    const items = await prisma.energyTypeCategory.findMany({
      orderBy: { code: "asc" },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi tải danh sách loại điện năng" }, { status: 500 });
  }
}

// POST: Tạo mới (chỉ ADMIN)
export async function POST(req: Request) {
  try {
    const session = await auth();
    if ((session?.user as any)?.userRole !== "ADMIN") {
      return NextResponse.json({ error: "Không có quyền thực hiện thao tác này" }, { status: 403 });
    }

    const body = await req.json();
    const { code, name, note } = body as { code?: string; name?: string; note?: string };

    if (!code || !name) {
      return NextResponse.json({ error: "Mã loại điện và Tên loại điện là bắt buộc" }, { status: 400 });
    }

    const existingCode = await prisma.energyTypeCategory.findUnique({ where: { code } });
    if (existingCode) {
      return NextResponse.json({ error: "Mã loại điện đã tồn tại" }, { status: 409 });
    }

    const existingName = await prisma.energyTypeCategory.findUnique({ where: { name } });
    if (existingName) {
      return NextResponse.json({ error: "Tên loại điện đã tồn tại" }, { status: 409 });
    }

    const created = await prisma.energyTypeCategory.create({
      data: { code: code.trim().toUpperCase(), name: name.trim(), note: note?.trim() || null },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi tạo mới loại điện năng" }, { status: 500 });
  }
}
