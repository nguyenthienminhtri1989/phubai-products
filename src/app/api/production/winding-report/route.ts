import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const body = await req.json();
  const {
    fromDate,
    toDate,
    revenueFactoryIds,
    sourceProcessIds,
    machineIds,
    itemIds,
    shifts,
  } = body;

  if (!fromDate || !toDate) {
    return NextResponse.json(
      { error: "Thiếu fromDate hoặc toDate" },
      { status: 400 },
    );
  }

  // UTC date range — theo pattern dự án
  const fromUTC = new Date(`${fromDate}T00:00:00.000Z`);
  const toUTC = new Date(`${toDate}T23:59:59.999Z`);

  // Base where — chỉ công đoạn có isRevenueProcess = true (đánh ống)
  const baseWhere: any = {
    machine: { process: { isRevenueProcess: true } },
    recordDate: { gte: fromUTC, lte: toUTC },
  };
  if (machineIds?.length) baseWhere.machineId = { in: machineIds };
  if (itemIds?.length) baseWhere.itemId = { in: itemIds };
  if (shifts?.length) baseWhere.shift = { in: shifts };

  // Where cho log đã có sourceProcessId (có filter theo nguồn / nhà máy doanh thu)
  const whereWithSource: any = {
    ...baseWhere,
    sourceProcessId: { not: null },
  };
  if (sourceProcessIds?.length) {
    whereWithSource.sourceProcessId = { in: sourceProcessIds };
  }
  if (revenueFactoryIds?.length) {
    whereWithSource.sourceProcess = {
      revenueFactoryId: { in: revenueFactoryIds },
    };
  }

  // 1. Lấy logs đã có sourceProcessId
  const logs = await prisma.productionLog.findMany({
    where: whereWithSource,
    select: {
      id: true,
      recordDate: true,
      finalOutput: true,
      sourceProcessId: true,
      sourceProcess: {
        select: {
          id: true,
          name: true,
          revenueFactory: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { recordDate: "asc" },
  });

  // 2. Đếm orphan logs (thiếu sourceProcessId) — không áp filter source/revenueFactory
  const orphanCount = await prisma.productionLog.count({
    where: {
      ...baseWhere,
      sourceProcessId: null,
    },
  });

  // 3. Build byRevenueFactory
  const rfMap = new Map<number, any>();
  for (const log of logs) {
    const rf = log.sourceProcess?.revenueFactory;
    if (!rf) continue;
    if (!rfMap.has(rf.id)) {
      rfMap.set(rf.id, {
        id: rf.id,
        name: rf.name,
        totalKg: 0,
        recordCount: 0,
        bySourceMap: new Map<
          number,
          { sourceProcessId: number; sourceName: string; kg: number }
        >(),
      });
    }
    const entry = rfMap.get(rf.id);
    entry.totalKg += log.finalOutput;
    entry.recordCount += 1;

    const spId = log.sourceProcessId!;
    if (!entry.bySourceMap.has(spId)) {
      entry.bySourceMap.set(spId, {
        sourceProcessId: spId,
        sourceName: log.sourceProcess!.name,
        kg: 0,
      });
    }
    entry.bySourceMap.get(spId).kg += log.finalOutput;
  }

  const byRevenueFactory = Array.from(rfMap.values())
    .map((e) => ({
      id: e.id,
      name: e.name,
      totalKg: e.totalKg,
      recordCount: e.recordCount,
      bySource: Array.from(e.bySourceMap.values()).sort(
        (a: any, b: any) => b.kg - a.kg,
      ),
    }))
    .sort((a, b) => a.id - b.id);

  // 4. Build pivot Ngày × Nguồn sợi
  const pivotMap = new Map<
    string,
    { date: string; bySource: Record<number, number>; total: number }
  >();
  for (const log of logs) {
    const dateKey = log.recordDate.toISOString().split("T")[0];
    if (!pivotMap.has(dateKey)) {
      pivotMap.set(dateKey, { date: dateKey, bySource: {}, total: 0 });
    }
    const row = pivotMap.get(dateKey)!;
    const spId = log.sourceProcessId!;
    row.bySource[spId] = (row.bySource[spId] || 0) + log.finalOutput;
    row.total += log.finalOutput;
  }
  const pivot = Array.from(pivotMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  // 5. Lấy danh sách nguồn sợi để FE render header (lọc theo filter nếu có)
  const sourceProcesses = await prisma.process.findMany({
    where: {
      revenueFactoryId: { not: null },
      ...(revenueFactoryIds?.length
        ? { revenueFactoryId: { in: revenueFactoryIds } }
        : {}),
      ...(sourceProcessIds?.length ? { id: { in: sourceProcessIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      revenueFactory: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  const totalKg = logs.reduce((s, l) => s + l.finalOutput, 0);

  return NextResponse.json({
    byRevenueFactory,
    pivot,
    sourceProcesses,
    orphanCount,
    totalKg,
  });
}
