import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// POST /api/kdsx/item-monthly-materials/copy-from-previous
// Body: { yearMonth, sourceYearMonth }
// Copy cấu hình từ tháng nguồn. Mặt hàng đã có ở tháng đích được GIỮ NGUYÊN (update {}).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { yearMonth, sourceYearMonth } = await req.json();
  if (
    !/^\d{4}-\d{2}$/.test(yearMonth) ||
    !/^\d{4}-\d{2}$/.test(sourceYearMonth)
  ) {
    return NextResponse.json(
      { error: "yearMonth không hợp lệ" },
      { status: 400 },
    );
  }

  const sources = await prisma.itemMonthlyMaterial.findMany({
    where: { yearMonth: sourceYearMonth },
  });

  let copied = 0;
  for (const s of sources) {
    await prisma.itemMonthlyMaterial.upsert({
      where: { itemId_yearMonth: { itemId: s.itemId, yearMonth } },
      create: {
        itemId: s.itemId,
        yearMonth,
        cottonMaterialTypeId: s.cottonMaterialTypeId,
        peMaterialTypeId: s.peMaterialTypeId,
        note: s.note
          ? `Copy từ ${sourceYearMonth}: ${s.note}`
          : `Copy từ ${sourceYearMonth}`,
      },
      update: {}, // Đã có thì giữ nguyên (không ghi đè)
    });
    copied++;
  }

  return NextResponse.json({ copied });
}
