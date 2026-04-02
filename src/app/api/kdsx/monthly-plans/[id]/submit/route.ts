import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const REQUIRED_COST_TYPES = ["TIEN_LUONG", "TIEN_DIEN", "KHAU_HAO"] as const;
const REQUIRED_COST_LABELS: Record<string, string> = {
  TIEN_LUONG: "Tiền lương",
  TIEN_DIEN: "Tiền điện",
  KHAU_HAO: "Khấu hao",
};

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.role;
  const accessLevel = (session.user as any)?.accessLevel;
  if (userRole !== "ADMIN" && accessLevel !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const plan = await prisma.monthlyPlan.findUnique({
    where: { id: Number(id) },
    include: {
      lineItems: true,
      fixedCosts: true,
    },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (plan.status !== "DRAFT") {
    return NextResponse.json({ error: "Chỉ có thể nộp kế hoạch ở trạng thái DRAFT" }, { status: 400 });
  }

  const errors: string[] = [];

  // ① Phải có ít nhất 1 dòng sợi
  if (plan.lineItems.length === 0) {
    errors.push("Chưa có dòng sợi nào trong kế hoạch");
  }

  // ② Tất cả dòng sợi phải có qty > 0 và unitPrice > 0
  const invalidLines = plan.lineItems.filter((l) => l.qty <= 0 || l.unitPriceUsd <= 0);
  if (invalidLines.length > 0) {
    errors.push(`${invalidLines.length} dòng sợi có số lượng hoặc đơn giá bằng 0`);
  }

  // ③ Phải có ít nhất 1 khoản chi phí cố định đã nhập (> 0)
  const hasAnyFixedCost = plan.fixedCosts.some((f) => f.amountVnd > 0);
  if (!hasAnyFixedCost) {
    errors.push("Chưa nhập chi phí cố định tháng");
  }

  // ④ Các khoản CP cố định bắt buộc phải có giá trị > 0
  const enteredTypes = new Set(
    plan.fixedCosts.filter((f) => f.amountVnd > 0).map((f) => f.costType as string)
  );
  const missingRequired = REQUIRED_COST_TYPES.filter((t) => !enteredTypes.has(t));
  if (missingRequired.length > 0) {
    errors.push(
      `Chưa nhập các khoản bắt buộc: ${missingRequired.map((t) => REQUIRED_COST_LABELS[t]).join(", ")}`
    );
  }

  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const updated = await prisma.monthlyPlan.update({
    where: { id: Number(id) },
    data: { status: "SUBMITTED" },
  });
  return NextResponse.json(updated);
}
