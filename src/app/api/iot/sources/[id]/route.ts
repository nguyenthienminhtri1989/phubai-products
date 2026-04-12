import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    if ((session.user as any).role !== "ADMIN" && (session.user as any).accessLevel !== "MANAGER") {
      return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, description, fileFormat, isActive } = body;

    const updated = await prisma.iotSource.update({
      where: { id: parseInt(id) },
      data: { name, description, ...(fileFormat && { fileFormat }), isActive },
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error(error);
    if (error.code === "P2002") return NextResponse.json({ error: "Tên nguồn đã tồn tại" }, { status: 409 });
    return NextResponse.json({ error: "Lỗi cập nhật nguồn IoT" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    if ((session.user as any).role !== "ADMIN" && (session.user as any).accessLevel !== "MANAGER") {
      return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
    }

    const { id } = await params;
    const sourceId = parseInt(id);

    // Không cho xóa nếu đã có import logs
    const logCount = await prisma.iotImportLog.count({ where: { sourceId } });
    if (logCount > 0) {
      return NextResponse.json(
        { error: `Không thể xóa nguồn đã có ${logCount} lần import. Vui lòng tắt thay vì xóa.` },
        { status: 400 }
      );
    }

    await prisma.iotSource.delete({ where: { id: sourceId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi xóa nguồn IoT" }, { status: 500 });
  }
}
