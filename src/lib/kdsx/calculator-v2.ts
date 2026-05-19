// src/lib/kdsx/calculator-v2.ts

import { prisma } from "@/lib/prisma";
import type {
  AllocationResult,
  AllocationLine,
} from "@/lib/allocation-engine-v2";

// ===== INTERFACES =====

export interface PnLSummary {
  totalQtyKg: number;
  totalRevenueVnd: number;
  totalCottonCostVnd: number;
  totalPeCostVnd: number;
  totalSellingCostVnd: number;
  totalGcDoubleTwistVnd: number;
  totalWasteRecoveryVnd: number; // Số dương = thu
  totalVariableCostVnd: number; // cotton + pe + BH + GC - phế
  totalFixedCostVnd: number;
  financialIncomeVnd: number; // DT HĐTC (cộng vào LN)
  totalProfitVnd: number;
}

export interface ContractPnL {
  orderItemId: number | null;
  orderId: number | null;
  orderNo: string | null;
  itemId: number;
  itemName: string;
  allocatedQty: number;
  unitPriceUsd: number;
  revenueVnd: number;
  cottonCostVnd: number;
  peCostVnd: number;
  sellingCostVnd: number;
  gcDoubleTwistVnd: number;
  wasteRecoveryVnd: number;
  variableCostVnd: number;
  profitContributionVnd: number; // DT - CP biến đổi (chưa trừ CP cố định)
}

export interface FixedCostLine {
  costType: string;
  label: string;
  amountVnd: number;
}

export interface PnLResult {
  summary: PnLSummary;
  byContract: ContractPnL[];
  fixedCosts: FixedCostLine[];
  meta: {
    exchangeRate: number;
    wasteAdjustmentFactor: number;
    mode: "REAL" | "PROJECTION";
  };
}

// ===== CONSTANTS =====

// Copy từ calculator.ts cũ — giữ đúng thứ tự hiển thị
export const FIXED_COST_LABELS: Record<string, string> = {
  TIEN_LUONG: "Tiền lương",
  TRICH_TRUOC_LUONG: "Trích trước tiền lương",
  TIEN_AN_CA: "Tiền ăn ca",
  BHXH_YT_TN_KPCD: "BHXH, YT, TN, KPCĐ",
  TIEN_DIEN: "Tiền điện",
  KHAU_HAO: "Khấu hao",
  ONG_CONE_BAO_PP: "Ống cone, thùng CT, bao PP, khóa, nẹp",
  CHI_PHI_VAT_LIEU: "Chi phí vật liệu + chi phí khác",
  CHI_PHI_QUAN_LY: "Chi phí quản lý doanh nghiệp",
  LAI_VAY_VCD: "Lãi vay vốn cố định",
  LAI_VAY_VLD: "Lãi vay vốn lưu động",
  LO_CHENH_LECH_TY_GIA: "Lỗ chênh lệch tỷ giá",
  DOANH_THU_HDTC: "Doanh thu hoạt động tài chính",
  KHAC: "Chi phí khác",
};

// ===== MAIN FUNCTION =====

/**
 * Tính DT/CP/LN từ kết quả allocation.
 *
 * Công thức lấy chuẩn từ file Excel (sheet T05):
 *   DT = qty × unitPriceUsd × exchangeRate
 *   CP Cotton = qty × cottonRate × (cottonPrice + warehouseFee) × cottonRatio × exchangeRate
 *   CP PE = qty × peRate × pePrice × (1 - cottonRatio) × exchangeRate
 *   CP BH = qty × sellingCostRate × unitPriceUsd × exchangeRate
 *   CP GC = qty × doubleTwistGcRate × unitPriceUsd × exchangeRate
 *   Phế = qty × wasteRate × wasteAdjustmentFactor × exchangeRate
 *   LN = DT - CP biến đổi - CP cố định + DT HĐTC
 */
