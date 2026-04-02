import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { recalculateAllocation } from "@/lib/allocation-engine";

// Vercel: cho phép timeout dài hơn (nếu deploy trên Vercel)
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Chỉ Admin mới được recalculate" }, { status: 403 });
  }

  const body = await req.json();
  const { factoryId, fromDate, toDate } = body;

  if (!factoryId || !fromDate || !toDate) {
    return NextResponse.json(
      { error: "Thiếu thông tin bắt buộc: factoryId, fromDate, toDate" },
      { status: 400 },
    );
  }

  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: "fromDate hoặc toDate không hợp lệ" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "fromDate phải trước hoặc bằng toDate" }, { status: 400 });
  }

  // Giới hạn khoảng thời gian tối đa 365 ngày
  const diffDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays > 365) {
    return NextResponse.json(
      { error: "Khoảng thời gian tối đa là 365 ngày" },
      { status: 400 },
    );
  }

  try {
    await recalculateAllocation(Number(factoryId), from, to);
    return NextResponse.json({ message: "Recalculated successfully", daysProcessed: diffDays });
  } catch (err: any) {
    console.error("Recalculate allocation error:", err);
    return NextResponse.json(
      { error: "Lỗi khi tính lại phân bổ", detail: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
