# TASK: Doanh thu Thực hiện (TH-DT) + Cải tiến phân bổ SL vào HĐ

## Tổng quan

Xây dựng luồng "Thực hiện" song song với "Kế hoạch" đã có:

- KH-SL (đã có) → KH-DT (đã có) → KH Tổng kết (đã có)
- TH-SL (mới) → TH-DT (mới) → So sánh KH vs TH

### Nguyên tắc cốt lõi

1. **Sản lượng TH-SL** = copy từ KH-SL, hàng ngày thay thế bằng số thực tế.
   Ngày chưa nhập SL thực → giữ giá trị KH (định mức).
   → Giúp lãnh đạo thấy dự báo doanh thu cập nhật liên tục.

2. **Đơn giá TH = đơn giá KH** (cùng HĐ, cùng unitPriceUsd).

3. **Chi phí TH** = tính lại theo SL thực tế × cùng định mức + giá NVL.
   Chi phí cố định TH có thể khác KH (kế toán nhập riêng).

4. **HĐ phát sinh** = cho phép thêm HĐ mới vào phần TH dù KH không có.

5. **HĐ "hứng" phần còn lại** (Kiểu 2 trong Excel) = 1 mặt hàng có nhiều HĐ,
   HĐ cuối tự nhận SL = tổng SL mặt hàng − các HĐ khác.

---

## Phần 1: Tính năng "HĐ hứng phần còn lại" (áp dụng cho cả KH và TH)

### Vấn đề

Hiện tại user nhập tay SL cho từng HĐ. Nhưng khi 1 mặt hàng có nhiều HĐ,
con số SL HĐ cuối phải = tổng SL mặt hàng − tổng các HĐ khác.
User phải tự tính bên ngoài → dễ sai.

### Giải pháp: Checkbox "Tự tính SL còn lại"

Trong form thêm dòng sợi vào kế hoạch tháng (PlanLineItem), thêm:

```tsx
<Form.Item name="isAutoQty" valuePropName="checked">
  <Checkbox>Tự tính SL = Tổng SL mặt hàng − các HĐ khác</Checkbox>
</Form.Item>
```

Khi tick:

- Ẩn ô nhập qty (hoặc hiện read-only)
- Backend tính: qty = tổng SL mặt hàng từ KH-SL (ScheduleSegment) − SUM(qty các PlanLineItem khác cùng itemId)
- Nếu kết quả < 0 → cảnh báo "Tổng SL các HĐ vượt quá SL kế hoạch"

### Schema: Thêm field vào PlanLineItem và ActualLineItem

```prisma
model PlanLineItem {
  // ... fields hiện có ...
  isAutoQty Boolean @default(false)  // true = tự tính SL còn lại
}

model ActualLineItem {
  // ... fields hiện có ...
  isAutoQty Boolean @default(false)
}
```

### API logic

File: `src/app/api/kdsx/monthly-plans/[id]/line-items/route.ts`

Khi tạo/cập nhật line item với isAutoQty = true:

```typescript
if (body.isAutoQty) {
  // Lấy tổng SL mặt hàng từ KH-SL (ScheduleSegment)
  const schedule = await prisma.productionSchedule.findUnique({
    where: {
      factoryId_yearMonth: {
        factoryId: plan.factoryId,
        yearMonth: plan.yearMonth,
      },
    },
    include: { segments: true },
  });

  const holidays: number[] = (schedule?.holidays as number[]) ?? [];
  const totalItemKg =
    schedule?.segments
      .filter((s) => s.itemId === Number(itemId))
      .reduce((sum, seg) => {
        const days = seg.toDay - seg.fromDay + 1;
        const holsInRange = holidays.filter(
          (h) => h >= seg.fromDay && h <= seg.toDay,
        ).length;
        return sum + seg.kgPerDay * (days - holsInRange);
      }, 0) ?? 0;

  // Trừ đi SL các HĐ khác cùng mặt hàng trong plan này
  const otherQty = await prisma.planLineItem.aggregate({
    where: {
      planId: plan.id,
      itemId: Number(itemId),
      isAutoQty: false,
      id: body.lineItemId ? { not: Number(body.lineItemId) } : undefined,
    },
    _sum: { qty: true },
  });

  const autoQty = Math.max(0, totalItemKg - (otherQty._sum.qty ?? 0));
  body.qty = autoQty;
}
```

