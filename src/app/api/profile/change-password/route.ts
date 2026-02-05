import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    // 1. Kiểm tra session
    const session = await auth();

    // --- IN RA TERMINAL ĐỂ KIỂM TRA ---
    console.log(">>> [DEBUG] Session User:", session?.user);

    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Bạn chưa đăng nhập" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    // 2. Validate input
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Thiếu thông tin mật khẩu" },
        { status: 400 },
      );
    }

    // 3. XỬ LÝ ID (QUAN TRỌNG NHẤT)
    // NextAuth trả về id là string, ta phải ép kiểu về số
    const userIdString = session.user.id;
    const userId = parseInt(userIdString || "0"); // Ép kiểu sang số nguyên

    console.log(
      `>>> [DEBUG] Đang tìm User có ID: ${userId} (Kiểu gốc: ${typeof userIdString})`,
    );

    if (!userId || isNaN(userId)) {
      return NextResponse.json(
        { error: "Lỗi phiên đăng nhập (ID không hợp lệ)" },
        { status: 401 },
      );
    }

    // 4. Tìm User trong Database
    const user = await prisma.user.findUnique({
      where: { id: userId }, // Prisma cần ID là số (Int)
    });

    // --- ĐÂY LÀ CHỖ GÂY RA LỖI 404 CỦA BẠN ---
    if (!user) {
      console.log(">>> [LOI] Không tìm thấy user trong DB!");
      return NextResponse.json(
        { error: "Không tìm thấy tài khoản" },
        { status: 404 },
      );
    }

    // 5. Kiểm tra mật khẩu cũ
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Mật khẩu hiện tại không đúng" },
        { status: 400 },
      );
    }

    // 6. Cập nhật mật khẩu
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    console.log(">>> [THANH CONG] Đã đổi mật khẩu!");
    return NextResponse.json({ message: "Đổi mật khẩu thành công!" });
  } catch (error) {
    console.error(">>> [LOI SERVER]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}
