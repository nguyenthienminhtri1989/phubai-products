// app/api/production/last-log/route.ts
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

    // LOGIC TRUY VẤN:
    // Tìm bản ghi có (Ngày < Ngày hiện tại) HOẶC (Ngày = Ngày hiện tại NHƯNG Ca < Ca hiện tại)
    const lastLog = await prisma.productionLog.findFirst({
      where: {
        machineId: parseInt(machineId),
        OR: [
          { recordDate: { lt: targetDate } }, // Những ngày trước
          {
            recordDate: targetDate,
            shift: { lt: targetShift }, // Cùng ngày nhưng ca trước
          },
        ],
      },
      // Sắp xếp giảm dần để lấy cái mới nhất trong quá khứ
      orderBy: [{ recordDate: "desc" }, { shift: "desc" }],
    });

    // Nếu tìm thấy thì trả về, không thấy (máy mới) thì trả null
    return NextResponse.json(lastLog);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Lỗi truy vấn lịch sử" },
      { status: 500 },
    );
  }
}
