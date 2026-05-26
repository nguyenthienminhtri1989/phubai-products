import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId");

  const rates = await prisma.rawMaterialRate.findMany({
    where: {
      ...(itemId ? { itemId: Number(itemId) } : {}),
    },
    include: { item: { select: { id: true, name: true, code: true } } },
    orderBy: { effectiveFrom: "desc" },
  });
  return NextResponse.json(rates);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  const KDSX_EDIT_ROLES = ["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"];
  if (!userRole || !KDSX_EDIT_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    itemId,
    cottonRate,
    cottonRatio,
    peRate,
    effectiveFrom,
    effectiveTo,
    note,
  } = body;
  if (!itemId || !effectiveFrom) {
    return NextResponse.json(
      { error: "Thiếu itemId hoặc effectiveFrom" },
      { status: 400 },
    );
  }

  const rate = await prisma.rawMaterialRate.create({
    data: {
      itemId: Number(itemId),
      cottonRate: cottonRate ?? null,
      cottonRatio: cottonRatio != null ? Number(cottonRatio) : 1.0,
      peRate: peRate ?? null,
      effectiveFrom: new Date(effectiveFrom),
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      note: note || null,
    },
    include: { item: { select: { id: true, name: true } } },
  });
  return NextResponse.json(rate, { status: 201 });
}
