import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const factoryId = searchParams.get("factoryId");
  const isActive = searchParams.get("isActive");

  const where: Record<string, unknown> = {};
  if (factoryId) where.factoryId = parseInt(factoryId);
  if (isActive !== null && isActive !== undefined && isActive !== "") {
    where.isActive = isActive === "true";
  }

  const versions = await prisma.benchmarkVersion.findMany({
    where,
    orderBy: { effectiveFrom: "desc" },
    include: {
      factory: { select: { id: true, name: true } },
      _count: { select: { benchmarks: true } },
    },
  });

  return NextResponse.json(versions);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.role;
  const accessLevel = (session.user as any)?.accessLevel;
  if (userRole !== "ADMIN" && accessLevel !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { versionName, factoryId, effectiveFrom, effectiveTo, approvedBy, note } = body;

  if (!versionName || !factoryId || !effectiveFrom) {
    return NextResponse.json({ error: "Thiếu thông tin bắt buộc" }, { status: 400 });
  }

  const version = await prisma.benchmarkVersion.create({
    data: {
      versionName,
      factoryId: parseInt(factoryId),
      effectiveFrom: new Date(effectiveFrom),
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      approvedBy: approvedBy || null,
      note: note || null,
      isActive: false, // mới tạo luôn là nháp, phải activate riêng
    },
  });

  return NextResponse.json(version, { status: 201 });
}
