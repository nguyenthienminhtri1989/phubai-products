// src/app/api/users/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";
import { auth } from "@/auth"; // <-- Dùng auth() của v5

// 1. GET: Lấy danh sách nhân viên
export async function GET() {
  try {
    const session = await auth(); // <-- Code chuẩn v5

    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Không có quyền truy cập" },
        { status: 403 },
      );
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { process: true },
    });

    // Loại bỏ mật khẩu
    const safeUsers = users.map(({ password, ...rest }) => rest);

    return NextResponse.json(safeUsers);
  } catch (error) {
    return NextResponse.json({ error: "Lỗi tải danh sách" }, { status: 500 });
  }
}

// 2. PUT: Cập nhật thông tin nhân viên
export async function PUT(req: Request) {
  try {
    const session = await auth(); // <-- SỬA LỖI Ở ĐÂY (Trước là getServerSession)

    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Không có quyền truy cập" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const {
      id,
      isActive,
      role,
      accessLevel,
      processId,
      newPassword,
      fullName,
    } = body;

    const updateData: any = {
      isActive,
      role,
      accessLevel,
      fullName,
      processId: processId ? parseInt(processId) : null,
    };

    if (newPassword && newPassword.trim() !== "") {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateData.password = hashedPassword;
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    return NextResponse.json({ error: "Lỗi cập nhật user" }, { status: 500 });
  }
}
