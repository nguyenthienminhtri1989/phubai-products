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

        // Tìm user trong DB — include pagePermissions với pageKey
        const user = await prisma.user.findUnique({
          where: { username },
          include: {
            userProcesses: true,
            userFactories: true, // Load danh sách nhà máy (nhiều)
            pagePermissions: {
              include: { page: { select: { pageKey: true } } },
            },
          },
        });

        if (!user) return null; // Không tìm thấy user

        // Kiểm tra mật khẩu
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null; // Sai mật khẩu

        // Kiểm tra kích hoạt
        if (!user.isActive) throw new Error("Tài khoản chưa được kích hoạt");

        // Flatten pagePermissions cho session
        const pagePerms = user.pagePermissions.map((pp) => ({
          pageKey: pp.page.pageKey,
          canView: pp.canView,
          canEdit: pp.canEdit,
        }));

        // Trả về user đầy đủ thông tin
        return {
          id: user.id.toString(),
          name: user.fullName,
          username: user.username,
          userRole: user.userRole,
          factoryId: user.factoryId,
          factoryIds: user.userFactories.map((uf) => uf.factoryId), // Nhiều nhà máy
          processIds: user.userProcesses.map((up) => up.processId),
          fullName: user.fullName,
          pagePermissions: pagePerms,
        } as any;
      },
    }),
  ],
  callbacks: {
    // 1. Chuyển dữ liệu từ authorize (user) sang token
    async jwt({ token, user }) {
      // Lần đầu đăng nhập — bake dữ liệu từ authorize() vào token
      if (user) {
        token.id = user.id;
        token.username = (user as any).username;
        token.userRole = (user as any).userRole;
        token.factoryId = (user as any).factoryId;
        token.factoryIds = (user as any).factoryIds; // Nhiều nhà máy
        token.processIds = (user as any).processIds;
        token.fullName = (user as any).fullName;
        token.pagePermissions = (user as any).pagePermissions;
        return token;
      }

      // Các lần sau (token tái sử dụng) — refresh pagePermissions từ DB
      // để phản ánh ngay khi admin thay đổi quyền mà không cần logout/login
      if (token.id) {
        try {
          const userId = parseInt(token.id as string);
          const dbPerms = await prisma.pagePermission.findMany({
            where: { userId },
            include: { page: { select: { pageKey: true } } },
          });
          token.pagePermissions = dbPerms.map((pp) => ({
            pageKey: pp.page.pageKey,
            canView: pp.canView,
            canEdit: pp.canEdit,
          }));
        } catch {
          // Nếu DB lỗi, giữ nguyên pagePermissions cũ trong token
        }
      }

      return token;
    },
    // 2. Chuyển dữ liệu từ token sang session (để dùng ở phía Client và API)
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as any).username = token.username;
        (session.user as any).userRole = token.userRole;
        (session.user as any).factoryId = token.factoryId;
        (session.user as any).factoryIds = token.factoryIds; // Nhiều nhà máy
        (session.user as any).processIds = token.processIds;
        (session.user as any).fullName = token.fullName;
        (session.user as any).pagePermissions = token.pagePermissions;
        // Backward compatibility — AdminLayout dùng session.user.role
        (session.user as any).role = token.userRole;
        (session.user as any).accessLevel = "MANAGER";
        (session.user as any).department = "FACTORY";
        (session.user as any).extraModules = [];
      }
      return session;
    },
  },
});
