import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// GET: Lấy danh sách tất cả nhóm đồng hồ (mọi user)
export async function GET() {
  try {
    const groups = await prisma.meterGroupCategory.findMany({
      orderBy: { groupCode: "asc" },
    });
    return NextResponse.json(groups);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi tải danh sách nhóm đồng hồ" }, { status: 500 });
  }
}

// POST: Tạo mới (chỉ ADMIN)
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Không có quyền thực hiện thao tác này" }, { status: 403 });
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

    const existingCode = await prisma.meterGroupCategory.findUnique({ where: { groupCode } });
    if (existingCode) {
      return NextResponse.json({ error: "Mã nhóm đã tồn tại" }, { status: 409 });
    }

    const existingName = await prisma.meterGroupCategory.findUnique({ where: { groupName } });
    if (existingName) {
      return NextResponse.json({ error: "Tên nhóm đã tồn tại" }, { status: 409 });
    }

    const created = await prisma.meterGroupCategory.create({
      data: {
        groupCode: groupCode.trim().toUpperCase(),
        groupName: groupName.trim(),
        note: note?.trim() || null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi tạo mới nhóm đồng hồ" }, { status: 500 });
  }
}
