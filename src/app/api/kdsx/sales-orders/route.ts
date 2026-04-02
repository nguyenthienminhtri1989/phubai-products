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

  const orders = await prisma.salesOrder.findMany({
    where: {
      ...(factoryId ? { factoryId: Number(factoryId) } : {}),
      ...(customerId ? { customerId: Number(customerId) } : {}),
      ...(isActive !== null ? { isActive: isActive === "true" } : {}),
    },
    include: {
      customer: true,
      factory: { select: { id: true, name: true } },
      items: {
        include: { item: { select: { id: true, name: true, code: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
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
  const { orderNo, customerId, factoryId, signedDate, note, items } = body;
  if (!orderNo || !customerId || !factoryId) {
    return NextResponse.json({ error: "Thiếu thông tin bắt buộc" }, { status: 400 });
  }

  const order = await prisma.salesOrder.create({
    data: {
      orderNo,
      customerId: Number(customerId),
      factoryId: Number(factoryId),
      signedDate: signedDate ? new Date(signedDate) : null,
      note: note || null,
      items: {
        create: (items || []).map((it: any) => ({
          itemId: Number(it.itemId),
          plannedQty: Number(it.plannedQty),
          unitPrice: Number(it.unitPrice),
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
}
