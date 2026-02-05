import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
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

    // Validate
    if (!machineId || !recordDate || !shift) {
      return NextResponse.json(
        { error: "Thiếu thông tin bắt buộc" },
        { status: 400 },
      );
    }

    // Ép kiểu an toàn
    machineId = parseInt(machineId);
    shift = parseInt(shift);
    itemId = parseInt(itemId);
    startIndex = startIndex !== null ? parseFloat(startIndex) : 0; // Lưu 0 nếu null
    endIndex = endIndex !== null ? parseFloat(endIndex) : null;
    inputNE = inputNE ? parseFloat(inputNE) : null;
    finalOutput = parseFloat(finalOutput);

    // Xử lý Date: Giữ nguyên ngày YYYY-MM-DD từ client gửi lên để tránh lệch múi giờ
    const dateObj = new Date(recordDate);

    // Tìm xem đã có chưa (Update hay Create)
    const existingLog = await prisma.productionLog.findFirst({
      where: {
        machineId,
        recordDate: dateObj,
        shift,
      },
    });

    let savedLog;
    const dataToSave = {
      machineId,
      recordDate: dateObj,
      shift,
      itemId,
      startIndex, // Đã có trong Schema
      endIndex,
      inputNE,
      finalOutput,
      note,
    };

    if (existingLog) {
      savedLog = await prisma.productionLog.update({
        where: { id: existingLog.id },
        data: dataToSave,
      });
    } else {
      savedLog = await prisma.productionLog.create({
        data: dataToSave,
      });
    }

    // Update NE cho máy để lần sau tự điền
    if (inputNE) {
      await prisma.machine.update({
        where: { id: machineId },
        data: { currentNE: parseFloat(inputNE) },
      });
    }

    return NextResponse.json(savedLog);
  } catch (error) {
    console.error("Save Error:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}
