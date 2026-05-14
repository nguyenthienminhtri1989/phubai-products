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

  // 2. TH — Sản lượng real-time từ ProductionLog
  // Chỉ lấy máy có trong segments của ProductionSchedule tháng này
  const [year, month] = yearMonth.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1); // exclusive

  const schedules = await prisma.productionSchedule.findMany({
    where: { yearMonth },
    select: {
      factoryId: true,
      segments: { select: { machineId: true } },
    },
  });

  // Build map: factoryId → machineIds (chỉ máy trong segments)
  const factoryMachineIds = new Map<number, number[]>();
  for (const sched of schedules) {
    const ids = [...new Set(sched.segments.map((s) => s.machineId))];
    factoryMachineIds.set(sched.factoryId, ids);
  }

  const allSegmentMachineIds = [
    ...new Set(schedules.flatMap((s) => s.segments.map((s2) => s2.machineId))),
  ];

  const logsByMachine = await prisma.productionLog.groupBy({
    by: ["machineId"],
    where: {
      machineId: { in: allSegmentMachineIds },
      recordDate: { gte: startDate, lt: endDate },
    },
    _sum: { finalOutput: true },
  });

  // Map machineId → factoryId từ factoryMachineIds (không cần query Machine)
  const machineToFactory = new Map<number, number>();
  for (const [factoryId, machineIds] of factoryMachineIds) {
    for (const machineId of machineIds) {
      machineToFactory.set(machineId, factoryId);
    }
  }

  const thQtyMap = new Map<number, number>();
  for (const row of logsByMachine) {
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
