import { NextRequest, NextResponse } from "next/server";
import {
  getMonthlyItemTotals,
  ItemTotalMode,
} from "@/lib/kdsx/monthly-item-totals";

// GET /api/kdsx/item-totals?factoryId=3&processId=5&yearMonth=2026-05&mode=ACTUAL_PROJECTED
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const factoryId = parseInt(sp.get("factoryId") ?? "0");
  const processId = parseInt(sp.get("processId") ?? "0");
  const yearMonth = sp.get("yearMonth") ?? "";
  const mode = (sp.get("mode") ?? "ACTUAL") as ItemTotalMode;

  if (!factoryId || !processId || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { error: "Thiếu factoryId, processId hoặc yearMonth không hợp lệ" },
      { status: 400 },
    );
  }

  if (!["PLAN", "ACTUAL", "ACTUAL_PROJECTED"].includes(mode)) {
    return NextResponse.json(
      { error: "mode phải là PLAN | ACTUAL | ACTUAL_PROJECTED" },
      { status: 400 },
    );
  }

  const totals = await getMonthlyItemTotals(factoryId, processId, yearMonth, mode);
  return NextResponse.json({ factoryId, processId, yearMonth, mode, totals });
}
