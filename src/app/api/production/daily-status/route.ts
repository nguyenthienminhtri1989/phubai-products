import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const processId = searchParams.get("processId");
    const dateStr = searchParams.get("date");
    const shift = searchParams.get("shift");

    if (!processId || !dateStr || !shift) return NextResponse.json([]);

    const targetDate = new Date(dateStr);

    const machines = await prisma.machine.findMany({
      where: {
        processId: parseInt(processId),
        isActive: true,
      },
      include: {
        currentItem: true,
        // Kỹ thuật: Include luôn log của Ca/Ngày đang chọn
        productionLogs: {
          where: {
            recordDate: targetDate,
            shift: parseInt(shift),
          },
          take: 1,
        },
      },
      orderBy: { id: "asc" },
    });

    // Format lại dữ liệu cho Frontend dễ dùng
    const formattedData = machines.map((m) => ({
      ...m,
      todayLog: m.productionLogs.length > 0 ? m.productionLogs[0] : null,
      productionLogs: undefined, // Xóa mảng gốc cho nhẹ
    }));

    return NextResponse.json(formattedData);
  } catch (error) {
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
