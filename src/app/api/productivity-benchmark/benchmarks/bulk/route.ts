import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calcTheoreticalOutput } from "@/utils/benchmark";

// POST /api/productivity-benchmark/benchmarks/bulk
// Import nhiều dòng định mức cùng lúc (từ Excel)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.role;
  const accessLevel = (session.user as any)?.accessLevel;
  if (userRole !== "ADMIN" && accessLevel !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { versionId, items } = body;

  if (!versionId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Thiếu versionId hoặc danh sách items rỗng" }, { status: 400 });
  }

  const version = await prisma.benchmarkVersion.findUnique({ where: { id: parseInt(versionId) } });
  if (!version) return NextResponse.json({ error: "Không tìm thấy phiên bản" }, { status: 404 });
  if (version.isActive) {
    return NextResponse.json({ error: "Không thể sửa phiên bản đang active" }, { status: 400 });
  }

  const errors: string[] = [];
  const dataToInsert: Array<{
    versionId: number;
    itemId: number;
    processId: number;
    machineModel: string;
    speedUnit: string;
    nm: number;
    ne: number;
    twist: number | null;
    speedValue: number;
    spindleOrHeadCount: number | null;
    theoreticalOutput: number;
    efficiency: number;
    stdOutputPerShift: number;
    note: string | null;
  }> = [];

  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    try {
      const theoreticalOutput = calcTheoreticalOutput({
        speedValue: parseFloat(row.speedValue),
        speedUnit: row.speedUnit,
        nm: parseFloat(row.nm),
        twist: row.twist ? parseFloat(row.twist) : undefined,
        spindleOrHeadCount: row.spindleOrHeadCount ? parseInt(row.spindleOrHeadCount) : undefined,
      });

      const efficiencyVal = parseFloat(row.efficiency);
      dataToInsert.push({
        versionId: parseInt(versionId),
        itemId: parseInt(row.itemId),
        processId: parseInt(row.processId),
        machineModel: row.machineModel,
        speedUnit: row.speedUnit,
        nm: parseFloat(row.nm),
        ne: parseFloat(row.ne),
        twist: row.twist ? parseFloat(row.twist) : null,
        speedValue: parseFloat(row.speedValue),
        spindleOrHeadCount: row.spindleOrHeadCount ? parseInt(row.spindleOrHeadCount) : null,
        theoreticalOutput,
        efficiency: efficiencyVal,
        stdOutputPerShift: theoreticalOutput * efficiencyVal,
        note: row.note || null,
      });
    } catch (e: any) {
      errors.push(`Dòng ${i + 1}: ${e.message}`);
    }
  }

  if (dataToInsert.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: 0, errors }, { status: 400 });
  }

  const result = await prisma.productivityBenchmark.createMany({
    data: dataToInsert,
    skipDuplicates: true,
  });

  return NextResponse.json({
    inserted: result.count,
    skipped: dataToInsert.length - result.count,
    errors,
  });
}
