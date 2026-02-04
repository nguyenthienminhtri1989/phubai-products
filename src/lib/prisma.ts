// lib/prisma.ts

// Tác dụng: Đảm bảo chỉ có DUY NHẤT 1 kết nối đến Database được tạo ra trong suốt quá trình chạy app.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
