import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const substationId = searchParams.get("substationId");
  const dateStr = searchParams.get("date"); // Ví dụ: "2026-03-29"

  if (!substationId || !dateStr) {
    return NextResponse.json(
      { error: "Thiếu tham số substationId hoặc date" },
      { status: 400 },
    );
  }

  try {
    // VÁ LỖI MÚI GIỜ: Tạo khoảng thời gian từ 00h00 đến 23h59 theo múi giờ Việt Nam (+07:00)
    // Cách này sẽ "tóm" được mọi bản ghi trong ngày dù nó được lưu bởi AI (Cronjob) hay do người dùng nhập tay
    const startOfDay = new Date(`${dateStr}T00:00:00.000+07:00`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999+07:00`);

    // Tìm tất cả đồng hồ đang hoạt động thuộc Trạm biến áp này
    const meters = await prisma.powerMeter.findMany({
      where: {
        substationId: Number(substationId),
        isActive: true,
      },
      include: {
        // Kéo theo bản ghi chốt số NẰM TRONG KHOẢNG thời gian của ngày đó
        records: {
          where: {
            recordDate: {
              gte: startOfDay, // Lớn hơn hoặc bằng 00h00
              lte: endOfDay, // Nhỏ hơn hoặc bằng 23h59
            },
          },
          take: 1, // Lấy 1 bản ghi là đủ để biết đã chốt hay chưa
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
