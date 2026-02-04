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
});
