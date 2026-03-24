import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Lấy danh sách giá điện (Tự động khởi tạo nếu chưa có)
export async function GET() {
  try {
    let prices = await prisma.electricityPrice.findMany({
      orderBy: { id: "asc" },
    });

    // AUTO-SEED: Nếu bảng trống, tự động nạp 3 mốc giá chuẩn
    if (prices.length === 0) {
      await prisma.electricityPrice.createMany({
        data: [
          {
            type: "NORMAL",
            name: "Bình thường",
            price: 1833,
            description: "04:00-09:30, 11:30-17:00, 20:00-22:00",
          },
          {
            type: "PEAK",
            name: "Cao điểm",
            price: 3398,
            description: "09:30-11:30, 17:00-20:00",
          },
          {
            type: "OFF_PEAK",
            name: "Thấp điểm",
            price: 1190,
            description: "22:00-04:00",
          },
        ],
      });
      // Lấy lại danh sách sau khi đã tạo
      prices = await prisma.electricityPrice.findMany({
        orderBy: { id: "asc" },
      });
    }

    return NextResponse.json(prices);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Lỗi khi lấy giá điện: " + error.message },
      { status: 500 },
    );
  }
}

// Cập nhật giá điện (chỉ ADMIN)
export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Không có quyền thực hiện thao tác này" }, { status: 403 });
    }

    const body = await request.json();
    const { id, price, description } = body;

    if (!id || price === undefined) {
      return NextResponse.json(
        { error: "Thiếu thông tin cập nhật" },
        { status: 400 },
      );
    }

    const updatedPrice = await prisma.electricityPrice.update({
      where: { id: Number(id) },
      data: {
        price: Number(price),
        description: description,
      },
    });

    return NextResponse.json(updatedPrice);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Lỗi cập nhật: " + error.message },
      { status: 500 },
    );
  }
}
