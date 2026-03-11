import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const { id } = await params;
  const logId = parseInt(id);

  const existing = await prisma.machineStopLog.findUnique({ where: { id: logId } });
  if (!existing) {
    return NextResponse.json({ error: "Không tìm thấy bản ghi" }, { status: 404 });
  }

  const body = await request.json();
  const { startTime, endTime, categoryId, description, severity } = body;

  const startDate = startTime ? new Date(startTime) : existing.startTime;
  let endDate: Date | null = existing.endTime;
  let durationMinutes: number | null = existing.durationMinutes;

  if (endTime !== undefined) {
    if (endTime === null) {
      endDate = null;
      durationMinutes = null;
    } else {
      endDate = new Date(endTime);
      if (endDate > new Date()) {
        return NextResponse.json({ error: "Thời gian chạy lại không được trong tương lai" }, { status: 400 });
      }
      if (endDate <= startDate) {
        return NextResponse.json({ error: "Thời gian chạy lại phải sau thời gian dừng" }, { status: 400 });
      }
      durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
    }
  } else if (startTime) {
    // Recalculate if startTime changed but endTime exists
    if (endDate) {
      durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
    }
  }

  if (categoryId) {
    const cat = await prisma.stopCategory.findUnique({ where: { id: parseInt(categoryId) } });
    if (!cat || !cat.isActive) {
      return NextResponse.json({ error: "Nguyên nhân không hợp lệ" }, { status: 400 });
    }
  }

  const updated = await prisma.machineStopLog.update({
    where: { id: logId },
    data: {
      ...(startTime && { startTime: startDate }),
      ...(endTime !== undefined && { endTime: endDate, durationMinutes }),
      ...(categoryId && { categoryId: parseInt(categoryId) }),
      ...(description !== undefined && { description }),
      ...(severity && { severity }),
    },
    include: {
      machine: { include: { process: true } },
      category: true,
      reportedBy: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const { id } = await params;
  const logId = parseInt(id);

  const existing = await prisma.machineStopLog.findUnique({ where: { id: logId } });
  if (!existing) {
    return NextResponse.json({ error: "Không tìm thấy bản ghi" }, { status: 404 });
  }

  const userId = parseInt(session.user.id);
  const isAdmin = session.user.role === "ADMIN";
  const isReporter = existing.reportedById === userId;

  if (!isAdmin && !isReporter) {
    return NextResponse.json({ error: "Bạn không có quyền xóa bản ghi này" }, { status: 403 });
  }

  await prisma.machineStopLog.delete({ where: { id: logId } });
  return NextResponse.json({ success: true });
}
