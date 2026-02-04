// types/next-auth.d.ts
import NextAuth, { DefaultSession } from "next-auth";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: string;
    processId: number | null;
    accessLevel: string;
    fullName: string;
    username: string;
  }
  interface Session {
    user: User & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    processId: number | null;
    accessLevel: string;
    fullName: string;
    username: string;
  }
}
