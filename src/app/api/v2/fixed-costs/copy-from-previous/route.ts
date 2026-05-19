import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function getPreviousYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { factoryId, yearMonth } = body as {
      factoryId: number;
      yearMonth: string;
    };

    if (!factoryId || !yearMonth) {
      return NextResponse.json(
        { error: "factoryId và yearMonth là bắt buộc" },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json(
        { error: "yearMonth phải có định dạng YYYY-MM" },
        { status: 400 }
      );
    }

    const previousYearMonth = getPreviousYearMonth(yearMonth);

    // Kiểm tra tháng trước có dữ liệu không
    const previousEntries = await prisma.fixedCostEntry.findMany({
      where: { factoryId, yearMonth: previousYearMonth },
    });

    if (previousEntries.length === 0) {
      return NextResponse.json(
        {
          error: `Chưa có chi phí tháng trước (${previousYearMonth}) để copy`,
        },
        { status: 404 }
      );
    }

    // Kiểm tra tháng hiện tại đã có dữ liệu chưa
    const currentCount = await prisma.fixedCostEntry.count({
      where: { factoryId, yearMonth },
    });

    if (currentCount > 0) {
      return NextResponse.json(
        {
          error: `Tháng ${yearMonth} đã có ${currentCount} dòng chi phí. Không copy đè.`,
        },
        { status: 409 }
      );
    }

    // Tạo mới các dòng cho tháng hiện tại từ tháng trước
    const newEntries = await prisma.fixedCostEntry.createMany({
      data: previousEntries.map((e) => ({
        factoryId,
        yearMonth,
        costType: e.costType,
        amountVnd: e.amountVnd,
        note: e.note,
      })),
    });

    return NextResponse.json({
      copied: newEntries.count,
      fromYearMonth: previousYearMonth,
      toYearMonth: yearMonth,
      factoryId,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
