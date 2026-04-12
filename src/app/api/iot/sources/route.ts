import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

    const sources = await prisma.iotSource.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { machineMaps: true, itemMaps: true, importLogs: true } },
      },
    });
    return NextResponse.json(sources);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi tải danh sách nguồn IoT" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    if ((session.user as any).role !== "ADMIN" && (session.user as any).accessLevel !== "MANAGER") {
      return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
    }

    const body = await req.json();
    const { name, description, fileFormat } = body;
    if (!name) return NextResponse.json({ error: "Tên nguồn bắt buộc" }, { status: 400 });

    const exists = await prisma.iotSource.findUnique({ where: { name } });
    if (exists) return NextResponse.json({ error: "Tên nguồn đã tồn tại" }, { status: 409 });

    const source = await (prisma.iotSource.create as any)({
      data: { name, description, fileFormat: fileFormat || "STANDARD" },
    });
    return NextResponse.json(source, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi tạo nguồn IoT" }, { status: 500 });
  }
}
