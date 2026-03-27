import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const normalizeDate = (dateStr: string) => new Date(`${dateStr}T00:00:00.000Z`);

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const machineId = parseInt(searchParams.get("machineId") || "");
  const recordDate = searchParams.get("recordDate") || "";
  const shift = parseInt(searchParams.get("shift") || "");

  if (isNaN(machineId) || !recordDate || isNaN(shift)) {
    return NextResponse.json({ hasMissing: false, missingShifts: [] });
  }

  // Xây dựng danh sách (ngày, ca) cần kiểm tra
  type Slot = { date: Date; dateStr: string; shift: number };
  const toCheck: Slot[] = [];

  const currentDate = normalizeDate(recordDate);

  if (shift === 1) {
    // Ca 1: kiểm tra tất cả ca (1,2,3) của ngày hôm trước
    const prevDate = new Date(currentDate);
    prevDate.setUTCDate(prevDate.getUTCDate() - 1);
    const prevDateStr = prevDate.toISOString().split("T")[0];
    [1, 2, 3].forEach((s) =>
      toCheck.push({ date: prevDate, dateStr: prevDateStr, shift: s })
    );
  } else {
    // Ca 2 hoặc 3: kiểm tra các ca nhỏ hơn trong cùng ngày
    for (let s = 1; s < shift; s++) {
      toCheck.push({ date: currentDate, dateStr: recordDate, shift: s });
    }
  }

  if (toCheck.length === 0) {
    return NextResponse.json({ hasMissing: false, missingShifts: [] });
  }

  // Lấy tên máy
  const machine = await prisma.machine.findUnique({
    where: { id: machineId },
    select: { name: true },
  });
  const machineName = machine?.name ?? `Máy ${machineId}`;

  // Kiểm tra từng slot
  const missingShifts: Array<{ date: string; shift: number; machineName: string }> = [];

  for (const slot of toCheck) {
    const logs = await prisma.productionLog.findMany({
      where: {
        machineId,
        recordDate: slot.date,
        shift: slot.shift,
      },
      select: { note: true },
    });

    // Bỏ qua nếu máy đã được đánh dấu dừng trong ca đó
    const isStopped = logs.some((l) => l.note === "Máy dừng");
    if (isStopped) continue;

    // Ca thiếu: chưa có bản ghi nào
    if (logs.length === 0) {
      missingShifts.push({ date: slot.dateStr, shift: slot.shift, machineName });
    }
  }

  return NextResponse.json({
    hasMissing: missingShifts.length > 0,
    missingShifts,
  });
}
