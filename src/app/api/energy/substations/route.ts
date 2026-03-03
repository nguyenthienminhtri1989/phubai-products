// API QUẢN LÝ TRẠM BIẾN ÁP
// src/app/api/energy/substations/route.ts

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const data = await prisma.substation.findMany({
      include: { factory: true },
      orderBy: { id: "asc" },
    });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { code, name, factoryId } = await request.json();
    const newData = await prisma.substation.create({
      data: { code, name, factoryId: Number(factoryId) },
    });
    return NextResponse.json(newData, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Mã trạm đã tồn tại hoặc lỗi dữ liệu" },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { id, code, name, factoryId } = await request.json();
    const updatedData = await prisma.substation.update({
      where: { id: Number(id) },
      data: { code, name, factoryId: Number(factoryId) },
    });
    return NextResponse.json(updatedData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
