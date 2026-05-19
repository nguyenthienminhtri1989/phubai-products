import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FixedCostType } from "@prisma/client";
import { FIXED_COST_LABELS } from "@/lib/kdsx/calculator-v2";

// Thứ tự chuẩn để trả đủ 14 dòng
const COST_TYPE_ORDER = Object.keys(FIXED_COST_LABELS);

export async function GET(req: NextRequest) {
  const factoryId = Number(req.nextUrl.searchParams.get("factoryId"));
  const yearMonth = req.nextUrl.searchParams.get("yearMonth") ?? "";

  if (!factoryId || !yearMonth) {
    return NextResponse.json(
      { error: "factoryId và yearMonth là bắt buộc" },
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
    const entries = await prisma.fixedCostEntry.findMany({
      where: { factoryId, yearMonth },
    });

    const entryMap = new Map(entries.map((e) => [e.costType, e.amountVnd]));

    // Luôn trả đủ 14 dòng, dòng chưa có → amountVnd = 0
    const costs = COST_TYPE_ORDER.map((costType) => ({
      costType,
      label: FIXED_COST_LABELS[costType] ?? costType,
      amountVnd: entryMap.get(costType as FixedCostType) ?? 0,
    }));

    return NextResponse.json({
      factoryId,
      yearMonth,
      costs,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { factoryId, yearMonth, costs } = body as {
      factoryId: number;
      yearMonth: string;
      costs: Array<{ costType: string; amountVnd: number }>;
    };

    if (!factoryId || !yearMonth || !Array.isArray(costs)) {
      return NextResponse.json(
        { error: "factoryId, yearMonth và costs là bắt buộc" },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json(
        { error: "yearMonth phải có định dạng YYYY-MM" },
        { status: 400 }
      );
    }

    // Upsert từng dòng dùng compound unique (factoryId + yearMonth + costType)
    const results = await Promise.all(
      costs.map(({ costType, amountVnd }) =>
        prisma.fixedCostEntry.upsert({
          where: {
            factoryId_yearMonth_costType: {
              factoryId,
              yearMonth,
              costType: costType as FixedCostType,
            },
          },
          update: { amountVnd },
          create: {
            factoryId,
            yearMonth,
            costType: costType as FixedCostType,
            amountVnd,
          },
        })
      )
    );

    return NextResponse.json({
      saved: results.length,
      factoryId,
      yearMonth,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
