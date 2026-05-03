import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

async function requireAdmin() {
  const session = await auth();
  if ((session?.user as any)?.userRole !== "ADMIN") return null;
  return session;
}

// GET: Lấy danh sách tất cả trang (cho UI admin phân quyền)
export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
    }

    const pages = await prisma.pageRegistry.findMany({
      orderBy: [{ pageGroup: "asc" }, { sortOrder: "asc" }],
    });

    return NextResponse.json(pages);
  } catch (error) {
    console.error("Get PageRegistry Error:", error);
    return NextResponse.json({ error: "Lỗi tải danh sách trang" }, { status: 500 });
  }
}

// POST: Tạo trang mới (hoặc upsert theo pageKey)
export async function POST(req: Request) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
    }

    const body = await req.json();
    const { pageKey, pageName, pageGroup, path, sortOrder } = body;

    if (!pageKey || !pageName || !pageGroup || !path) {
      return NextResponse.json({ error: "Thiếu thông tin bắt buộc" }, { status: 400 });
    }
    if (!/^[a-z0-9._-]+$/.test(pageKey)) {
      return NextResponse.json(
        { error: "pageKey chỉ được chứa chữ thường, số, dấu chấm, gạch ngang" },
        { status: 400 }
      );
    }

    const result = await prisma.pageRegistry.upsert({
      where: { pageKey },
      update: { pageName, pageGroup, path, sortOrder: sortOrder ?? 50 },
      create: { pageKey, pageName, pageGroup, path, sortOrder: sortOrder ?? 50 },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("POST PageRegistry Error:", error);
    if (error.code === "P2002") {
      return NextResponse.json({ error: "pageKey đã tồn tại" }, { status: 409 });
    }
    return NextResponse.json({ error: "Lỗi tạo trang" }, { status: 500 });
  }
}

// PUT: Cập nhật trang theo id
export async function PUT(req: Request) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
    }

    const body = await req.json();
    const { id, pageKey, pageName, pageGroup, path, sortOrder } = body;

    if (!id) {
      return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
    }

    const result = await prisma.pageRegistry.update({
      where: { id: Number(id) },
      data: { pageKey, pageName, pageGroup, path, sortOrder: sortOrder ?? 50 },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("PUT PageRegistry Error:", error);
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Trang không tồn tại" }, { status: 404 });
    }
    return NextResponse.json({ error: "Lỗi cập nhật trang" }, { status: 500 });
  }
}

// DELETE: Xoá trang theo id
export async function DELETE(req: Request) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Thiếu id" }, { status: 400 });
    }

    await prisma.pageRegistry.delete({ where: { id: Number(id) } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE PageRegistry Error:", error);
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Trang không tồn tại" }, { status: 404 });
    }
    return NextResponse.json({ error: "Lỗi xoá trang" }, { status: 500 });
  }
}
