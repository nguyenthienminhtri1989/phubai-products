import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/kdsx/item-monthly-materials?yearMonth=2026-05
// Trả về tất cả mặt hàng + định mức hiệu lực + cấu hình NVL của tháng
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const yearMonth = new URL(req.url).searchParams.get("yearMonth") ?? "";
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { error: "yearMonth không hợp lệ" },
      { status: 400 },
    );
  }

  // Tính khoảng ngày của tháng đang xem
  const [yr, mo] = yearMonth.split("-").map(Number);
  const monthStart = new Date(yr, mo - 1, 1); // VD: 1/5/2026
  const monthEnd = new Date(yr, mo, 0); // VD: 31/5/2026

  const items = await prisma.item.findMany({
    where: { isActive: true },
    include: {
      // Định mức hiệu lực TẠI tháng đang xem (không phải chỉ bản ghi đang hiệu lực hôm nay)
      rawMaterialRates: {
        where: {
          effectiveFrom: { lte: monthEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }],
        },
        take: 1,
        orderBy: { effectiveFrom: "desc" },
      },
      monthlyMaterials: {
        where: { yearMonth },
        include: {
          cottonMaterialType: {
            select: { id: true, name: true, category: true },
          },
          peMaterialType: { select: { id: true, name: true, category: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = items.map((item) => {
    const rate = item.rawMaterialRates[0];
    const mm = item.monthlyMaterials[0];
    return {
      itemId: item.id,
      itemName: item.name,
      cottonRatio: rate?.cottonRatio ?? null,
      cottonRate: rate?.cottonRate ?? null,
      peRate: rate?.peRate ?? null,
      isPureCotton: (rate?.cottonRatio ?? 1) >= 1.0,
      cottonMaterialType: mm?.cottonMaterialType ?? null,
      peMaterialType: mm?.peMaterialType ?? null,
      note: mm?.note ?? null,
    };
  });

  return NextResponse.json({ rows });
}

// POST /api/kdsx/item-monthly-materials
// Body: { yearMonth, items: [{ itemId, cottonMaterialTypeId, peMaterialTypeId, note? }] }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { yearMonth, items } = await req.json();
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { error: "yearMonth không hợp lệ" },
      { status: 400 },
    );
  }
  if (!Array.isArray(items)) {
    return NextResponse.json(
      { error: "items phải là mảng" },
      { status: 400 },
    );
  }

  for (const it of items) {
    await prisma.itemMonthlyMaterial.upsert({
      where: { itemId_yearMonth: { itemId: it.itemId, yearMonth } },
      create: {
        itemId: it.itemId,
        yearMonth,
        cottonMaterialTypeId: it.cottonMaterialTypeId ?? null,
        peMaterialTypeId: it.peMaterialTypeId ?? null,
        note: it.note ?? null,
      },
      update: {
        cottonMaterialTypeId: it.cottonMaterialTypeId ?? null,
        peMaterialTypeId: it.peMaterialTypeId ?? null,
        note: it.note ?? null,
      },
    });
  }

  return NextResponse.json({ success: true, saved: items.length });
}
