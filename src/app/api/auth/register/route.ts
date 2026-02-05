import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, password, fullName, processId } = body;

    // 1. Kiểm tra dữ liệu đầu vào
    if (!username || !password || !fullName || !processId) {
      return NextResponse.json(
        {
          error:
            "Vui lòng nhập đầy đủ thông tin: Tên đăng nhập, Mật khẩu, Họ tên và Bộ phận",
        },
        { status: 400 },
      );
    }

    // 2. Kiểm tra xem username đã tồn tại chưa
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          error:
            "Tên đăng nhập này đã có người sử dụng, vui lòng chọn tên khác.",
        },
        { status: 409 }, // 409 Conflict
      );
    }

    // 3. Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Tạo User mới
    // Lưu ý: isActive = false (Chờ duyệt), role = USER
    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        fullName,
        processId: parseInt(processId), // Chuyển processId từ chuỗi sang số
        role: "USER", // Mặc định là nhân viên thường
        accessLevel: "READ_ONLY", // Mặc định quyền thấp nhất
        isActive: false, // Quan trọng: Phải chờ Admin duyệt
      },
    });

    // 5. Trả về thông báo thành công
    return NextResponse.json(
      {
        message:
          "Đăng ký thành công! Vui lòng báo cho Quản trị viên để kích hoạt tài khoản.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Lỗi đăng ký:", error);
    return NextResponse.json(
      { error: "Lỗi hệ thống, không thể đăng ký lúc này." },
      { status: 500 },
    );
  }
}
