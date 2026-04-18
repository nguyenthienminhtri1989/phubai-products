import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/kdsx/production-schedule/benchmark-lookup?machineId=&itemId=&yearMonth=&factoryId=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const machineId = parseInt(searchParams.get("machineId") ?? "0");
  const itemId = parseInt(searchParams.get("itemId") ?? "0");
  const yearMonth = searchParams.get("yearMonth") ?? "";
  const factoryId = parseInt(searchParams.get("factoryId") ?? "0");

  if (!machineId || !itemId || !yearMonth || !factoryId) {
    return NextResponse.json(
      { error: "Thiếu machineId, itemId, yearMonth hoặc factoryId" },
      { status: 400 }
    );
  }

  const machine = await prisma.machine.findUnique({
    where: { id: machineId },
    select: { processId: true, model: true, name: true },
  });

  if (!machine) {
    return NextResponse.json({ notFound: true, reason: "machine_not_found" });
  }

  if (!machine.model) {
    return NextResponse.json({
      notFound: true,
      reason: "machine_no_model",
      message: `Máy "${machine.name}" chưa có trường "Loại máy" (model). Vui lòng cập nhật trong danh mục máy.`,
    });
  }

  const planDate = new Date(yearMonth + "-01");

  const version = await prisma.benchmarkVersion.findFirst({
    where: {
      factoryId,
      effectiveFrom: { lte: planDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: planDate } }],
      isActive: true,
    },
    orderBy: { effectiveFrom: "desc" },
  });

  if (!version) {
    return NextResponse.json({
      notFound: true,
      reason: "no_version",
      message: `Chưa có phiên bản định mức nào đang hiệu lực vào tháng ${yearMonth}.`,
    });
  }

  const benchmark = await prisma.productivityBenchmark.findFirst({
    where: {
      versionId: version.id,
      itemId,
      processId: machine.processId,
      machineModel: machine.model,
      benchmarkType: "EMPIRICAL",
    },
    select: {
      id: true,
      empiricalOutputPerDay: true,
      empiricalNote: true,
      version: { select: { versionName: true } },
    },
  });

  if (!benchmark || benchmark.empiricalOutputPerDay == null) {
    return NextResponse.json({
      notFound: true,
      reason: "no_benchmark",
      message: `Chưa có định mức EMPIRICAL cho tổ hợp (máy model: ${machine.model}, mặt hàng ID: ${itemId}) trong phiên bản "${version.versionName}".`,
    });
  }

  return NextResponse.json({
    kgPerDay: benchmark.empiricalOutputPerDay,
    benchmarkId: benchmark.id,
    versionName: benchmark.version.versionName,
    empiricalNote: benchmark.empiricalNote,
  });
}
