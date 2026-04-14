import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

function detectShift(date: Date): number {
  const hour = date.getHours();
  if (hour >= 6 && hour < 14) return 1;
  if (hour >= 14 && hour < 22) return 2;
  return 3;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const machineId = searchParams.get("machineId");
  const processId = searchParams.get("processId");
  const factoryId = searchParams.get("factoryId");
  const categoryId = searchParams.get("categoryId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const activeOnly = searchParams.get("activeOnly") === "true";
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  const userRole = (session.user as any)?.userRole as string | undefined;
  const userProcessIds: number[] = (session.user as any).processIds || [];

  // Build machine filter
  const machineWhere: any = {};
  if (machineId) machineWhere.id = parseInt(machineId);
  if (processId) machineWhere.processId = parseInt(processId);
  if (factoryId) machineWhere.process = { factoryId: parseInt(factoryId) };

  // Non-admin: restrict to their processes
  if (userRole !== "ADMIN" && userProcessIds.length > 0) {
    machineWhere.processId = { in: userProcessIds };
  }

  const where: any = {
    machine: machineWhere,
  };
  if (categoryId) where.categoryId = parseInt(categoryId);
  if (activeOnly) where.endTime = null;
  if (dateFrom || dateTo) {
    where.recordDate = {};
    if (dateFrom) where.recordDate.gte = new Date(dateFrom);
    if (dateTo) where.recordDate.lte = new Date(dateTo);
  }

  const [total, logs] = await Promise.all([
    prisma.machineStopLog.count({ where }),
    prisma.machineStopLog.findMany({
      where,
      include: {
        machine: { include: { process: { include: { factory: true } } } },
        category: true,
        reportedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { startTime: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({ logs, total, page, pageSize });
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    const body = await request.json();
    const { machineId, categoryId, startTime, severity, endTime, description, shift: shiftInput } = body;

    if (!machineId || !categoryId || !startTime || !severity) {
      return NextResponse.json({ error: "Thiếu thông tin bắt buộc" }, { status: 400 });
    }

    const startDate = new Date(startTime);
    if (startDate > new Date()) {
      return NextResponse.json({ error: "Thời gian dừng không được trong tương lai" }, { status: 400 });
    }

    const userRole = (session.user as any)?.userRole as string | undefined;
    const userProcessIds: number[] = (session.user as any).processIds || [];

    // Authorization: non-admin can only add stops for their process machines
    if (userRole !== "ADMIN") {
      const machine = await prisma.machine.findUnique({
        where: { id: parseInt(machineId) },
        select: { processId: true },
      });
      if (!machine) {
        return NextResponse.json({ error: "Máy không tồn tại" }, { status: 404 });
      }
      if (!userProcessIds.includes(machine.processId)) {
        return NextResponse.json({ error: "Bạn không có quyền báo dừng máy thuộc công đoạn này" }, { status: 403 });
      }
    }

    // Validate category exists and is active
    const category = await prisma.stopCategory.findUnique({ where: { id: parseInt(categoryId) } });
    if (!category || !category.isActive) {
      return NextResponse.json({ error: "Nguyên nhân không hợp lệ hoặc đã bị tắt" }, { status: 400 });
    }

    let endDate: Date | undefined;
    let durationMinutes: number | undefined;

    if (endTime) {
      endDate = new Date(endTime);
      if (endDate > new Date()) {
        return NextResponse.json({ error: "Thời gian chạy lại không được trong tương lai" }, { status: 400 });
      }
      if (endDate <= startDate) {
        return NextResponse.json({ error: "Thời gian chạy lại phải sau thời gian dừng" }, { status: 400 });
      }
      durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
    }

    const shift = shiftInput ?? detectShift(startDate);
    const recordDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

    const log = await prisma.machineStopLog.create({
      data: {
        machineId: parseInt(machineId),
        categoryId: parseInt(categoryId),
        startTime: startDate,
        endTime: endDate,
        durationMinutes,
        description,
        severity,
        shift,
        recordDate,
        reportedById: parseInt(session.user.id),
      },
      include: {
        machine: { include: { process: true } },
        category: true,
        reportedBy: { select: { id: true, fullName: true } },
      },
    });

    return NextResponse.json(log);
  } catch (error) {
    console.error("MachineStop POST error:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}
