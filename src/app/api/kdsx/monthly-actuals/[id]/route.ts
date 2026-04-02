import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const actual = await prisma.monthlyActual.findUnique({
    where: { id: Number(id) },
    include: {
      factory: { select: { id: true, name: true } },
      lineItems: {
        include: {
          item: { select: { id: true, name: true, code: true } },
          salesOrderItem: {
            include: { order: { select: { id: true, orderNo: true } } },
          },
        },
        orderBy: { id: "asc" },
      },
      fixedCosts: { orderBy: { id: "asc" } },
    },
  });
  if (!actual) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(actual);
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
  const { note } = body;

  const actual = await prisma.monthlyActual.update({
    where: { id: Number(id) },
    data: { note: note ?? null },
  });
  return NextResponse.json(actual);
}
