import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// --- HÀM LẤY DANH SÁCH CÔNG ĐOẠN ---
export async function GET() {
  try {
    // Kỹ thuật Eager Loading: Lấy kèm dữ liệu bảng cha (Factory)
    const processes = await prisma.process.findMany({
      include: {
        factory: true, // <-- Quan trọng: Lấy thông tin nhà máy
      },
      orderBy: { id: "asc" },
    });
    return NextResponse.json(processes);
  } catch (error) {
    return NextResponse.json(
      { error: "Lỗi lấy dữ liệu công đoạn: " + error },
      { status: 500 },
    );
  }
}

// --- HÀM THÊM MỚI CÔNG ĐOẠN (chỉ ADMIN) ---
export async function POST(request: Request) {
  try {
    const session = await auth();
    if ((session?.user as any)?.userRole !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới được thêm công đoạn" }, { status: 403 });
    }

    const body = await request.json();
    const { name, factoryId, isRevenueProcess } = body;

    if (!name || !factoryId) {
      return NextResponse.json(
        { error: "Bắt buộc nhập tên công đoạn và tên nhà máy!" },
        { status: 400 },
      );
    }

    const newProcess = await prisma.process.create({
      data: {
        name: name,
        factoryId: parseInt(factoryId),
        isRevenueProcess: Boolean(isRevenueProcess),
      },
      include: { factory: true }, // // Trả về kèm thông tin nhà máy để frontend hiển thị ngay
    });

    return NextResponse.json(newProcess, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Lỗi thêm mới dữ liệu: " + error },
      { status: 500 },
    );
  }
}
