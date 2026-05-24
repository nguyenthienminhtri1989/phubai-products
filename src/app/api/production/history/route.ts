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
      pageSize = 20,
      sorts = [] as { field: any; order: string }[], // Multi-column sort
      // Legacy single sort support (backward compat)
      sortField,
      sortOrder,
    } = body;

    // Normalize: nếu gửi sorts mảng thì dùng, ngược lại fallback sang sortField/sortOrder cũ
    const activeSorts: { field: any; order: string }[] =
      Array.isArray(sorts) && sorts.length > 0
        ? sorts
        : sortField
        ? [{ field: sortField, order: sortOrder ?? 'desc' }]
        : [];

    // 1. Xây dựng điều kiện lọc (Where)
    const where: any = {};

    if (fromDate && toDate) {
      where.recordDate = { gte: new Date(fromDate), lte: new Date(toDate) };
    }
    if (shifts?.length > 0) where.shift = { in: shifts };
    if (machineIds?.length > 0) where.machineId = { in: machineIds };
    if (itemIds?.length > 0) where.itemId = { in: itemIds };

    // Lọc theo Công đoạn/Nhà máy nếu chưa chọn Máy cụ thể
    if ((!machineIds || machineIds.length === 0) && (processIds?.length > 0 || factoryIds?.length > 0)) {
      if (processIds?.length > 0) {
        // Lọc theo công đoạn (ưu tiên hơn nhà máy)
        where.machine = { processId: { in: processIds } };
      } else if (factoryIds?.length > 0) {
        // Lọc theo nhà máy khi chưa chọn công đoạn
        where.machine = { process: { factoryId: { in: factoryIds } } };
      }
    }

    // 2. CHẠY SONG SONG 3 TRUY VẤN (TRANSACTION)
    // - Query 1: Lấy danh sách phân trang (Data)
    // - Query 2: Đếm tổng số bản ghi (Total Count - để chia trang)
    // - Query 3: Tính tổng sản lượng + hiệu suất TB có trọng số

    const [logs, totalCount, allLogsForEff] = await prisma.$transaction([
      // Query 1: Data Pagination
      prisma.productionLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          machine: { include: { process: { include: { factory: true } } } },
          item: true,
          lot: { select: { id: true, lotNumber: true } },
          createdBy: { select: { fullName: true } },
        },
        orderBy: (() => {
          if (activeSorts.length > 0) {
            // Build mảng orderBy Prisma theo đúng thứ tự ưu tiên
            return activeSorts.map(({ field, order }) => {
              const direction = order === 'ascend' ? 'asc' : 'desc';
              if (Array.isArray(field)) {
                // Nested field: ["machine", "name"] → { machine: { name: direction } }
                const obj: any = {};
                let cur = obj;
                for (let i = 0; i < field.length - 1; i++) {
                  cur[field[i]] = {};
                  cur = cur[field[i]];
                }
                cur[field[field.length - 1]] = direction;
                return obj;
              } else {
                if (field === 'recordDate') {
                  // Khi sort theo ngày, luôn kèm shift cùng chiều
                  return { [field]: direction };
                }
                return { [field]: direction };
              }
            });
          }
          // Mặc định: mới nhất trước
          return [{ recordDate: "desc" }, { shift: "desc" }];
        })(),
      }),

      // Query 2: Count
      prisma.productionLog.count({ where }),

      // Query 3: Lấy sản lượng + hiệu suất toàn bộ (để tính TB có trọng số)
      prisma.productionLog.findMany({
        where,
        select: { finalOutput: true, efficiency: true },
      }),
    ]);

    // Tính tổng sản lượng và hiệu suất trung bình có trọng số
    // Công thức: Σ(output_i × eff_i) / Σ(output_i) — chỉ tính các ca có nhập hiệu suất
    let totalOutput = 0;
    let weightedEffSum = 0;
    let weightedEffBase = 0;
    for (const log of allLogsForEff) {
      totalOutput += log.finalOutput;
      if (log.efficiency != null && log.finalOutput > 0) {
        weightedEffSum += log.finalOutput * log.efficiency;
        weightedEffBase += log.finalOutput;
      }
    }
    const avgEfficiency = weightedEffBase > 0
      ? Math.round((weightedEffSum / weightedEffBase) * 10) / 10
      : null;

    return NextResponse.json({
      data: logs,
      pagination: {
        total: totalCount,
        current: page,
        pageSize: pageSize,
      },
      stats: {
        totalOutput,
        avgEfficiency, // % TB có trọng số theo sản lượng, null nếu chưa có dữ liệu
      },
    });
  } catch (error) {
    console.error("Report Error:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}
