Vậy vấn đề rõ ràng rồi. Dashboard đang cộng sản lượng của **tất cả công đoạn** trong nhà máy, trong khi `ActualProductionGrid` chỉ tính máy **có trong segments** của schedule đó.

Cần biết: với mỗi nhà máy, **schedule tháng đó có `factoryId` và danh sách `segmentMachineIds`** — đây chính là filter cần dùng.

Hướng sửa: thay vì query `ProductionLog` toàn bộ máy trong nhà máy, cần **chỉ lấy máy có trong `ProductionSchedule.segments`** của tháng đó.

---

## Sửa `src/app/api/kdsx/summary/route.ts`

Thêm bước lấy `segmentMachineIds` từ `ProductionSchedule` trước khi query `ProductionLog`:

```typescript
// 2. TH — Sản lượng real-time từ ProductionLog
// Chỉ lấy máy có trong segments của ProductionSchedule tháng này
const [year, month] = yearMonth.split("-").map(Number);
const startDate = new Date(year, month - 1, 1);
const endDate = new Date(year, month, 1); // exclusive

// Lấy tất cả schedule của tháng này (mỗi nhà máy có 1 schedule)
const schedules = await prisma.productionSchedule.findMany({
  where: { yearMonth },
  include: {
    segments: {
      select: { machineId: true },
    },
  },
  select: {
    factoryId: true,
    segments: { select: { machineId: true } },
  },
});

// Build map: factoryId → Set<machineId> (chỉ máy trong segments)
const factoryMachineIds = new Map<number, number[]>();
for (const sched of schedules) {
  const ids = [...new Set(sched.segments.map((s) => s.machineId))];
  factoryMachineIds.set(sched.factoryId, ids);
}

// Query ProductionLog — chỉ lấy máy trong segments, filter theo tháng
const allSegmentMachineIds = [
  ...new Set(schedules.flatMap((s) => s.segments.map((s2) => s2.machineId))),
];

const logsByMachine = await prisma.productionLog.groupBy({
  by: ["machineId"],
  where: {
    machineId: { in: allSegmentMachineIds }, // ← FILTER ĐÚNG
    recordDate: { gte: startDate, lt: endDate },
  },
  _sum: { finalOutput: true },
});

// Map machineId → factoryId (dùng factoryMachineIds thay vì query Machine)
const machineToFactory = new Map<number, number>();
for (const [factoryId, machineIds] of factoryMachineIds) {
  for (const machineId of machineIds) {
    machineToFactory.set(machineId, factoryId);
  }
}

// Gộp sản lượng theo factoryId
const thQtyMap = new Map<number, number>();
for (const row of logsByMachine) {
  const factoryId = machineToFactory.get(row.machineId);
  if (!factoryId) continue;
  thQtyMap.set(
    factoryId,
    (thQtyMap.get(factoryId) ?? 0) + (row._sum.finalOutput ?? 0),
  );
}
```

---

## Lưu ý cho Claude Code

- Bỏ hoàn toàn đoạn query `prisma.machine.findMany` để map `machineId → factoryId` — không cần nữa vì đã có `factoryMachineIds`
- Nếu nhà máy **chưa tạo schedule** cho tháng đó → `thQtyMap` không có entry → `totalQtyKg = 0`, đúng behavior
- Phần còn lại của file giữ nguyên
