// GET /api/production/lines/[id]/output
// Tra ve tong san luong tung may trong line, tinh tu startDate den hom nay (hoac endDate)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const lineId = parseInt(id);

    // Lay thong tin line: startDate, endDate, itemId, links
    const line = await prisma.productionLine.findUnique({
      where: { id: lineId },
      select: {
        startDate: true,
        endDate: true,
        itemId: true,
        links: {
          select: { fromMachineId: true, toMachineId: true },
        },
      },
    });

    if (!line) {
      return NextResponse.json({ error: "Khong tim thay line" }, { status: 404 });
    }

    // Thu thap tat ca machineId duy nhat trong line
    const machineIdSet = new Set<number>();
    line.links.forEach((link) => {
      machineIdSet.add(link.fromMachineId);
      machineIdSet.add(link.toMachineId);
    });
    const machineIds = Array.from(machineIdSet);

    if (machineIds.length === 0) {
      return NextResponse.json([]);
    }

    // Khoang thoi gian: tu startDate den endDate (hoac hom nay neu line dang hieu luc)
    const startDate = line.startDate;
    const endDate = line.endDate ?? new Date();

    // Tong hop san luong theo may
    const logs = await prisma.productionLog.groupBy({
      by: ["machineId"],
      where: {
        machineId: { in: machineIds },
        itemId: line.itemId,
        recordDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: { finalOutput: true },
    });

    const result = logs.map((log) => ({
      machineId: log.machineId,
      totalOutput: log._sum.finalOutput ?? 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET Line Output Error:", error);
    return NextResponse.json(
      { error: "Loi lay du lieu san luong" },
      { status: 500 },
    );
  }
}
