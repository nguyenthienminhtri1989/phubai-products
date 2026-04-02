import { prisma } from "@/lib/prisma";
import { FixedCostType, SnapshotType } from "@prisma/client";

// ===== TÍNH TOÁN TỪNG DÒNG SỢI =====

export interface CalcInput {
  qty: number; // kg
  unitPriceUsd: number; // USD/kg
  rates: {
    cottonRate?: number; // kg cotton / kg TP
    peRate?: number; // kg PE / kg TP
    wasteRate?: number; // tỷ lệ phế (0-1)
    sellingCostRate?: number; // USD/kg
    doubleTwistGcRate?: number; // USD/kg
  };
  params: {
    exchangeRate: number; // VNĐ/USD
    avgCottonPrice: number; // USD/kg bông bình quân
    peBenmaPrice?: number; // USD/kg PE Benma
    wastePrice?: number; // VNĐ/kg phế liệu
  };
}

export interface CalcOutput {
  revenueVnd: number;
  cottonCostVnd: number;
  peCostVnd: number;
  sellingCostVnd: number;
  gcDoubleTwistVnd: number;
  wasteRecoveryVnd: number;
  grossProfitVnd: number;
}

export function calculateLineItem(input: CalcInput): CalcOutput {
  const { qty, unitPriceUsd, rates, params } = input;
  const { exchangeRate, avgCottonPrice, peBenmaPrice = 0, wastePrice = 0 } = params;
  const {
    cottonRate = 0,
    peRate = 0,
    wasteRate = 0,
    sellingCostRate = 0,
    doubleTwistGcRate = 0,
  } = rates;

  const revenueVnd = qty * unitPriceUsd * exchangeRate;
  const cottonCostVnd = qty * cottonRate * avgCottonPrice * exchangeRate;
  const peCostVnd = qty * peRate * peBenmaPrice * exchangeRate;
  const sellingCostVnd = qty * sellingCostRate * exchangeRate;
  const gcDoubleTwistVnd = qty * doubleTwistGcRate * exchangeRate;
  // wastePrice đã là VNĐ/kg
  const wasteRecoveryVnd = qty * wasteRate * wastePrice;
  const grossProfitVnd =
    revenueVnd -
    cottonCostVnd -
    peCostVnd -
    sellingCostVnd -
    gcDoubleTwistVnd +
    wasteRecoveryVnd;

  return {
    revenueVnd,
    cottonCostVnd,
    peCostVnd,
    sellingCostVnd,
    gcDoubleTwistVnd,
    wasteRecoveryVnd,
    grossProfitVnd,
  };
}

// ===== REFRESH SUMMARY SNAPSHOT =====

