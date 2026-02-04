// src/auth.config.ts
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login", // Dẫn về trang đăng nhập của bạn
  },
  callbacks: {
    // 1. Logic bảo vệ route (Middleware dùng cái này)
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/");
      const isOnLogin = nextUrl.pathname.startsWith("/login");

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Chưa login -> Đá về trang login
      } else if (isLoggedIn && isOnLogin) {
        // Đã login mà cố vào trang login -> Đá về trang chủ
        return Response.redirect(new URL("/", nextUrl));
      }
      return true;
    },
    // 2. Tùy biến JWT để lưu thêm thông tin
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = user.role;
        token.processId = user.processId;
        token.accessLevel = user.accessLevel;
        token.username = user.username;
        token.fullName = user.fullName;
      }
      if (trigger === "update" && session) {
        return { ...token, ...session.user };
      }
      return token;
    },
    // 3. Tùy biến Session để Client đọc được
    session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.sub as string;
        session.user.role = token.role as string;
        session.user.processId = token.processId as number | null;
        session.user.accessLevel = token.accessLevel as string;
        session.user.username = token.username as string;
        session.user.fullName = token.fullName as string;
      }
      return session;
    },
  },
  providers: [], // Để trống, sẽ nạp ở auth.ts
} satisfies NextAuthConfig;
