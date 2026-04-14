import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calcTheoreticalOutput } from "@/utils/benchmark";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const versionId = searchParams.get("versionId");
  const itemId = searchParams.get("itemId");
  const processId = searchParams.get("processId");

  const where: Record<string, unknown> = {};
  if (versionId) where.versionId = parseInt(versionId);
  if (itemId) where.itemId = parseInt(itemId);
  if (processId) where.processId = parseInt(processId);

  const benchmarks = await prisma.productivityBenchmark.findMany({
    where,
    orderBy: [{ processId: "asc" }, { itemId: "asc" }],
    include: {
      item: { select: { id: true, name: true } },
      process: { select: { id: true, name: true } },
      version: { select: { id: true, versionName: true, isActive: true } },
    },
  });

  return NextResponse.json(benchmarks);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  const ALLOWED_ROLES = ["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"];
  if (!userRole || !ALLOWED_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    versionId, itemId, processId, machineModel, speedUnit,
    nm, ne, twist, speedValue, spindleOrHeadCount,
    efficiency, note,
    benchmarkType, empiricalOutputPerDay, empiricalNote,
  } = body;

  // Validate bắt buộc chung
  if (!versionId || !itemId || !processId || !machineModel) {
    return NextResponse.json({ error: "Thiếu thông tin bắt buộc (phiên bản, mặt hàng, công đoạn, loại máy)" }, { status: 400 });
  }

  // Kiểm tra phiên bản đang active thì không cho thêm
  const version = await prisma.benchmarkVersion.findUnique({ where: { id: parseInt(versionId) } });
  if (!version) return NextResponse.json({ error: "Không tìm thấy phiên bản" }, { status: 404 });
  if (version.isActive) {
    return NextResponse.json({ error: "Không thể sửa phiên bản đang active. Hãy nhân bản trước." }, { status: 400 });
  }

  const type = benchmarkType === "EMPIRICAL" ? "EMPIRICAL" : "THEORY";

  // --- Xử lý theo loại định mức ---
  if (type === "EMPIRICAL") {
    // Định mức thực nghiệm — chỉ cần empiricalOutputPerDay
    if (!empiricalOutputPerDay || parseFloat(empiricalOutputPerDay) <= 0) {
      return NextResponse.json({ error: "Sản lượng thực nghiệm phải > 0" }, { status: 400 });
    }

    const benchmark = await prisma.productivityBenchmark.create({
      data: {
        versionId: parseInt(versionId),
        itemId: parseInt(itemId),
        processId: parseInt(processId),
        machineModel,
        speedUnit: speedUnit || "rpm",
        nm: nm ? parseFloat(nm) : 0,
        ne: ne ? parseFloat(ne) : 0,
        twist: null,
        speedValue: speedValue ? parseFloat(speedValue) : 0,
        spindleOrHeadCount: null,
        theoreticalOutput: 0,
        efficiency: efficiency ? parseFloat(efficiency) : 0,
        stdOutputPerShift: 0,
        note: note || null,
        benchmarkType: "EMPIRICAL",
        empiricalOutputPerDay: parseFloat(empiricalOutputPerDay),
        empiricalNote: empiricalNote || null,
      },
      include: {
        item: { select: { id: true, name: true } },
        process: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(benchmark, { status: 201 });

  } else {
    // Định mức lý thuyết (THEORY) — validation cũ giữ nguyên
    if (!speedUnit || !nm || !ne || !speedValue || !efficiency) {
      return NextResponse.json({ error: "Thiếu thông số kỹ thuật bắt buộc (đơn vị tốc độ, Nm, Ne, tốc độ, hiệu suất)" }, { status: 400 });
    }

    // Backend tự tính — không dùng số frontend gửi lên
    let theoreticalOutput: number;
    try {
      theoreticalOutput = calcTheoreticalOutput({
        speedValue: parseFloat(speedValue),
        speedUnit,
        nm: parseFloat(nm),
        twist: twist ? parseFloat(twist) : undefined,
        spindleOrHeadCount: spindleOrHeadCount ? parseInt(spindleOrHeadCount) : undefined,
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    const efficiencyVal = parseFloat(efficiency);
    const stdOutputPerShift = theoreticalOutput * efficiencyVal;

    const benchmark = await prisma.productivityBenchmark.create({
      data: {
        versionId: parseInt(versionId),
        itemId: parseInt(itemId),
        processId: parseInt(processId),
        machineModel,
        speedUnit,
        nm: parseFloat(nm),
        ne: parseFloat(ne),
        twist: twist ? parseFloat(twist) : null,
        speedValue: parseFloat(speedValue),
        spindleOrHeadCount: spindleOrHeadCount ? parseInt(spindleOrHeadCount) : null,
        theoreticalOutput,
        efficiency: efficiencyVal,
        stdOutputPerShift,
        note: note || null,
        benchmarkType: "THEORY",
        empiricalOutputPerDay: null,
        empiricalNote: null,
      },
      include: {
        item: { select: { id: true, name: true } },
        process: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(benchmark, { status: 201 });
  }
}
