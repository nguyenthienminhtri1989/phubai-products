import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET: list tất cả MaterialType (filter ?category=COTTON|PE, ?isActive=true)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const isActiveStr = searchParams.get("isActive");

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (isActiveStr !== null) where.isActive = isActiveStr === "true";

  const types = await prisma.materialType.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(types);
}

// POST: tạo mới { code, name, category, note? }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRole = (session.user as any)?.userRole as string | undefined;
  if (userRole !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden — chỉ Admin mới được thêm loại NVL" },
      { status: 403 },
    );
  }

  const body = await req.json();
  const { code, name, category, note } = body;

  if (!code || !name || !category) {
    return NextResponse.json(
      { error: "Thiếu code, name hoặc category" },
      { status: 400 },
    );
  }
  if (!["COTTON", "PE"].includes(category)) {
    return NextResponse.json(
      { error: "category phải là COTTON hoặc PE" },
      { status: 400 },
    );
  }

  try {
    const mt = await prisma.materialType.create({
      data: {
        code: code.toUpperCase().trim(),
        name: name.trim(),
        category,
        note: note || null,
        isActive: true,
      },
    });
    return NextResponse.json(mt, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json(
        { error: "Mã code đã tồn tại" },
        { status: 409 },
      );
    }
    throw e;
  }
}
