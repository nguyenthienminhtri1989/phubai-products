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

  const result = await prisma.productionLog.aggregate({
    _sum: { finalOutput: true },
    where: {
      recordDate: normalizeDate(date),
      machine: { processId: parseInt(processId) },
    },
  });

  return NextResponse.json({ total: Math.round(result._sum.finalOutput || 0) });
}
