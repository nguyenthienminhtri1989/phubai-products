import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const order = await prisma.salesOrder.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      factory: { select: { id: true, name: true } },
      items: {
        include: { item: { select: { id: true, name: true, code: true } } },
      },
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(order);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.role;
  const accessLevel = (session.user as any)?.accessLevel;
  if (userRole !== "ADMIN" && accessLevel !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { orderNo, customerId, factoryId, signedDate, note, isActive } = body;

  const order = await prisma.salesOrder.update({
    where: { id: Number(id) },
    data: {
      orderNo,
      customerId: customerId ? Number(customerId) : undefined,
      factoryId: factoryId ? Number(factoryId) : undefined,
      signedDate: signedDate ? new Date(signedDate) : null,
      note: note ?? null,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
    },
    include: {
      customer: true,
      factory: { select: { id: true, name: true } },
      items: { include: { item: true } },
    },
  });
  return NextResponse.json(order);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.role;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.salesOrder.delete({ where: { id: Number(id) } });
  return NextResponse.json({ success: true });
}