export async function refreshSummarySnapshot(
  factoryId: number,
  yearMonth: string,
  type: SnapshotType
) {
  if (type === SnapshotType.KH) {
    const plan = await prisma.monthlyPlan.findUnique({
      where: { factoryId_yearMonth: { factoryId, yearMonth } },
      include: {
        lineItems: true,
        fixedCosts: true,
      },
    });

    if (!plan) {
      // Xóa snapshot nếu plan không còn tồn tại
      await prisma.monthlySummarySnapshot.deleteMany({
        where: { factoryId, yearMonth, type: SnapshotType.KH },
      });
      return;
    }

    const totalQtyKg = plan.lineItems.reduce((s: number, li) => s + li.qty, 0);
    const totalRevenueVnd = plan.lineItems.reduce(
      (s: number, li) => s + (li.revenueVnd ?? 0),
      0
    );
    const variableCostVnd = plan.lineItems.reduce(
      (s: number, li) =>
        s +
        (li.cottonCostVnd ?? 0) +
        (li.peCostVnd ?? 0) +
        (li.sellingCostVnd ?? 0) +
        (li.gcDoubleTwistVnd ?? 0) -
        (li.wasteRecoveryVnd ?? 0),
      0
    );
    // DOANH_THU_HDTC là khoản thu — cộng vào lợi nhuận, không tính vào chi phí
    const fixedCostVnd = plan.fixedCosts
      .filter((fc) => fc.costType !== "DOANH_THU_HDTC")
      .reduce((s: number, fc) => s + fc.amountVnd, 0);
    const financialIncome = plan.fixedCosts
      .find((fc) => fc.costType === "DOANH_THU_HDTC")?.amountVnd ?? 0;
    const totalCostVnd = variableCostVnd + fixedCostVnd;
    const totalProfitVnd = totalRevenueVnd - totalCostVnd + financialIncome;

    await prisma.monthlySummarySnapshot.upsert({
      where: {
        factoryId_yearMonth_type: { factoryId, yearMonth, type: SnapshotType.KH },
      },
      create: {
        factoryId,
        yearMonth,
        type: SnapshotType.KH,
        totalQtyKg,
        totalRevenueVnd,
        totalCostVnd,
        totalProfitVnd,
      },
      update: {
        totalQtyKg,
        totalRevenueVnd,
        totalCostVnd,
        totalProfitVnd,
      },
    });
  } else {
    // TH
    const actual = await prisma.monthlyActual.findUnique({
      where: { factoryId_yearMonth: { factoryId, yearMonth } },
      include: {
        lineItems: true,
        fixedCosts: true,
      },
    });

    if (!actual) {
      await prisma.monthlySummarySnapshot.deleteMany({
        where: { factoryId, yearMonth, type: SnapshotType.TH },
      });
      return;
    }

    const totalQtyKg = actual.lineItems.reduce((s, li) => s + li.qty, 0);
    const totalRevenueVnd = actual.lineItems.reduce(
      (s, li) => s + (li.revenueVnd ?? 0),
      0
    );
    const variableCostVnd = actual.lineItems.reduce(
      (s, li) =>
        s +
        (li.cottonCostVnd ?? 0) +
        (li.peCostVnd ?? 0) +
        (li.sellingCostVnd ?? 0) +
        (li.gcDoubleTwistVnd ?? 0) -
        (li.wasteRecoveryVnd ?? 0),
      0
    );
    // DOANH_THU_HDTC là khoản thu — cộng vào lợi nhuận, không tính vào chi phí
    const fixedCostVnd = actual.fixedCosts
      .filter((fc) => fc.costType !== "DOANH_THU_HDTC")
      .reduce((s, fc) => s + fc.amountVnd, 0);
    const financialIncome = actual.fixedCosts
      .find((fc) => fc.costType === "DOANH_THU_HDTC")?.amountVnd ?? 0;
    const totalCostVnd = variableCostVnd + fixedCostVnd;
    const totalProfitVnd = totalRevenueVnd - totalCostVnd + financialIncome;

    await prisma.monthlySummarySnapshot.upsert({
      where: {
        factoryId_yearMonth_type: { factoryId, yearMonth, type: SnapshotType.TH },
      },
      create: {
        factoryId,
        yearMonth,
        type: SnapshotType.TH,
        totalQtyKg,
        totalRevenueVnd,
        totalCostVnd,
        totalProfitVnd,
      },
      update: {
        totalQtyKg,
        totalRevenueVnd,
        totalCostVnd,
        totalProfitVnd,
      },
    });
  }
}

// Tất cả 14 loại chi phí cố định theo thứ tự hiển thị
export const ALL_FIXED_COST_TYPES: FixedCostType[] = [
  "TIEN_LUONG",
  "TRICH_TRUOC_LUONG",
  "TIEN_AN_CA",
  "BHXH_YT_TN_KPCD",
  "TIEN_DIEN",
  "KHAU_HAO",
  "ONG_CONE_BAO_PP",
  "CHI_PHI_VAT_LIEU",
  "CHI_PHI_QUAN_LY",
  "LAI_VAY_VCD",
  "LAI_VAY_VLD",
  "LO_CHENH_LECH_TY_GIA",
  "DOANH_THU_HDTC",
  "KHAC",
];

export const FIXED_COST_LABELS: Record<FixedCostType, string> = {
  TIEN_LUONG: "Tiền lương",
  TRICH_TRUOC_LUONG: "Trích trước tiền lương",
  TIEN_AN_CA: "Tiền ăn ca",
  BHXH_YT_TN_KPCD: "BHXH, YT, TN, KPCĐ",
  TIEN_DIEN: "Tiền điện",
  KHAU_HAO: "Khấu hao",
  ONG_CONE_BAO_PP: "Ống cone, thùng CT, bao PP...",
  CHI_PHI_VAT_LIEU: "CP vật liệu + CP khác",
  CHI_PHI_QUAN_LY: "CP quản lý doanh nghiệp",
  LAI_VAY_VCD: "Lãi vay vốn cố định",
  LAI_VAY_VLD: "Lãi vay vốn lưu động",
  LO_CHENH_LECH_TY_GIA: "Lỗ chênh lệch tỷ giá",
  DOANH_THU_HDTC: "Doanh thu HĐTC (*)",
  KHAC: "Khác",
};
