import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// GET /api/productivity-benchmark/capacity
// Query: itemId, processId, factoryId, year, month, benchmarkType? (THEORY|EMPIRICAL, default: THEORY)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId");
  const processId = searchParams.get("processId");
  const factoryId = searchParams.get("factoryId");
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const benchmarkType = searchParams.get("benchmarkType") ?? "THEORY";

  if (!itemId || !processId || !factoryId || !year || !month) {
    return NextResponse.json({ error: "Thiếu tham số: itemId, processId, factoryId, year, month" }, { status: 400 });
  }

  // 1. Lấy định mức từ version đang active, theo benchmarkType
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
      version: { select: { id: true, versionName: true } },
      item: { select: { id: true, name: true } },
      process: { select: { id: true, name: true } },
    },
  });

  if (!benchmark) {
    const typeLabel = benchmarkType === "EMPIRICAL" ? "thực nghiệm" : "lý thuyết";
    return NextResponse.json(
      { error: `Không tìm thấy định mức ${typeLabel} cho mặt hàng + công đoạn này trong phiên bản đang active` },
      { status: 404 }
    );
  }

  // 2. Tính dailyOutputPerMachine theo loại định mức
  let dailyOutputPerMachine: number;

  if (benchmarkType === "EMPIRICAL") {
    if (!benchmark.empiricalOutputPerDay || benchmark.empiricalOutputPerDay <= 0) {
      return NextResponse.json(
        { error: "Chưa có định mức thực nghiệm cho mặt hàng này" },
        { status: 404 }
      );
    }
    // empiricalOutputPerDay đã là kg/ngày — không nhân 3 ca nữa
    dailyOutputPerMachine = benchmark.empiricalOutputPerDay;
  } else {
    // THEORY — logic cũ giữ nguyên: stdOutputPerShift × 3 ca
    dailyOutputPerMachine = benchmark.stdOutputPerShift * 3;
  }

  // 3. Đếm số máy đang active trong process
  const machineCount = await prisma.machine.count({
    where: {
      processId: parseInt(processId),
      isActive: true,
    },
  });

  // 4. Số ngày trong tháng
  const days = daysInMonth(parseInt(year), parseInt(month));

  // 5. capacity = dailyOutputPerMachine × machineCount × days
  const capacityKg = dailyOutputPerMachine * machineCount * days;
  const capacityTon = capacityKg / 1000;

  return NextResponse.json({
    item: benchmark.item,
    process: benchmark.process,
    version: benchmark.version,
    stdOutputPerShift: benchmark.stdOutputPerShift,
    machineModel: benchmark.machineModel,
    machineCount,
    daysInMonth: days,
    year: parseInt(year),
    month: parseInt(month),
    capacityKg,
    capacityTon,
    benchmarkType,
    dailyOutputPerMachine,
    empiricalOutputPerDay: benchmark.empiricalOutputPerDay,
  });
}
