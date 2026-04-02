import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/productivity-benchmark/comparison
// Query: itemId, processId, factoryId, dateFrom, dateTo
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId");
  const processId = searchParams.get("processId");
  const factoryId = searchParams.get("factoryId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  if (!itemId || !processId || !factoryId || !dateFrom || !dateTo) {
    return NextResponse.json(
      { error: "Thiếu tham số: itemId, processId, factoryId, dateFrom, dateTo" },
      { status: 400 }
    );
  }

  // 1. Lấy định mức hiện tại
  const benchmark = await prisma.productivityBenchmark.findFirst({
    where: {
      itemId: parseInt(itemId),
      processId: parseInt(processId),
      version: {
        factoryId: parseInt(factoryId),
        isActive: true,
      },
    },
    include: {
      item: { select: { id: true, name: true } },
      process: { select: { id: true, name: true } },
    },
  });

  if (!benchmark) {
    return NextResponse.json(
      { error: "Không tìm thấy định mức active cho mặt hàng + công đoạn này" },
      { status: 404 }
    );
  }

  // 2. Lấy danh sách máy trong process
  const machines = await prisma.machine.findMany({
    where: {
      processId: parseInt(processId),
      isActive: true,
    },
    select: { id: true, name: true },
  });

  if (machines.length === 0) {
    return NextResponse.json({ benchmark, comparisons: [] });
  }

  const machineIds = machines.map((m) => m.id);

  // 3. Query ProductionLog GROUP BY machineId
  const logs = await prisma.productionLog.groupBy({
    by: ["machineId"],
    where: {
      itemId: parseInt(itemId),
      machineId: { in: machineIds },
      recordDate: {
        gte: new Date(dateFrom),
        lte: new Date(dateTo),
      },
    },
    _avg: { finalOutput: true },
    _count: { id: true },
  });

  // 4. Tính hiệu suất thực tế
  const machineMap = new Map(machines.map((m) => [m.id, m.name]));
  const comparisons = logs.map((log) => {
    const avgActual = log._avg.finalOutput ?? 0;
    const efficiencyPct = benchmark.stdOutputPerShift > 0
      ? (avgActual / benchmark.stdOutputPerShift) * 100
      : 0;
    return {
      machineId: log.machineId,
      machineName: machineMap.get(log.machineId) ?? `Máy ${log.machineId}`,
      avgActual: Math.round(avgActual * 100) / 100,
      benchmark: benchmark.stdOutputPerShift,
      efficiencyPct: Math.round(efficiencyPct * 10) / 10,
      shiftCount: log._count.id,
    };
  });

  // Thêm máy chưa có dữ liệu
  const loggedMachineIds = new Set(logs.map((l) => l.machineId));
  for (const machine of machines) {
    if (!loggedMachineIds.has(machine.id)) {
      comparisons.push({
        machineId: machine.id,
        machineName: machine.name,
        avgActual: 0,
        benchmark: benchmark.stdOutputPerShift,
        efficiencyPct: 0,
        shiftCount: 0,
      });
    }
  }

  comparisons.sort((a, b) => b.efficiencyPct - a.efficiencyPct);

  return NextResponse.json({
    benchmark: {
      stdOutputPerShift: benchmark.stdOutputPerShift,
      item: benchmark.item,
      process: benchmark.process,
    },
    dateFrom,
    dateTo,
    comparisons,
  });
}
