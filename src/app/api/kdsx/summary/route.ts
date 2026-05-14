import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessKdsx } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessKdsx(session as any))
    return NextResponse.json(
      { error: "Không có quyền truy cập module KD-SX" },
      { status: 403 },
    );

  const { searchParams } = new URL(req.url);
  const yearMonth = searchParams.get("yearMonth");
  if (!yearMonth)
    return NextResponse.json({ error: "Cần yearMonth" }, { status: 400 });

  // 1. KH — đọc từ snapshot (giữ nguyên)
  const snapshots = await prisma.monthlySummarySnapshot.findMany({
    where: { yearMonth },
    include: { factory: { select: { id: true, name: true } } },
    orderBy: [{ factoryId: "asc" }, { type: "asc" }],
  });

  // 2. TH — Sản lượng: tính real-time từ ProductionLog
  const [startDate, endDate] = (() => {
    const [year, month] = yearMonth.split("-").map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1); // exclusive
    return [start, end];
  })();

  const thQtyByMachine = await prisma.productionLog.groupBy({
    by: ["machineId"],
    where: {
      recordDate: { gte: startDate, lt: endDate },
    },
    _sum: { finalOutput: true },
  });

  const machineIds = thQtyByMachine.map((r) => r.machineId);
  const machines = await prisma.machine.findMany({
    where: { id: { in: machineIds } },
    select: {
      id: true,
      process: { select: { factoryId: true } },
    },
  });
  const machineToFactory = new Map(
    machines.map((m) => [m.id, m.process.factoryId]),
  );

  const thQtyMap = new Map<number, number>();
  for (const row of thQtyByMachine) {
    const factoryId = machineToFactory.get(row.machineId);
    if (!factoryId) continue;
    thQtyMap.set(
      factoryId,
      (thQtyMap.get(factoryId) ?? 0) + (row._sum.finalOutput ?? 0),
    );
  }

  // 3. Danh sách nhà máy
  const factories = await prisma.factory.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });

  // 4. Build response
  const result = factories.map((factory) => {
    const khSnap = snapshots.find(
      (s) => s.factoryId === factory.id && s.type === "KH",
    );
    const thSnap = snapshots.find(
      (s) => s.factoryId === factory.id && s.type === "TH",
    );

    return {
      factory,
      kh: khSnap
        ? {
            totalQtyKg: khSnap.totalQtyKg,
            totalRevenueVnd: khSnap.totalRevenueVnd,
            totalCostVnd: khSnap.totalCostVnd,
            totalProfitVnd: khSnap.totalProfitVnd,
            refreshedAt: khSnap.refreshedAt,
          }
        : null,
      th: {
        totalQtyKg: thQtyMap.get(factory.id) ?? 0,
        totalRevenueVnd: thSnap?.totalRevenueVnd ?? null,
        totalCostVnd: thSnap?.totalCostVnd ?? null,
        totalProfitVnd: thSnap?.totalProfitVnd ?? null,
        refreshedAt: thSnap?.refreshedAt ?? null,
      },
    };
  });

  return NextResponse.json({ yearMonth, data: result });
}
