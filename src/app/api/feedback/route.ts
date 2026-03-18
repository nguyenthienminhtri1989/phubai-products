import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import nodemailer from "nodemailer";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    const body = await request.json();
    const { type, title, content } = body;

    if (!type || !title || !content) {
      return NextResponse.json({ error: "Vui lòng điền đầy đủ thông tin" }, { status: 400 });
    }

    const senderName = session.user?.name || "Người dùng";
    const senderEmail = session.user?.email || "Không có email";

    const typeLabel = type === "feedback" ? "Góp ý / Phản hồi" : "Ý tưởng / Đề xuất";

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Phú Bài ERP" <${process.env.SMTP_USER}>`,
      to: process.env.FEEDBACK_TO || "minhtri154@gmail.com",
      subject: `[${typeLabel}] ${title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1677ff; border-bottom: 2px solid #1677ff; padding-bottom: 8px;">
            ${typeLabel}
          </h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr>
              <td style="padding: 8px; font-weight: bold; width: 130px; color: #555;">Người gửi:</td>
              <td style="padding: 8px;">${senderName}</td>
            </tr>
            <tr style="background: #f5f5f5;">
              <td style="padding: 8px; font-weight: bold; color: #555;">Email:</td>
              <td style="padding: 8px;">${senderEmail}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold; color: #555;">Loại:</td>
              <td style="padding: 8px;">${typeLabel}</td>
            </tr>
            <tr style="background: #f5f5f5;">
              <td style="padding: 8px; font-weight: bold; color: #555;">Tiêu đề:</td>
              <td style="padding: 8px;">${title}</td>
            </tr>
          </table>
          <div style="background: #f9f9f9; border-left: 4px solid #1677ff; padding: 16px; border-radius: 4px;">
            <p style="font-weight: bold; margin-bottom: 8px; color: #555;">Nội dung:</p>
            <p style="white-space: pre-wrap; margin: 0;">${content}</p>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">
            Gửi lúc: ${new Date().toLocaleString("vi-VN")} — Phú Bài ERP System
          </p>
        </div>
      `,
    });

    return NextResponse.json({ message: "Gửi phản hồi thành công" });
  } catch (error) {
    console.error("Feedback email error:", error);
    return NextResponse.json({ error: "Gửi thất bại, vui lòng thử lại sau" }, { status: 500 });
  }
}
