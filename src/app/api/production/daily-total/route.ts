import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const normalizeDate = (dateStr: string) => {
  return new Date(`${dateStr}T00:00:00.000Z`);
};

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const processId = searchParams.get("processId");
  const date = searchParams.get("date");

  if (!processId || !date) return NextResponse.json({ total: 0 });

  // Bước 1: Lấy danh sách machineId thuộc công đoạn
  const machines = await prisma.machine.findMany({
    where: { processId: parseInt(processId) },
    select: { id: true },
  });
  const machineIds = machines.map(m => m.id);

  if (machineIds.length === 0) return NextResponse.json({ total: 0 });

  // Bước 2: Tính tổng sản lượng cả ngày (tất cả ca) cho các máy đó
  const result = await prisma.productionLog.aggregate({
    _sum: { finalOutput: true },
    where: {
      recordDate: normalizeDate(date),
      machineId: { in: machineIds },
    },
  });

  return NextResponse.json({ total: Math.round(result._sum.finalOutput || 0) });
}
