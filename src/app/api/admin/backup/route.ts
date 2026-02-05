import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// 1. BACKUP: Tải dữ liệu về
export async function GET() {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN")
      return NextResponse.json(
        { error: "Chỉ Admin mới được backup" },
        { status: 403 },
      );

    // Lấy song song dữ liệu từ các bảng
    const [factories, processes, items, machines, users, productionLogs] =
      await Promise.all([
        prisma.factory.findMany(),
        prisma.process.findMany(),
        prisma.item.findMany(),
        prisma.machine.findMany(),
        prisma.user.findMany(),
        prisma.productionLog.findMany(),
      ]);

    // Gom lại thành 1 object JSON
    const backupData = {
      timestamp: new Date().toISOString(),
      version: "1.0",
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
    console.error(error);
    return NextResponse.json({ error: "Lỗi khi tạo backup" }, { status: 500 });
  }
}

// 2. RESTORE: Khôi phục dữ liệu từ file
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN")
      return NextResponse.json(
        { error: "Chỉ Admin mới được restore" },
        { status: 403 },
      );

    const body = await req.json();
    const { factories, processes, items, machines, users, productionLogs } =
      body.data;

    // Sử dụng transaction để đảm bảo toàn vẹn dữ liệu (Thất bại là rollback hết)
    await prisma.$transaction(async (tx) => {
      // BƯỚC 1: Dọn dẹp dữ liệu cũ (Tùy chọn: Xóa hết để nạp lại cho sạch)
      // Phải xóa theo thứ tự ngược lại của lúc tạo để tránh lỗi khóa ngoại
      await tx.productionLog.deleteMany();
      await tx.machine.deleteMany();
      await tx.user.deleteMany();
      await tx.process.deleteMany();
      await tx.item.deleteMany();
      await tx.factory.deleteMany();

      // BƯỚC 2: Nạp dữ liệu mới (Theo đúng thứ tự phụ thuộc)

      // 2.1. Nhà máy
      if (factories?.length > 0)
        await tx.factory.createMany({ data: factories });

      // 2.2. Mặt hàng & Công đoạn
      if (items?.length > 0) await tx.item.createMany({ data: items });
      if (processes?.length > 0)
        await tx.process.createMany({ data: processes });

      // 2.3. User (Cần Công đoạn)
      if (users?.length > 0) await tx.user.createMany({ data: users });

      // 2.4. Máy móc (Cần Công đoạn & Mặt hàng)
      if (machines?.length > 0) await tx.machine.createMany({ data: machines });

      // 2.5. Nhật ký (Cần Máy, User, Item)
      // Lưu ý: Nhật ký có thể rất nhiều, nếu > 5000 bản ghi có thể cần chia nhỏ (batching).
      // Ở đây ta giả định dữ liệu chưa quá lớn.
      if (productionLogs?.length > 0) {
        // Format lại Date string về Date object
        const formattedLogs = productionLogs.map((log: any) => ({
          ...log,
          recordDate: new Date(log.recordDate),
          createdAt: new Date(log.createdAt),
          updatedAt: new Date(log.updatedAt),
        }));
        await tx.productionLog.createMany({ data: formattedLogs });
      }
    });

    return NextResponse.json({ message: "Khôi phục dữ liệu thành công!" });
  } catch (error) {
    console.error("Restore Error:", error);
    return NextResponse.json(
      { error: "Lỗi khôi phục dữ liệu (Có thể do sai cấu trúc file)" },
      { status: 500 },
    );
  }
}
