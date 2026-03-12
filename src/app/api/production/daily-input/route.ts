import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// Hàm hỗ trợ chuẩn hóa ngày về 00:00:00 UTC để khớp với @db.Date trong Prisma
const normalizeDate = (dateStr: string) => {
  return new Date(`${dateStr}T00:00:00.000Z`);
};

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const machineId = searchParams.get("machineId");
  const date = searchParams.get("date");
  const shift = searchParams.get("shift");

  if (!machineId || !date || !shift) {
    return NextResponse.json(null);
  }

  const log = await prisma.productionLog.findFirst({
    where: {
      machineId: parseInt(machineId),
      recordDate: normalizeDate(date),
      shift: parseInt(shift),
    },
    orderBy: { id: "desc" },
    select: { id: true, endIndex: true, startIndex: true, finalOutput: true, note: true, itemId: true },
  });

  return NextResponse.json(log ?? null);
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

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

    // 1. Ép kiểu dữ liệu
    machineId = parseInt(machineId);
    shift = parseInt(shift);
    itemId = parseInt(itemId);
    startIndex = startIndex != null ? parseFloat(startIndex) : 0;
    endIndex = endIndex != null ? parseFloat(endIndex) : null;
    inputNE = inputNE != null ? parseFloat(inputNE) : null;
    finalOutput = finalOutput != null ? Math.round(parseFloat(finalOutput)) : 0;

    if (isNaN(machineId) || isNaN(shift) || isNaN(itemId)) {
      return NextResponse.json({ error: "Dữ liệu đầu vào không hợp lệ" }, { status: 400 });
    }

    // 2. Chuẩn hóa ngày (Quan trọng để tìm đúng bản ghi cũ)
    const dateObj = normalizeDate(recordDate);

    // 3. Kiểm tra quyền hạn
    const accessLevel = (session.user as any).accessLevel;
    if (session.user.role !== "ADMIN" && accessLevel === "READ_ONLY") {
      return NextResponse.json({ error: "Tài khoản không có quyền nhập liệu" }, { status: 403 });
    }

    // 4. Tìm bản ghi hiện tại để Cập nhật (Update) hoặc Tạo mới (Create)
    const existingLog = await prisma.productionLog.findFirst({
      where: {
        machineId,
        recordDate: dateObj,
        shift,
        itemId, // Tìm theo đúng mặt hàng đang sửa
      },
    });

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

    let savedLog;
    if (existingLog) {
      // CẬP NHẬT: Nếu đã tồn tại, ghi đè toàn bộ (bao gồm startIndex và finalOutput mới)
      savedLog = await prisma.productionLog.update({
        where: { id: existingLog.id },
        data: dataToSave,
      });
    } else {
      // TẠO MỚI: Nếu chưa có
      try {
        savedLog = await prisma.productionLog.create({
          data: dataToSave,
        });
      } catch (e: any) {
        if (e.code === 'P2002') {
          // Xử lý race condition: nếu vừa được tạo bởi người khác, thì update nó
          const fallback = await prisma.productionLog.findFirst({
            where: { machineId, recordDate: dateObj, shift, itemId }
          });
          if (fallback) {
            savedLog = await prisma.productionLog.update({
              where: { id: fallback.id },
              data: dataToSave
            });
          } else throw e;
        } else throw e;
      }
    }

    // 5. Cập nhật trạng thái máy
    await prisma.machine.update({
      where: { id: machineId },
      data: {
        currentItemId: itemId,
        ...(inputNE ? { currentNE: parseFloat(inputNE) } : {}),
      },
    });

    return NextResponse.json(savedLog);
  } catch (error: any) {
    console.error("Save Error:", error);
    return NextResponse.json({ error: "Lỗi hệ thống", detail: error.message }, { status: 500 });
  }
}
