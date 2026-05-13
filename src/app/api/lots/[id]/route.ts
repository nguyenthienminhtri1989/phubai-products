import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const lot = await prisma.lot.findUnique({
    where: { id: parseInt(id) },
    include: {
      item: { select: { id: true, name: true } },
      factory: { select: { id: true, name: true } },
      salesOrderItem: {
        select: {
          id: true,
          order: { select: { id: true, orderNo: true } },
        },
      },
      rawMaterials: {
        include: {
          rawLot: { select: { id: true, lotNumber: true, lotType: true } },
        },
      },
      productionLogs: {
        select: {
          id: true,
          recordDate: true,
          shift: true,
          finalOutput: true,
          machine: { select: { id: true, name: true } },
        },
        orderBy: { recordDate: "desc" },
        take: 50,
      },
    },
  });

  if (!lot) return NextResponse.json({ error: "Không tìm thấy lô" }, { status: 404 });
  return NextResponse.json(lot);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const lotId = parseInt(id);

  try {
    const body = await request.json();
    const { lotNumber, status, note, salesOrderItemId, rawLotIds } = body;

    const updateData: any = {};
    if (lotNumber !== undefined) updateData.lotNumber = lotNumber;
    if (status !== undefined) {
      updateData.status = status;
      if (status === "CLOSED") updateData.closedAt = new Date();
    }
    if (note !== undefined) updateData.note = note || null;
    if (salesOrderItemId !== undefined)
      updateData.salesOrderItemId = salesOrderItemId ? parseInt(salesOrderItemId) : null;

    const lot = await prisma.$transaction(async (tx) => {
      // Replace raw material links if provided
      if (Array.isArray(rawLotIds)) {
        await tx.lotMaterialLink.deleteMany({ where: { yarnLotId: lotId } });
        if (rawLotIds.length > 0) {
          await tx.lotMaterialLink.createMany({
            data: rawLotIds.map((rawLotId: number) => ({
              yarnLotId: lotId,
              rawLotId,
            })),
          });
        }
      }

      return tx.lot.update({
        where: { id: lotId },
        data: updateData,
      });
    });

    return NextResponse.json(lot);
  } catch (error: any) {
    console.error("Lot update error:", error);
    return NextResponse.json(
      { error: "Lỗi cập nhật lô hàng", detail: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const userRole = (session.user as any)?.userRole as string;
  if (!["ADMIN", "FACTORY_MANAGER"].includes(userRole)) {
    return NextResponse.json({ error: "Không có quyền xóa lô hàng" }, { status: 403 });
  }

  const { id } = await params;
  const lotId = parseInt(id);

  try {
    // Chỉ xóa nếu chưa có ProductionLog
    const logCount = await prisma.productionLog.count({ where: { lotId } });
    if (logCount > 0) {
      return NextResponse.json(
        { error: `Lô này đã có ${logCount} bản ghi sản xuất, không thể xóa. Hãy đóng lô thay vì xóa.` },
        { status: 400 }
      );
    }

    // Xóa links trước
    await prisma.lotMaterialLink.deleteMany({
      where: { OR: [{ yarnLotId: lotId }, { rawLotId: lotId }] },
    });

    await prisma.lot.delete({ where: { id: lotId } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Lot delete error:", error);
    return NextResponse.json(
      { error: "Lỗi xóa lô hàng", detail: error.message },
      { status: 500 }
    );
  }
}
