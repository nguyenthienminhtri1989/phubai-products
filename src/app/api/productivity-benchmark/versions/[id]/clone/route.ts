import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// POST /api/productivity-benchmark/versions/[id]/clone
// Nhân bản version: tạo version mới và copy toàn bộ benchmarks
export async function POST(
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
  const sourceId = parseInt(id);

  const body = await req.json();
  const { versionName, effectiveFrom, note } = body;

  if (!versionName || !effectiveFrom) {
    return NextResponse.json({ error: "Thiếu tên phiên bản và ngày hiệu lực" }, { status: 400 });
  }

  const source = await prisma.benchmarkVersion.findUnique({
    where: { id: sourceId },
    include: { benchmarks: true },
  });
  if (!source) return NextResponse.json({ error: "Không tìm thấy phiên bản gốc" }, { status: 404 });

  const newVersion = await prisma.$transaction(async (tx) => {
    const created = await tx.benchmarkVersion.create({
      data: {
        versionName,
        factoryId: source.factoryId,
        effectiveFrom: new Date(effectiveFrom),
        note: note || `Nhân bản từ "${source.versionName}"`,
        isActive: false,
      },
    });

    if (source.benchmarks.length > 0) {
      await tx.productivityBenchmark.createMany({
        data: source.benchmarks.map((b) => ({
          versionId: created.id,
          itemId: b.itemId,
          processId: b.processId,
          machineModel: b.machineModel,
          speedUnit: b.speedUnit,
          nm: b.nm,
          ne: b.ne,
          twist: b.twist,
          speedValue: b.speedValue,
          spindleOrHeadCount: b.spindleOrHeadCount,
          theoreticalOutput: b.theoreticalOutput,
          efficiency: b.efficiency,
          stdOutputPerShift: b.stdOutputPerShift,
          note: b.note,
        })),
        skipDuplicates: true,
      });
    }

    return created;
  });

  return NextResponse.json(newVersion, { status: 201 });
}
