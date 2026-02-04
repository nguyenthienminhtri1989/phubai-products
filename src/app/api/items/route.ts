import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Lấy danh sách sản phẩm
export async function GET() {
  try {
    const items = await prisma.item.findMany({
      orderBy: {
        name: "asc", // Sắp xếp tên từ A - Z cho dễ tìm kiếm
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Lỗi tải dữ liệu từ server" },
      { status: 500 },
    );
  }
}

// Thêm sản phẩm
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Tên sản phẩm không được để trống" },
        { status: 400 },
      );
    }

    const newItem = await prisma.item.create({
      data: { name },
    });

    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Lỗi thêm mới dữ liệu từ server" },
      { status: 500 },
    );
  }
}
