import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// GET: Lấy danh sách tất cả trang (cho UI admin phân quyền)
export async function GET() {
  try {
    const session = await auth();
    if ((session?.user as any)?.userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Không có quyền truy cập" },
        { status: 403 }
      );
    }

    const pages = await prisma.pageRegistry.findMany({
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(pages);
  } catch (error) {
    console.error("Get PageRegistry Error:", error);
    return NextResponse.json(
      { error: "Lỗi tải danh sách trang" },
      { status: 500 }
    );
  }
}
