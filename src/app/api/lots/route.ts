import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const lotType = searchParams.get("lotType") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const factoryId = searchParams.get("factoryId");
  const search = searchParams.get("search") ?? undefined;

  const lots = await prisma.lot.findMany({
    where: {
      ...(lotType && { lotType: lotType as any }),
      ...(status && { status: status as any }),
      ...(factoryId && { factoryId: parseInt(factoryId) }),
      ...(search && {
        OR: [
          { lotNumber: { contains: search, mode: "insensitive" } },
          { note: { contains: search, mode: "insensitive" } },
        ],
      }),
    },
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
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(lots);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  try {
    const body = await request.json();
    const { lotNumber, lotType, factoryId, salesOrderItemId, note, rawLotIds } = body;

    if (!lotNumber || !lotType || !factoryId) {
      return NextResponse.json(
        { error: "Thiếu thông tin bắt buộc: lotNumber, lotType, factoryId" },
        { status: 400 }
      );
    }

    const lot = await prisma.$transaction(async (tx) => {
      const newLot = await tx.lot.create({
        data: {
          lotNumber,
          lotType,
          factoryId: parseInt(factoryId),
          salesOrderItemId: salesOrderItemId ? parseInt(salesOrderItemId) : null,
          note: note || null,
        },
      });

      // Nếu là lô sợi → link nguyên liệu
      if (lotType === "YARN" && Array.isArray(rawLotIds) && rawLotIds.length > 0) {
        await tx.lotMaterialLink.createMany({
          data: rawLotIds.map((rawLotId: number) => ({
            yarnLotId: newLot.id,
            rawLotId,
          })),
        });
      }

      return newLot;
    });

    return NextResponse.json(lot, { status: 201 });
  } catch (error: any) {
    console.error("Lot create error:", error);
    return NextResponse.json(
      { error: "Lỗi tạo lô hàng", detail: error.message },
      { status: 500 }
    );
  }
}
