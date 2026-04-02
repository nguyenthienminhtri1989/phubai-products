import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const factoryId = searchParams.get("factoryId");
  const status = searchParams.get("status");
  const month = searchParams.get("month"); // YYYY-MM
  const customerId = searchParams.get("customerId");

  // Lọc theo tháng deliveryDate nếu có
  let deliveryDateFilter: Record<string, Date> | undefined;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    deliveryDateFilter = {
      gte: new Date(`${y}-${String(m).padStart(2, "0")}-01`),
      lt: new Date(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`),
    };
  }

  const orders = await prisma.salesOrder.findMany({
    where: {
      ...(factoryId ? { factoryId: Number(factoryId) } : {}),
      ...(status ? { status: status as any } : {}),
      ...(customerId ? { customerId: Number(customerId) } : {}),
      ...(deliveryDateFilter ? { deliveryDate: deliveryDateFilter } : {}),
    },
    include: {
      customer: { select: { id: true, name: true, code: true } },
      factory: { select: { id: true, name: true } },
      items: {
        include: {
          item: { select: { id: true, name: true, code: true } },
        },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { deliveryDate: "asc" },
  });

  return NextResponse.json(orders);
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
  const { contractCode, customerId, factoryId, deliveryDate, startDate, note, items } = body;

  if (!contractCode || !customerId || !factoryId || !deliveryDate) {
    return NextResponse.json(
      { error: "Thiếu thông tin bắt buộc: contractCode, customerId, factoryId, deliveryDate" },
      { status: 400 },
    );
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Hợp đồng phải có ít nhất 1 mặt hàng" }, { status: 400 });
  }

  for (const it of items) {
    if (!it.itemId || !it.qtyOrdered || Number(it.qtyOrdered) <= 0) {
      return NextResponse.json(
        { error: "Mỗi mặt hàng phải có itemId và qtyOrdered > 0" },
        { status: 400 },
      );
    }
  }

  // deliveryDate không được trong quá khứ
  const ddDate = new Date(deliveryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (ddDate < today) {
    return NextResponse.json(
      { error: "deliveryDate không được là ngày trong quá khứ" },
      { status: 400 },
    );
  }

  // Kiểm tra contractCode unique
  const existing = await prisma.salesOrder.findUnique({ where: { orderNo: contractCode } });
  if (existing) {
    return NextResponse.json({ error: "Số hợp đồng đã tồn tại" }, { status: 409 });
  }

  const order = await prisma.salesOrder.create({
    data: {
      orderNo: contractCode,
      customerId: Number(customerId),
      factoryId: Number(factoryId),
      deliveryDate: ddDate,
      startDate: startDate ? new Date(startDate) : null,
      note: note || null,
      items: {
        create: items.map((it: any) => ({
          itemId: Number(it.itemId),
          plannedQty: Number(it.qtyOrdered),
          unitPrice: Number(it.unitPrice ?? 0),
          deliveryDate: it.deliveryDate ? new Date(it.deliveryDate) : null,
          note: it.note || null,
        })),
      },
    },
    include: {
      customer: { select: { id: true, name: true, code: true } },
      factory: { select: { id: true, name: true } },
      items: { include: { item: true } },
    },
  });

  return NextResponse.json(order, { status: 201 });
}
