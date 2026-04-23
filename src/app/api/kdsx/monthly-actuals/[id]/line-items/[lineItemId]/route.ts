import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { refreshSummarySnapshot } from "@/lib/kdsx/calculator";
import { SnapshotType } from "@prisma/client";

/**
 * DELETE /api/kdsx/monthly-actuals/[id]/line-items/[lineItemId]
 * Chỉ cho phép xóa HĐ phát sinh (isAdHoc = true)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; lineItemId: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  const KDSX_EDIT_ROLES = ["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"];
  if (!userRole || !KDSX_EDIT_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, lineItemId } = await params;
  const actual = await prisma.monthlyActual.findUnique({
    where: { id: Number(id) },
  });
  if (!actual)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lineItem = await prisma.actualLineItem.findUnique({
    where: { id: Number(lineItemId) },
  });
  if (!lineItem || lineItem.actualId !== actual.id) {
    return NextResponse.json({ error: "Line item not found" }, { status: 404 });
  }
  if (!lineItem.isAdHoc) {
    return NextResponse.json(
      { error: "Chỉ có thể xóa dòng HĐ phát sinh (isAdHoc)" },
      { status: 400 },
    );
  }

  await prisma.actualLineItem.delete({ where: { id: Number(lineItemId) } });
  await refreshSummarySnapshot(
    actual.factoryId,
    actual.yearMonth,
    SnapshotType.TH,
  );

  return NextResponse.json({ success: true });
}
