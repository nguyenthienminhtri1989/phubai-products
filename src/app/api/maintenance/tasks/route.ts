import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// 1. GET: Lấy danh sách hạng mục
export async function GET() {
  try {
    const tasks = await prisma.maintenanceTask.findMany({
      include: {
        machine: {
          select: {
            id: true,
            name: true,
            processId: true,
            process: {
              select: { id: true, name: true }, // Lấy tên công đoạn để hiển thị
            },
          },
        },
      },
      orderBy: {
        nextDueDate: "asc", // Ưu tiên việc gấp lên đầu
      },
    });

    return NextResponse.json(tasks);
  } catch (error: any) {
    console.error("GET Maintenance Error:", error);
    return NextResponse.json(
      { error: "Lỗi tải danh sách: " + error.message },
      { status: 500 },
    );
  }
}

// 2. POST: Thêm mới hạng mục
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      machineId,
      taskName,
      intervalMonths,
      nextDueDate,
      leadTimeDays,
      description,
    } = body;

    // --- VALIDATION & PARSING (Quan trọng cho TypeScript/Prisma) ---

    // Kiểm tra thiếu trường
    if (!machineId || !taskName || !intervalMonths || !nextDueDate) {
      return NextResponse.json(
        {
          error:
            "Vui lòng điền đầy đủ: Máy, Tên hạng mục, Chu kỳ, Ngày bắt đầu.",
        },
        { status: 400 },
      );
    }

    // Ép kiểu an toàn (Frontend có thể gửi string)
    const parsedMachineId = Number(machineId);
    const parsedInterval = parseFloat(intervalMonths);
    const parsedLeadTime = leadTimeDays ? parseInt(leadTimeDays) : 30;

    // Kiểm tra tính hợp lệ của số
    if (isNaN(parsedMachineId))
      return NextResponse.json(
        { error: "ID máy không hợp lệ" },
        { status: 400 },
      );
    if (isNaN(parsedInterval))
      return NextResponse.json(
        { error: "Chu kỳ không hợp lệ" },
        { status: 400 },
      );

    // Tạo bản ghi mới
    const newTask = await prisma.maintenanceTask.create({
      data: {
        machineId: parsedMachineId,
        taskName: String(taskName),
        description: description ? String(description) : "",
        intervalMonths: parsedInterval,
        nextDueDate: new Date(nextDueDate), // Chuyển ISO string sang Date Object
        leadTimeDays: parsedLeadTime,
        emailNotify: true,
      },
    });

    return NextResponse.json(newTask, { status: 201 });
  } catch (error: any) {
    console.error("POST Maintenance Error:", error);
    return NextResponse.json(
      { error: "Không thể lưu dữ liệu: " + error.message },
      { status: 500 },
    );
  }
}
