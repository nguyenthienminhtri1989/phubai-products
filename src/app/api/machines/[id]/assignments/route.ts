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
    include: {
      item: { select: { id: true, name: true } },
      lot: { select: { id: true, lotNumber: true } },
      sourceProcess: {
        select: {
          id: true,
          name: true,
          revenueFactory: { select: { id: true, name: true } },
        },
      },
    },
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
    const assignments: {
      itemId: number;
      lotId?: number | null;
      sourceProcessId?: number | null;
      sortOrder?: number;
    }[] = body.assignments ?? [];

    // VALIDATION: phát hiện trùng (itemId, lotId) trong cùng request
    const seen = new Map<string, number>();
    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      const key = `${a.itemId}:${a.lotId ?? "null"}`;
      if (seen.has(key)) {
        return NextResponse.json(
          {
            error:
              a.lotId == null
                ? `Mặt hàng "${a.itemId}" được gán 2 lần cho máy này. Nếu chạy 2 lô khác nhau cùng mặt hàng, vui lòng chọn lô cụ thể cho từng dòng.`
                : `Mặt hàng "${a.itemId}" + lô "${a.lotId}" được gán 2 lần. Mỗi cặp mặt hàng + lô chỉ được 1 dòng.`,
          },
          { status: 400 },
        );
      }
      seen.set(key, i);
    }

    // CẢNH BÁO: nếu có >1 dòng cùng itemId thì tất cả dòng đó phải có lotId
    const itemCount = new Map<number, number>();
    for (const a of assignments) {
      itemCount.set(a.itemId, (itemCount.get(a.itemId) ?? 0) + 1);
    }
    for (const [itemId, count] of itemCount) {
      if (count > 1) {
        const sameItem = assignments.filter((a) => a.itemId === itemId);
        const missingLot = sameItem.some((a) => a.lotId == null);
        if (missingLot) {
          return NextResponse.json(
            {
              error: `Có ${count} dòng cùng mặt hàng "${itemId}" — tất cả các dòng này phải chọn lô cụ thể để phân biệt.`,
            },
            { status: 400 },
          );
        }
      }
    }

    const sourceIds = [
      ...new Set(
        assignments
          .map((a) => (a.sourceProcessId ? Number(a.sourceProcessId) : null))
          .filter((id): id is number => !!id),
      ),
    ];
    if (sourceIds.length > 0) {
      const validSources = await prisma.process.findMany({
        where: { id: { in: sourceIds }, revenueFactoryId: { not: null } },
        select: { id: true },
      });
      if (validSources.length !== sourceIds.length) {
        return NextResponse.json(
          { error: "Nguon soi trong phan cong khong hop le" },
          { status: 400 },
        );
      }
    }

    // Replace all: xóa cũ, tạo mới
    await prisma.machineItemAssignment.deleteMany({ where: { machineId } });

    if (assignments.length > 0) {
      await prisma.machineItemAssignment.createMany({
        data: assignments.map((a, i) => ({
          machineId,
          itemId: a.itemId,
          lotId: a.lotId ?? null,
          sourceProcessId: a.sourceProcessId ?? null,
          sortOrder: a.sortOrder ?? i,
          isActive: true,
        })),
      });
    }

    // Trả về danh sách đã lưu
    const result = await prisma.machineItemAssignment.findMany({
      where: { machineId, isActive: true },
      include: {
        item: { select: { id: true, name: true } },
        lot: { select: { id: true, lotNumber: true } },
        sourceProcess: {
          select: {
            id: true,
            name: true,
            revenueFactory: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(result);
  } catch (e: unknown) {
    console.error("Assignment update error:", e);
    if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002") {
      return NextResponse.json({ error: "Mặt hàng đã được gán cho máy này rồi" }, { status: 400 });
    }
    return NextResponse.json({ error: (e instanceof Error ? e.message : undefined) || "Lỗi cập nhật assignments" }, { status: 500 });
  }
}

// PATCH endpoint đã bị xóa (spec shift_item_change_multi_lot).
// Composite unique [machineId, itemId] không còn tồn tại sau khi chuyển sang
// partial unique index → frontend dùng PUT thay-thế-toàn-bộ thay vì PATCH.
