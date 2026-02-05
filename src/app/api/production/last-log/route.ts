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

    // Logic: Tìm bản ghi có (Ngày nhỏ hơn) HOẶC (Ngày bằng nhưng Ca nhỏ hơn)
    const lastLog = await prisma.productionLog.findFirst({
      where: {
        machineId: parseInt(machineId),
        OR: [
          { recordDate: { lt: targetDate } },
          {
            recordDate: targetDate,
            shift: { lt: targetShift },
          },
        ],
      },
      orderBy: [
        { recordDate: "desc" }, // Ngày gần nhất
        { shift: "desc" }, // Ca lớn nhất trong ngày đó
      ],
    });

    return NextResponse.json(lastLog);
  } catch (error) {
    console.error("Get Error:", error);
    return NextResponse.json({ error: "Lỗi truy vấn" }, { status: 500 });
  }
}
