import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Chỉ Admin được kích hoạt phiên bản" }, { status: 403 });
  }

  const { id } = await params;
  const versionId = parseInt(id);

  const version = await prisma.benchmarkVersion.findUnique({ where: { id: versionId } });
  if (!version) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  if (version.isActive) return NextResponse.json({ error: "Phiên bản này đã active" }, { status: 400 });

  // Dùng transaction: deactivate tất cả version cùng factory, rồi activate version này
  const updated = await prisma.$transaction(async (tx) => {
    await tx.benchmarkVersion.updateMany({
      where: { factoryId: version.factoryId, isActive: true },
      data: { isActive: false, effectiveTo: new Date() },
    });

    return tx.benchmarkVersion.update({
      where: { id: versionId },
      data: { isActive: true, effectiveTo: null },
    });
  });

  return NextResponse.json(updated);
}
