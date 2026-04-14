import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessKdsx } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessKdsx(session as any))
    return NextResponse.json({ error: "Không có quyền truy cập module KD-SX" }, { status: 403 });

  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { salesOrders: true } } },
  });
  return NextResponse.json(customers);
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
  const { name, code, address, phone, email, taxCode, customerType, note } = body;
  if (!name) return NextResponse.json({ error: "Thiếu tên khách hàng" }, { status: 400 });

  // Validate customerType
  const validTypes = ["DOMESTIC", "FOREIGN"];
  const resolvedType = validTypes.includes(customerType) ? customerType : "DOMESTIC";

  const customer = await prisma.customer.create({
    data: {
      name,
      code: code || null,
      address: address || null,
      phone: phone || null,
      email: email || null,
      taxCode: taxCode || null,
      customerType: resolvedType,
      note: note || null,
    },
  });
  return NextResponse.json(customer, { status: 201 });
}
