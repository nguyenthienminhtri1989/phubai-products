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
    // 1. LẤY THÔNG TIN NGƯỜI DÙNG
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
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

    // Validate Input
    if (!machineId || !recordDate || !shift || !itemId) {
      return NextResponse.json(
        { error: "Thiếu thông tin bắt buộc" },
        { status: 400 },
      );
    }

    // Ép kiểu an toàn
    machineId = parseInt(machineId);
    shift = parseInt(shift);
    itemId = parseInt(itemId);
    startIndex = startIndex != null ? parseFloat(startIndex) : 0; // != null bắt cả undefined
    endIndex = endIndex != null ? parseFloat(endIndex) : null;
    inputNE = inputNE != null ? parseFloat(inputNE) : null;
    finalOutput = Math.round(parseFloat(finalOutput));

    // Validate sau khi parseInt — bắt NaN nếu giá trị không hợp lệ
    if (isNaN(machineId) || isNaN(shift) || isNaN(itemId)) {
      return NextResponse.json({ error: "machineId / shift / itemId không hợp lệ" }, { status: 400 });
    }

    // 2. LOGIC BẢO MẬT: KIỂM TRA QUYỀN NHẬP LIỆU
    // Chặn user READ_ONLY — không có quyền ghi dữ liệu
    const accessLevel = (session.user as any).accessLevel;
    if (session.user.role !== "ADMIN" && accessLevel === "READ_ONLY") {
      return NextResponse.json(
        { error: "Tài khoản chỉ có quyền xem. Liên hệ quản trị viên để được cấp quyền nhập liệu." },
        { status: 403 },
      );
    }

    // Nếu không phải ADMIN, bắt buộc phải kiểm tra Process
    if (session.user.role !== "ADMIN") {
      // Lấy thông tin máy để biết nó thuộc công đoạn nào
      const targetMachine = await prisma.machine.findUnique({
        where: { id: machineId },
        select: { processId: true },
      });

      if (!targetMachine) {
        return NextResponse.json(
          { error: "Máy không tồn tại" },
          { status: 404 },
        );
      }

      // So sánh công đoạn của User và công đoạn của Máy
      const userProcessIds: number[] = (session.user as any).processIds || [];

      if (!userProcessIds.includes(targetMachine.processId)) {
        return NextResponse.json(
          {
            error:
              "BẠN KHÔNG CÓ QUYỀN! Tài khoản của bạn không được phép nhập liệu cho máy thuộc công đoạn này.",
          },
          { status: 403 },
        );
      }
    }

    // Xử lý Date: Giữ nguyên ngày YYYY-MM-DD từ client gửi lên để tránh lệch múi giờ
    const dateObj = new Date(recordDate);

    // Tìm xem đã có chưa (Update hay Create) - tìm theo cả itemId để hỗ trợ đổi hàng giữa ca
    const existingLog = await prisma.productionLog.findFirst({
      where: {
        machineId,
        recordDate: dateObj,
        shift,
        itemId,
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
      savedLog = await prisma.productionLog.update({
        where: { id: existingLog.id },
        data: dataToSave,
      });
    } else {
      try {
        savedLog = await prisma.productionLog.create({ data: dataToSave });
      } catch (createError: any) {
        // P2002 = unique constraint violation: record tồn tại nhưng findFirst miss
        // (thường do timezone @db.Date hoặc itemId không khớp ở lần tìm trước)
        if (createError.code === "P2002") {
          const conflicting = await prisma.productionLog.findFirst({
            where: { machineId, recordDate: dateObj, shift, itemId },
          });
          if (!conflicting) throw createError;
          savedLog = await prisma.productionLog.update({
            where: { id: conflicting.id },
            data: dataToSave,
          });
        } else {
          throw createError;
        }
      }
    }

    // Update mặt hàng & NE cho máy để lần sau tự điền
    await prisma.machine.update({
      where: { id: machineId },
      data: {
        currentItemId: itemId,
        ...(inputNE ? { currentNE: parseFloat(inputNE) } : {}),
      },
    });

    return NextResponse.json(savedLog);
  } catch (error) {
    console.error("Save Error:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}
