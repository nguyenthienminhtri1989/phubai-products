import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const data = await prisma.powerMeter.findMany({
      include: { factory: true, substation: true },
      orderBy: { factoryId: "asc" },
    });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const newData = await prisma.powerMeter.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description || null,
        type: data.type,
        tu: data.tu,
        ti: data.ti,
        factoryId: data.factoryId,
        substationId: data.substationId || null,
      },
    });
    return NextResponse.json(newData, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Mã đồng hồ đã tồn tại hoặc lỗi dữ liệu" },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const data = await request.json();
    const updatedData = await prisma.powerMeter.update({
      where: { id: Number(data.id) },
      data: {
        code: data.code,
        name: data.name,
        description: data.description || null,
        type: data.type,
        tu: data.tu,
        ti: data.ti,
        factoryId: data.factoryId,
        substationId: data.substationId || null,
      },
    });
    return NextResponse.json(updatedData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
