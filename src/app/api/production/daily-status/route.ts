// app/api/production/daily-status/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const processId = searchParams.get("processId");
    const dateStr = searchParams.get("date"); // YYYY-MM-DD
    const shift = searchParams.get("shift");

    if (!processId || !dateStr || !shift) {
      return NextResponse.json(
        { error: "Thiếu thông tin lọc" },
        { status: 400 },
      );
    }

    // Convert date string sang Date object chuẩn ISO
    const targetDate = new Date(dateStr);

    const machines = await prisma.machine.findMany({
      where: {
        processId: parseInt(processId),
        isActive: true, // Chỉ lấy máy đang hoạt động
      },
      include: {
        currentItem: true, // Lấy tên mặt hàng đang chạy để hiển thị
        // Kỹ thuật: Lấy luôn log của ngày hôm nay (nếu có) để Frontend biết đường tô màu xanh
        productionLogs: {
          where: {
            recordDate: targetDate,
            shift: parseInt(shift),
          },
          select: {
            id: true,
            finalOutput: true,
            // Lấy thêm các trường khác nếu muốn hiển thị chi tiết ngay trên card
          },
          take: 1,
        },
      },
      orderBy: { name: "asc" }, // Sắp xếp tên máy A->Z
    });

    // Biến đổi dữ liệu cho gọn trước khi trả về Client
    const formattedData = machines.map((m) => ({
      ...m,
      // Frontend đang mong đợi field tên là "todayLog" (object hoặc null)
      todayLog: m.productionLogs.length > 0 ? m.productionLogs[0] : null,
      productionLogs: undefined, // Xóa mảng gốc đi cho nhẹ payload
    }));

    return NextResponse.json(formattedData);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
