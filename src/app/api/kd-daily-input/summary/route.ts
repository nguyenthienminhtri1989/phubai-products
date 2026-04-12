import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// ============================================================
// GET /api/kd-daily-input/summary
// Tổng hợp sản lượng KD theo mặt hàng trong khoảng thời gian
// Query: factoryId, dateFrom, dateTo, itemId?
// ============================================================
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const factoryId = searchParams.get("factoryId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const itemId = searchParams.get("itemId");

  if (!factoryId || !dateFrom || !dateTo) {
    return NextResponse.json(
      { error: "Thiếu factoryId, dateFrom hoặc dateTo" },
      { status: 400 },
    );
  }

  const normalizeDate = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00.000Z`);

  const summary = await prisma.kdDailyInput.groupBy({
    by: ["itemId"],
    where: {
      machine: { process: { factoryId: parseInt(factoryId) } },
      recordDate: {
        gte: normalizeDate(dateFrom),
        lte: normalizeDate(dateTo),
      },
      ...(itemId ? { itemId: parseInt(itemId) } : {}),
    },
    _sum: { outputKg: true },
    orderBy: { _sum: { outputKg: "desc" } },
  });

  // Lấy thêm tên mặt hàng
  const itemIds = summary.map((s) => s.itemId);
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, name: true, code: true },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const result = summary.map((s) => ({
    itemId: s.itemId,
    itemName: itemMap.get(s.itemId)?.name ?? "Unknown",
    itemCode: itemMap.get(s.itemId)?.code ?? null,
    totalKg: s._sum.outputKg ?? 0,
  }));

  return NextResponse.json(result);
}