### UI hiển thị

Trong bảng dòng sợi, cột SL hiển thị:

- Bình thường: "15,000 kg"
- isAutoQty: "81,100 kg (tự tính)" + Tag nhỏ "AUTO"

---

## Phần 2: Sheet TH-SL — Sản lượng thực hiện

### Nguyên tắc

- Bắt đầu tháng: copy toàn bộ từ KH-SL (mỗi ô = kgPerDay từ ScheduleSegment)
- Hàng ngày: ô nào đã có SL thực tế (từ KdDailyInput hoặc ProductionLog) → thay thế
- Ô chưa có SL thực tế → giữ giá trị KH (định mức)
- Kết quả: tổng SL tháng = (ngày đã nhập × SL thực tế) + (ngày chưa nhập × SL định mức)

### API đã có (từ task trước)

`GET /api/kdsx/production-schedule/[id]/actual` — trả về grid SL thực tế theo máy × ngày.

### API mới: Tổng hợp SL theo mặt hàng cho TH-DT

File mới: `src/app/api/kdsx/production-schedule/[id]/actual-summary-by-item/route.ts`

```typescript
// GET /api/kdsx/production-schedule/[id]/actual-summary-by-item
// Trả về: tổng SL theo mặt hàng, kết hợp KH + TH

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
  const totalDays = new Date(year, month, 0).getDate();
  const holidays: number[] = (schedule.holidays as number[]) ?? [];
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  // Lấy SL thực tế từ KdDailyInput
  const machineIds = [...new Set(schedule.segments.map((s) => s.machineId))];
  const actuals = await prisma.kdDailyInput.findMany({
    where: {
      machineId: { in: machineIds },
      recordDate: { gte: startDate, lte: endDate },
    },
  });

  // Build map: machineId → day → outputKg
  const actualMap: Record<number, Record<number, number>> = {};
  for (const a of actuals) {
    const day = new Date(a.recordDate).getDate();
    if (!actualMap[a.machineId]) actualMap[a.machineId] = {};
    actualMap[a.machineId][day] =
      (actualMap[a.machineId][day] || 0) + a.outputKg;
  }

  // Tính tổng SL theo mặt hàng: KH + TH kết hợp
  const itemTotals: Record<
    number,
    { itemId: number; khKg: number; thKg: number }
  > = {};

  for (const seg of schedule.segments) {
    if (!itemTotals[seg.itemId]) {
      itemTotals[seg.itemId] = { itemId: seg.itemId, khKg: 0, thKg: 0 };
    }

    for (let day = seg.fromDay; day <= seg.toDay; day++) {
      if (holidays.includes(day)) continue;

      const khKg = seg.kgPerDay;
      // Nếu ngày đó đã có SL thực tế → dùng thực tế, chưa có → dùng KH
      const actualKg = actualMap[seg.machineId]?.[day];
      const thKg = actualKg !== undefined ? actualKg : khKg;

      itemTotals[seg.itemId].khKg += khKg;
      itemTotals[seg.itemId].thKg += thKg;
    }
  }

  return NextResponse.json(Object.values(itemTotals));
}
```

Response:

```json
[
  { "itemId": 1, "khKg": 113100, "thKg": 110500 },
  { "itemId": 5, "khKg": 185600, "thKg": 185600 },
  ...
]
```

---

## Phần 3: TH-DT — Doanh thu thực hiện

### Cách hoạt động

TH-DT **không phải là model riêng** — nó là **MonthlyActual + ActualLineItem** đã có.
Chỉ cần sửa logic tạo/sync ActualLineItem để:

- SL lấy từ API actual-summary-by-item (kết hợp KH + TH)
- Đơn giá = giống PlanLineItem.unitPriceUsd (cùng HĐ)
- Chi phí = tính lại bằng calculateLineItem() với SL mới
- Chi phí cố định = kế toán nhập riêng (có thể khác KH)

