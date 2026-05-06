import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const machineId = parseInt(id);
  if (isNaN(machineId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const assignments = await prisma.machineItemAssignment.findMany({
    where: { machineId, isActive: true },
    include: { item: { select: { id: true, name: true } } },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(assignments);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const machineId = parseInt(id);
  if (isNaN(machineId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const body = await req.json();
    const assignments: { itemId: number; fromSpindle?: number; toSpindle?: number; sortOrder?: number }[] =
      body.assignments ?? [];

    // Replace all: xóa cũ, tạo mới
    await prisma.machineItemAssignment.deleteMany({ where: { machineId } });

    if (assignments.length > 0) {
      await prisma.machineItemAssignment.createMany({
        data: assignments.map((a, i) => ({
          machineId,
          itemId: a.itemId,
          fromSpindle: a.fromSpindle ?? null,
          toSpindle: a.toSpindle ?? null,
          sortOrder: a.sortOrder ?? i,
          isActive: true,
        })),
      });
    }

    // Trả về danh sách đã lưu
    const result = await prisma.machineItemAssignment.findMany({
      where: { machineId, isActive: true },
      include: { item: { select: { id: true, name: true } } },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("Assignment update error:", e);
    if (e.code === "P2002") {
      return NextResponse.json({ error: "Mặt hàng đã được gán cho máy này rồi" }, { status: 400 });
    }
    return NextResponse.json({ error: e.message || "Lỗi cập nhật assignments" }, { status: 500 });
  }
}
