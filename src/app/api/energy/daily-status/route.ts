import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const substationId = searchParams.get("substationId");
  const dateStr = searchParams.get("date");

  if (!substationId || !dateStr) {
    return NextResponse.json(
      { error: "Thiếu tham số substationId hoặc date" },
      { status: 400 },
    );
  }

  try {
    const targetDate = new Date(dateStr);

    // Tìm tất cả đồng hồ đang hoạt động thuộc Trạm biến áp này
    const meters = await prisma.powerMeter.findMany({
      where: {
        substationId: Number(substationId),
        isActive: true,
      },
      include: {
        // Kéo theo bản ghi chốt số của đúng ngày được chọn (nếu có)
        records: {
          where: { recordDate: targetDate },
          take: 1,
        },
      },
      orderBy: { code: "asc" }, // Sắp xếp theo mã đồng hồ
    });

    // Định dạng lại dữ liệu trả về cho Frontend dễ đọc
    const result = meters.map((m) => {
      const { records, ...rest } = m;
      return {
        ...rest,
        todayRecord: records.length > 0 ? records[0] : null,
      };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Lỗi lấy danh sách đồng hồ:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
