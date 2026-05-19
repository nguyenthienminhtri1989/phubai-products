// src/lib/allocation-engine-v2.ts

import { prisma } from "@/lib/prisma";

// ===== INTERFACES =====

export interface AllocationLine {
  itemId: number;
  itemName: string;
  orderItemId: number | null; // null = surplus
  orderId: number | null;
  orderNo: string | null;
  allocatedQty: number; // kg phân bổ
  unitPriceUsd: number;
  revenueUsd: number;
  // Thông tin bổ sung cho calculator
  sellingCostRate: number | null;
  wasteRecoveryRate: number | null;
}

export interface ProductionByItem {
  itemId: number;
  itemName: string;
  totalQty: number;
}

export interface AllocationResult {
  allocations: AllocationLine[];
  productionByItem: ProductionByItem[];
  meta: {
    factoryId: number;
    yearMonth: string;
    mode: "REAL" | "PROJECTION";
    fromDate: string;
    toDate: string;
    calculatedAt: string;
  };
}

// ===== MAIN FUNCTION =====

/**
 * Phân bổ sản lượng từ ProductionLog vào hợp đồng theo waterfall.
 *
 * KHÔNG GHI VÀO DB — chỉ tính toán và trả về kết quả.
 * Gọi mỗi lần dashboard cần số liệu.
 *
 * @param factoryId - ID nhà máy
 * @param yearMonth - "YYYY-MM"
 * @param mode - 'REAL' (đến hôm nay) | 'PROJECTION' (cả tháng)
 */
export async function runAllocationFromProduction(
  factoryId: number,
  yearMonth: string,
  mode: "REAL" | "PROJECTION" = "REAL"
): Promise<AllocationResult> {
  const [year, month] = yearMonth.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0); // ngày cuối tháng
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const toDate =
    mode === "REAL" ? (today < lastDay ? today : lastDay) : lastDay;

  // ===== BƯỚC 1: Lấy sản lượng theo mặt hàng =====
  const productionByItem = await getProductionByItem(factoryId, firstDay, toDate);

  // Nếu mode PROJECTION: cộng thêm SL ước tính cho ngày tương lai
  if (mode === "PROJECTION" && today < lastDay) {
    await addProjectedProduction(
      productionByItem,
      factoryId,
      today,
      lastDay,
      firstDay
    );
  }

  // ===== BƯỚC 2 + 3: Waterfall allocation =====
  const allocations = await waterfallAllocate(
    productionByItem,
    factoryId,
    yearMonth,
    firstDay
  );

  return {
    allocations,
    productionByItem,
    meta: {
      factoryId,
      yearMonth,
      mode,
      fromDate: firstDay.toISOString().split("T")[0],
      toDate: toDate.toISOString().split("T")[0],
      calculatedAt: new Date().toISOString(),
    },
  };
}

// ===== HELPER FUNCTIONS =====

/**
 * Lấy tổng sản lượng theo mặt hàng từ ProductionLog.
 * Join Machine → Process → Factory để filter theo factoryId.
 */
async function getProductionByItem(
  factoryId: number,
  fromDate: Date,
  toDate: Date
): Promise<ProductionByItem[]> {
  const logs = await prisma.productionLog.groupBy({
    by: ["itemId"],
    where: {
      recordDate: { gte: fromDate, lte: toDate },
      machine: {
        process: {
          factoryId: factoryId,
        },
      },
    },
    _sum: { finalOutput: true },
  });

  // Lấy tên item
  const itemIds = logs.map((l: (typeof logs)[0]) => l.itemId);
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, name: true },
  });
  const itemMap = new Map(
    items.map((i: { id: number; name: string }) => [i.id, i.name])
  );

  return logs
    .filter((l: (typeof logs)[0]) => (l._sum.finalOutput ?? 0) > 0)
    .map((l: (typeof logs)[0]) => ({
      itemId: l.itemId,
      itemName: itemMap.get(l.itemId) ?? `Item #${l.itemId}`,
      totalQty: l._sum.finalOutput ?? 0,
    }));
}

