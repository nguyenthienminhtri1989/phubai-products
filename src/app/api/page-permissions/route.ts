import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// GET: Lấy quyền hiện tại của 1 user (theo userId query param)
export async function GET(req: Request) {
  try {
    const session = await auth();
    if ((session?.user as any)?.userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Không có quyền truy cập" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json(
        { error: "Thiếu userId" },
        { status: 400 }
      );
    }

    const permissions = await prisma.pagePermission.findMany({
      where: { userId: parseInt(userId) },
      include: {
        page: {
          select: {
            id: true,
            pageKey: true,
            pageName: true,
            pageGroup: true,
            path: true,
            sortOrder: true,
          },
        },
      },
      orderBy: { page: { sortOrder: "asc" } },
    });

    return NextResponse.json(permissions);
  } catch (error) {
    console.error("Get PagePermissions Error:", error);
    return NextResponse.json(
      { error: "Lỗi tải quyền" },
      { status: 500 }
    );
  }
}

// PUT: Cập nhật hàng loạt quyền cho 1 user
// Body: { userId: number, permissions: [{ pageId: number, canView: boolean, canEdit: boolean }] }
export async function PUT(req: Request) {
  try {
    const session = await auth();
    if ((session?.user as any)?.userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Không có quyền truy cập" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { userId, permissions } = body;

    if (!userId || !Array.isArray(permissions)) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ" },
        { status: 400 }
      );
    }

    const userIdInt = parseInt(userId);

    // Xóa toàn bộ quyền cũ rồi tạo lại (upsert batch)
    await prisma.$transaction(async (tx) => {
      // Xóa tất cả permissions hiện tại
      await tx.pagePermission.deleteMany({
        where: { userId: userIdInt },
      });

      // Chỉ tạo lại các permissions đã được check (canView hoặc canEdit = true)
      const toCreate = permissions.filter(
        (p: any) => p.canView || p.canEdit
      );

      if (toCreate.length > 0) {
        await tx.pagePermission.createMany({
          data: toCreate.map((p: any) => ({
            userId: userIdInt,
            pageId: p.pageId,
            canView: !!p.canView,
            canEdit: !!p.canEdit,
          })),
        });
      }
    });

    return NextResponse.json({ success: true, count: permissions.length });
  } catch (error) {
    console.error("Update PagePermissions Error:", error);
    return NextResponse.json(
      { error: "Lỗi cập nhật quyền" },
      { status: 500 }
    );
  }
}
