// src/app/api/factories/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 1. HÀM GET: TRẢ VỀ DANH SÁCH NHÀ MÁY
export async function GET() {
  try {
    const factories = await prisma.factory.findMany({
      orderBy: { id: "asc" },
    });
    return NextResponse.json(factories);
  } catch (error) {
    return NextResponse.json(
      { error: "Lỗi khi tải danh sách nhà máy: " + error },
      { status: 500 }
    );
  }
}

// 2. HÀM POST: TẠO MỚI NHÀ MÁY
export async function POST(request: Request) {
  try {
    const body = await request.json(); // Lấy dữ liệu từ phía Client gửi lên
    const { name, note } = body; // Lấy dữ liệu từ body

    // Valdate cơ bản
    if (!name) {
      return NextResponse.json(
        { error: "Bắt buộc nhập tên nhà máy!" },
        { status: 400 }
      );
    }

    // Đẩy dữ liệu vào CSDL
    const newFactory = await prisma.factory.create({
      data: {
        name: name,
        note: note,
      },
    });

    // Trả về thông tin nhà máy vừa thêm thành công
    return NextResponse.json(newFactory, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Lỗi khi thêm nhà máy: " + error },
      { status: 500 }
    );
  }
}