export async function calculateRevenuePnL(
  allocationResult: AllocationResult,
  factoryId: number,
  yearMonth: string,
  mode: "REAL" | "PROJECTION"
): Promise<PnLResult> {
  // ===== BƯỚC 1: Lấy thông số tháng =====
  const inputParam = await prisma.monthlyInputParam.findFirst({
    where: { factoryId, yearMonth },
  });

  if (!inputParam) {
    throw new Error(
      `Chưa nhập thông số tháng (tỷ giá, phí kho) cho factory ${factoryId} tháng ${yearMonth}. ` +
        `Vui lòng vào Thông số tháng để nhập.`
    );
  }

  const exchangeRate = inputParam.exchangeRate;
  const warehouseFee = inputParam.warehouseFee ?? 0.02;
  const wasteAdjustmentFactor = inputParam.wasteAdjustmentFactor ?? 0.95;

  // ===== BƯỚC 2: Lấy giá NVL (fallback tháng gần nhất) =====
  const cottonPrices = await prisma.materialPrice.findMany({
    where: {
      yearMonth: { lte: yearMonth },
      materialType: { category: "COTTON" },
    },
    include: { materialType: true },
    orderBy: { yearMonth: "desc" },
  });

  const pePrices = await prisma.materialPrice.findMany({
    where: {
      yearMonth: { lte: yearMonth },
      materialType: { category: "PE" },
    },
    include: { materialType: true },
    orderBy: { yearMonth: "desc" },
  });

  // Lấy giá gần nhất cho mỗi loại NVL
  const latestCottonPrice = cottonPrices.length > 0 ? cottonPrices[0].priceUsd : 0;
  const latestPePrice = pePrices.length > 0 ? pePrices[0].priceUsd : 0;

  // ===== BƯỚC 3: Lấy định mức tiêu hao (cache per itemId) =====
  const [yearNum, monthNum] = yearMonth.split("-").map(Number);
  const lastDayOfMonth = new Date(yearNum, monthNum, 0);
  const firstDayOfMonth = new Date(yearNum, monthNum - 1, 1);

  const itemIds = [
    ...new Set(allocationResult.allocations.map((a: AllocationLine) => a.itemId)),
  ];

  const rateMap = new Map<
    number,
    {
      cottonRate: number;
      peRate: number;
      cottonRatio: number;
      wasteRate: number;
      doubleTwistGcRate: number;
    }
  >();

  for (const itemId of itemIds) {
    const rate = await prisma.rawMaterialRate.findFirst({
      where: {
        itemId,
        effectiveFrom: { lte: lastDayOfMonth },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: firstDayOfMonth } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });

    rateMap.set(itemId, {
      cottonRate: rate?.cottonRate ?? 0,
      peRate: rate?.peRate ?? 0,
      cottonRatio: rate?.cottonRatio ?? 1.0,
      wasteRate: rate?.wasteRate ?? 0,
      doubleTwistGcRate: rate?.doubleTwistGcRate ?? 0,
    });
  }

  // ===== BƯỚC 4: Tính chi phí biến đổi cho mỗi allocation line =====
  const byContract: ContractPnL[] = [];

  for (const line of allocationResult.allocations) {
    const rate = rateMap.get(line.itemId) ?? {
      cottonRate: 0,
      peRate: 0,
      cottonRatio: 1.0,
      wasteRate: 0,
      doubleTwistGcRate: 0,
    };

    const qty = line.allocatedQty;
    const unitPrice = line.unitPriceUsd;

    // Giá bông bình quân = giá cotton + phí kho
    const avgCottonPrice = latestCottonPrice + warehouseFee;

    // CP Cotton = qty × cottonRate × avgCottonPrice × cottonRatio × exchangeRate
    const cottonCostVnd =
      qty * rate.cottonRate * avgCottonPrice * rate.cottonRatio * exchangeRate;

    // CP PE = qty × peRate × pePrice × (1 - cottonRatio) × exchangeRate
    const peCostVnd =
      qty * rate.peRate * latestPePrice * (1 - rate.cottonRatio) * exchangeRate;

    // CP Bán hàng = qty × sellingCostRate × unitPrice × exchangeRate
    const sellingCostRate = line.sellingCostRate ?? 0;
    const sellingCostVnd = qty * sellingCostRate * unitPrice * exchangeRate;

    // CP GC xe đôi = qty × doubleTwistGcRate × unitPrice × exchangeRate
    const gcDoubleTwistVnd =
      qty * rate.doubleTwistGcRate * unitPrice * exchangeRate;

    // Phế thu hồi = qty × wasteRate × wasteAdjustmentFactor × exchangeRate
    // wasteRate ở đây là USD/kg (VD: 0.18 USD/kg)
    const itemWasteRate = line.wasteRecoveryRate ?? rate.wasteRate ?? 0;
    const wasteRecoveryVnd =
      qty * itemWasteRate * wasteAdjustmentFactor * exchangeRate;

    // Revenue
    const revenueVnd = qty * unitPrice * exchangeRate;

    // Variable cost
    const variableCostVnd =
      cottonCostVnd +
      peCostVnd +
      sellingCostVnd +
      gcDoubleTwistVnd -
      wasteRecoveryVnd;

    byContract.push({
      orderItemId: line.orderItemId,
      orderId: line.orderId,
      orderNo: line.orderNo,
      itemId: line.itemId,
      itemName: line.itemName,
      allocatedQty: qty,
      unitPriceUsd: unitPrice,
      revenueVnd,
      cottonCostVnd,
      peCostVnd,
      sellingCostVnd,
      gcDoubleTwistVnd,
      wasteRecoveryVnd,
      variableCostVnd,
      profitContributionVnd: revenueVnd - variableCostVnd,
    });
  }

  // ===== BƯỚC 5: Chi phí cố định =====
  const fixedCostEntries = await prisma.fixedCostEntry.findMany({
    where: { factoryId, yearMonth },
  });

  const fixedCosts: FixedCostLine[] = fixedCostEntries.map((fc) => ({
    costType: fc.costType,
    label: FIXED_COST_LABELS[fc.costType] ?? fc.costType,
    amountVnd: fc.amountVnd,
  }));

  // Tách DT HĐTC
  const financialIncome =
    fixedCostEntries.find((fc) => fc.costType === "DOANH_THU_HDTC")
      ?.amountVnd ?? 0;

  let totalFixedCost = fixedCostEntries
    .filter((fc) => fc.costType !== "DOANH_THU_HDTC")
    .reduce((sum, fc) => sum + fc.amountVnd, 0);

  let adjustedFinancialIncome = financialIncome;

  // Mode REAL: chia tỷ lệ theo ngày đã qua
  if (mode === "REAL") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const effectiveToday =
      today < lastDayOfMonth ? today : lastDayOfMonth;
    const daysPassed =
      Math.ceil(
        (effectiveToday.getTime() - firstDayOfMonth.getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;
    const daysInMonth = lastDayOfMonth.getDate();
    const ratio = daysPassed / daysInMonth;
    totalFixedCost = totalFixedCost * ratio;
    adjustedFinancialIncome = financialIncome * ratio;
  }

  // ===== BƯỚC 6: Tổng hợp =====
  const totalRevenue = byContract.reduce((s, c) => s + c.revenueVnd, 0);
  const totalCottonCost = byContract.reduce((s, c) => s + c.cottonCostVnd, 0);
  const totalPeCost = byContract.reduce((s, c) => s + c.peCostVnd, 0);
  const totalSellingCost = byContract.reduce(
    (s, c) => s + c.sellingCostVnd,
    0
  );
  const totalGcCost = byContract.reduce(
    (s, c) => s + c.gcDoubleTwistVnd,
    0
  );
  const totalWasteRecovery = byContract.reduce(
    (s, c) => s + c.wasteRecoveryVnd,
    0
  );
  const totalVariableCost = byContract.reduce(
    (s, c) => s + c.variableCostVnd,
    0
  );
  const totalQtyKg = byContract.reduce((s, c) => s + c.allocatedQty, 0);

  const totalProfit =
    totalRevenue -
    totalVariableCost -
    totalFixedCost +
    adjustedFinancialIncome;

  return {
    summary: {
      totalQtyKg,
      totalRevenueVnd: totalRevenue,
      totalCottonCostVnd: totalCottonCost,
      totalPeCostVnd: totalPeCost,
      totalSellingCostVnd: totalSellingCost,
      totalGcDoubleTwistVnd: totalGcCost,
      totalWasteRecoveryVnd: totalWasteRecovery,
      totalVariableCostVnd: totalVariableCost,
      totalFixedCostVnd: totalFixedCost,
      financialIncomeVnd: adjustedFinancialIncome,
      totalProfitVnd: totalProfit,
    },
    byContract,
    fixedCosts,
    meta: {
      exchangeRate,
      wasteAdjustmentFactor,
      mode,
    },
  };
}
