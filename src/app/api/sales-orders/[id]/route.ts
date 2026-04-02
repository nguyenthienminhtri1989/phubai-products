import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// ── helper: tính estimatedDoneDate cho 1 item ──────────────────────────────
async function calcEstimatedDoneDate(
  itemId: number,
  factoryId: number,
  remainingQty: number,
): Promise<Date | null> {
  if (remainingQty <= 0) return null;

  const benchmark = await prisma.productivityBenchmark.findFirst({
    where: {
      itemId,
      process: { factoryId },
      version: { isActive: true },
    },
  });
  if (!benchmark) return null;

  const machineCount = await prisma.machine.count({
    where: {
      process: { factoryId },
      currentItemId: itemId,
      isActive: true,
    },
  });
  if (machineCount === 0) return null;

  const dailyOutput = benchmark.stdOutputPerShift * machineCount * 3; // 3 ca/ngày
  if (dailyOutput <= 0) return null;

  const daysNeeded = Math.ceil(remainingQty / dailyOutput);
  const estimated = new Date();
  estimated.setDate(estimated.getDate() + daysNeeded);
  return estimated;
}

// ── GET /api/sales-orders/[id] ─────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
            orderBy: { productionDate: "asc" },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!order) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });

  const factoryId = order.factoryId;

  // Enrich từng item với computed fields
  const enrichedItems = await Promise.all(
    order.items.map(async (item) => {
      const remainingQty = Math.max(0, item.plannedQty - item.allocatedQty);
      const progressPct = Math.min(100, (item.allocatedQty / item.plannedQty) * 100);
      const estimatedDoneDate = await calcEstimatedDoneDate(item.itemId, factoryId, remainingQty);
      return {
        ...item,
        remainingQty,
        progressPct: Math.round(progressPct * 10) / 10,
        estimatedDoneDate: estimatedDoneDate?.toISOString().split("T")[0] ?? null,
      };
    }),
  );

  return NextResponse.json({ ...order, items: enrichedItems });
}

// ── PUT /api/sales-orders/[id] ─────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.role;
  const accessLevel = (session.user as any)?.accessLevel;
  if (userRole !== "ADMIN" && accessLevel !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const order = await prisma.salesOrder.findUnique({ where: { id: Number(id) } });
  if (!order) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });

  if (order.status === "DONE" || order.status === "CANCELLED") {
    return NextResponse.json(
      { error: "Không thể sửa hợp đồng đã DONE hoặc CANCELLED" },
      { status: 400 },
    );
  }

  const body = await req.json();
  const { deliveryDate, startDate, note } = body;

  const updated = await prisma.salesOrder.update({
    where: { id: Number(id) },
    data: {
      ...(deliveryDate ? { deliveryDate: new Date(deliveryDate) } : {}),
      ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
      ...(note !== undefined ? { note } : {}),
    },
    include: {
      customer: { select: { id: true, name: true } },
      factory: { select: { id: true, name: true } },
      items: { include: { item: { select: { id: true, name: true } } } },
    },
  });

  return NextResponse.json(updated);
}

// ── DELETE /api/sales-orders/[id] ─────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Chỉ Admin mới được xóa hợp đồng" }, { status: 403 });
  }

  const { id } = await params;
  const orderId = Number(id);
  const order = await prisma.salesOrder.findUnique({
    where: { id: orderId },
    include: { items: { select: { id: true } } },
  });
  if (!order) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });

  if (order.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Chỉ được xóa hợp đồng có trạng thái ACTIVE" },
      { status: 400 },
    );
  }

  const itemIds = order.items.map((i) => i.id);

  // Xóa đúng thứ tự: OrderAllocation → SalesOrderItem → SalesOrder
  await prisma.$transaction([
    prisma.orderAllocation.deleteMany({ where: { salesOrderItemId: { in: itemIds } } }),
    prisma.salesOrderItem.deleteMany({ where: { orderId: orderId } }),
    prisma.salesOrder.delete({ where: { id: orderId } }),
  ]);

  return NextResponse.json({ message: "Đã xóa hợp đồng" });
}