/**
 * Cộng thêm sản lượng ước tính cho ngày tương lai (PROJECTION mode).
 * Dùng ProductivityBenchmark EMPIRICAL nếu có, fallback tính trung bình.
 */
async function addProjectedProduction(
  productionByItem: ProductionByItem[],
  factoryId: number,
  today: Date,
  lastDay: Date,
  firstDay: Date
): Promise<void> {
  const remainingDays = Math.ceil(
    (lastDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (remainingDays <= 0) return;

  const daysPassed =
    Math.ceil(
      (today.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

  for (const item of productionByItem) {
    // Đếm số máy đang chạy mặt hàng này trong factory
    const machineCount = await prisma.machine.count({
      where: {
        currentItemId: item.itemId,
        isActive: true,
        process: { factoryId },
      },
    });

    if (machineCount === 0) continue;

    // Tìm benchmark EMPIRICAL
    const benchmark = await prisma.productivityBenchmark.findFirst({
      where: {
        itemId: item.itemId,
        benchmarkType: "EMPIRICAL",
        version: { factoryId, isActive: true },
        empiricalOutputPerDay: { not: null, gt: 0 },
      },
      orderBy: { version: { effectiveFrom: "desc" } },
    });

    let projectedQty: number;
    if (benchmark?.empiricalOutputPerDay) {
      // EMPIRICAL: empiricalOutputPerDay đã là kg/ngày cho 1 loại máy
      projectedQty =
        benchmark.empiricalOutputPerDay * machineCount * remainingDays;
    } else {
      // Fallback: trung bình từ dữ liệu thực tế
      const avgDailyQty = daysPassed > 0 ? item.totalQty / daysPassed : 0;
      projectedQty = avgDailyQty * remainingDays;
    }

    item.totalQty += projectedQty;
  }
}

/**
 * Rót sản lượng vào hợp đồng theo thứ tự ưu tiên (waterfall).
 *
 * Thứ tự sort:
 *   1. priorityOverride ASC NULLS LAST (có số → lên trước, số nhỏ trước)
 *   2. deadline ASC NULLS LAST (có deadline → lên trước, sớm trước)
 *   3. signedDate ASC NULLS LAST (ký trước → lên trước)
 *   4. SalesOrder.id ASC (ổn định)
 */
async function waterfallAllocate(
  productionByItem: ProductionByItem[],
  factoryId: number,
  yearMonth: string,
  firstDayOfMonth: Date
): Promise<AllocationLine[]> {
  const allocations: AllocationLine[] = [];

  for (const prodItem of productionByItem) {
    // Lấy danh sách HĐ active cho mặt hàng này
    const contracts = await prisma.salesOrderItem.findMany({
      where: {
        itemId: prodItem.itemId,
        order: {
          factoryId,
          status: "ACTIVE",
          isActive: true,
        },
        OR: [
          { deferToMonth: null },
          { deferToMonth: { lte: yearMonth } },
        ],
      },
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            deliveryDate: true,
            signedDate: true,
          },
        },
      },
    });

    // Tính "còn cần SX" cho mỗi HĐ
    // previousAllocated = tổng SL đã phân bổ từ ProductionLog CÁC THÁNG TRƯỚC
    const contractsWithRemaining = await Promise.all(
      contracts.map(async (c: (typeof contracts)[0]) => {
        // Dùng OrderAllocation cũ (source='KD') cho các tháng trước.
        // Nếu chưa có allocation cũ thì coi như 0.
        // Về sau khi chuyển hoàn toàn sang v2, sẽ có cơ chế snapshot.
        const previousAllocated = await prisma.orderAllocation.aggregate({
          where: {
            salesOrderItemId: c.id,
            productionDate: { lt: firstDayOfMonth },
          },
          _sum: { allocatedQty: true },
        });

        const totalPreviousAllocated =
          (previousAllocated._sum?.allocatedQty ?? 0);
        const remainingQty =
          c.plannedQty - c.deliveredQty - totalPreviousAllocated;

        return { ...c, remainingQty };
      })
    );

    type ContractWithRemaining = (typeof contractsWithRemaining)[0];

    // Loại bỏ HĐ đã hoàn thành
    const activeContracts = contractsWithRemaining.filter(
      (c: ContractWithRemaining) => c.remainingQty > 0
    );

    // Sort theo ưu tiên
    activeContracts.sort((a: ContractWithRemaining, b: ContractWithRemaining) => {
      // 1. priorityOverride: có trước, số nhỏ trước
      const aP = a.priorityOverride;
      const bP = b.priorityOverride;
      if (aP != null && bP == null) return -1;
      if (aP == null && bP != null) return 1;
      if (aP != null && bP != null && aP !== bP) return aP - bP;

      // 2. deadline: có trước, sớm trước
      const aD = a.deliveryDate ?? a.order.deliveryDate;
      const bD = b.deliveryDate ?? b.order.deliveryDate;
      if (aD && !bD) return -1;
      if (!aD && bD) return 1;
      if (aD && bD) {
        const diff = new Date(aD).getTime() - new Date(bD).getTime();
        if (diff !== 0) return diff;
      }

      // 3. signedDate: ký trước lên trước
      const aS = a.order.signedDate;
      const bS = b.order.signedDate;
      if (aS && !bS) return -1;
      if (!aS && bS) return 1;
      if (aS && bS) {
        const diff = new Date(aS).getTime() - new Date(bS).getTime();
        if (diff !== 0) return diff;
      }

      // 4. orderId (ổn định)
      return a.order.id - b.order.id;
    });

    // Waterfall: rót sản lượng
    let remainingProduction = prodItem.totalQty;
    let lastContract: (typeof activeContracts)[0] | null = null;

    for (const contract of activeContracts) {
      if (remainingProduction <= 0) break;

      const allocateQty = Math.min(remainingProduction, contract.remainingQty);
      if (allocateQty > 0) {
        allocations.push({
          itemId: prodItem.itemId,
          itemName: prodItem.itemName,
          orderItemId: contract.id,
          orderId: contract.order.id,
          orderNo: contract.order.orderNo,
          allocatedQty: allocateQty,
          unitPriceUsd: contract.unitPrice,
          revenueUsd: allocateQty * contract.unitPrice,
          sellingCostRate: contract.sellingCostRate,
          wasteRecoveryRate: contract.wasteRecoveryRate,
        });

        remainingProduction -= allocateQty;
        lastContract = contract;
      }
    }

    // Surplus: phần dư vượt tất cả HĐ
    if (remainingProduction > 0) {
      const surplusPrice = lastContract?.unitPrice ?? 0;
      allocations.push({
        itemId: prodItem.itemId,
        itemName: prodItem.itemName,
        orderItemId: null,
        orderId: null,
        orderNo: null,
        allocatedQty: remainingProduction,
        unitPriceUsd: surplusPrice,
        revenueUsd: remainingProduction * surplusPrice,
        sellingCostRate: lastContract?.sellingCostRate ?? null,
        wasteRecoveryRate: lastContract?.wasteRecoveryRate ?? null,
      });
    }
  }

  return allocations;
}

// ===== EXPORT HELPERS =====

/**
 * Phân bổ sản lượng CHỈ HÔM NAY (cho dashboard card "Hôm nay").
 * Dùng cùng logic waterfall nhưng SL chỉ lấy 1 ngày.
 */
export async function runAllocationToday(
  factoryId: number,
  yearMonth: string
): Promise<AllocationResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [year, month] = yearMonth.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);

  // Lấy SL chỉ hôm nay
  const todayProduction = await getProductionByItem(factoryId, today, today);

  // Waterfall vẫn cần biết "đã rót bao nhiêu trước hôm nay" để biết HĐ nào đang active.
  // Do đó vẫn dùng waterfallAllocate nhưng truyền SL = chỉ hôm nay
  const allocations = await waterfallAllocate(
    todayProduction,
    factoryId,
    yearMonth,
    firstDay
  );

  return {
    allocations,
    productionByItem: todayProduction,
    meta: {
      factoryId,
      yearMonth,
      mode: "REAL",
      fromDate: today.toISOString().split("T")[0],
      toDate: today.toISOString().split("T")[0],
      calculatedAt: new Date().toISOString(),
    },
  };
}
