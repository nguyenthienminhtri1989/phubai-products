import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const processId = searchParams.get("processId");
    const dateStr = searchParams.get("date");
    const shift = searchParams.get("shift");

    if (!processId || !dateStr || !shift) return NextResponse.json([]);

    const targetDate = new Date(dateStr);

    const machines = await prisma.machine.findMany({
      where: {
        processId: parseInt(processId),
        isActive: true,
      },
      include: {
        currentItem: true,
        currentLot: { select: { id: true, lotNumber: true } },
        currentSourceProcess: {
          select: {
            id: true,
            name: true,
            revenueFactory: { select: { id: true, name: true } },
          },
        },
        itemAssignments: {
          where: { isActive: true },
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
        },
        productionLogs: {
          where: {
            recordDate: targetDate,
            shift: parseInt(shift),
          },
          include: {
            item: { select: { id: true, name: true } },
            lot: { select: { id: true, lotNumber: true } },
          },
          orderBy: { id: "asc" },
        },
      },
      orderBy: { id: "asc" },
    });

    // Format lại dữ liệu cho Frontend dễ dùng
    const formattedData = machines.map((m) => ({
      ...m,
      todayLog: m.productionLogs.length > 0 ? m.productionLogs[0] : null,
      todayLogs: m.productionLogs,   // Mảng đầy đủ cho grid page (nhiều MH/ca)
      productionLogs: undefined,     // Xóa mảng gốc cho nhẹ
    }));

    return NextResponse.json(formattedData);
  } catch {
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
