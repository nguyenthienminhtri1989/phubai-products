# 🏗️ ARCHITECTURE — Phu Bai ERP

---

## Prisma Schema Conventions

### ID & Keys

```prisma
id        Int      @id @default(autoincrement())   // LUÔN dùng Int autoincrement
yearMonth String   // "YYYY-MM" — KHÔNG dùng DateTime
```

### Relation naming đã có (không đặt lại)

```
SalesOrderItem.orderId        (không phải salesOrderId)
SalesOrderItem → order        (không phải salesOrder relation)
SalesOrderItem.plannedQty     (không phải qtyOrdered)
```

### Unique constraints quan trọng

```prisma
// ProductionLog — KHÔNG THAY ĐỔI
@@unique([machineId, recordDate, shift, itemId])

// IotMachineMap
@@unique([sourceId, iotName])

// ProductivityBenchmark
@@unique([versionId, itemId, processId, machineModel])

// MonthlyPlan / MonthlyActual
@@unique([factoryId, yearMonth])

// MonthlyInputParam
@@unique([factoryId, yearMonth])
```

### Migration

- Dùng `prisma migrate deploy` (không phải `migrate dev`) trong môi trường non-interactive
- Mỗi migration là 1 thư mục `prisma/migrations/YYYYMMDDHHMMSS_name/`
- **Strictly additive**: ALTER TABLE ADD COLUMN (nullable hoặc có default), không DROP

---

## API Route Conventions

### File structure

```
src/app/api/[module]/route.ts           → GET list, POST create
src/app/api/[module]/[id]/route.ts      → GET detail, PUT update, DELETE
src/app/api/[module]/[id]/[action]/route.ts → POST action (submit, approve...)
```

### Response format chuẩn

```typescript
// Success
return NextResponse.json({ data: result }, { status: 200 });
return NextResponse.json({ data: result }, { status: 201 }); // Created

// Error
return NextResponse.json({ error: "Mô tả lỗi tiếng Việt" }, { status: 400 });
return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
```

### Auth pattern — Dùng ở đầu MỌI route handler

```typescript
import { auth } from "@/lib/auth"; // dùng auth() từ NextAuth v5, KHÔNG dùng getServerSession

export async function GET(req: Request) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user;
  const isAdmin = user.role === "ADMIN";
  const userProcessId = user.processId; // null nếu là Admin
  // ...
}
```

### Permission pattern

```typescript
// User chỉ được thao tác trong processId của mình
if (!isAdmin && record.machine.process.id !== userProcessId) {
  return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
}

// Chỉ Admin mới xóa được máy
if (!isAdmin)
  return NextResponse.json(
    { error: "Chỉ Admin mới được xóa máy" },
    { status: 403 },
  );
```

---

## Module Paths (đã tồn tại — không tạo trùng)

### Pages

| Module                        | Path                                           |
| ----------------------------- | ---------------------------------------------- |
| Nhập sản lượng desktop        | `/production/daily-input`                      |
| Nhập sản lượng mobile         | `/production/mobile-input`                     |
| QR Code máy                   | `/machines/qr-machines`                        |
| Dừng máy                      | `/production/machine-stops`                    |
| Lịch sử dừng                  | `/production/stop-history`                     |
| Import IoT                    | `/iot-import`                                  |
| IoT Sources                   | `/iot-import/sources`                          |
| KD-SX Dashboard               | `/kdsx`                                        |
| KD-SX Khách hàng              | `/kdsx/customers`                              |
| KD-SX Hợp đồng                | `/kdsx/sales-orders`                           |
| KD-SX Chi tiết HĐ             | `/kdsx/sales-orders/[id]`                      |
| KD-SX Kế hoạch                | `/kdsx/plans`                                  |
| KD-SX Chi tiết KH             | `/kdsx/plans/[factoryId]/[yearMonth]`          |
| KD-SX Thực hiện               | `/kdsx/actuals`                                |
| KD-SX Tiến độ HĐ              | `/kdsx/order-progress`                         |
| Benchmark                     | `/dashboard/productivity-benchmark`            |
| Benchmark Công suất           | `/dashboard/productivity-benchmark/capacity`   |
| Benchmark So sánh             | `/dashboard/productivity-benchmark/comparison` |
| Danh mục dừng máy             | `/dashboard/stop-categories`                   |
| Theo dõi đơn hàng (read-only) | `/sales-orders`                                |

### API Routes

| Route prefix                   | Module                                                     |
| ------------------------------ | ---------------------------------------------------------- |
| `/api/production/`             | Sản lượng, dừng máy                                        |
| `/api/kdsx/`                   | KD-SX (kế hoạch, HĐ, khách hàng, thực hiện)                |
| `/api/iot/`                    | IoT Import                                                 |
| `/api/productivity-benchmark/` | Benchmark                                                  |
| `/api/sales-orders/`           | Tracking actions (complete, cancel, recalculate, progress) |

---

## Dữ liệu tiền tệ & số học

```typescript
// FixedCostEntry.amountVnd lưu VNĐ tuyệt đối
// UI hiển thị tỷ: value / 1_000_000_000
// Khi gửi API: uiValue * 1_000_000_000

// efficiency lưu thập phân 0–1
// VD: 85% → 0.85

// yearMonth validate
const isValid = /^\d{4}-\d{2}$/.test(yearMonth);
```

---

## Prisma Query Patterns hay dùng

### Lấy định mức đúng thời điểm

```typescript
const rate = await prisma.rawMaterialRate.findFirst({
  where: {
    itemId,
    effectiveFrom: { lte: planDate },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: planDate } }],
  },
  orderBy: { effectiveFrom: "desc" },
});
```

### Tổng hợp sản lượng thực tế từ ProductionLog

```typescript
const actualQty = await prisma.productionLog.groupBy({
  by: ["itemId"],
  where: {
    machine: { process: { factoryId } },
    recordDate: { gte: startOfMonth, lte: endOfMonth },
  },
  _sum: { finalOutput: true },
});
```

### Atomic activate version benchmark

```typescript
await prisma.$transaction([
  prisma.benchmarkVersion.updateMany({
    where: { factoryId, isActive: true },
    data: { isActive: false },
  }),
  prisma.benchmarkVersion.update({
    where: { id: versionId },
    data: { isActive: true },
  }),
]);
```

---

## UI Component Conventions (Ant Design)

- Layout responsive: `<Row><Col xs={24} lg={12} xl={8}>`
- Grid máy: màu trắng = chưa nhập, màu xanh = đã nhập
- Progress bar: luôn `Math.min(100, pct)` — không vượt 100%
- Sidebar menu: thêm item vào `src/components/AdminLayout.tsx`
- Lazy load chart: dùng `next/dynamic` cho Recharts
- Auto-refresh: `setInterval(..., 60_000)` cho trang dừng máy
