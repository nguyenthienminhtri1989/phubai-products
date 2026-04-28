// src/auth.config.ts
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login", // Dẫn về trang đăng nhập của bạn
  },
  callbacks: {
    // authorized() chạy trong Middleware (Edge runtime) — chỉ kiểm tra login/logout
    // KHÔNG đặt jwt/session ở đây vì auth.config.ts không có Prisma (Edge-safe)
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
  },
  providers: [], // Để trống, sẽ nạp ở auth.ts
} satisfies NextAuthConfig;
