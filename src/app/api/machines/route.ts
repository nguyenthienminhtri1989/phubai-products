// app/api/machines/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// HÀM LẤY DANH SÁCH MÁY
export async function GET() {
  try {
    const machines = await prisma.machine.findMany({
      include: {
        process: {
          include: { factory: true }, // Lấy cả ông nội (Factory)
        },
        currentItem: true, // Lấy tên mặt hàng đang chạy
      },
      orderBy: { id: "asc" }, // Sắp xếp theo id hoặc tên
    });

    return NextResponse.json(machines);
  } catch (error) {
    return NextResponse.json(
      { error: "Lỗi tải dữ liệu: " + error },
      { status: 500 }
    );
  }
}

// HÀM THÊM MÁY MỚI
export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Parse dữ liệu cho chuẩn
    const data = {
      name: body.name,
      isActive: body.isActive,
      processId: parseInt(body.processId),
      formulaType: parseInt(body.formulaType),
      spindleCount: body.spindleCount ? parseInt(body.spindleCount) : null,
      currentItemId: body.currentItemId ? parseInt(body.currentItemId) : null,
      currentNE: body.currentNE ? parseFloat(body.currentNE) : null,
    };

    const newMachine = await prisma.machine.create({
      data: data,
    });

    return NextResponse.json(newMachine, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Lỗi thêm mới: " + error },
      { status: 500 }
    );
  }
}
