import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calcEstimatedDoneDate } from "@/lib/estimate-completion";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const order = await prisma.salesOrder.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      factory: { select: { id: true, name: true } },
      items: {
        include: {
          item: { select: { id: true, name: true, code: true } },
          allocations: {
            select: { productionDate: true, allocatedQty: true },
            orderBy: { productionDate: "asc" },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Enrich each item with progress data
  const enrichedItems = await Promise.all(
    order.items.map(async (item) => {
      const totalDelivered = (item.deliveredQty ?? 0) + item.allocatedQty;
      const remainingQty = Math.max(0, item.plannedQty - totalDelivered);
      const progressPct = Math.min(
        100,
        item.plannedQty > 0
          ? Math.round((totalDelivered / item.plannedQty) * 1000) / 10
          : 0,
      );

      // Cumulative production by date
      let cumulative = 0;
      const cumulativeData = item.allocations.map((a) => {
        cumulative += a.allocatedQty;
        return {
          date: a.productionDate.toISOString().split("T")[0],
          qty: a.allocatedQty,
          cumulative,
        };
      });

      const estimatedDoneDate = await calcEstimatedDoneDate(
        item.itemId,
        order.factoryId,
        remainingQty,
      );

      return {
        ...item,
        remainingQty,
        progressPct,
        cumulativeData,
        estimatedDoneDate:
          estimatedDoneDate?.toISOString().split("T")[0] ?? null,
      };
    }),
  );

  return NextResponse.json({ ...order, items: enrichedItems });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  const KDSX_EDIT_ROLES = ["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"];
  if (!userRole || !KDSX_EDIT_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const {
    orderNo,
    customerId,
    factoryId,
    signedDate,
    deliveryDate,
    startDate,
    note,
    isActive,
  } = body;

  await prisma.salesOrder.update({
    where: { id: Number(id) },
    data: {
      orderNo,
      customerId: customerId ? Number(customerId) : undefined,
      factoryId: factoryId ? Number(factoryId) : undefined,
      signedDate: signedDate ? new Date(signedDate) : null,
      deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined,
      startDate: startDate ? new Date(startDate) : null,
      note: note ?? null,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
    },
  });

  if (body.items && Array.isArray(body.items)) {
    // Xóa items cũ
    await prisma.salesOrderItem.deleteMany({ where: { orderId: Number(id) } });
    // Tạo lại từ body
    await prisma.salesOrderItem.createMany({
      data: body.items.map((item: any) => ({
        orderId: Number(id),
        itemId: item.itemId,
        plannedQty: item.plannedQty,
        unitPrice: item.unitPrice,
        sellingCostRate: item.sellingCostRate ?? null,
        deliveredQty: item.deliveredQty ?? 0,
        note: item.note ?? null,
      })),
    });
  }

  const order = await prisma.salesOrder.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      factory: { select: { id: true, name: true } },
      items: { include: { item: true } },
    },
  });

  return NextResponse.json(order);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.salesOrder.delete({ where: { id: Number(id) } });
  return NextResponse.json({ success: true });
}
