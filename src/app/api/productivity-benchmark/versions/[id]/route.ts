import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const version = await prisma.benchmarkVersion.findUnique({
    where: { id: parseInt(id) },
    include: {
      factory: { select: { id: true, name: true } },
      benchmarks: {
        include: {
          item: { select: { id: true, name: true } },
          process: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!version) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  return NextResponse.json(version);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  const ALLOWED_ROLES = ["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"];
  if (!userRole || !ALLOWED_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { versionName, effectiveFrom, effectiveTo, approvedBy, note } = body;

  const version = await prisma.benchmarkVersion.update({
    where: { id: parseInt(id) },
    data: {
      versionName,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : undefined,
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      approvedBy: approvedBy ?? null,
      note: note ?? null,
    },
  });

  return NextResponse.json(version);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Chỉ Admin được xóa phiên bản" }, { status: 403 });
  }

  const { id } = await params;

  // Không cho xóa nếu đang có benchmark
  const count = await prisma.productivityBenchmark.count({
    where: { versionId: parseInt(id) },
  });
  if (count > 0) {
    return NextResponse.json(
      { error: `Không thể xóa — phiên bản đang có ${count} dòng định mức` },
      { status: 400 }
    );
  }

  await prisma.benchmarkVersion.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
