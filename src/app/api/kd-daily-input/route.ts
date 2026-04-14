import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { runAllocationKD } from "@/lib/allocation-engine";

// Chuẩn hóa ngày về 00:00:00 UTC để khớp với @db.Date của Prisma/PostgreSQL
const normalizeDate = (dateStr: string) => {
  return new Date(`${dateStr}T00:00:00.000Z`);
};

// ============================================================
// GET — Lấy danh sách KdDailyInput theo ngày + nhà máy + công đoạn
// Query: factoryId, processId?, date (YYYY-MM-DD), itemId?
// ============================================================
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const factoryId = searchParams.get("factoryId");
  const processId = searchParams.get("processId");
  const date = searchParams.get("date");
  const itemId = searchParams.get("itemId");

  if (!factoryId || !date) {
    return NextResponse.json(
      { error: "Thiếu factoryId hoặc date" },
      { status: 400 },
    );
  }

  const records = await prisma.kdDailyInput.findMany({
    where: {
      recordDate: normalizeDate(date),
      machine: {
        process: {
          factoryId: parseInt(factoryId),
          ...(processId ? { id: parseInt(processId) } : {}),
        },
      },
      ...(itemId ? { itemId: parseInt(itemId) } : {}),
    },
    include: {
      machine: {
        include: {
          process: true,
        },
      },
      item: true,
    },
    orderBy: [{ machine: { name: "asc" } }, { item: { name: "asc" } }],
  });

  return NextResponse.json(records);
}

// ============================================================
// POST — Upsert batch (lưu nhiều máy cùng lúc)
// Body: { date, factoryId, items: [{ machineId, itemId, outputKg, note? }] }
// ============================================================
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

    // Kiểm tra quyền
    // Mọi user đã đăng nhập đều được ghi nhập liệu sản xuất

    const body = await request.json();
    const { date, factoryId, items } = body;

    if (!date || !factoryId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ" },
        { status: 400 },
      );
    }

    // Validate outputKg >= 0
    for (const item of items) {
      if (typeof item.outputKg !== "number" || item.outputKg < 0) {
        return NextResponse.json(
          {
            error: `outputKg phải >= 0 (machineId=${item.machineId}, itemId=${item.itemId})`,
          },
          { status: 400 },
        );
      }
    }

    const dateObj = normalizeDate(date);
    const createdById = parseInt(session.user.id);

    // Upsert từng dòng trong transaction
    const results = await prisma.$transaction(
      items.map((item: { machineId: number; itemId: number; outputKg: number; note?: string }) =>
        prisma.kdDailyInput.upsert({
          where: {
            machineId_itemId_recordDate: {
              machineId: item.machineId,
              itemId: item.itemId,
              recordDate: dateObj,
            },
          },
          create: {
            machineId: item.machineId,
            itemId: item.itemId,
            recordDate: dateObj,
            outputKg: item.outputKg,
            note: item.note ?? null,
            createdById,
          },
          update: {
            outputKg: item.outputKg,
            note: item.note ?? null,
            updatedAt: new Date(),
          },
        }),
      ),
    );

    // Chạy allocation KD (non-blocking — lỗi không ảnh hưởng nhập liệu)
    try {
      await runAllocationKD(parseInt(factoryId), dateObj);
    } catch (err) {
      console.error("KD Allocation error (non-blocking):", err);
    }

    return NextResponse.json({
      message: `Đã lưu ${results.length} dòng`,
      count: results.length,
    });
  } catch (error: any) {
    console.error("KdDailyInput POST Error:", error);
    return NextResponse.json(
      { error: "Lỗi lưu dữ liệu", detail: error.message },
      { status: 500 },
    );
  }
}
