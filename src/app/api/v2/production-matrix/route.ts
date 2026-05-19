import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const factoryId = Number(req.nextUrl.searchParams.get("factoryId"));
  const yearMonth = req.nextUrl.searchParams.get("yearMonth") ?? "";

  if (!factoryId || !yearMonth) {
    return NextResponse.json(
      { error: "factoryId và yearMonth là bắt buộc" },
      { status: 400 }
    );
  }

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { error: "yearMonth phải có định dạng YYYY-MM" },
      { status: 400 }
    );
  }

  try {
    const [year, month] = yearMonth.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();

    const logs = await prisma.productionLog.findMany({
      where: {
        recordDate: { gte: firstDay, lte: lastDay },
        machine: { process: { factoryId } },
      },
      select: {
        itemId: true,
        recordDate: true,
        finalOutput: true,
      },
    });

    // Lấy tên item
    const itemIds = [...new Set(logs.map((l) => l.itemId))];
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    // Group by itemId → day
    const data: Record<number, Record<number, number>> = {};
    for (const log of logs) {
      const day = new Date(log.recordDate).getDate();
      if (!data[log.itemId]) data[log.itemId] = {};
      data[log.itemId][day] = (data[log.itemId][day] ?? 0) + log.finalOutput;
    }

    // Tổng theo item
    const totals: Record<number, number> = {};
    for (const itemId of itemIds) {
      totals[itemId] = Object.values(data[itemId] ?? {}).reduce(
        (s, v) => s + v,
        0
      );
    }

    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return NextResponse.json({
      items: items.map((i) => ({ itemId: i.id, itemName: i.name })),
      days,
      data,
      totals,
      meta: {
        factoryId,
        yearMonth,
        daysInMonth,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
