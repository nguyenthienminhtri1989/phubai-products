**Dòng sợi isAutoQty phải tự cập nhật qty khi sản lượng thực tế thay đổi**

Đọc files:

- `src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx`
- `src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts`

## 1. Frontend — tự tính lại qty cho dòng isAutoQty mỗi khi mở trang

File: `src/app/kdsx/plans/[factoryId]/[yearMonth]/page.tsx`

Sau khi fetch plan + projectedQtyByItem xong, thêm useEffect tự cập nhật:

```typescript
// Tự cập nhật qty cho dòng isAutoQty khi projectedQtyByItem thay đổi
useEffect(() => {
  if (!plan || Object.keys(projectedQtyByItem).length === 0) return;

  const autoLines = plan.lineItems.filter((li) => li.isAutoQty);
  if (autoLines.length === 0) return;

  let hasChange = false;
  const updates: Array<{ lineItemId: number; newQty: number }> = [];

  for (const li of autoLines) {
    const totalProjected = projectedQtyByItem[li.itemId] ?? 0;
    const otherQty = plan.lineItems
      .filter((other) => other.itemId === li.itemId && other.id !== li.id)
      .reduce((s, other) => s + other.qty, 0);
    const newQty = Math.max(0, Math.round(totalProjected - otherQty));

    if (Math.abs(newQty - li.qty) > 1) {
      // chênh > 1kg mới cập nhật
      hasChange = true;
      updates.push({ lineItemId: li.id, newQty });
    }
  }

  if (hasChange && plan.status === "DRAFT") {
    // Tự động cập nhật lên server
    Promise.all(
      updates.map((u) =>
        fetch(`/api/kdsx/monthly-plans/${plan.id}/line-items/${u.lineItemId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qty: u.newQty, isAutoQty: true }),
        }),
      ),
    )
      .then(() => {
        if (updates.length > 0) {
          message.info(`Đã cập nhật SL cho ${updates.length} dòng tự tính`);
          fetchPlan(); // reload để hiện số mới
        }
      })
      .catch(() => {});
  }
}, [projectedQtyByItem, plan?.id]);
```

Lưu ý: chỉ tự cập nhật khi plan ở trạng thái DRAFT. SUBMITTED/APPROVED thì không sửa.

## 2. Backend recalculate — dùng actual + benchmark thay vì ScheduleSegment

File: `src/app/api/kdsx/monthly-plans/[id]/recalculate/route.ts`

Đọc file này. Tìm phần xử lý `isAutoQty`. Nếu đang tính qty từ ScheduleSegment thì sửa logic tương tự: fetch actual grid + benchmarkMap, tính projectedQtyByItem, rồi `qty = projected - otherQty`.

Thêm logic tính projected từ actual API:

```typescript
// Trong hàm recalculate, trước vòng lặp lineItems:
// Fetch actual grid + benchmark
const schedule = await prisma.productionSchedule.findUnique({
  where: {
    factoryId_yearMonth: {
      factoryId: plan.factoryId,
      yearMonth: plan.yearMonth,
    },
  },
});

let projectedQtyByItem: Record<number, number> = {};

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

  const logs = await prisma.productionLog.groupBy({
    by: ["machineId", "itemId", "recordDate"],
    where: {
      machineId: { in: segmentMachineIds },
      recordDate: { gte: startDate, lte: endDate },
    },
    _sum: { finalOutput: true },
  });

  // Build grid
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

  // Fetch benchmarkMap (giống API actual)
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

  // Tính projected giống frontend
  const daysWithData = new Set<number>();
  for (const mid of Object.keys(grid).map(Number)) {
    for (const dStr of Object.keys(grid[mid])) {
      const d = Number(dStr);
      if (Object.values(grid[mid][d]).some((kg) => kg > 0)) daysWithData.add(d);
    }
  }

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
        if (!ex) combos.set(key, { machineId: mid, itemId: iid, lastDay: day });
        else if (day > ex.lastDay) ex.lastDay = day;
      }
    }
  }

  const lastRowPerMachine = new Map<number, string>();
  for (const [key, c] of combos) {
    const ex = lastRowPerMachine.get(c.machineId);
    if (!ex || c.lastDay > (combos.get(ex)?.lastDay ?? 0))
      lastRowPerMachine.set(c.machineId, key);
  }

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

// Trong vòng lặp lineItems, khi gặp isAutoQty:
// qty = projectedQtyByItem[itemId] - otherQty (các dòng cùng item không phải autoQty)
```

---

Tóm tắt: dòng isAutoQty sẽ tự cập nhật qty mỗi khi mở trang (DRAFT), và khi bấm "Tính lại tất cả". Backend recalculate cũng dùng actual + benchmark thay vì ScheduleSegment.
