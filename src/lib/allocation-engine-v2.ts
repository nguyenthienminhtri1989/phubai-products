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
  note: string | null; // ghi chú phân biệt dòng (cảng, container...)
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
  const firstDay = new Date(`${yearMonth}-01T00:00:00.000Z`);
  const lastDay = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // ngày cuối tháng
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

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
 * Nếu có MonthlyQuota cho item+yearMonth → dùng quota-based waterfall (FIXED trước, REMAINDER sau).
 * Nếu không có quota → fallback waterfall cũ (sort theo priority/deadline/signedDate).
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
        quotas: {
          where: { yearMonth },
        },
      },
    });

    // Tính "còn cần SX" cho mỗi HĐ từ các tháng trước
    const contractsWithRemaining = await Promise.all(
      contracts.map(async (c: (typeof contracts)[0]) => {
        const previousAllocated = await prisma.orderAllocation.aggregate({
          where: {
            salesOrderItemId: c.id,
            productionDate: { lt: firstDayOfMonth },
          },
          _sum: { allocatedQty: true },
        });
        const totalPreviousAllocated = previousAllocated._sum?.allocatedQty ?? 0;
        const remainingQty = c.plannedQty - c.deliveredQty - totalPreviousAllocated;
        return { ...c, remainingQty };
      })
    );

    type ContractWithRemaining = (typeof contractsWithRemaining)[0];

    const activeContracts = contractsWithRemaining.filter(
      (c: ContractWithRemaining) => c.remainingQty > 0
    );

    let remainingProduction = prodItem.totalQty;
    let lastContract: ContractWithRemaining | null = null;

    // Kiểm tra có MonthlyQuota cho item này không
    const quotaContracts = activeContracts.filter(
      (c: ContractWithRemaining) => c.quotas.length > 0
    );

    if (quotaContracts.length > 0) {
      // ===== QUOTA-BASED WATERFALL =====
      // Tách FIXED và REMAINDER, sort theo sortOrder
      const fixedQuotas = activeContracts
        .filter((c: ContractWithRemaining) => c.quotas.length > 0 && !c.quotas[0].isRemainder)
        .sort((a: ContractWithRemaining, b: ContractWithRemaining) =>
          (a.quotas[0]?.sortOrder ?? 0) - (b.quotas[0]?.sortOrder ?? 0)
        );
      const remainderContract = activeContracts.find(
        (c: ContractWithRemaining) => c.quotas.length > 0 && c.quotas[0].isRemainder
      ) ?? null;

      // Rót FIXED trước (bị cap bởi quotaQty)
      for (const contract of fixedQuotas) {
        if (remainingProduction <= 0) break;
        const cap = Math.min(
          contract.quotas[0].quotaQty ?? contract.remainingQty,
          contract.remainingQty
        );
        const allocateQty = Math.min(remainingProduction, cap);
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
            note: contract.note ?? null,
            sellingCostRate: contract.sellingCostRate,
            wasteRecoveryRate: contract.wasteRecoveryRate,
          });
          remainingProduction -= allocateQty;
          lastContract = contract;
        }
      }

      // Phần dư → REMAINDER
      if (remainderContract && remainingProduction > 0) {
        const allocateQty = Math.min(remainingProduction, remainderContract.remainingQty);
        if (allocateQty > 0) {
          allocations.push({
            itemId: prodItem.itemId,
            itemName: prodItem.itemName,
            orderItemId: remainderContract.id,
            orderId: remainderContract.order.id,
            orderNo: remainderContract.order.orderNo,
            allocatedQty: allocateQty,
            unitPriceUsd: remainderContract.unitPrice,
            revenueUsd: allocateQty * remainderContract.unitPrice,
            note: remainderContract.note ?? null,
            sellingCostRate: remainderContract.sellingCostRate,
            wasteRecoveryRate: remainderContract.wasteRecoveryRate,
          });
          remainingProduction -= allocateQty;
          lastContract = remainderContract;
        }
      }
    } else {
      // ===== FALLBACK: WATERFALL CŨ (sort theo priority/deadline/signedDate) =====
      activeContracts.sort((a: ContractWithRemaining, b: ContractWithRemaining) => {
        const aP = a.priorityOverride;
        const bP = b.priorityOverride;
        if (aP != null && bP == null) return -1;
        if (aP == null && bP != null) return 1;
        if (aP != null && bP != null && aP !== bP) return aP - bP;

        const aD = a.deliveryDate ?? a.order.deliveryDate;
        const bD = b.deliveryDate ?? b.order.deliveryDate;
        if (aD && !bD) return -1;
        if (!aD && bD) return 1;
        if (aD && bD) {
          const diff = new Date(aD).getTime() - new Date(bD).getTime();
          if (diff !== 0) return diff;
        }

        const aS = a.order.signedDate;
        const bS = b.order.signedDate;
        if (aS && !bS) return -1;
        if (!aS && bS) return 1;
        if (aS && bS) {
          const diff = new Date(aS).getTime() - new Date(bS).getTime();
          if (diff !== 0) return diff;
        }

        return a.order.id - b.order.id;
      });

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
            note: contract.note ?? null,
            sellingCostRate: contract.sellingCostRate,
            wasteRecoveryRate: contract.wasteRecoveryRate,
          });
          remainingProduction -= allocateQty;
          lastContract = contract;
        }
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
        note: null,
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
  today.setUTCHours(0, 0, 0, 0);

  const firstDay = new Date(`${yearMonth}-01T00:00:00.000Z`);

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
