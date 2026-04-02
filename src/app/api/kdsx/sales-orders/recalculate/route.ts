import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { recalculateAllocation } from "@/lib/allocation-engine";

// POST /api/kdsx/sales-orders/recalculate
// Body: { factoryId, fromDate, toDate }
// Admin only — tính lại toàn bộ allocation trong khoảng thời gian
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.role;
  if (userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden — chỉ Admin" }, { status: 403 });
  }

  const body = await req.json();
  const { factoryId, fromDate, toDate } = body;

  if (!factoryId || !fromDate || !toDate) {
    return NextResponse.json(
      { error: "Bắt buộc: factoryId, fromDate, toDate" },
      { status: 400 },
    );
  }

  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: "fromDate / toDate không hợp lệ" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "fromDate phải <= toDate" }, { status: 400 });
  }

  await recalculateAllocation(Number(factoryId), from, to);

  return NextResponse.json({ success: true, factoryId, fromDate, toDate });
}
