import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

    const body = await request.json();
    const {
      fromDate,
      toDate,
      factoryIds,
      processIds,
      machineIds,
      shifts,
      itemIds,
      page = 1,
      pageSize = 20, // Mặc định trang 1, 20 dòng/trang
    } = body;

    // 1. Xây dựng điều kiện lọc (Where)
    const where: any = {};

    if (fromDate && toDate) {
      where.recordDate = { gte: new Date(fromDate), lte: new Date(toDate) };
    }
    if (shifts?.length > 0) where.shift = { in: shifts };
    if (machineIds?.length > 0) where.machineId = { in: machineIds };
    if (itemIds?.length > 0) where.itemId = { in: itemIds };

    // Lọc theo Công đoạn/Nhà máy nếu chưa chọn Máy cụ thể
    if (
      (!machineIds || machineIds.length === 0) &&
      (processIds?.length > 0 || factoryIds?.length > 0)
    ) {
      where.machine = {};
      if (processIds?.length > 0) where.machine.processId = { in: processIds };
      // Nếu cần lọc theo factory mà chưa chọn process (Logic nâng cao)
    }

    // 2. CHẠY SONG SONG 3 TRUY VẤN (TRANSACTION)
    // - Query 1: Lấy danh sách phân trang (Data)
    // - Query 2: Đếm tổng số bản ghi (Total Count - để chia trang)
    // - Query 3: Tính tổng sản lượng toàn bộ (Grand Total - cho Dashboard)

    const [logs, totalCount, aggregate] = await prisma.$transaction([
      // Query 1: Data Pagination
      prisma.productionLog.findMany({
        where,
        skip: (page - 1) * pageSize, // Bỏ qua các dòng của trang trước
        take: pageSize, // Chỉ lấy số dòng của trang hiện tại
        include: {
          machine: { include: { process: { include: { factory: true } } } },
          item: true,
          createdBy: { select: { fullName: true } },
        },
        orderBy: [{ recordDate: "desc" }, { shift: "desc" }],
      }),

      // Query 2: Count
      prisma.productionLog.count({ where }),

      // Query 3: Sum Output
      prisma.productionLog.aggregate({
        where,
        _sum: { finalOutput: true },
      }),
    ]);

    return NextResponse.json({
      data: logs,
      pagination: {
        total: totalCount,
        current: page,
        pageSize: pageSize,
      },
      stats: {
        totalOutput: aggregate._sum.finalOutput || 0,
      },
    });
  } catch (error) {
    console.error("Report Error:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}
