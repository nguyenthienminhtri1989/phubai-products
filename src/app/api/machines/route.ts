import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const factoryId = searchParams.get("factoryId");
  const processId = searchParams.get("processId");

  const where: any = {};
  if (factoryId) where.process = { factoryId: parseInt(factoryId) };
  if (processId) where.processId = parseInt(processId);

  const machines = await prisma.machine.findMany({
    where,
    include: {
      process: { include: { factory: true } },
      currentItem: true, // Lấy tên mặt hàng đang chạy
    },
    orderBy: [{ processId: "asc" }, { id: "asc" }],
  });

  return NextResponse.json(machines);
}

export async function POST(req: Request) {
  // ... (Code check quyền Admin tương tự các file khác) ...
  try {
    const body = await req.json();
    const newMachine = await prisma.machine.create({
      data: {
        name: body.name,
        processId: parseInt(body.processId),
        formulaType: parseInt(body.formulaType),
        spindleCount: body.spindleCount ? parseInt(body.spindleCount) : undefined,
        isActive: body.isActive !== false,
        currentNE: body.currentNE !== undefined && body.currentNE !== null && body.currentNE !== '' ? parseFloat(body.currentNE) : undefined,
      },
    });
    return NextResponse.json(newMachine);
  } catch (e: any) {
    console.error("Machine create error:", e);
    if (e.code === 'P2002') {
      return NextResponse.json({ error: "Tên máy đã tồn tại. Vui lòng đặt tên khác." }, { status: 400 });
    }
    return NextResponse.json({ error: e.message || "Lỗi tạo máy" }, { status: 500 });
  }
}
