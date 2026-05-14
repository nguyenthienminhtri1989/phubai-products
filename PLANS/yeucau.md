Viết spec luôn:

---

## Thay đổi cần làm trong `src/app/api/kdsx/summary/route.ts`

Chỉ sửa **1 file duy nhất**, không cần tạo thêm gì.

**Logic thay đổi:** Giữ nguyên KH từ snapshot. TH — Sản lượng tính real-time từ `ProductionLog`, các cột TH khác (doanh thu/chi phí/lợi nhuận) vẫn đọc từ snapshot nhưng **hiện `-` nếu snapshot chưa có** — không block việc hiện sản lượng.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessKdsx } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessKdsx(session as any))
    return NextResponse.json(
      { error: "Không có quyền truy cập module KD-SX" },
      { status: 403 },
    );

  const { searchParams } = new URL(req.url);
  const yearMonth = searchParams.get("yearMonth");
  if (!yearMonth)
    return NextResponse.json({ error: "Cần yearMonth" }, { status: 400 });

  // 1. KH — đọc từ snapshot (giữ nguyên)
  const snapshots = await prisma.monthlySummarySnapshot.findMany({
    where: { yearMonth },
    include: { factory: { select: { id: true, name: true } } },
    orderBy: [{ factoryId: "asc" }, { type: "asc" }],
  });

  // 2. TH — Sản lượng: tính real-time từ ProductionLog
  // Join: ProductionLog → Machine → Process → Factory
  // Lọc theo tháng, group by factoryId
  const [startDate, endDate] = (() => {
    const [year, month] = yearMonth.split("-").map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1); // exclusive
    return [start, end];
  })();

  const thQtyByFactory = await prisma.productionLog.groupBy({
    by: ["machineId"],
    where: {
      recordDate: { gte: startDate, lt: endDate },
    },
    _sum: { finalOutput: true },
  });

  // Cần map machineId → factoryId
  const machineIds = thQtyByFactory.map((r) => r.machineId);
  const machines = await prisma.machine.findMany({
    where: { id: { in: machineIds } },
    select: {
      id: true,
      process: { select: { factoryId: true } },
    },
  });
  const machineToFactory = new Map(
    machines.map((m) => [m.id, m.process.factoryId]),
  );

  // Gộp sản lượng theo factoryId
  const thQtyMap = new Map<number, number>();
  for (const row of thQtyByFactory) {
    const factoryId = machineToFactory.get(row.machineId);
    if (!factoryId) continue;
    thQtyMap.set(
      factoryId,
      (thQtyMap.get(factoryId) ?? 0) + (row._sum.finalOutput ?? 0),
    );
  }

  // 3. Danh sách nhà máy
  const factories = await prisma.factory.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });

  // 4. Build response
  const result = factories.map((factory) => {
    const khSnap = snapshots.find(
      (s) => s.factoryId === factory.id && s.type === "KH",
    );
    const thSnap = snapshots.find(
      (s) => s.factoryId === factory.id && s.type === "TH",
    );

    return {
      factory,
      kh: khSnap
        ? {
            totalQtyKg: khSnap.totalQtyKg,
            totalRevenueVnd: khSnap.totalRevenueVnd,
            totalCostVnd: khSnap.totalCostVnd,
            totalProfitVnd: khSnap.totalProfitVnd,
            refreshedAt: khSnap.refreshedAt,
          }
        : null,
      th: {
        // Sản lượng: real-time từ ProductionLog
        totalQtyKg: thQtyMap.get(factory.id) ?? 0,
        // Doanh thu/chi phí/lợi nhuận: từ snapshot nếu có, null nếu chưa
        totalRevenueVnd: thSnap?.totalRevenueVnd ?? null,
        totalCostVnd: thSnap?.totalCostVnd ?? null,
        totalProfitVnd: thSnap?.totalProfitVnd ?? null,
        refreshedAt: thSnap?.refreshedAt ?? null,
      },
    };
  });

  return NextResponse.json({ yearMonth, data: result });
}
```

---

## Lưu ý cho Claude Code

- `th` bây giờ **không bao giờ là `null`** — luôn có ít nhất `totalQtyKg` (có thể = 0)
- Frontend `page.tsx` hiện đang dùng `fmtQty(row.th?.totalQtyKg)` — sẽ hiển thị đúng ngay, không cần sửa frontend
- Cột `% TH/KH` đang so sánh `totalRevenueVnd` — vẫn hiện `-` nếu chưa có doanh thu TH, đúng behavior
- Không đụng gì đến `refreshSummarySnapshot()` hay `ActualLineItem`
