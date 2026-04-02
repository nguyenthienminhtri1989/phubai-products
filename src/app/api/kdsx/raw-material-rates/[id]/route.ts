import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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

  const rate = await prisma.rawMaterialRate.update({
    where: { id: Number(id) },
    data: {
      cottonRate: body.cottonRate ?? null,
      peRate: body.peRate ?? null,
      wasteRate: body.wasteRate ?? null,
      sellingCostRate: body.sellingCostRate ?? null,
      doubleTwistGcRate: body.doubleTwistGcRate ?? null,
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
  const userRole = (session.user as any)?.role;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.rawMaterialRate.delete({ where: { id: Number(id) } });
  return NextResponse.json({ success: true });
}
