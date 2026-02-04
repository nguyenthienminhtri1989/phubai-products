// app/api/production/daily-input/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { recordDate, note } = body;
    let { machineId, shift, itemId, endIndex, inputNE, finalOutput } = body;

    // 1. Kiểm tra dữ liệu bắt buộc
    if (!machineId || !recordDate || !shift) {
      return NextResponse.json(
        { error: "Thiếu thông tin máy, ngày hoặc ca" },
        { status: 400 },
      );
    }

    // 2. Kiểm tra itemId (tên mặt hàng được gán)
    if (!itemId) {
      return NextResponse.json(
        {
          error:
            "Máy này chưa được gán Mặt hàng. Vui lòng vào trang 'Danh mục Máy' hoặc 'điều phối'để gán mặt hàng trước khi nhập sản lượng.",
        },
        { status: 400 },
      );
    }

    // 3. Ép kiểu dữ liệu sang số (Int/Float) để Prisma không báo lỗi
    machineId = parseInt(machineId);
    shift = parseInt(shift);
    itemId = parseInt(itemId);
    endIndex = endIndex !== null ? parseFloat(endIndex) : null;
    inputNE = inputNE ? parseFloat(inputNE) : null;
    finalOutput = parseFloat(finalOutput);
    // --------------------

    const dateObj = new Date(recordDate);

    // 2. Kiểm tra xem đã có bản ghi nào trùng (Máy + Ngày + Ca) chưa?
    const existingLog = await prisma.productionLog.findFirst({
      where: {
        machineId: machineId,
        recordDate: dateObj,
        shift: shift,
      },
    });

    let savedLog;

    if (existingLog) {
      // A. Nếu có rồi -> UPDATE
      savedLog = await prisma.productionLog.update({
        where: { id: existingLog.id },
        data: {
          itemId,
          endIndex,
          inputNE,
          finalOutput,
          note,
          // Cập nhật người sửa nếu bạn có hệ thống auth (createdById)
        },
      });
    } else {
      // B. Nếu chưa có -> CREATE
      savedLog = await prisma.productionLog.create({
        data: {
          machineId,
          recordDate: dateObj,
          shift,
          itemId,
          endIndex,
          inputNE,
          finalOutput,
          note,
        },
      });
    }

    // 2. CẬP NHẬT TRẠNG THÁI MÁY (Phụ trợ)
    // Nếu đây là bản ghi mới nhất, hãy cập nhật lại Chi số hiện tại vào bảng Machine
    // để lần sau mở form lên nó tự điền số mới này.
    if (inputNE) {
      await prisma.machine.update({
        where: { id: machineId },
        data: { currentNE: parseFloat(inputNE) },
      });
    }

    return NextResponse.json(savedLog, { status: 200 });
  } catch (error) {
    console.error("Lỗi lưu nhật ký:", error);
    return NextResponse.json(
      { error: "Lỗi hệ thống khi lưu" },
      { status: 500 },
    );
  }
}
