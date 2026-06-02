import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  const KDSX_EDIT_ROLES = ["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"];
  if (!userRole || !KDSX_EDIT_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const rateId = Number(id);

  const existingRate = await prisma.rawMaterialRate.findUnique({ where: { id: rateId } });
  if (!existingRate) return NextResponse.json({ error: "Không tìm thấy định mức" }, { status: 404 });

  // Kiểm tra xem định mức này đã được áp dụng trong bản ghi sản xuất chưa
  const usedCount = await prisma.productionLog.count({
    where: {
      itemId: existingRate.itemId,
      recordDate: {
        gte: existingRate.effectiveFrom,
        ...(existingRate.effectiveTo ? { lte: existingRate.effectiveTo } : {}),
      },
    },
  });

  if (usedCount > 0) {
    return NextResponse.json(
      {
        error: `Định mức này đã được áp dụng trong ${usedCount} bản ghi sản xuất. Vui lòng dùng "Tạo phiên bản mới" thay vì sửa trực tiếp để không làm lệch số liệu tháng đã qua.`,
        usedCount,
      },
      { status: 409 }
    );
  }

  const body = await req.json();
  const rate = await prisma.rawMaterialRate.update({
    where: { id: rateId },
    data: {
      cottonRate: body.cottonRate ?? null,
      cottonRatio: body.cottonRatio != null ? Number(body.cottonRatio) : undefined,
      peRate: body.peRate ?? null,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,
      effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
      note: body.note ?? null,
    },
  });
  return NextResponse.json(rate);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.rawMaterialRate.delete({ where: { id: Number(id) } });
  return NextResponse.json({ success: true });
}