### Sửa API sync thực hiện

File: `src/app/api/kdsx/monthly-actuals/[id]/sync/route.ts`

Hiện tại sync lấy SL từ ProductionLog groupBy. Sửa lại:

```typescript
// Bước 1: Lấy SL kết hợp KH+TH từ production schedule
const schedule = await prisma.productionSchedule.findUnique({
  where: { factoryId_yearMonth: { factoryId: actual.factoryId, yearMonth: actual.yearMonth } },
  include: { segments: true },
});

// Bước 2: Lấy SL thực tế từ KdDailyInput
// ... (logic tương tự actual-summary-by-item ở trên)

// Bước 3: Với mỗi mặt hàng, tìm PlanLineItem tương ứng để lấy đơn giá + NVL info
const planLineItems = await prisma.planLineItem.findMany({
  where: { plan: { factoryId: actual.factoryId, yearMonth: actual.yearMonth } },
  include: { salesOrderItem: true },
});

// Bước 4: Tạo/update ActualLineItem
for (const itemTotal of itemTotals) {
  // Tìm tất cả PlanLineItem cùng itemId
  const planItems = planLineItems.filter(pl => pl.itemId === itemTotal.itemId);

  for (const planItem of planItems) {
    // Tỷ lệ SL thực tế so với KH
    const ratio = itemTotal.khKg > 0 ? itemTotal.thKg / itemTotal.khKg : 1;
    // SL thực tế cho HĐ này = SL KH × ratio
    const actualQty = planItem.isAutoQty
      ? /* tính auto */ 0
      : planItem.qty * ratio;

    const calcResult = calculateLineItem({
      qty: actualQty,
      unitPriceUsd: planItem.unitPriceUsd,  // đơn giá giống KH
      rates: {
        cottonRate: /* từ RawMaterialRate */,
        peRate: /* từ RawMaterialRate */,
        cottonRatio: planItem.cottonRatio ?? 1.0,
        wasteRate: /* từ RawMaterialRate */,
        sellingCostRate: planItem.salesOrderItem?.sellingCostRate ?? 0,
        doubleTwistGcRate: /* từ RawMaterialRate */,
      },
      params: {
        exchangeRate: inputParam.exchangeRate,
        cottonPriceUsd: planItem.cottonPriceUsd ?? 0,  // dùng cùng giá NVL với KH
        pePriceUsd: planItem.pePriceUsd ?? 0,
      },
    });

    // Upsert ActualLineItem
    await prisma.actualLineItem.upsert({
      where: {
        // unique: actualId + salesOrderItemId + itemId
        // (cần thêm unique constraint nếu chưa có)
      },
      create: {
        actualId: actual.id,
        itemId: itemTotal.itemId,
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
        ...calcResult,
      },
      update: {
        qty: actualQty,
        ...calcResult,
      },
    });
  }
}

// Bước 5: Refresh summary snapshot
await refreshSummarySnapshot(actual.factoryId, actual.yearMonth, SnapshotType.TH);
```

---

## Phần 4: HĐ phát sinh trong TH

Cho phép thêm dòng sợi mới vào MonthlyActual (ActualLineItem)
mà không cần có PlanLineItem tương ứng.

### UI: Tab "Dòng sợi" trong trang Thực hiện

Giống KH nhưng thêm nút "Thêm HĐ phát sinh":

- Mở modal giống form tạo line item trong KH
- Chọn HĐ (hoặc DP) + mặt hàng + SL + đơn giá + loại NVL
- Lưu vào ActualLineItem với flag `isAdHoc = true`

### Schema: Thêm field

```prisma
model ActualLineItem {
  // ... fields hiện có ...
  isAdHoc Boolean @default(false)  // true = HĐ phát sinh, không có trong KH
}
```

---

## Phần 5: UI trang Thực hiện tháng

### Cách tiếp cận: KHÔNG tạo trang mới

