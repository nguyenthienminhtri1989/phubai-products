import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/kdsx/material-prices/by-month?yearMonth=2026-04
 * Trả về tất cả loại NVL active + giá tháng đó (nếu có)
 * Grouped by category: cotton[] và pe[]
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const yearMonth = searchParams.get("yearMonth");
  if (!yearMonth) {
    return NextResponse.json({ error: "Thiếu yearMonth" }, { status: 400 });
  }

  // Lấy tất cả loại NVL đang active
  const allTypes = await prisma.materialType.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  // Lấy giá tháng đó
  const prices = await prisma.materialPrice.findMany({
    where: { yearMonth },
  });

  // Build lookup map
  const priceMap = new Map<number, number>();
  for (const p of prices) {
    priceMap.set(p.materialTypeId, p.priceUsd);
  }

  // Group by category
  const cotton: Array<{
    id: number;
    code: string;
    name: string;
    priceUsd: number | null;
  }> = [];
  const pe: Array<{
    id: number;
    code: string;
    name: string;
    priceUsd: number | null;
  }> = [];

  for (const t of allTypes) {
    const entry = {
      id: t.id,
      code: t.code,
      name: t.name,
      priceUsd: priceMap.get(t.id) ?? null,
    };
    if (t.category === "COTTON") cotton.push(entry);
    else pe.push(entry);
  }

  return NextResponse.json({ cotton, pe, yearMonth });
}
