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
  const planId = Number(id);

  // 1. Load plan + all lineItems (bao gồm snapshot giá NVL)
  const plan = await prisma.monthlyPlan.findUnique({
    where: { id: planId },
    include: { lineItems: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Chỉ cho phép tính lại khi plan còn DRAFT
  if (plan.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Chỉ có thể tính lại kế hoạch ở trạng thái Nháp (DRAFT)" },
      { status: 400 },
    );
  }

  // 2. Load inputParam cho (factoryId, yearMonth) — chỉ cần exchangeRate
  const inputParam = await prisma.monthlyInputParam.findUnique({
    where: {
      factoryId_yearMonth: {
        factoryId: plan.factoryId,
        yearMonth: plan.yearMonth,
      },
    },
  });
  if (!inputParam) {
    return NextResponse.json(
      {
        error: "Chưa có thông số tháng. Hãy nhập thông số trước khi tính lại.",
      },
      { status: 400 },
    );
  }

  // 2b. Tính projectedQtyByItem từ actual grid + benchmark (cùng logic với frontend)
  const projectedQtyByItem: Record<number, number> = {};
  const schedule = await prisma.productionSchedule.findFirst({
    where: {
      factoryId: plan.factoryId,
      yearMonth: plan.yearMonth,
      isPrimary: true,
    },
    include: { segments: true },
  });

  if (schedule) {
    const [year, month] = plan.yearMonth.split("-").map(Number);
    const startDate = new Date(`${plan.yearMonth}-01T00:00:00.000Z`);
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = new Date(
      `${plan.yearMonth}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`,
    );

    const segmentMachineIds = [
      ...new Set(schedule.segments.map((s) => s.machineId)),
    ];

    if (segmentMachineIds.length > 0) {
      const logs = await prisma.productionLog.groupBy({
        by: ["machineId", "itemId", "recordDate"],
        where: {
          machineId: { in: segmentMachineIds },
          recordDate: { gte: startDate, lte: endDate },
        },
        _sum: { finalOutput: true },
      });

      // Build grid[machineId][day][itemId] = kg
      const grid: Record<number, Record<number, Record<number, number>>> = {};
      for (const l of logs) {
        const day = new Date(l.recordDate).getUTCDate();
        const mid = l.machineId;
        const iid = l.itemId;
        if (!grid[mid]) grid[mid] = {};
        if (!grid[mid][day]) grid[mid][day] = {};
        grid[mid][day][iid] =
          (grid[mid][day][iid] ?? 0) + (l._sum.finalOutput ?? 0);
      }

      // Build benchmarkMap cho các combo (machineId-itemId)
      const activeVersion = await prisma.benchmarkVersion.findFirst({
        where: { factoryId: plan.factoryId, isActive: true },
        orderBy: { effectiveFrom: "desc" },
      });

      const machines = await prisma.machine.findMany({
        where: { id: { in: segmentMachineIds } },
        select: { id: true, model: true, processId: true },
      });

      const benchmarkMap: Record<string, number> = {};
      if (activeVersion) {
        const combosSet = new Set<string>();
        for (const l of logs) combosSet.add(`${l.machineId}-${l.itemId}`);
        for (const combo of combosSet) {
          const [midStr, iidStr] = combo.split("-");
          const machine = machines.find((m) => m.id === Number(midStr));
          if (!machine?.model) continue;
          const bm = await prisma.productivityBenchmark.findFirst({
            where: {
              versionId: activeVersion.id,
              itemId: Number(iidStr),
              processId: machine.processId,
              machineModel: machine.model,
              benchmarkType: "EMPIRICAL",
            },
          });
          if (bm?.empiricalOutputPerDay)
            benchmarkMap[combo] = bm.empiricalOutputPerDay;
        }
      }

      // Tập day có dữ liệu thực tế (>0)
      const daysWithData = new Set<number>();
      for (const mid of Object.keys(grid).map(Number)) {
        for (const dStr of Object.keys(grid[mid])) {
          const d = Number(dStr);
          if (Object.values(grid[mid][d]).some((kg) => kg > 0))
            daysWithData.add(d);
        }
      }

      // Build combos & lastDay per combo
      const combos = new Map<
        string,
        { machineId: number; itemId: number; lastDay: number }
      >();
      for (const mid of Object.keys(grid).map(Number)) {
        for (const dStr of Object.keys(grid[mid])) {
          const day = Number(dStr);
          for (const iidStr of Object.keys(grid[mid][day])) {
            const iid = Number(iidStr);
            if (grid[mid][day][iid] <= 0) continue;
            const key = `${mid}-${iid}`;
            const ex = combos.get(key);
            if (!ex)
              combos.set(key, { machineId: mid, itemId: iid, lastDay: day });
            else if (day > ex.lastDay) ex.lastDay = day;
          }
        }
      }

      // lastRow per machine = combo có lastDay lớn nhất
      const lastRowPerMachine = new Map<number, string>();
      for (const [key, c] of combos) {
        const ex = lastRowPerMachine.get(c.machineId);
        if (!ex || c.lastDay > (combos.get(ex)?.lastDay ?? 0))
          lastRowPerMachine.set(c.machineId, key);
      }

      // Cộng dồn: actual nếu có, ngược lại bù benchmark cho lastRow của máy
      for (const [key, c] of combos) {
        const bmKg = benchmarkMap[key] ?? 0;
        const isLast = lastRowPerMachine.get(c.machineId) === key;
        for (let day = 1; day <= lastDay; day++) {
          const actual = grid[c.machineId]?.[day]?.[c.itemId] ?? 0;
          if (actual > 0) {
            projectedQtyByItem[c.itemId] =
              (projectedQtyByItem[c.itemId] ?? 0) + actual;
          } else if (
            bmKg > 0 &&
            !daysWithData.has(day) &&
            day > c.lastDay &&
            isLast
          ) {
            projectedQtyByItem[c.itemId] =
              (projectedQtyByItem[c.itemId] ?? 0) + bmKg;
          }
        }
      }
    }
  }

  let updated = 0;

  // 3. Với mỗi lineItem — tính lại dùng SNAPSHOT giá NVL (không tra MaterialPrice mới)
  for (const li of plan.lineItems) {
    // a. Tra RawMaterialRate mới nhất theo itemId
    const rate = await prisma.rawMaterialRate.findFirst({
      where: { itemId: li.itemId, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    });

    // b. Lấy sellingCostRate từ SalesOrderItem (nếu có) hoặc 0
    let sellingCostRate = 0;
    if (li.salesOrderItemId) {
      const soi = await prisma.salesOrderItem.findUnique({
        where: { id: li.salesOrderItemId },
        select: { sellingCostRate: true },
      });
      sellingCostRate = soi?.sellingCostRate ?? 0;
    }

    // c. Dùng snapshot cottonRatio từ lineItem nếu có, nếu không dùng từ rate
    const cottonRatioValue = li.cottonRatio ?? rate?.cottonRatio ?? 1.0;

    // d. Nếu isAutoQty — tính lại qty từ projectedQtyByItem - otherQty (các dòng cùng item)
    let effectiveQty = li.qty;
    if (li.isAutoQty) {
      const totalProjected = projectedQtyByItem[li.itemId] ?? 0;
      const otherQty = plan.lineItems
        .filter((other) => other.itemId === li.itemId && other.id !== li.id)
        .reduce((s, other) => s + other.qty, 0);
      effectiveQty = Math.max(0, Math.round(totalProjected - otherQty));
    }

    // e. Gọi calculateLineItem() — dùng SNAPSHOT giá (cottonPriceUsd, pePriceUsd)
    const calcResult = calculateLineItem({
      qty: effectiveQty,
      unitPriceUsd: li.unitPriceUsd,
      rates: {
        cottonRate: rate?.cottonRate ?? 0,
        peRate: rate?.peRate ?? 0,
        cottonRatio: cottonRatioValue,
        wasteRate: rate?.wasteRate ?? 0,
        sellingCostRate,
        doubleTwistGcRate: rate?.doubleTwistGcRate ?? 0,
      },
      params: {
        exchangeRate: inputParam.exchangeRate,
        // Dùng snapshot giá đã lưu trong lineItem — KHÔNG tra MaterialPrice mới
        cottonPriceUsd: li.cottonPriceUsd ?? 0,
        pePriceUsd: li.pePriceUsd ?? 0,
      },
    });

    // f. Update lineItem với kết quả mới (giữ nguyên snapshot giá NVL)
    await prisma.planLineItem.update({
      where: { id: li.id },
      data: {
        ...(li.isAutoQty ? { qty: effectiveQty } : {}),
        ...calcResult,
      },
    });

    updated++;
  }

  // 4. Refresh summary snapshot
  await refreshSummarySnapshot(plan.factoryId, plan.yearMonth, SnapshotType.KH);

  // 5. Trả về số dòng đã tính lại
  return NextResponse.json({ updated });
}
