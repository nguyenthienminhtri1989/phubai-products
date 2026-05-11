import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// PATCH: ADMIN sửa 1 bản ghi production_logs (tên mặt hàng, chỉ số, sản lượng)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userRole = (session?.user as any)?.userRole as string | undefined;
  if (userRole !== "ADMIN") {
    return NextResponse.json(
      { error: "Chỉ ADMIN được sửa bản ghi sản lượng" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const logId = parseInt(id);
  if (isNaN(logId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }

  const existing = await prisma.productionLog.findUnique({ where: { id: logId } });
  if (!existing) {
    return NextResponse.json({ error: "Không tìm thấy bản ghi" }, { status: 404 });
  }

  const body = await req.json();
  const data: any = {};

  if (body.itemId !== undefined) {
    const newItemId = parseInt(body.itemId);
    if (isNaN(newItemId)) {
      return NextResponse.json({ error: "itemId không hợp lệ" }, { status: 400 });
    }
    // Check trùng unique (machineId, recordDate, shift, itemId)
    if (newItemId !== existing.itemId) {
      const conflict = await prisma.productionLog.findFirst({
        where: {
          machineId: existing.machineId,
          recordDate: existing.recordDate,
          shift: existing.shift,
          itemId: newItemId,
          id: { not: logId },
        },
        select: { id: true },
      });
      if (conflict) {
        return NextResponse.json(
          {
            error:
              "Đã có bản ghi khác cho máy/ngày/ca/mặt hàng này. Không thể đổi mặt hàng trùng.",
          },
          { status: 409 },
        );
      }
    }
    data.itemId = newItemId;
  }

  if (body.startIndex !== undefined) {
    data.startIndex = body.startIndex === null || body.startIndex === "" ? 0 : parseFloat(body.startIndex);
  }
  if (body.endIndex !== undefined) {
    data.endIndex = body.endIndex === null || body.endIndex === "" ? null : parseFloat(body.endIndex);
  }
  if (body.finalOutput !== undefined) {
    data.finalOutput = body.finalOutput === null || body.finalOutput === "" ? 0 : Math.round(parseFloat(body.finalOutput));
  }
  if (body.efficiency !== undefined) {
    data.efficiency = body.efficiency === null || body.efficiency === "" ? null : parseFloat(body.efficiency);
  }
  if (body.note !== undefined) {
    data.note = body.note ?? null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Không có dữ liệu để cập nhật" }, { status: 400 });
  }

  const updated = await prisma.productionLog.update({
    where: { id: logId },
    data,
    include: {
      item: { select: { id: true, name: true } },
      machine: {
        select: {
          id: true,
          name: true,
          process: {
            select: {
              id: true,
              name: true,
              factory: { select: { id: true, name: true } },
            },
          },
        },
      },
      createdBy: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json(updated);
}

// DELETE: ADMIN hard-delete 1 bản ghi
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userRole = (session?.user as any)?.userRole as string | undefined;
  if (userRole !== "ADMIN") {
    return NextResponse.json(
      { error: "Chỉ ADMIN được xóa bản ghi sản lượng" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const logId = parseInt(id);
  if (isNaN(logId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }

  const existing = await prisma.productionLog.findUnique({ where: { id: logId } });
  if (!existing) {
    return NextResponse.json({ error: "Không tìm thấy bản ghi" }, { status: 404 });
  }

  await prisma.productionLog.delete({ where: { id: logId } });
  return NextResponse.json({ success: true });
}
