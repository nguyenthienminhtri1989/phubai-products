import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("activeOnly") === "true";

  const categories = await prisma.stopCategory.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { id: "asc" },
  });

  return NextResponse.json(categories);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Chỉ Admin mới được thực hiện thao tác này" }, { status: 403 });
  }

  const body = await request.json();
  const { name, color } = body;

  if (!name || !color) {
    return NextResponse.json({ error: "Thiếu tên hoặc màu sắc" }, { status: 400 });
  }

  const category = await prisma.stopCategory.create({
    data: { name, color, isDefault: false, isActive: true },
  });

  return NextResponse.json(category);
}
