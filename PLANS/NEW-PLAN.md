# TASK: Cải tiến Kế hoạch SX + Thêm tab Thực hiện + Dashboard so sánh

## Phần 1: Fix auto-fill khi chọn nhiều máy

### Vấn đề

Chọn 1 máy + mặt hàng → auto-fill kgPerDay OK.
Chọn nhiều máy → không auto-fill, phải bỏ chọn 1 máy rồi chọn lại.

### File sửa: `src/components/kdsx/ScheduleSegmentModal.tsx`

### Nguyên nhân

Logic `useEffect` hoặc `onChange` chỉ gọi `benchmark-lookup` khi
`machineIds.length === 1`. Cần sửa: gọi benchmark-lookup với máy đầu tiên
trong danh sách bất kể chọn bao nhiêu máy (vì đã đảm bảo cùng model).

### Cách fix

Trong useEffect hoặc hàm onChange khi chọn máy/mặt hàng:

```typescript
// CŨ: chỉ gọi khi chọn 1 máy
if (form.machineIds?.length === 1 && form.itemId) {
  fetchBenchmark(form.machineIds[0], form.itemId);
}

// MỚI: gọi với máy đầu tiên, bất kể chọn bao nhiêu
if (form.machineIds?.length > 0 && form.itemId) {
  fetchBenchmark(form.machineIds[0], form.itemId);
}
```

Tương tự trong onChange của Select máy:

```typescript
onChange={(values) => {
  setForm(prev => ({ ...prev, machineIds: values }));
  // Auto-fill ngay khi chọn, không đợi useEffect
  if (values.length > 0 && form.itemId) {
    fetchBenchmark(values[0], form.itemId);
  }
}}
```

---

## Phần 2: Chọn màu cho mặt hàng ngay trên giao diện Kế hoạch SX

### Cách tiếp cận

KHÔNG thêm field color vào model Item (vì nhiều mặt hàng, phức tạp).
Thay vào đó, lưu mapping màu trong `ProductionSchedule.metadata` (JSON)
— mỗi schedule tự quản lý bảng màu riêng.

### File sửa: `prisma/schema.prisma`

Thêm field vào model `ProductionSchedule`:

```prisma
model ProductionSchedule {
  // ... fields hiện có ...
  itemColors Json @default("{}") // {"1":"#4CAF50","5":"#2196F3",...}
}
```

Chạy migration:

```bash
npx prisma migrate dev --name add_item_colors_to_schedule
```

### File sửa: API PUT schedule

`src/app/api/kdsx/production-schedule/[id]/route.ts`

Thêm `itemColors` vào handler PUT:

```typescript
...(itemColors !== undefined && { itemColors }),
```

### File sửa: UI chi tiết schedule

`src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx`

**a) Palette màu mặc định (16 màu đủ phân biệt):**

```typescript
const DEFAULT_COLORS = [
  "#4CAF50",
  "#2196F3",
  "#FF9800",
  "#9C27B0",
  "#F44336",
  "#00BCD4",
  "#FFEB3B",
  "#E91E63",
  "#3F51B5",
  "#8BC34A",
  "#FF5722",
  "#607D8B",
  "#009688",
  "#795548",
  "#CDDC39",
  "#673AB7",
];

function getItemColor(
  itemId: number,
  itemColors: Record<string, string>,
): string {
  if (itemColors[String(itemId)]) return itemColors[String(itemId)];
  // Fallback: chọn từ palette theo index
  const idx = Object.keys(itemColors).length;
  return DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
}
```

**b) Color picker nhỏ: click vào ô mặt hàng trong cột "Mặt hàng" để đổi màu**

Khi user click vào tên mặt hàng trong cột sticky bên trái → hiện popup
color picker nhỏ (dùng `<input type="color">` đơn giản):

```tsx
// Trong cột Mặt hàng (sticky left)
{
  machineSegs.map((s) => (
    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <input
        type="color"
        value={getItemColor(s.itemId, schedule.itemColors)}
        onChange={(e) => handleChangeItemColor(s.itemId, e.target.value)}
        style={{
          width: 16,
          height: 16,
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
        title="Đổi màu mặt hàng"
      />
      <span
        style={{
          color: getItemColor(s.itemId, schedule.itemColors),
          fontWeight: 600,
          fontSize: 11,
        }}
      >
        {s.item.name}
      </span>
    </div>
  ));
}
```

**c) Hàm lưu màu:**

