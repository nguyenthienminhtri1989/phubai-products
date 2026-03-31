import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// 1. BACKUP: Tải dữ liệu về
export async function GET() {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Chỉ Admin mới được backup" },
        { status: 403 },
      );
    }

    // Lấy dữ liệu song song từ tất cả các bảng
    const [factories, processes, items, machines, users, productionLogs] =
      await Promise.all([
        prisma.factory.findMany(),
        prisma.process.findMany(),
        prisma.item.findMany(),
        prisma.machine.findMany(),
        prisma.user.findMany(),
        prisma.productionLog.findMany(),
      ]);

    const backupData = {
      timestamp: new Date().toISOString(),
      version: "1.1",
      data: {
        factories,
        processes,
        items,
        machines,
        users,
        productionLogs,
      },
    };

    return NextResponse.json(backupData);
  } catch (error) {
    console.error("Backup Error:", error);
    return NextResponse.json({ error: "Lỗi khi tạo backup" }, { status: 500 });
  }
}

// 2. RESTORE: Khôi phục dữ liệu từ file
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Chỉ Admin mới được restore" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { factories, processes, items, machines, users, productionLogs } =
      body.data;

    // Sử dụng transaction với thời gian chờ lâu hơn (30s)
    await prisma.$transaction(
      async (tx) => {
        // BƯỚC 1: Tạm thời vô hiệu hóa kiểm tra khóa ngoại (Chỉ dùng cho PostgreSQL)
        // Lệnh này giúp tránh lỗi "Foreign Key Constraint" khi đang nạp dữ liệu dở dang
        await tx.$executeRawUnsafe(`SET CONSTRAINTS ALL DEFERRED;`);

        // BƯỚC 2: Xóa sạch dữ liệu cũ và reset ID (TRUNCATE CASCADE)
        // Lưu ý: Đảm bảo tên các bảng trong mảng này khớp CẢ CHỮ HOA CHỮ THƯỜNG với tên bảng thật trong PostgreSQL.
        // Mặc định Prisma đặt tên bảng trùng với tên Model (ví dụ: "User", "Factory").
        // Nếu DB của bạn có dùng @@map("users"), hãy đổi "User" thành "users" ở mảng bên dưới.
        const tables = [
          "production_logs",
          "machines",
          "users",
          "processes",
          "items",
          "factories",
        ];
        for (const table of tables) {
          await tx.$executeRawUnsafe(
            `TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`,
          );
        }

        // BƯỚC 3: Nạp dữ liệu mới
        if (factories?.length > 0)
          await tx.factory.createMany({ data: factories });
        if (items?.length > 0) await tx.item.createMany({ data: items });
        if (processes?.length > 0)
          await tx.process.createMany({ data: processes });
        if (users?.length > 0) await tx.user.createMany({ data: users });
        if (machines?.length > 0)
          await tx.machine.createMany({ data: machines });

        // BƯỚC 4: Nạp nhật ký sản xuất (Chia nhỏ lô / Batching để tránh tràn bộ nhớ)
        if (productionLogs?.length > 0) {
          const batchSize = 1000;
          for (let i = 0; i < productionLogs.length; i += batchSize) {
            const batch = productionLogs
              .slice(i, i + batchSize)
              .map((log: any) => ({
                ...log,
                // Xử lý an toàn các trường thời gian
                recordDate: log.recordDate ? new Date(log.recordDate) : null,
                createdAt: log.createdAt ? new Date(log.createdAt) : undefined,
                updatedAt: log.updatedAt ? new Date(log.updatedAt) : undefined,
              }));
            await tx.productionLog.createMany({ data: batch });
          }
        }
      },
      {
        timeout: 30000, // Tăng timeout lên 30 giây để xử lý lượng dữ liệu lớn
      },
    );

    return NextResponse.json({ message: "Khôi phục dữ liệu thành công!" });
  } catch (error: any) {
    console.error("Restore Error:", error);
    return NextResponse.json(
      {
        error:
          error.message ||
          "Lỗi khôi phục dữ liệu (Có thể do sai cấu trúc file)",
      },
      { status: 500 },
    );
  }
}
