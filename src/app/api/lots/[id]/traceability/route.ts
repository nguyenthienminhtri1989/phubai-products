import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const lotId = parseInt(id);

  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    include: {
      item: { select: { id: true, name: true } },
      factory: { select: { id: true, name: true } },
      salesOrderItem: {
        select: {
          id: true,
          order: { select: { id: true, orderNo: true } },
        },
      },
      rawMaterials: {
        include: {
          rawLot: { select: { id: true, lotNumber: true, lotType: true } },
        },
      },
      productionLogs: {
        select: {
          id: true,
          recordDate: true,
          shift: true,
          finalOutput: true,
          machine: { select: { id: true, name: true } },
        },
        orderBy: { recordDate: "asc" },
      },
    },
  });

  if (!lot) return NextResponse.json({ error: "Không tìm thấy lô" }, { status: 404 });
  if (lot.lotType !== "YARN") {
    return NextResponse.json({ error: "Truy xuất nguồn gốc chỉ áp dụng cho lô sợi (YARN)" }, { status: 400 });
  }

  // Tổng hợp dữ liệu sản xuất
  const logs = lot.productionLogs;
  const totalKg = logs.reduce((sum, l) => sum + l.finalOutput, 0);
  const machineNames = [...new Set(logs.map((l) => l.machine.name))];
  const dates = logs.map((l) => new Date(l.recordDate).toISOString().slice(0, 10));
  const shifts = [...new Set(logs.map((l) => l.shift))].sort();

  const dateRange =
    dates.length > 0
      ? { from: dates[0], to: dates[dates.length - 1] }
      : null;

  return NextResponse.json({
    lot: {
      id: lot.id,
      lotNumber: lot.lotNumber,
      lotType: lot.lotType,
      status: lot.status,
      item: lot.item,
      factory: lot.factory,
      salesOrderItem: lot.salesOrderItem,
      openedAt: lot.openedAt,
      closedAt: lot.closedAt,
    },
    rawMaterials: lot.rawMaterials.map((link) => ({
      lotNumber: link.rawLot.lotNumber,
      lotType: link.rawLot.lotType,
      lotId: link.rawLot.id,
    })),
    productionSummary: {
      totalKg: Math.round(totalKg * 100) / 100,
      machines: machineNames,
      dateRange,
      shifts,
      totalRecords: logs.length,
    },
  });
}