```typescript
const handleChangeItemColor = async (itemId: number, color: string) => {
  const newColors = { ...schedule.itemColors, [String(itemId)]: color };
  // Cập nhật local ngay để UX mượt
  setSchedule((prev) => (prev ? { ...prev, itemColors: newColors } : prev));
  // Lưu lên server
  await fetch(`/api/kdsx/production-schedule/${scheduleId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemColors: newColors }),
  });
};
```

**d) Thay thế hàm `itemColor()` cũ:**

Mọi chỗ đang gọi `itemColor(itemId)`, `itemBg(itemId)`, `itemBorder(itemId)`
→ thay bằng:

```typescript
function getColor(itemId: number): string {
  return getItemColor(itemId, schedule?.itemColors ?? {});
}
function getBg(itemId: number): string {
  return getColor(itemId) + "33"; // alpha 20%
}
function getBorder(itemId: number): string {
  return getColor(itemId) + "AA"; // alpha 67%
}
```

---

## Phần 3: Tab Thực hiện — Bảng sản lượng thực tế

### Thiết kế: 2 tabs trong trang chi tiết schedule

Trang `/kdsx/production-schedule/[id]` hiện tại hiển thị bảng KẾ HOẠCH.
Thêm component Tabs ở đầu grid:

```
[Tab 1: Kế hoạch]  [Tab 2: Thực hiện]  [Tab 3: So sánh]
```

### File mới: `src/components/kdsx/ActualProductionGrid.tsx`

Component hiển thị grid giống KH nhưng dữ liệu lấy từ nguồn khác:

**Nguồn dữ liệu:**

- `KdDailyInput` (phòng KD nhập — gộp 3 ca/ngày) — ưu tiên dùng nguồn này
- Hoặc `ProductionLog` (công nhân nhập theo ca) → GROUP BY machineId, itemId, recordDate → SUM(finalOutput)

**API mới: GET `/api/kdsx/production-schedule/[id]/actual`**

File mới: `src/app/api/kdsx/production-schedule/[id]/actual/route.ts`

```typescript
export async function GET(req, { params }) {
  const { id } = await params;
  const schedule = await prisma.productionSchedule.findUnique({
    where: { id: parseInt(id) },
    include: { segments: true },
  });
  if (!schedule)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { factoryId, yearMonth } = schedule;
  const [year, month] = yearMonth.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // last day of month

  // Lấy danh sách máy từ segments
  const machineIds = [...new Set(schedule.segments.map((s) => s.machineId))];

  // Lấy sản lượng thực tế từ KdDailyInput
  const actuals = await prisma.kdDailyInput.findMany({
    where: {
      machineId: { in: machineIds },
      recordDate: { gte: startDate, lte: endDate },
    },
    select: {
      machineId: true,
      itemId: true,
      recordDate: true,
      outputKg: true,
    },
  });

  // Nếu KdDailyInput trống, fallback sang ProductionLog
  let data = actuals;
  if (actuals.length === 0) {
    const logs = await prisma.productionLog.groupBy({
      by: ["machineId", "itemId", "recordDate"],
      where: {
        machineId: { in: machineIds },
        recordDate: { gte: startDate, lte: endDate },
      },
      _sum: { finalOutput: true },
    });
    data = logs.map((l) => ({
      machineId: l.machineId,
      itemId: l.itemId,
      recordDate: l.recordDate,
      outputKg: l._sum.finalOutput ?? 0,
    }));
  }

  // Format: { machineId: { day: { itemId, kg } } }
  const grid: Record<
    number,
    Record<number, { itemId: number; kg: number }>
  > = {};
  for (const row of data) {
    const day = new Date(row.recordDate).getDate();
    if (!grid[row.machineId]) grid[row.machineId] = {};
    if (!grid[row.machineId][day]) {
      grid[row.machineId][day] = { itemId: row.itemId, kg: 0 };
    }
    grid[row.machineId][day].kg += row.outputKg;
  }

  return NextResponse.json({
    grid,
    source: actuals.length > 0 ? "KD_DAILY_INPUT" : "PRODUCTION_LOG",
  });
}
```

### UI Component: ActualProductionGrid.tsx

- Grid layout giống hệt bảng KH (cùng số máy, cùng số ngày)
- Ô có dữ liệu: hiển thị kg thực tế, nền màu theo mặt hàng (dùng cùng bảng màu)
- Ô trống (chưa nhập): hiện "·" màu nhạt
- Cột TỔNG: tổng kg thực tế của máy
- Hàng TỔNG/NGÀY: tổng kg tất cả máy theo ngày
- KHÔNG cho edit (read-only) — dữ liệu nhập từ trang `/kd-daily-input`

### So sánh visual: Ô KH vs TH

Trong tab Thực hiện, mỗi ô có thể hiện 2 số nhỏ:

```
  780 kg  ← thực tế (font lớn, đậm)
 (780)   ← kế hoạch (font nhỏ, nhạt, trong ngoặc)
```

Hoặc đơn giản hơn: chỉ hiện số thực tế, dùng màu để so sánh:

- Xanh lá: TH ≥ KH (đạt/vượt)
- Đỏ: TH < KH × 0.9 (thấp hơn 10%+)
- Vàng: KH × 0.9 ≤ TH < KH (gần đạt)

---

## Phần 4: Tab So sánh — Dashboard KH vs TH

### File mới: `src/components/kdsx/ScheduleComparisonDashboard.tsx`

Hiển thị trong Tab 3 "So sánh":

**a) Biểu đồ cột so sánh theo mặt hàng:**

Dùng Recharts BarChart, mỗi mặt hàng 1 nhóm 2 cột:

- Cột xanh dương: Sản lượng KH (tấn)
- Cột xanh lá: Sản lượng TH (tấn)

```tsx
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const chartData = items.map((item) => ({
  name: item.itemName,
  khTons: item.khTotalKg / 1000,
  thTons: item.thTotalKg / 1000,
  ratio:
    item.thTotalKg > 0
      ? ((item.thTotalKg / item.khTotalKg) * 100).toFixed(0)
      : "0",
}));

