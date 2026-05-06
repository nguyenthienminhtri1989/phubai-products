import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";
import { auth } from "@/auth";

// 1. GET: Lấy danh sách
export async function GET() {
  try {
    const session = await auth();
    if ((session?.user as any)?.userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Không có quyền truy cập" },
        { status: 403 },
      );
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        userProcesses: { include: { process: true } },
        factory: { select: { id: true, name: true } },
        userFactories: { include: { factory: { select: { id: true, name: true } } } },
      },
    });

    // Loại bỏ mật khẩu
    const safeUsers = users.map(({ password, ...rest }) => rest);
    return NextResponse.json(safeUsers);
  } catch (error) {
    console.error("Get Users Error:", error);
    return NextResponse.json({ error: "Lỗi tải danh sách" }, { status: 500 });
  }
}

// 2. POST: Tạo mới
export async function POST(req: Request) {
  try {
    const session = await auth();
    if ((session?.user as any)?.userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Không có quyền truy cập" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { username, password, fullName, userRole, processIds, factoryIds } = body;

    // Validate
    if (!username || !password || !fullName) {
      return NextResponse.json(
        { error: "Vui lòng nhập đủ: Username, Mật khẩu, Họ tên" },
        { status: 400 },
      );
    }

    // Kiểm tra trùng username
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json(
        { error: "Tên đăng nhập này đã tồn tại!" },
        { status: 409 },
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const pIds: number[] = Array.isArray(processIds) ? processIds.map(Number) : [];
    const fIds: number[] = Array.isArray(factoryIds) ? factoryIds.map(Number) : [];
    // factoryId đầu tiên trong list (backward compat cho session)
    const primaryFactoryId = fIds.length > 0 ? fIds[0] : null;

    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        fullName,
        userRole: userRole || "VIEWER",
        factoryId: primaryFactoryId,
        isActive: true,
        userProcesses: {
          create: pIds.map((pid) => ({ processId: pid })),
        },
        userFactories: {
          create: fIds.map((fid) => ({ factoryId: fid })),
        },
      },
    });

    const { password: _, ...userWithoutPass } = newUser;
    return NextResponse.json(userWithoutPass, { status: 201 });
  } catch (error) {
    console.error("Create User Error:", error);
    return NextResponse.json({ error: "Lỗi tạo user mới" }, { status: 500 });
  }
}

// 3. PUT: Cập nhật
export async function PUT(req: Request) {
  try {
    const session = await auth();
    if ((session?.user as any)?.userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Không có quyền truy cập" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { id, isActive, userRole, processIds, newPassword, fullName, factoryIds } = body;
    const pIds: number[] = Array.isArray(processIds) ? processIds.map(Number) : [];
    const fIds: number[] = Array.isArray(factoryIds) ? factoryIds.map(Number) : [];
    // factoryId đầu tiên trong list (backward compat cho session)
    const primaryFactoryId = fIds.length > 0 ? fIds[0] : null;

    const updateData: any = {
      isActive,
      userRole: userRole || "VIEWER",
      fullName,
      factoryId: primaryFactoryId,
    };

    if (newPassword && newPassword.trim() !== "") {
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    // Xóa toàn bộ quan hệ cũ rồi tạo lại
    await prisma.userProcess.deleteMany({ where: { userId: parseInt(id) } });
    await prisma.userFactory.deleteMany({ where: { userId: parseInt(id) } });

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        ...updateData,
        userProcesses: {
          create: pIds.map((pid) => ({ processId: pid })),
        },
        userFactories: {
          create: fIds.map((fid) => ({ factoryId: fid })),
        },
      },
    });

    const { password: _, ...safeUser } = updatedUser;
    return NextResponse.json(safeUser);
  } catch (error) {
    console.error("Update User Error:", error);
    return NextResponse.json({ error: "Lỗi cập nhật user" }, { status: 500 });
  }
}

// 4. DELETE: Xóa user
export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if ((session?.user as any)?.userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Không có quyền truy cập" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Thiếu ID người dùng" }, { status: 400 });
    }

    const userId = parseInt(id);
    const currentUserId = (session?.user as any)?.id;

    // Không cho phép tự xóa chính mình
    if (currentUserId && userId === parseInt(currentUserId)) {
      return NextResponse.json(
        { error: "Bạn không thể xóa tài khoản đang đăng nhập!" },
        { status: 400 },
      );
    }

    // Xóa các bản ghi liên quan trước
    await prisma.userProcess.deleteMany({ where: { userId } });
    await prisma.pagePermission.deleteMany({ where: { userId } });

    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true, message: "Đã xóa người dùng" });
  } catch (error) {
    console.error("Delete User Error:", error);
    return NextResponse.json({ error: "Lỗi xóa người dùng" }, { status: 500 });
  }
}
