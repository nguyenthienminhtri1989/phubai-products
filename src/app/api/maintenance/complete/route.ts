import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { taskId, performedBy, notes, cost } = body;

    if (!taskId) {
      return NextResponse.json(
        { error: "Thiếu ID hạng mục bảo dưỡng" },
        { status: 400 },
      );
    }

    // Sử dụng $transaction để đảm bảo tính toàn vẹn dữ liệu
    const result = await prisma.$transaction(async (tx) => {
      // 1. Tìm thông tin hạng mục hiện tại để lấy chu kỳ (intervalMonths)
      const task = await tx.maintenanceTask.findUnique({
        where: { id: taskId },
      });

      if (!task) throw new Error("Không tìm thấy hạng mục bảo dưỡng");

      // 2. Tạo bản ghi Lịch sử mới
      const history = await tx.maintenanceHistory.create({
        data: {
          taskId,
          performedDate: new Date(),
          performedBy,
          notes,
          cost: parseFloat(cost) || 0,
        },
      });

      // 3. Tính toán ngày đến hạn tiếp theo
      // NextDueDate = Ngày hôm nay + intervalMonths
      const nextDate = new Date();
      nextDate.setMonth(nextDate.getMonth() + task.intervalMonths);

      // 4. Cập nhật trạng thái mới nhất vào bảng Task
      const updatedTask = await tx.maintenanceTask.update({
        where: { id: taskId },
        data: {
          lastPerformedDate: new Date(),
          nextDueDate: nextDate,
        },
      });

      return { history, updatedTask };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
