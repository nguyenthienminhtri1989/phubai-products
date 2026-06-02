import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/kdsx/raw-material-rates/new-version
 *
 * Tạo phiên bản định mức mới (versioning):
 * 1. Đóng record hiện tại: effectiveTo = effectiveFrom_mới - 1 ngày
 * 2. INSERT record mới với effectiveFrom = ngày áp dụng, effectiveTo = NULL
 *
 * Body: { currentId, effectiveFrom, cottonRate, cottonRatio, peRate, note }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  const KDSX_EDIT_ROLES = ["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"];
  if (!userRole || !KDSX_EDIT_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { currentId, effectiveFrom, cottonRate, cottonRatio, peRate, note } = body;

  if (!currentId || !effectiveFrom) {
    return NextResponse.json({ error: "Thiếu currentId hoặc effectiveFrom" }, { status: 400 });
  }

  const current = await prisma.rawMaterialRate.findUnique({ where: { id: Number(currentId) } });
  if (!current) {
    return NextResponse.json({ error: "Không tìm thấy định mức hiện tại" }, { status: 404 });
  }

  const newEffectiveFrom = new Date(effectiveFrom);

  // effectiveTo của record cũ = ngày áp dụng mới - 1 ngày
  const oldEffectiveTo = new Date(newEffectiveFrom);
  oldEffectiveTo.setDate(oldEffectiveTo.getDate() - 1);

  // Kiểm tra: ngày mới phải sau ngày bắt đầu của record cũ
  if (newEffectiveFrom <= current.effectiveFrom) {
    return NextResponse.json(
      { error: "Ngày áp dụng mới phải sau ngày hiệu lực của phiên bản hiện tại" },
      { status: 400 }
    );
  }

  const [, newRate] = await prisma.$transaction([
    // Đóng record cũ
    prisma.rawMaterialRate.update({
      where: { id: Number(currentId) },
      data: { effectiveTo: oldEffectiveTo },
    }),
    // Tạo record mới
    prisma.rawMaterialRate.create({
      data: {
        itemId: current.itemId,
        cottonRate: cottonRate ?? null,
        cottonRatio: cottonRatio != null ? Number(cottonRatio) : 1.0,
        peRate: peRate ?? null,
        effectiveFrom: newEffectiveFrom,
        effectiveTo: null,
        note: note || null,
      },
      include: { item: { select: { id: true, name: true } } },
    }),
  ]);

  return NextResponse.json(newRate, { status: 201 });
}
