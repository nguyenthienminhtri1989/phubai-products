import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";
import { auth } from "@/auth";

// 1. GET: Lấy danh sách
export async function GET() {
  try {
    const session = await auth();
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
    console.error("Get Users Error:", error);
    return NextResponse.json({ error: "Lỗi tải danh sách" }, { status: 500 });
  }
}

// 2. POST: Tạo mới (ĐÃ SỬA: Dùng username)
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Không có quyền truy cập" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { username, password, fullName, role, accessLevel, processId } = body;

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

    const newUser = await prisma.user.create({
      data: {
        username, // Dùng username
        password: hashedPassword,
        fullName,
        role: role || "USER",
        accessLevel: accessLevel || "READ_ONLY",
        processId: processId ? parseInt(processId) : null,
        isActive: true, // Admin tạo thì cho active luôn
      },
    });

    // Trả về user không có password
    const { password: _, ...userWithoutPass } = newUser;
    return NextResponse.json(userWithoutPass, { status: 201 });
  } catch (error) {
    console.error("Create User Error:", error);
    return NextResponse.json({ error: "Lỗi tạo user mới" }, { status: 500 });
  }
}

// 3. PUT: Cập nhật (Giữ nguyên logic cũ, chỉ clean code)
export async function PUT(req: Request) {
  try {
    const session = await auth();
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

    const { password: _, ...safeUser } = updatedUser;
    return NextResponse.json(safeUser);
  } catch (error) {
    console.error("Update User Error:", error);
    return NextResponse.json({ error: "Lỗi cập nhật user" }, { status: 500 });
  }
}
