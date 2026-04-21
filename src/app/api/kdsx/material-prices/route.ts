import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET: list giá NVL (filter ?yearMonth=2026-04, ?category=COTTON|PE)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const yearMonth = searchParams.get("yearMonth");
  const category = searchParams.get("category");

  const prices = await prisma.materialPrice.findMany({
    where: {
      ...(yearMonth ? { yearMonth } : {}),
      ...(category ? { materialType: { category } } : {}),
    },
    include: {
      materialType: {
        select: {
          id: true,
          code: true,
          name: true,
          category: true,
          isActive: true,
        },
      },
    },
    orderBy: [
      { materialType: { category: "asc" } },
      { materialType: { name: "asc" } },
    ],
  });

  return NextResponse.json(prices);
}

// POST: tạo/cập nhật giá { materialTypeId, yearMonth, priceUsd, note? }
// Upsert theo unique(materialTypeId, yearMonth)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRole = (session.user as any)?.userRole as string | undefined;
  const ALLOWED_ROLES = ["ADMIN", "DIRECTOR", "FACTORY_MANAGER", "SALES"];
  if (!userRole || !ALLOWED_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { materialTypeId, yearMonth, priceUsd, note } = body;

  if (!materialTypeId || !yearMonth || priceUsd === undefined) {
    return NextResponse.json(
      { error: "Thiếu materialTypeId, yearMonth hoặc priceUsd" },
      { status: 400 },
    );
  }

  // Validate yearMonth format YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { error: "yearMonth phải có dạng YYYY-MM" },
      { status: 400 },
    );
  }

  const price = await prisma.materialPrice.upsert({
    where: {
      materialTypeId_yearMonth: {
        materialTypeId: Number(materialTypeId),
        yearMonth,
      },
    },
    create: {
      materialTypeId: Number(materialTypeId),
      yearMonth,
      priceUsd: Number(priceUsd),
      note: note || null,
    },
    update: {
      priceUsd: Number(priceUsd),
      note: note !== undefined ? note || null : undefined,
    },
    include: {
      materialType: {
        select: { id: true, code: true, name: true, category: true },
      },
    },
  });

  return NextResponse.json(price, { status: 201 });
}
