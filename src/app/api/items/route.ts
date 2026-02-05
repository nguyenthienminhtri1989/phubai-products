import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// 1. GET: Lấy danh sách (Có lọc)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];
    }

    const items = await prisma.item.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { productionLogs: true } },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi tải danh sách" }, { status: 500 });
  }
}

// 2. POST: Tạo mới
export async function POST(req: Request) {
  try {
    const session = await auth();
    // Check quyền Admin hoặc Manager
    if (
      session?.user?.role !== "ADMIN" &&
      session?.user?.accessLevel !== "MANAGER"
    ) {
      return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
    }

    const body = await req.json();
    const { name, code, ne, composition, twist, weavingStyle, material } = body;

    if (!name)
      return NextResponse.json({ error: "Tên bắt buộc" }, { status: 400 });

    // Check trùng tên
    const exists = await prisma.item.findUnique({ where: { name } });
    if (exists)
      return NextResponse.json({ error: "Tên đã tồn tại" }, { status: 409 });

    const newItem = await prisma.item.create({
      data: {
        name,
        code,
        ne: ne ? parseInt(ne) : null,
        composition,
        twist: twist ? parseInt(twist) : null,
        weavingStyle,
        material,
      },
    });

    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi tạo mới" }, { status: 500 });
  }
}