<ResponsiveContainer width="100%" height={400}>
  <BarChart data={chartData}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
    <YAxis label={{ value: "Tấn", angle: -90, position: "insideLeft" }} />
    <Tooltip />
    <Legend />
    <Bar dataKey="khTons" name="Kế hoạch" fill="#1677ff" />
    <Bar dataKey="thTons" name="Thực hiện" fill="#52c41a" />
  </BarChart>
</ResponsiveContainer>;
```

**b) Biểu đồ line: sản lượng tích lũy theo ngày**

2 đường:

- Đường xanh dương (KH): cộng dồn kg/ngày từ segments
- Đường xanh lá (TH): cộng dồn kg/ngày từ actual

Giúp lãnh đạo thấy nhà máy đang chạy đúng tiến độ hay đang tụt hậu.

**c) Bảng tổng hợp:**

| Mặt hàng | KH (kg) | TH (kg) | Chênh lệch | Tỷ lệ  |
| -------- | ------- | ------- | ---------- | ------ |
| 30COCD   | 109,200 | 105,300 | -3,900     | 96.4%  |
| 32CVCM   | 185,600 | 190,200 | +4,600     | 102.5% |
| TỔNG     | 450,000 | 438,500 | -11,500    | 97.4%  |

Tag màu cho cột Tỷ lệ:

- ≥ 100%: Tag xanh lá
- 90-99%: Tag vàng
- < 90%: Tag đỏ

---

## Phần 5: Tích hợp Tabs vào trang chi tiết

### File sửa: `src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx`

Thêm Tabs component bao quanh grid:

```tsx
import { Tabs } from "antd";
import ActualProductionGrid from "@/components/kdsx/ActualProductionGrid";
import ScheduleComparisonDashboard from "@/components/kdsx/ScheduleComparisonDashboard";

// Trong phần return, sau Summary Cards:
<Tabs
  defaultActiveKey="plan"
  items={[
    {
      key: "plan",
      label: "📋 Kế hoạch",
      children: (
        // ... grid KH hiện tại (giữ nguyên) ...
      ),
    },
    {
      key: "actual",
      label: "📊 Thực hiện",
      children: (
        <ActualProductionGrid
          scheduleId={scheduleId}
          segments={schedule.segments}
          holidays={holidayArr}
          totalDays={totalDays}
          itemColors={schedule.itemColors}
          yearMonth={yearMonth}
        />
      ),
    },
    {
      key: "compare",
      label: "📈 So sánh KH/TH",
      children: (
        <ScheduleComparisonDashboard
          scheduleId={scheduleId}
          summary={summary}
          yearMonth={yearMonth}
          itemColors={schedule.itemColors}
        />
      ),
    },
  ]}
/>
```

---

## Tóm tắt files

| File                                                                       | Thay đổi                                      |
| -------------------------------------------------------------------------- | --------------------------------------------- |
| `prisma/schema.prisma`                                                     | Thêm `itemColors Json` vào ProductionSchedule |
| `src/components/kdsx/ScheduleSegmentModal.tsx`                             | Fix auto-fill multi-machine                   |
| `src/app/api/kdsx/production-schedule/[id]/route.ts`                       | PUT nhận thêm itemColors                      |
| `src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx` | Thêm color picker + Tabs 3 tab                |
| `src/app/api/kdsx/production-schedule/[id]/actual/route.ts`                | **MỚI** — API lấy sản lượng thực tế           |
| `src/components/kdsx/ActualProductionGrid.tsx`                             | **MỚI** — Grid thực hiện (read-only)          |
| `src/components/kdsx/ScheduleComparisonDashboard.tsx`                      | **MỚI** — Dashboard so sánh KH vs TH          |

## Verify sau khi xong

```powershell
Write-Host "=== Files mới ===" -ForegroundColor Yellow
Test-Path "src\components\kdsx\ActualProductionGrid.tsx"
Test-Path "src\components\kdsx\ScheduleComparisonDashboard.tsx"
Test-Path "src\app\api\kdsx\production-schedule\[id]\actual\route.ts"

Write-Host "=== Tabs có trong UI không ===" -ForegroundColor Yellow
Select-String -Pattern "Tabs|actual|compare|Thực hiện|So sánh" -LiteralPath "src\app\kdsx\production-schedule\[id]\ProductionScheduleDetailClient.tsx" | Select-Object -First 5

Write-Host "=== Color picker ===" -ForegroundColor Yellow
Select-String -Pattern "type=.color.|itemColors|handleChangeItemColor" -LiteralPath "src\app\kdsx\production-schedule\[id]\ProductionScheduleDetailClient.tsx" | Select-Object -First 5

Write-Host "=== Migration ===" -ForegroundColor Yellow
Get-ChildItem prisma\migrations\ | Sort-Object Name | Select-Object -Last 3
```
