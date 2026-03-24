import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// GET: Lấy danh sách tất cả ca làm việc (mọi user)
export async function GET() {
  try {
    const shifts = await prisma.shiftCategory.findMany({
      orderBy: { code: "asc" },
    });
    return NextResponse.json(shifts);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi tải danh sách ca làm việc" }, { status: 500 });
  }
}

// POST: Tạo mới ca làm việc (chỉ ADMIN)
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Không có quyền thực hiện thao tác này" }, { status: 403 });
    }

    const body = await req.json();
    const { code, name, note } = body;

    if (!code || !name) {
      return NextResponse.json({ error: "Mã ca và Tên ca là bắt buộc" }, { status: 400 });
    }

    // Kiểm tra trùng mã
    const existingCode = await prisma.shiftCategory.findUnique({ where: { code } });
    if (existingCode) {
      return NextResponse.json({ error: "Mã ca đã tồn tại" }, { status: 409 });
    }

    // Kiểm tra trùng tên
    const existingName = await prisma.shiftCategory.findUnique({ where: { name } });
    if (existingName) {
      return NextResponse.json({ error: "Tên ca đã tồn tại" }, { status: 409 });
    }

    const newShift = await prisma.shiftCategory.create({
      data: { code: code.trim().toUpperCase(), name: name.trim(), note: note?.trim() || null },
    });

    return NextResponse.json(newShift, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi tạo mới ca làm việc" }, { status: 500 });
  }
}
