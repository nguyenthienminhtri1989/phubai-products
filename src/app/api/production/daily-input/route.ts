import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

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
      recordDate: new Date(date),
      shift: parseInt(shift),
    },
    orderBy: { id: "desc" },
    select: { id: true, endIndex: true, startIndex: true, finalOutput: true, note: true },
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

    // 1. Ép kiểu và kiểm tra dữ liệu đầu vào
    machineId = parseInt(machineId);
    shift = parseInt(shift);
    itemId = parseInt(itemId);
    startIndex = startIndex != null ? parseFloat(startIndex) : 0;
    endIndex = endIndex != null ? parseFloat(endIndex) : null;
    inputNE = inputNE != null ? parseFloat(inputNE) : null;
    finalOutput = finalOutput != null ? Math.round(parseFloat(finalOutput)) : 0;

    if (isNaN(machineId) || isNaN(shift) || isNaN(itemId)) {
      return NextResponse.json({ error: "Thông tin máy/ca/hàng không hợp lệ" }, { status: 400 });
    }

    // 2. Xử lý ngày tháng chuẩn (tránh lệch múi giờ)
    // Dùng chuỗi YYYY-MM-DD trực tiếp để Prisma xử lý @db.Date chính xác
    const dateObj = new Date(`${recordDate}T00:00:00.000Z`);

    // 3. Kiểm tra quyền hạn
    const accessLevel = (session.user as any).accessLevel;
    if (session.user.role !== "ADMIN" && accessLevel === "READ_ONLY") {
      return NextResponse.json({ error: "Tài khoản không có quyền nhập liệu" }, { status: 403 });
    }

    // 4. Tìm bản ghi cũ để cập nhật hoặc tạo mới
    // Tìm chính xác theo tổ hợp Unique: Máy + Ngày + Ca + Mặt hàng
    const existingLog = await prisma.productionLog.findFirst({
      where: {
        machineId,
        recordDate: dateObj,
        shift,
        itemId,
      },
    });

    const userId = parseInt(session.user.id);
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
      createdById: isNaN(userId) ? null : userId,
    };

    let savedLog;
    if (existingLog) {
      // Nếu đã có bản ghi, thực hiện Cập nhật
      savedLog = await prisma.productionLog.update({
        where: { id: existingLog.id },
        data: dataToSave,
      });
    } else {
      // Nếu chưa có, tạo mới (Sử dụng try-catch riêng để bắt lỗi Unique)
      try {
        savedLog = await prisma.productionLog.create({
          data: dataToSave,
        });
      } catch (createError: any) {
        // Nếu xảy ra lỗi trùng lặp (P2002), tìm lại lần nữa và ghi đè
        if (createError.code === "P2002") {
          const fallbackLog = await prisma.productionLog.findFirst({
            where: { machineId, recordDate: dateObj, shift, itemId },
          });
          if (fallbackLog) {
            savedLog = await prisma.productionLog.update({
              where: { id: fallbackLog.id },
              data: dataToSave,
            });
          } else {
            throw createError;
          }
        } else {
          throw createError;
        }
      }
    }

    // 5. Cập nhật trạng thái máy (Mặt hàng và Chi số hiện tại)
    const machineUpdateData: any = { currentItemId: itemId };
    if (inputNE !== null && !isNaN(inputNE)) {
      machineUpdateData.currentNE = inputNE;
    }

    await prisma.machine.update({
      where: { id: machineId },
      data: machineUpdateData,
    });

    return NextResponse.json(savedLog);
  } catch (error: any) {
    console.error("Critical Save Error:", error);
    return NextResponse.json({ 
      error: "Lỗi hệ thống khi lưu", 
      message: error.message 
    }, { status: 500 });
  }
}
