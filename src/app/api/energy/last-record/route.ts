import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const meterId = searchParams.get("meterId");
  const dateStr = searchParams.get("date");

  if (!meterId || !dateStr) {
    return NextResponse.json(null);
  }

  try {
    const targetDate = new Date(dateStr);

    // Tìm bản ghi chốt điện của đồng hồ này, có ngày < ngày đang chọn
    const lastRecord = await prisma.powerRecord.findFirst({
      where: {
        meterId: Number(meterId),
        recordDate: { lt: targetDate }, // 'lt' = less than (nhỏ hơn)
      },
      orderBy: {
        recordDate: "desc", // Xếp giảm dần để lấy cái gần nhất
      },
    });

    return NextResponse.json(lastRecord);
  } catch (error: any) {
    console.error("Lỗi truy vết chỉ số:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
