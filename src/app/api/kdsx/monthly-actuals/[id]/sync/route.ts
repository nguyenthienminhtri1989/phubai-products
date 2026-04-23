import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  calculateLineItem,
  refreshSummarySnapshot,
} from "@/lib/kdsx/calculator";
import { SnapshotType } from "@prisma/client";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as any)?.userRole as string | undefined;
  const KDSX_EDIT_ROLES = ["ADMIN", "DIRECTOR", "SALES", "FACTORY_MANAGER"];
  if (!userRole || !KDSX_EDIT_ROLES.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const actual = await prisma.monthlyActual.findUnique({
    where: { id: Number(id) },
    include: { lineItems: { where: { isAdHoc: false } } }, // chỉ lấy dòng không phải phát sinh
  });
  if (!actual)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { factoryId, yearMonth } = actual;
  const [year, month] = yearMonth.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // ngày cuối tháng

  // =====================================================================
  // Bước 1: Lấy Production Schedule + tính SL kết hợp KH+TH theo mặt hàng
  // =====================================================================
  const schedule = await prisma.productionSchedule.findUnique({
    where: { factoryId_yearMonth: { factoryId, yearMonth } },
    include: { segments: true },
  });

  // itemTotals: mặt hàng → { khKg, thKg }
  const itemTotals: Record<
    number,
    { itemId: number; khKg: number; thKg: number }
  > = {};

  if (schedule && schedule.segments.length > 0) {
    const holidays: number[] = (schedule.holidays as number[]) ?? [];
    const machineIds = [
      ...new Set(schedule.segments.map((s) => s.machineId)),
    ];

    // Lấy SL thực tế từ KdDailyInput
    const actuals = await prisma.kdDailyInput.findMany({
      where: {
        machineId: { in: machineIds },
        recordDate: { gte: startDate, lte: endDate },
      },
      select: { machineId: true, recordDate: true, outputKg: true },
    });

    const actualMap: Record<number, Record<number, number>> = {};
    for (const a of actuals) {
      const day = new Date(a.recordDate).getDate();
      if (!actualMap[a.machineId]) actualMap[a.machineId] = {};
      actualMap[a.machineId][day] =
        (actualMap[a.machineId][day] ?? 0) + a.outputKg;
    }

    for (const seg of schedule.segments) {
      if (!itemTotals[seg.itemId]) {
        itemTotals[seg.itemId] = { itemId: seg.itemId, khKg: 0, thKg: 0 };
      }
      for (let day = seg.fromDay; day <= seg.toDay; day++) {
        if (holidays.includes(day)) continue;
        const khKg = seg.kgPerDay;
        const actualKg = actualMap[seg.machineId]?.[day];
        const thKg = actualKg !== undefined ? actualKg : khKg;
        itemTotals[seg.itemId].khKg += khKg;
        itemTotals[seg.itemId].thKg += thKg;
      }
    }
  } else {
    // Fallback: nếu không có schedule, dùng ProductionLog groupBy như cũ
    const grouped = await prisma.productionLog.groupBy({
      by: ["itemId"],
      where: {
        machine: { process: { factoryId } },
        recordDate: { gte: startDate, lte: endDate },
      },
      _sum: { finalOutput: true },
    });
    for (const grp of grouped) {
      const qty = grp._sum.finalOutput ?? 0;
      itemTotals[grp.itemId] = {
        itemId: grp.itemId,
        khKg: qty,
        thKg: qty,
      };
    }
  }

  // =====================================================================
  // Bước 2: Lấy thông số tháng
  // =====================================================================
  const inputParam = await prisma.monthlyInputParam.findUnique({
    where: { factoryId_yearMonth: { factoryId, yearMonth } },
  });

  // =====================================================================
  // Bước 3: Lấy toàn bộ PlanLineItem tháng này để dùng đơn giá + NVL
  // =====================================================================
  const planLineItems = await prisma.planLineItem.findMany({
    where: { plan: { factoryId, yearMonth } },
    include: { salesOrderItem: { select: { sellingCostRate: true } } },
  });

  let syncedCount = 0;

  // =====================================================================
  // Bước 4: Với mỗi mặt hàng, upsert ActualLineItem
  //   - Nếu có PlanLineItem → dùng đơn giá KH, tính ratio SL TH/KH
  //   - Nếu không có PlanLineItem → fallback sang soItem như cũ
  // =====================================================================
  for (const itemTotal of Object.values(itemTotals)) {
    const { itemId, khKg, thKg } = itemTotal;

    // Lấy tất cả PlanLineItem cùng mặt hàng trong tháng này
    const planItems = planLineItems.filter((pl) => pl.itemId === itemId);

    if (planItems.length > 0) {
      // Có kế hoạch → phân bổ SL thực tế theo tỷ lệ SL kế hoạch từng HĐ
      const ratio = khKg > 0 ? thKg / khKg : 1;

      for (const planItem of planItems) {
        // SL thực tế cho HĐ này = SL KH của HĐ × ratio toàn mặt hàng
        const actualQty = planItem.qty * ratio;

        // Lấy định mức
        const rate = await prisma.rawMaterialRate.findFirst({
          where: { itemId, effectiveTo: null },
          orderBy: { effectiveFrom: "desc" },
        });

        let calcResult = {
          revenueVnd: 0,
          cottonCostVnd: 0,
          peCostVnd: 0,
          sellingCostVnd: 0,
          gcDoubleTwistVnd: 0,
          wasteRecoveryVnd: 0,
          grossProfitVnd: 0,
        };

        if (inputParam && planItem.unitPriceUsd > 0) {
          const cottonRatioValue = planItem.cottonRatio ?? rate?.cottonRatio ?? 1.0;
          calcResult = calculateLineItem({
            qty: actualQty,
            unitPriceUsd: planItem.unitPriceUsd, // đơn giá giống KH
            rates: {
              cottonRate: rate?.cottonRate ?? 0,
              peRate: rate?.peRate ?? 0,
              cottonRatio: cottonRatioValue,
              wasteRate: rate?.wasteRate ?? 0,
              sellingCostRate:
                planItem.salesOrderItem?.sellingCostRate ?? 0,
              doubleTwistGcRate: rate?.doubleTwistGcRate ?? 0,
            },
            params: {
              exchangeRate: inputParam.exchangeRate,
              cottonPriceUsd: planItem.cottonPriceUsd ?? 0,
              pePriceUsd: planItem.pePriceUsd ?? 0,
            },
          });
        }

        // Upsert: tìm ActualLineItem theo actualId + salesOrderItemId + itemId
        const existing = actual.lineItems.find(
          (li) =>
            li.itemId === itemId &&
            li.salesOrderItemId === planItem.salesOrderItemId,
        );

        if (existing) {
          await prisma.actualLineItem.update({
            where: { id: existing.id },
            data: {
              qty: actualQty,
              unitPriceUsd: planItem.unitPriceUsd,
              cottonMaterialTypeId: planItem.cottonMaterialTypeId,
              cottonPriceUsd: planItem.cottonPriceUsd,
              cottonRatio: planItem.cottonRatio,
              peMaterialTypeId: planItem.peMaterialTypeId,
              pePriceUsd: planItem.pePriceUsd,
              peRatio: planItem.peRatio,
              isAutoQty: planItem.isAutoQty,
              ...calcResult,
            },
          });
        } else {
          await prisma.actualLineItem.create({
            data: {
              actualId: actual.id,
              itemId,
              salesOrderItemId: planItem.salesOrderItemId,
              qty: actualQty,
              unitPriceUsd: planItem.unitPriceUsd,
              cottonMaterialTypeId: planItem.cottonMaterialTypeId,
              cottonPriceUsd: planItem.cottonPriceUsd,
              cottonRatio: planItem.cottonRatio,
              peMaterialTypeId: planItem.peMaterialTypeId,
              pePriceUsd: planItem.pePriceUsd,
              peRatio: planItem.peRatio,
              isAutoQty: planItem.isAutoQty,
              isAdHoc: false,
              ...calcResult,
            },
          });
        }
        syncedCount++;
      }
    } else {
      // Không có kế hoạch → fallback: tìm soItem và tính như cũ
      const soItem = await prisma.salesOrderItem.findFirst({
        where: { itemId, order: { factoryId, isActive: true } },
        orderBy: { id: "desc" },
        select: { id: true, unitPrice: true, sellingCostRate: true },
      });
      const unitPriceUsd = soItem?.unitPrice ?? 0;

      const rate = await prisma.rawMaterialRate.findFirst({
        where: { itemId, effectiveTo: null },
        orderBy: { effectiveFrom: "desc" },
      });

      let calcResult = {
        revenueVnd: 0,
        cottonCostVnd: 0,
        peCostVnd: 0,
        sellingCostVnd: 0,
        gcDoubleTwistVnd: 0,
        wasteRecoveryVnd: 0,
        grossProfitVnd: 0,
      };

      if (inputParam && unitPriceUsd > 0) {
        let cottonPriceUsd = 0;
        let pePriceUsd = 0;
        const cottonRatioValue = rate?.cottonRatio ?? 1.0;

        // Fallback: lấy giá NVL đầu tiên từ MaterialPrice
        const defaultCotton = await prisma.materialPrice.findFirst({
          where: { yearMonth, materialType: { category: "COTTON", isActive: true } },
          orderBy: { id: "asc" },
        });
        cottonPriceUsd = defaultCotton?.priceUsd ?? 0;

        if (cottonRatioValue < 1.0) {
          const defaultPe = await prisma.materialPrice.findFirst({
            where: { yearMonth, materialType: { category: "PE", isActive: true } },
            orderBy: { id: "asc" },
          });
          pePriceUsd = defaultPe?.priceUsd ?? 0;
        }

        calcResult = calculateLineItem({
          qty: thKg,
          unitPriceUsd,
          rates: {
            cottonRate: rate?.cottonRate ?? 0,
            peRate: rate?.peRate ?? 0,
            cottonRatio: cottonRatioValue,
            wasteRate: rate?.wasteRate ?? 0,
            sellingCostRate: soItem?.sellingCostRate ?? 0,
            doubleTwistGcRate: rate?.doubleTwistGcRate ?? 0,
          },
          params: {
            exchangeRate: inputParam.exchangeRate,
            cottonPriceUsd,
            pePriceUsd,
          },
        });
      }

      const existing = actual.lineItems.find(
        (li) => li.itemId === itemId && !li.salesOrderItemId,
      );
      if (existing) {
        await prisma.actualLineItem.update({
          where: { id: existing.id },
          data: { qty: thKg, unitPriceUsd, salesOrderItemId: soItem?.id ?? null, ...calcResult },
        });
      } else {
        await prisma.actualLineItem.create({
          data: {
            actualId: actual.id,
            itemId,
            qty: thKg,
            unitPriceUsd,
            salesOrderItemId: soItem?.id ?? null,
            isAdHoc: false,
            ...calcResult,
          },
        });
      }
      syncedCount++;
    }
  }

  await refreshSummarySnapshot(factoryId, yearMonth, SnapshotType.TH);

  return NextResponse.json({ success: true, syncedItems: syncedCount });
}
