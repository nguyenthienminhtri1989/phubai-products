import { prisma } from "@/lib/prisma";
import { FixedCostType, SnapshotType } from "@prisma/client";

// ===== TÍNH TOÁN TỪNG DÒNG SỢI =====

export interface CalcInput {
  qty: number; // kg
  unitPriceUsd: number; // USD/kg
  rates: {
    cottonRate?: number; // ĐM tiêu hao cotton (kg NL/kg TP) — từ RawMaterialRate
    peRate?: number; // ĐM tiêu hao PE (kg NL/kg TP) — giá trị GỐC, từ RawMaterialRate
    cottonRatio?: number; // Tỷ lệ cotton (0-1) — từ RawMaterialRate hoặc snapshot
    wasteRate?: number; // Tỷ lệ phế (0-1) — từ RawMaterialRate
    sellingCostRate?: number; // USD/kg — từ SalesOrderItem
    doubleTwistGcRate?: number; // USD/kg — từ RawMaterialRate
  };
  params: {
    exchangeRate: number; // Tỷ giá VNĐ/USD — từ MonthlyInputParam
    cottonPriceUsd: number; // Giá bông đã chọn (USD/kg) — từ MaterialPrice hoặc snapshot
    pePriceUsd?: number; // Giá PE đã chọn (USD/kg) — từ MaterialPrice hoặc snapshot
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
  const { exchangeRate, cottonPriceUsd, pePriceUsd = 0 } = params;
  const {
    cottonRate = 0,
    peRate = 0,
    cottonRatio = 1.0, // mặc định 100% cotton
    wasteRate = 0,
    sellingCostRate = 0,
    doubleTwistGcRate = 0,
  } = rates;

  const peRatio = 1 - cottonRatio; // tự tính, không lưu DB

  const revenueVnd = qty * unitPriceUsd * exchangeRate;

  // CP Cotton = tỷ giá × sản lượng × giá bông × định mức × tỷ lệ cotton
  const cottonCostVnd =
    exchangeRate * qty * cottonPriceUsd * cottonRate * cottonRatio;

  // CP PE = tỷ giá × sản lượng × giá PE × định mức PE (GỐC) × tỷ lệ PE
  const peCostVnd =
    peRatio > 0 ? exchangeRate * qty * pePriceUsd * peRate * peRatio : 0;

  const sellingCostVnd = qty * sellingCostRate * exchangeRate;
  const gcDoubleTwistVnd = qty * doubleTwistGcRate * exchangeRate;

  // Phế thu hồi × 0.95 (hệ số thu hồi thực tế)
  const wasteRecoveryVnd = qty * wasteRate * exchangeRate * 0.95;

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
  type: SnapshotType,
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
      0,
    );
    const variableCostVnd = plan.lineItems.reduce(
      (s: number, li) =>
        s +
        (li.cottonCostVnd ?? 0) +
        (li.peCostVnd ?? 0) +
        (li.sellingCostVnd ?? 0) +
        (li.gcDoubleTwistVnd ?? 0) -
        (li.wasteRecoveryVnd ?? 0),
      0,
    );
    // DOANH_THU_HDTC là khoản thu — cộng vào lợi nhuận, không tính vào chi phí
    const fixedCostVnd = plan.fixedCosts
      .filter((fc) => fc.costType !== "DOANH_THU_HDTC")
      .reduce((s: number, fc) => s + fc.amountVnd, 0);
    const financialIncome =
      plan.fixedCosts.find((fc) => fc.costType === "DOANH_THU_HDTC")
        ?.amountVnd ?? 0;
    const totalCostVnd = variableCostVnd + fixedCostVnd;
    const totalProfitVnd = totalRevenueVnd - totalCostVnd + financialIncome;

    await prisma.monthlySummarySnapshot.upsert({
      where: {
        factoryId_yearMonth_type: {
          factoryId,
          yearMonth,
          type: SnapshotType.KH,
        },
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
      0,
    );
    const variableCostVnd = actual.lineItems.reduce(
      (s, li) =>
        s +
        (li.cottonCostVnd ?? 0) +
        (li.peCostVnd ?? 0) +
        (li.sellingCostVnd ?? 0) +
        (li.gcDoubleTwistVnd ?? 0) -
        (li.wasteRecoveryVnd ?? 0),
      0,
    );
    // DOANH_THU_HDTC là khoản thu — cộng vào lợi nhuận, không tính vào chi phí
    const fixedCostVnd = actual.fixedCosts
      .filter((fc) => fc.costType !== "DOANH_THU_HDTC")
      .reduce((s, fc) => s + fc.amountVnd, 0);
    const financialIncome =
      actual.fixedCosts.find((fc) => fc.costType === "DOANH_THU_HDTC")
        ?.amountVnd ?? 0;
    const totalCostVnd = variableCostVnd + fixedCostVnd;
    const totalProfitVnd = totalRevenueVnd - totalCostVnd + financialIncome;

    await prisma.monthlySummarySnapshot.upsert({
      where: {
        factoryId_yearMonth_type: {
          factoryId,
          yearMonth,
          type: SnapshotType.TH,
        },
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
