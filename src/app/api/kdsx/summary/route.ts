import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const yearMonth = searchParams.get("yearMonth");
  if (!yearMonth) {
    return NextResponse.json({ error: "Cần yearMonth" }, { status: 400 });
  }

  // Lấy tất cả snapshot của tháng này
  const snapshots = await prisma.monthlySummarySnapshot.findMany({
    where: { yearMonth },
    include: {
      factory: { select: { id: true, name: true } },
    },
    orderBy: [{ factoryId: "asc" }, { type: "asc" }],
  });

  // Lấy danh sách nhà máy
  const factories = await prisma.factory.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });

  // Build response dạng: mỗi nhà máy có KH và TH
  const result = factories.map((factory) => {
    const kh = snapshots.find((s) => s.factoryId === factory.id && s.type === "KH");
    const th = snapshots.find((s) => s.factoryId === factory.id && s.type === "TH");
    return {
      factory,
      kh: kh
        ? {
            totalQtyKg: kh.totalQtyKg,
            totalRevenueVnd: kh.totalRevenueVnd,
            totalCostVnd: kh.totalCostVnd,
            totalProfitVnd: kh.totalProfitVnd,
            refreshedAt: kh.refreshedAt,
          }
        : null,
      th: th
        ? {
            totalQtyKg: th.totalQtyKg,
            totalRevenueVnd: th.totalRevenueVnd,
            totalCostVnd: th.totalCostVnd,
            totalProfitVnd: th.totalProfitVnd,
            refreshedAt: th.refreshedAt,
          }
        : null,
    };
  });

  return NextResponse.json({ yearMonth, data: result });
}