Trang kế hoạch tháng hiện tại (`/kdsx/plans/[factoryId]/[yearMonth]`)
thêm Tab mới hoặc toggle KH/TH:

```
[ Kế hoạch | Thực hiện ]    ← Toggle ở đầu trang

Khi chọn "Kế hoạch":
- Hiện PlanLineItem + CP cố định KH + Tổng kết KH (như hiện tại)

Khi chọn "Thực hiện":
- Hiện ActualLineItem + CP cố định TH + Tổng kết TH
- Nút "Đồng bộ SL thực tế" (gọi sync API)
- Nút "Thêm HĐ phát sinh"
- CP cố định TH nhập riêng (có thể khác KH)
```

### Hoặc dùng trang Kế hoạch SX tháng (production-schedule/[id])

Đã có 3 tabs: Kế hoạch | Thực hiện | So sánh.

Tab "Thực hiện" hiện đang hiện grid SL. Thêm phần bên dưới grid:

- Bảng doanh thu thực hiện (giống bảng KH-DT nhưng dùng SL thực tế)
- CP cố định TH
- Tổng kết TH

---

## Phần 6: So sánh KH vs TH (cập nhật)

Tab "So sánh" trong production-schedule/[id] hiển thị:

| Chỉ tiêu        | Kế hoạch       | Thực hiện      | Chênh lệch     | %     |
| --------------- | -------------- | -------------- | -------------- | ----- |
| Sản lượng (kg)  | 489,780        | 475,200        | -14,580        | 97.0% |
| Doanh thu (đ)   | 38,808,005,689 | 37,650,xxx,xxx | -1,158,xxx,xxx | 97.0% |
| CP NVL (đ)      | 23,285,xxx,xxx | 22,600,xxx,xxx | -685,xxx,xxx   |       |
| CP BH + GC (đ)  | 2,577,xxx,xxx  | 2,500,xxx,xxx  |                |       |
| Phế thu hồi (đ) | -1,660,xxx,xxx | -1,610,xxx,xxx |                |       |
| CP cố định (đ)  | 11,512,xxx,xxx | 11,512,xxx,xxx | 0              |       |
| **LN Ròng**     | 1,513,xxx,xxx  | 1,028,xxx,xxx  | -485,xxx,xxx   | 67.9% |

- Biểu đồ cột: DT KH vs DT TH theo mặt hàng
- Biểu đồ line: SL tích lũy theo ngày (KH vs TH)

---

## Tóm tắt files

| Loại    | File                                            | Nội dung                                                                |
| ------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| Schema  | prisma/schema.prisma                            | +isAutoQty vào PlanLineItem/ActualLineItem, +isAdHoc vào ActualLineItem |
| API mới | production-schedule/[id]/actual-summary-by-item | Tổng SL theo mặt hàng KH+TH                                             |
| API sửa | monthly-plans/[id]/line-items/route.ts          | Thêm logic isAutoQty                                                    |
| API sửa | monthly-actuals/[id]/sync/route.ts              | Sync SL từ TH-SL, dùng đơn giá từ KH                                    |
| UI sửa  | plans/[factoryId]/[yearMonth]/page.tsx          | Toggle KH/TH, checkbox isAutoQty                                        |
| UI sửa  | production-schedule/[id]                        | Tab So sánh cập nhật                                                    |

## Thứ tự thực hiện (recommend)

1. Thêm isAutoQty + logic tính SL auto cho KH (nhỏ, test ngay được)
2. API actual-summary-by-item (backend, test bằng Postman)
3. Sửa sync API cho TH (backend)
4. UI toggle KH/TH + hiển thị TH-DT
5. Tab So sánh cập nhật

## Lưu ý

- Đơn giá TH = đơn giá KH (không nhập lại)
- Giá NVL TH = giá NVL KH (snapshot trong PlanLineItem) — trừ khi user chủ động đổi
- CP cố định TH nhập riêng, mặc định copy từ KH
- HĐ phát sinh chỉ xuất hiện trong TH, không ảnh hưởng KH
- Nút "Tính lại tất cả" phải hoạt động cho cả KH và TH
