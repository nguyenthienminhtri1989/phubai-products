import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// Chuẩn hóa ngày về 00:00:00 UTC để khớp với @db.Date của Prisma/PostgreSQL
const normalizeDate = (dateStr: string) => {
  return new Date(`${dateStr}T00:00:00.000Z`);
};

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const machineId = searchParams.get("machineId");
  const date = searchParams.get("date");
  const shift = searchParams.get("shift");

  if (!machineId || !date || !shift) return NextResponse.json(null);

  const log = await prisma.productionLog.findFirst({
    where: {
      machineId: parseInt(machineId),
      recordDate: normalizeDate(date),
      shift: parseInt(shift),
    },
    orderBy: { id: "desc" },
  });

  return NextResponse.json(log ?? null);
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

    const body = await request.json();
    const { recordDate, note } = body;
    let {
      machineId,
      shift,
      itemId,
      startIndex,
      endIndex,
      inputNE,
      finalOutput,
    } = body;

    // 1. Ép kiểu dữ liệu an toàn
    machineId = parseInt(machineId);
    shift = parseInt(shift);
    itemId = parseInt(itemId);
    startIndex = startIndex != null ? parseFloat(startIndex) : 0;
    endIndex = endIndex != null ? parseFloat(endIndex) : null;
    inputNE = inputNE != null ? parseFloat(inputNE) : null;
    finalOutput = finalOutput != null ? Math.round(parseFloat(finalOutput)) : 0;

    if (isNaN(machineId) || isNaN(shift) || isNaN(itemId)) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ" },
        { status: 400 },
      );
    }

    // 2. Chuẩn hóa ngày
    const dateObj = normalizeDate(recordDate);

    // 3. Kiểm tra quyền
    const accessLevel = (session.user as any).accessLevel;
    if (session.user.role !== "ADMIN" && accessLevel === "READ_ONLY") {
      return NextResponse.json({ error: "Chỉ có quyền xem" }, { status: 403 });
    }

    const dataToSave = {
      machineId,
      recordDate: dateObj,
      shift,
      itemId,
      startIndex,
      endIndex,
      inputNE,
      finalOutput,
      note,
      createdById: parseInt(session.user.id),
    };

    // 4. SỬ DỤNG UPSERT: Tự động Cập nhật hoặc Tạo mới dựa trên khóa Unique
    // Khóa này được Prisma tự sinh từ @@unique([machineId, recordDate, shift, itemId])
    const savedLog = await prisma.productionLog.upsert({
      where: {
        machineId_recordDate_shift_itemId: {
          machineId,
          recordDate: dateObj,
          shift,
          itemId,
        },
      },
      update: dataToSave,
      create: dataToSave,
    });

    // 5. Cập nhật thông tin máy
    await prisma.machine.update({
      where: { id: machineId },
      data: {
        currentItemId: itemId,
        ...(inputNE ? { currentNE: parseFloat(inputNE) } : {}),
      },
    });

    return NextResponse.json(savedLog);
  } catch (error: any) {
    console.error("Save Error Details:", error);
    // Nếu vẫn lỗi P2002 sau khi dùng upsert, có thể do itemId bị thay đổi
    return NextResponse.json(
      {
        error: "Lỗi lưu dữ liệu",
        detail:
          error.code === "P2002"
            ? "Xung đột dữ liệu ca làm việc"
            : error.message,
      },
      { status: 500 },
    );
  }
}

// CODE ĐÃ THỰC SỰ ĐƯỢC ĐẨY LÊN GIT CHƯA??????
