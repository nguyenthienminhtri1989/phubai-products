import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const data = await prisma.powerMeter.findMany({
      include: { factory: true, substation: true, meterGroup: true },
      orderBy: { factoryId: "asc" },
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi tải danh sách đồng hồ" }, { status: 500 });
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
        meterGroupId: data.meterGroupId ? Number(data.meterGroupId) : null,
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

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    await prisma.powerMeter.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Không thể xóa đồng hồ. Có thể đang được sử dụng trong dữ liệu điện năng." }, { status: 400 });
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
        meterGroupId: data.meterGroupId ? Number(data.meterGroupId) : null,
      },
    });
    return NextResponse.json(updatedData);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi cập nhật đồng hồ" }, { status: 400 });
  }
}
