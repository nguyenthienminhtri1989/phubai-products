import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/kdsx/raw-material-rates/new-version
 *
 * Tạo phiên bản định mức mới (versioning). 3 trường hợp:
 *
 * (a) Mặt hàng có active version (effectiveTo = NULL):
 *     → Đóng active: effectiveTo = effectiveFrom_mới - 1 ngày
 *     → INSERT record mới effectiveTo = NULL
 *
 * (b) Mặt hàng có version đã đóng, không có active:
 *     → Chỉ INSERT record mới, không động đến record cũ
 *
 * (c) Mặt hàng chưa có record nào:
 *     → Chỉ INSERT record mới
 *
 * Body: { itemId, effectiveFrom, cottonRate, cottonRatio, peRate, note }
 *   (không cần currentId — server tự tìm active version theo itemId)
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
  const { itemId, effectiveFrom, cottonRate, cottonRatio, peRate, note } = body;

  if (!itemId || !effectiveFrom) {
    return NextResponse.json({ error: "Thiếu itemId hoặc effectiveFrom" }, { status: 400 });
  }

  const newEffectiveFrom = new Date(effectiveFrom);

  // Tìm active version (effectiveTo = NULL) của item này — nếu có sẽ được đóng lại
  const activeVersion = await prisma.rawMaterialRate.findFirst({
    where: { itemId: Number(itemId), effectiveTo: null },
    orderBy: { effectiveFrom: "desc" },
  });

  // Kiểm tra ngày mới phải sau effectiveFrom của active version (nếu có)
  if (activeVersion && newEffectiveFrom <= activeVersion.effectiveFrom) {
    return NextResponse.json(
      {
        error: `Ngày áp dụng mới (${effectiveFrom}) phải sau ngày hiệu lực của phiên bản đang active (${activeVersion.effectiveFrom.toISOString().slice(0, 10)})`,
      },
      { status: 400 }
    );
  }

  // Kiểm tra overlap với bất kỳ record nào khác (không phải active version)
  // Tức là: có record nào khác đang chứa khoảng [effectiveFrom] không?
  const overlap = await prisma.rawMaterialRate.findFirst({
    where: {
      itemId: Number(itemId),
      effectiveFrom: { lte: newEffectiveFrom },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: newEffectiveFrom } }],
      ...(activeVersion ? { id: { not: activeVersion.id } } : {}),
    },
  });

  if (overlap) {
    const fromStr = overlap.effectiveFrom.toISOString().slice(0, 10);
    const toStr = overlap.effectiveTo ? overlap.effectiveTo.toISOString().slice(0, 10) : "không thời hạn";
    return NextResponse.json(
      {
        error: `Ngày áp dụng bị trùng với khoảng hiệu lực đã có (từ ${fromStr} đến ${toStr}). Vui lòng chọn ngày khác.`,
      },
      { status: 409 }
    );
  }

  // Transaction: đóng active (nếu có) + tạo record mới
  const oldEffectiveTo = new Date(newEffectiveFrom);
  oldEffectiveTo.setDate(oldEffectiveTo.getDate() - 1);

  let newRate;

  if (activeVersion) {
    // Có active version → đóng lại + tạo mới
    const [, created] = await prisma.$transaction([
      prisma.rawMaterialRate.update({
        where: { id: activeVersion.id },
        data: { effectiveTo: oldEffectiveTo },
      }),
      prisma.rawMaterialRate.create({
        data: {
          itemId: Number(itemId),
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
    newRate = created;
  } else {
    // Không có active version → chỉ tạo mới
    newRate = await prisma.rawMaterialRate.create({
      data: {
        itemId: Number(itemId),
        cottonRate: cottonRate ?? null,
        cottonRatio: cottonRatio != null ? Number(cottonRatio) : 1.0,
        peRate: peRate ?? null,
        effectiveFrom: newEffectiveFrom,
        effectiveTo: null,
        note: note || null,
      },
      include: { item: { select: { id: true, name: true } } },
    });
  }

  return NextResponse.json(newRate, { status: 201 });
}
