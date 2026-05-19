import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  runAllocationFromProduction,
  runAllocationToday,
} from "@/lib/allocation-engine-v2";
import {
  calculateRevenuePnL,
  PnLSummary,
  PnLResult,
} from "@/lib/kdsx/calculator-v2";

function emptySummary(): PnLSummary {
  return {
    totalQtyKg: 0,
    totalRevenueVnd: 0,
    totalCottonCostVnd: 0,
    totalPeCostVnd: 0,
    totalSellingCostVnd: 0,
    totalGcDoubleTwistVnd: 0,
    totalWasteRecoveryVnd: 0,
    totalVariableCostVnd: 0,
    totalFixedCostVnd: 0,
    financialIncomeVnd: 0,
    totalProfitVnd: 0,
  };
}

function addSummaries(a: PnLSummary, b: PnLSummary): PnLSummary {
  return {
    totalQtyKg: a.totalQtyKg + b.totalQtyKg,
    totalRevenueVnd: a.totalRevenueVnd + b.totalRevenueVnd,
    totalCottonCostVnd: a.totalCottonCostVnd + b.totalCottonCostVnd,
    totalPeCostVnd: a.totalPeCostVnd + b.totalPeCostVnd,
    totalSellingCostVnd: a.totalSellingCostVnd + b.totalSellingCostVnd,
    totalGcDoubleTwistVnd:
      a.totalGcDoubleTwistVnd + b.totalGcDoubleTwistVnd,
    totalWasteRecoveryVnd:
      a.totalWasteRecoveryVnd + b.totalWasteRecoveryVnd,
    totalVariableCostVnd: a.totalVariableCostVnd + b.totalVariableCostVnd,
    totalFixedCostVnd: a.totalFixedCostVnd + b.totalFixedCostVnd,
    financialIncomeVnd: a.financialIncomeVnd + b.financialIncomeVnd,
    totalProfitVnd: a.totalProfitVnd + b.totalProfitVnd,
  };
}

export async function GET(req: NextRequest) {
  const yearMonth = req.nextUrl.searchParams.get("yearMonth") ?? "";

  if (!yearMonth) {
    return NextResponse.json(
      { error: "yearMonth là bắt buộc" },
      { status: 400 }
    );
  }

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { error: "yearMonth phải có định dạng YYYY-MM" },
      { status: 400 }
    );
  }

  try {
    const factories = await prisma.factory.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });

    const factoryResults: Array<{
      factoryId: number;
      factoryName: string;
      today: PnLResult | null;
      mtd: PnLResult | null;
      projected: PnLResult | null;
      skipped: boolean;
      skipReason?: string;
    }> = [];

    let totalToday = emptySummary();
    let totalMtd = emptySummary();
    let totalProjected = emptySummary();

    for (const factory of factories) {
      try {
        const [mtdAlloc, projAlloc, todayAlloc] = await Promise.all([
          runAllocationFromProduction(factory.id, yearMonth, "REAL"),
          runAllocationFromProduction(factory.id, yearMonth, "PROJECTION"),
          runAllocationToday(factory.id, yearMonth),
        ]);

        const [mtd, projected, today] = await Promise.all([
          calculateRevenuePnL(mtdAlloc, factory.id, yearMonth, "REAL"),
          calculateRevenuePnL(projAlloc, factory.id, yearMonth, "PROJECTION"),
          calculateRevenuePnL(todayAlloc, factory.id, yearMonth, "REAL"),
        ]);

        factoryResults.push({
          factoryId: factory.id,
          factoryName: factory.name,
          today,
          mtd,
          projected,
          skipped: false,
        });

        totalToday = addSummaries(totalToday, today.summary);
        totalMtd = addSummaries(totalMtd, mtd.summary);
        totalProjected = addSummaries(totalProjected, projected.summary);
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : "Lỗi không xác định";
        factoryResults.push({
          factoryId: factory.id,
          factoryName: factory.name,
          today: null,
          mtd: null,
          projected: null,
          skipped: true,
          skipReason: reason,
        });
      }
    }

    return NextResponse.json({
      factories: factoryResults,
      total: {
        today: totalToday,
        mtd: totalMtd,
        projected: totalProjected,
      },
      meta: {
        yearMonth,
        calculatedAt: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
