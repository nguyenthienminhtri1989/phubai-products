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
    const { username, password, fullName, userRole, processIds, factoryId } = body;

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

    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        fullName,
        userRole: userRole || "VIEWER",
        factoryId: factoryId ? parseInt(factoryId) : null,
        isActive: true,
        userProcesses: {
          create: pIds.map((pid) => ({ processId: pid })),
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
    const { id, isActive, userRole, processIds, newPassword, fullName, factoryId } = body;
    const pIds: number[] = Array.isArray(processIds) ? processIds.map(Number) : [];

    const updateData: any = {
      isActive,
      userRole: userRole || "VIEWER",
      fullName,
      factoryId: factoryId ? parseInt(factoryId) : null,
    };

    if (newPassword && newPassword.trim() !== "") {
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    // Xóa toàn bộ quan hệ cũ rồi tạo lại
    await prisma.userProcess.deleteMany({ where: { userId: parseInt(id) } });

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        ...updateData,
        userProcesses: {
          create: pIds.map((pid) => ({ processId: pid })),
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
