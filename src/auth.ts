// src/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const username = String(credentials.username);
        const password = String(credentials.password);

        // Tìm user trong DB
        const user = await prisma.user.findUnique({
          where: { username },
        });

        if (!user) return null; // Không tìm thấy user

        // Kiểm tra mật khẩu
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null; // Sai mật khẩu

        // Kiểm tra kích hoạt
        if (!user.isActive) throw new Error("Tài khoản chưa được kích hoạt");

        // Trả về user đầy đủ thông tin
        // Lưu ý: Object này sẽ được truyền vào callback 'jwt' bên dưới
        return {
          id: user.id.toString(),
          name: user.fullName,
          username: user.username,
          role: user.role,
          processId: user.processId,
          accessLevel: user.accessLevel,
          fullName: user.fullName,
        };
      },
    }),
  ],
  // --- PHẦN QUAN TRỌNG VỪA ĐƯỢC THÊM VÀO ---
  callbacks: {
    // 1. Chuyển dữ liệu từ authorize (user) sang token
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = (user as any).username;
        token.role = (user as any).role;
        token.accessLevel = (user as any).accessLevel;
        token.processId = (user as any).processId;
        token.fullName = (user as any).fullName;
      }
      return token;
    },
    // 2. Chuyển dữ liệu từ token sang session (để dùng ở phía Client và API)
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        // Ép kiểu 'as any' để tránh lỗi TypeScript đỏ do chưa khai báo type mở rộng
        (session.user as any).username = token.username;
        (session.user as any).role = token.role;
        (session.user as any).accessLevel = token.accessLevel;
        (session.user as any).processId = token.processId;
        (session.user as any).fullName = token.fullName;
      }
      return session;
    },
  },
});
