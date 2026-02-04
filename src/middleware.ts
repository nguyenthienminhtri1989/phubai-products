// src/middleware.ts
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Chặn tất cả, trừ các file tĩnh và API
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
