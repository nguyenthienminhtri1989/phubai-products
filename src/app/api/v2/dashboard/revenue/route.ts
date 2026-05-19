import { NextRequest, NextResponse } from "next/server";
import {
  runAllocationFromProduction,
  runAllocationToday,
} from "@/lib/allocation-engine-v2";
import { calculateRevenuePnL } from "@/lib/kdsx/calculator-v2";

export async function GET(req: NextRequest) {
  const factoryId = Number(req.nextUrl.searchParams.get("factoryId"));
  const yearMonth = req.nextUrl.searchParams.get("yearMonth") ?? "";

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

  try {
    // 1. MTD (đầu tháng → hôm nay)
    const mtdAllocation = await runAllocationFromProduction(
      factoryId,
      yearMonth,
      "REAL"
    );
    const mtd = await calculateRevenuePnL(
      mtdAllocation,
      factoryId,
      yearMonth,
      "REAL"
    );

    // 2. Projected (cả tháng)
    const projAllocation = await runAllocationFromProduction(
      factoryId,
      yearMonth,
      "PROJECTION"
    );
    const projected = await calculateRevenuePnL(
      projAllocation,
      factoryId,
      yearMonth,
      "PROJECTION"
    );

    // 3. Today (chỉ hôm nay)
    const todayAllocation = await runAllocationToday(factoryId, yearMonth);
    const today = await calculateRevenuePnL(
      todayAllocation,
      factoryId,
      yearMonth,
      "REAL"
    );

    return NextResponse.json({
      today,
      mtd,
      projected,
      meta: {
        factoryId,
        yearMonth,
        calculatedAt: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
