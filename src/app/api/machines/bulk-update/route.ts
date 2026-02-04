// app/api/machines/bulk-update/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { machineIds, itemId, currentNE } = body;
    // machineIds: Mảng chứa các ID [1, 2, 3, 4, 5]
    // itemId: ID mặt hàng muốn gán
    // currentNE: Chi số (nếu có cập nhật luôn)

    if (!machineIds || machineIds.length === 0) {
      return NextResponse.json({ error: "Chưa chọn máy nào" }, { status: 400 });
    }

    // Cập nhật 1 lần cho tất cả máy được chọn
    await prisma.machine.updateMany({
      where: {
        id: { in: machineIds }, // Logic: Cập nhật những máy có ID nằm trong danh sách
      },
      data: {
        currentItemId: itemId,
        currentNE: currentNE || null, // Cập nhật luôn chi số nếu có
      },
    });

    return NextResponse.json({ message: "Cập nhật thành công" });
  } catch (error) {
    console.error("Lỗi cập nhật máy móc", error);
    return NextResponse.json({ error: "Lỗi cập nhật" }, { status: 500 });
  }
}
