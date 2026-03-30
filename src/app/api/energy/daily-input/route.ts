import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Hàm hỗ trợ ép kiểu an toàn
const parseNum = (val: any) =>
  val !== undefined && val !== null && val !== "" ? Number(val) : null;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { recordDate, meterId, isReset, consTotal, costTotal, ...values } =
      body;

    const dateObj = new Date(`${recordDate}T12:00:00.000+07:00`);
    const mId = Number(meterId);

    // Đóng gói dữ liệu cần lưu
    const dataPayload = {
      isReset: Boolean(isReset),

      // ---> ĐÂY CHÍNH LÀ CHÌA KHÓA: ÉP CỨNG GHI NHẬN NGUỒN NHẬP TAY
      dataSource: "MANUAL",

      // Hạ thế
      prevTotal: parseNum(values.prevTotal),
      currTotal: parseNum(values.currTotal),

      // Trung thế
      prevNormal: parseNum(values.prevNormal),
      currNormal: parseNum(values.currNormal),

      prevPeak: parseNum(values.prevPeak),
      currPeak: parseNum(values.currPeak),

      prevOffPeak: parseNum(values.prevOffPeak),
      currOffPeak: parseNum(values.currOffPeak),

      // Kết quả tính toán
      consTotal: parseNum(consTotal) || 0,
      costTotal: parseNum(costTotal) || 0,

      note: isReset ? "Đã thay đồng hồ / Reset" : null,
    };

    // Dùng upsert: Nếu máy tự động (AUTO) đã chốt nhưng bị sai,
    // khi user bấm LƯU thì sẽ đè thành (MANUAL) sửa sai cho máy.
    const record = await prisma.powerRecord.upsert({
      where: {
        recordDate_meterId: {
          recordDate: dateObj,
          meterId: mId,
        },
      },
      update: dataPayload,
      create: {
        recordDate: dateObj,
        meterId: mId,
        ...dataPayload,
      },
    });

    return NextResponse.json(record, { status: 200 });
  } catch (error: any) {
    console.error("Lỗi lưu chỉ số điện:", error);
    return NextResponse.json(
      { error: "Lỗi lưu dữ liệu: " + error.message },
      { status: 500 },
    );
  }
}
