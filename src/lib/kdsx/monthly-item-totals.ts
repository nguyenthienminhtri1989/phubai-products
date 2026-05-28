import { prisma } from "@/lib/prisma";

export type ItemTotalMode = "PLAN" | "ACTUAL" | "ACTUAL_PROJECTED";

export interface ItemTotal {
  itemId: number;
  itemName: string;
  totalKg: number;
  actualKg: number;     // SL đã nhập thực tế (ProductionLog)
  projectedKg: number;  // SL ước tính ngày chưa nhập (0 nếu mode != PROJECTED)
  planKg: number;       // SL kế hoạch (0 nếu mode != PLAN)
}

/**
 * Nguồn sự thật DUY NHẤT cho tổng SL tháng theo mặt hàng.
 * Scope: (factoryId, processId, yearMonth).
 * Công đoạn ống và sợi con TÁCH BIỆT — chỉ gom máy thuộc processId này.
 *
 * @param mode
 *   PLAN             — tổng từ ScheduleSegment (kgPerDay đã lưu, kể cả nhập tay)
 *   ACTUAL           — chỉ SL đã nhập từ ProductionLog
 *   ACTUAL_PROJECTED — SL đã nhập + ước tính ngày chưa nhập (trung bình thực tế)
 */
export async function getMonthlyItemTotals(
  factoryId: number,
  processId: number,
  yearMonth: string,
  mode: ItemTotalMode,
): Promise<ItemTotal[]> {
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayDay =
    today.getFullYear() === year && today.getMonth() + 1 === month
      ? today.getDate()
      : lastDay; // tháng đã qua → coi như hết tháng

  if (mode === "PLAN") {
    return getPlanTotals(factoryId, processId, yearMonth);
  }
  return getActualTotals(factoryId, processId, yearMonth, lastDay, todayDay, mode);
}

async function getPlanTotals(
  factoryId: number,
  processId: number,
  yearMonth: string,
): Promise<ItemTotal[]> {
  const schedule = await prisma.productionSchedule.findFirst({
    where: { factoryId, processId, yearMonth },
    select: { id: true, holidays: true },
  });
  if (!schedule) return [];

  const holidays: number[] = Array.isArray(schedule.holidays)
    ? (schedule.holidays as number[])
    : [];

  const segments = await prisma.scheduleSegment.findMany({
    where: { scheduleId: schedule.id },
    include: { item: { select: { id: true, name: true } } },
  });

  const map = new Map<number, ItemTotal>();
  for (const seg of segments) {
    let days = seg.toDay - seg.fromDay + 1;
    const holidaysInRange = holidays.filter(
      (h) => h >= seg.fromDay && h <= seg.toDay,
    ).length;
    days = Math.max(0, days - holidaysInRange);
    const kg = days * seg.kgPerDay;

    if (!map.has(seg.itemId)) {
      map.set(seg.itemId, {
        itemId: seg.itemId,
        itemName: seg.item.name,
        totalKg: 0,
        actualKg: 0,
        projectedKg: 0,
        planKg: 0,
      });
    }
    const e = map.get(seg.itemId)!;
    e.planKg += kg;
    e.totalKg += kg;
  }
  return [...map.values()].sort((a, b) => b.totalKg - a.totalKg);
}

async function getActualTotals(
  factoryId: number,
  processId: number,
  yearMonth: string,
  lastDay: number,
  todayDay: number,
  mode: ItemTotalMode,
): Promise<ItemTotal[]> {
  void factoryId; // processId đã scope factory gián tiếp qua process.factoryId
  const startDate = new Date(`${yearMonth}-01T00:00:00.000Z`);
  const endDate = new Date(
    `${yearMonth}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`,
  );

  const machines = await prisma.machine.findMany({
    where: { processId, isActive: true },
    select: { id: true },
  });
  const machineIds = machines.map((m) => m.id);
  if (machineIds.length === 0) return [];

  const logs = await prisma.productionLog.groupBy({
    by: ["machineId", "itemId", "recordDate"],
    where: {
      machineId: { in: machineIds },
      recordDate: { gte: startDate, lte: endDate },
    },
    _sum: { finalOutput: true },
  });

  const map = new Map<number, ItemTotal>();
  // perCombo: theo từng máy-mặt hàng, để tính trung bình thực tế
  const perCombo = new Map<
    string,
    { itemId: number; totalKg: number; days: Set<number>; lastDay: number }
  >();

  for (const l of logs) {
    const kg = l._sum.finalOutput ?? 0;
    if (kg <= 0) continue;
    const day = new Date(l.recordDate).getUTCDate();
    const combo = `${l.machineId}-${l.itemId}`;

    if (!perCombo.has(combo)) {
      perCombo.set(combo, { itemId: l.itemId, totalKg: 0, days: new Set(), lastDay: 0 });
    }
    const c = perCombo.get(combo)!;
    c.totalKg += kg;
    c.days.add(day);
    if (day > c.lastDay) c.lastDay = day;

    if (!map.has(l.itemId)) {
      map.set(l.itemId, {
        itemId: l.itemId,
        itemName: "",
        totalKg: 0,
        actualKg: 0,
        projectedKg: 0,
        planKg: 0,
      });
    }
    const e = map.get(l.itemId)!;
    e.actualKg += kg;
    e.totalKg += kg;
  }

  // Mode PROJECTED: cộng ước tính cho ngày chưa nhập PER COMBO
  // avgPerDay = trung bình thực tế của combo (không dùng benchmark cố định)
  if (mode === "ACTUAL_PROJECTED") {
    for (const [, c] of perCombo) {
      if (c.days.size === 0 || c.lastDay <= 0) continue;
      if (c.lastDay >= todayDay) continue; // đã nhập đến hôm nay → không ước tính
      const avgPerDay = c.totalKg / c.days.size;
      const remainingDays = Math.max(0, lastDay - c.lastDay);
      const projected = avgPerDay * remainingDays;
      if (projected > 0) {
        const e = map.get(c.itemId);
        if (e) {
          e.projectedKg += projected;
          e.totalKg += projected;
        }
      }
    }
  }

  // Điền tên item
  const itemIds = [...map.keys()];
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(items.map((i) => [i.id, i.name]));
  for (const [id, e] of map) e.itemName = nameMap.get(id) ?? `Item #${id}`;

  return [...map.values()].sort((a, b) => b.totalKg - a.totalKg);
}
