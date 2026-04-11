import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/productivity-benchmark/comparison
// Query: itemId, processId, factoryId, dateFrom, dateTo, benchmarkType? (THEORY|EMPIRICAL, default: THEORY)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId");
  const processId = searchParams.get("processId");
  const factoryId = searchParams.get("factoryId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const benchmarkType = searchParams.get("benchmarkType") ?? "THEORY";

  if (!itemId || !processId || !factoryId || !dateFrom || !dateTo) {
    return NextResponse.json(
      { error: "Thiếu tham số: itemId, processId, factoryId, dateFrom, dateTo" },
      { status: 400 }
    );
  }

  // 1. Lấy định mức hiện tại theo benchmarkType
  const benchmark = await prisma.productivityBenchmark.findFirst({
    where: {
      itemId: parseInt(itemId),
      processId: parseInt(processId),
      benchmarkType: benchmarkType as "THEORY" | "EMPIRICAL",
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
    const typeLabel = benchmarkType === "EMPIRICAL" ? "thực nghiệm" : "lý thuyết";
    return NextResponse.json(
      { error: `Không tìm thấy định mức ${typeLabel} active cho mặt hàng + công đoạn này` },
      { status: 404 }
    );
  }

  // 2. Tính benchmarkValue (kg/ngày) theo loại định mức
  // THEORY: stdOutputPerShift × 3 ca = kg/ngày
  // EMPIRICAL: empiricalOutputPerDay đã là kg/ngày
  const benchmarkValue =
    benchmarkType === "EMPIRICAL"
      ? (benchmark.empiricalOutputPerDay ?? 0)
      : benchmark.stdOutputPerShift * 3;

  // 3. Lấy danh sách máy trong process
  const machines = await prisma.machine.findMany({
    where: {
      processId: parseInt(processId),
      isActive: true,
    },
    select: { id: true, name: true },
  });

  if (machines.length === 0) {
    return NextResponse.json({
      benchmark: {
        stdOutputPerShift: benchmark.stdOutputPerShift,
        item: benchmark.item,
        process: benchmark.process,
        benchmarkType,
        benchmarkValue,
      },
      comparisons: [],
    });
  }

  const machineIds = machines.map((m) => m.id);

  // 4. Query ProductionLog GROUP BY machineId, tính trung bình theo ngày
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

  // 5. Tính hiệu suất thực tế so với benchmarkValue (kg/ngày)
  // avgActual từ ProductionLog là kg/ca → nhân 3 để ra kg/ngày
  const machineMap = new Map(machines.map((m) => [m.id, m.name]));
  const comparisons = logs.map((log) => {
    const avgActualPerShift = log._avg.finalOutput ?? 0;
    const avgActualPerDay = avgActualPerShift * 3; // quy đổi ra kg/ngày
    const efficiencyPct = benchmarkValue > 0
      ? (avgActualPerDay / benchmarkValue) * 100
      : 0;
    return {
      machineId: log.machineId,
      machineName: machineMap.get(log.machineId) ?? `Máy ${log.machineId}`,
      avgActualPerShift: Math.round(avgActualPerShift * 100) / 100,
      avgActualPerDay: Math.round(avgActualPerDay * 100) / 100,
      benchmarkValue,       // kg/ngày
      benchmarkType,
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
        avgActualPerShift: 0,
        avgActualPerDay: 0,
        benchmarkValue,
        benchmarkType,
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
      benchmarkType,
      benchmarkValue,
    },
    dateFrom,
    dateTo,
    comparisons,
  });
}
