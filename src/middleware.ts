// src/middleware.ts
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth(async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Bỏ qua chính trang maintenance và API check để tránh redirect loop
  if (!pathname.startsWith("/maintenance") && !pathname.startsWith("/api/maintenance")) {
    try {
      const checkUrl = new URL("/api/maintenance", req.nextUrl.origin);
      const res = await fetch(checkUrl, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { active?: boolean };
        if (data.active === true) {
          return NextResponse.redirect(new URL("/maintenance", req.nextUrl.origin));
        }
      }
    } catch {
      // Nếu fetch lỗi thì cho đi tiếp, tránh chặn oan user
    }
  }

  // Không return gì → để NextAuth auth wrapper xử lý tiếp như cũ
});

export const config = {
  // Chặn tất cả, trừ các file tĩnh và API
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg|.*\\.jpg|.*\\.jpeg|.*\\.webp|.*\\.ico).*)"],
};
