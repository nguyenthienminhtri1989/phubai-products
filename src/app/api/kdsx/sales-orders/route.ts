import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const factoryId = searchParams.get("factoryId");
  const customerId = searchParams.get("customerId");
  const isActive = searchParams.get("isActive");
  const statusParam = searchParams.get("status"); // comma-separated e.g. "ACTIVE,OVERDUE"

  const statusList = statusParam
    ? statusParam.split(",").map((s) => s.trim())
    : null;

  const orders = await prisma.salesOrder.findMany({
    where: {
      ...(factoryId ? { factoryId: Number(factoryId) } : {}),
      ...(customerId ? { customerId: Number(customerId) } : {}),
      ...(isActive !== null ? { isActive: isActive === "true" } : {}),
      ...(statusList ? { status: { in: statusList as any[] } } : {}),
    },
    include: {
      customer: true,
      factory: { select: { id: true, name: true } },
      items: {
        include: { item: { select: { id: true, name: true, code: true } } },
      },
    },
    orderBy: { deliveryDate: "asc" },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = orders.map((order) => {
    const deliveryDate = new Date(order.deliveryDate);
    deliveryDate.setHours(0, 0, 0, 0);
    const daysUntilDeadline = Math.ceil(
      (deliveryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    const totalQty = order.items.reduce((s, i) => s + i.plannedQty, 0);
    const totalAllocated = order.items.reduce((s, i) => s + (i.deliveredQty ?? 0) + i.allocatedQty, 0);
    const overallProgressPct = Math.min(
      100,
      totalQty > 0 ? Math.round((totalAllocated / totalQty) * 1000) / 10 : 0,
    );

    return { ...order, overallProgressPct, daysUntilDeadline };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  const KDSX_EDIT_ROLES = ["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"];
  if (!userRole || !KDSX_EDIT_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { orderNo, customerId, factoryId, signedDate, deliveryDate, startDate, note, items } = body;
  if (!orderNo || !factoryId) {
    return NextResponse.json({ error: "Thiếu thông tin bắt buộc (orderNo, factoryId)" }, { status: 400 });
  }

  try {
    const order = await prisma.salesOrder.create({
      data: {
        orderNo,
        customerId: customerId ? Number(customerId) : null,
        factoryId: Number(factoryId),
        signedDate: signedDate ? new Date(signedDate) : null,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : new Date("2099-12-31"),
        startDate: startDate ? new Date(startDate) : null,
        note: note || null,
        items: {
          create: (items || []).map((it: any) => ({
            itemId: Number(it.itemId),
            plannedQty: Number(it.plannedQty),
            unitPrice: Number(it.unitPrice),
            sellingCostRate: it.sellingCostRate ?? null,
            deliveredQty: it.deliveredQty ?? 0,
            note: it.note || null,
          })),
        },
      },
      include: {
        customer: true,
        factory: { select: { id: true, name: true } },
        items: { include: { item: true } },
      },
    });
    return NextResponse.json(order, { status: 201 });
  } catch (error: any) {
    console.error("SalesOrder POST error:", error);
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Số hợp đồng đã tồn tại, vui lòng dùng số khác" }, { status: 400 });
    }
    return NextResponse.json({ error: "Lỗi tạo hợp đồng: " + error.message }, { status: 500 });
  }
}
