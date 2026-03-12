import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get("machineId");
    const dateStr = searchParams.get("date");
    const shiftStr = searchParams.get("shift");

    if (!machineId || !dateStr || !shiftStr) return NextResponse.json(null);

    const targetDate = new Date(dateStr);
    const targetShift = parseInt(shiftStr);

    // Giới hạn tìm kiếm trong khoảng 2 ngày đổ lại để tránh cộng dồn sai khi bỏ ca quá lâu
    const twoDaysAgo = new Date(targetDate);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Tìm bản ghi gần nhất có endIndex (bỏ qua bản ghi hiện tại và bản ghi không có endIndex)
    const lastLog = await prisma.productionLog.findFirst({
      where: {
        machineId: parseInt(machineId),
        recordDate: {
          gte: twoDaysAgo,
          lte: targetDate,
        },
        endIndex: { not: null },
        NOT: {
          AND: [
            { recordDate: targetDate },
            { shift: targetShift },
          ],
        },
      },
      orderBy: [
        { recordDate: "desc" },
        { shift: "desc" },
      ],
      select: {
        endIndex: true,
        recordDate: true,
        shift: true,
      },
    });

    return NextResponse.json(lastLog);
  } catch (error) {
    console.error("Get Error:", error);
    return NextResponse.json({ error: "Lỗi truy vấn" }, { status: 500 });
  }
}
