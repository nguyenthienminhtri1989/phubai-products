import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// GET /api/productivity-benchmark/capacity
// Query: itemId, processId, factoryId, year, month
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId");
  const processId = searchParams.get("processId");
  const factoryId = searchParams.get("factoryId");
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  if (!itemId || !processId || !factoryId || !year || !month) {
    return NextResponse.json({ error: "Thiếu tham số: itemId, processId, factoryId, year, month" }, { status: 400 });
  }

  // 1. Lấy stdOutputPerShift từ version đang active
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
      version: { select: { id: true, versionName: true } },
      item: { select: { id: true, name: true } },
      process: { select: { id: true, name: true } },
    },
  });

  if (!benchmark) {
    return NextResponse.json(
      { error: "Không tìm thấy định mức cho mặt hàng + công đoạn này trong phiên bản đang active" },
      { status: 404 }
    );
  }

  // 2. Đếm số máy đang active trong process
  const machineCount = await prisma.machine.count({
    where: {
      processId: parseInt(processId),
      isActive: true,
    },
  });

  // 3. Số ngày trong tháng
  const days = daysInMonth(parseInt(year), parseInt(month));

  // 4. capacity = stdOutputPerShift × machineCount × days × 3 (ca/ngày)
  const capacityKg = benchmark.stdOutputPerShift * machineCount * days * 3;
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
  });
}
