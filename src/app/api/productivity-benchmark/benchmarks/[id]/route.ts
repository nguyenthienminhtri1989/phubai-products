import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calcTheoreticalOutput } from "@/utils/benchmark";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const benchmark = await prisma.productivityBenchmark.findUnique({
    where: { id: parseInt(id) },
    include: {
      item: { select: { id: true, name: true } },
      process: { select: { id: true, name: true } },
      version: { select: { id: true, versionName: true, isActive: true } },
    },
  });

  if (!benchmark) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  return NextResponse.json(benchmark);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.role;
  const accessLevel = (session.user as any)?.accessLevel;
  if (userRole !== "ADMIN" && accessLevel !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.productivityBenchmark.findUnique({
    where: { id: parseInt(id) },
    include: { version: true },
  });
  if (!existing) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  if (existing.version.isActive) {
    return NextResponse.json({ error: "Không thể sửa phiên bản đang active" }, { status: 400 });
  }

  const body = await req.json();
  const { machineModel, speedUnit, nm, ne, twist, speedValue, spindleOrHeadCount, efficiency, note,
    benchmarkType, empiricalOutputPerDay, empiricalNote } = body;

  const type = benchmarkType === "EMPIRICAL" ? "EMPIRICAL" : "THEORY";

  if (type === "EMPIRICAL") {
    if (!empiricalOutputPerDay || parseFloat(empiricalOutputPerDay) <= 0) {
      return NextResponse.json({ error: "Sản lượng thực nghiệm phải > 0" }, { status: 400 });
    }
    const updated = await prisma.productivityBenchmark.update({
      where: { id: parseInt(id) },
      data: {
        machineModel,
        benchmarkType: "EMPIRICAL",
        empiricalOutputPerDay: parseFloat(empiricalOutputPerDay),
        empiricalNote: empiricalNote ?? null,
        note: note ?? null,
        theoreticalOutput: 0,
        stdOutputPerShift: 0,
      },
    });
    return NextResponse.json(updated);
  }

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
  const updated = await prisma.productivityBenchmark.update({
    where: { id: parseInt(id) },
    data: {
      machineModel,
      speedUnit,
      nm: parseFloat(nm),
      ne: parseFloat(ne),
      twist: twist ? parseFloat(twist) : null,
      speedValue: parseFloat(speedValue),
      spindleOrHeadCount: spindleOrHeadCount ? parseInt(spindleOrHeadCount) : null,
      theoreticalOutput,
      efficiency: efficiencyVal,
      stdOutputPerShift: theoreticalOutput * efficiencyVal,
      note: note ?? null,
      benchmarkType: "THEORY",
      empiricalOutputPerDay: null,
      empiricalNote: null,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.role;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Chỉ Admin được xóa" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.productivityBenchmark.findUnique({
    where: { id: parseInt(id) },
    include: { version: true },
  });
  if (!existing) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  if (existing.version.isActive) {
    return NextResponse.json({ error: "Không thể xóa dòng trong phiên bản đang active" }, { status: 400 });
  }

  await prisma.productivityBenchmark.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
