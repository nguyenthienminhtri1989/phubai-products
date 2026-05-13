# SPEC: Ghi ngược Mặt hàng & Lô hàng từ trang Nhập sản lượng → trang Điều phối máy

## Mục tiêu

Khi user đổi mặt hàng hoặc lô hàng trên trang nhập sản lượng (`/production/daily-input-grid`), thay đổi phải được **ghi ngược** về trang điều phối máy (`/machines`) để lần nhập liệu sau không cần vào trang điều phối sửa lại.

## Phạm vi

| Loại máy                                         | Ghi ngược mặt hàng                                                   | Ghi ngược lô hàng |
| ------------------------------------------------ | -------------------------------------------------------------------- | ----------------- |
| Máy thường (`allowMultiItemPerShift = false`)    | ĐÃ CÓ — `POST /api/machines/batch` cập nhật `machines.currentItemId` | CHƯA CÓ — cần làm |
| Máy multi-item (`allowMultiItemPerShift = true`) | CHƯA CÓ — cần làm                                                    | CHƯA CÓ — cần làm |

---

## Đọc các file sau trước khi code

```
prisma/schema.prisma                              → model Machine, MachineItemAssignment, Lot
src/app/production/daily-input-grid/page.tsx       → trang nhập sản lượng (file chính cần sửa)
src/app/api/machines/[id]/assignments/route.ts     → API assignments hiện tại (GET + PUT)
src/app/api/machines/batch/route.ts                → API batch update currentItemId
src/app/api/machines/[id]/route.ts                 → API PUT machine (xem có nhận currentLotId chưa)
```

---

## 1. Backend — API mới & sửa

### 1.1 Thêm PATCH vào `src/app/api/machines/[id]/assignments/route.ts`

Mục đích: cập nhật 1 assignment duy nhất (đổi itemId cũ → mới), không xóa/tạo lại toàn bộ.

```typescript
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const machineId = parseInt(id);
  if (isNaN(machineId))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const body = await req.json();
    const { oldItemId, newItemId } = body;

    if (!oldItemId || !newItemId) {
      return NextResponse.json(
        { error: "Thiếu oldItemId hoặc newItemId" },
        { status: 400 },
      );
    }

    // Tìm assignment hiện tại theo machineId + oldItemId
    const existing = await prisma.machineItemAssignment.findUnique({
      where: { machineId_itemId: { machineId, itemId: oldItemId } },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Không tìm thấy assignment cần cập nhật" },
        { status: 404 },
      );
    }

    // Kiểm tra newItemId đã tồn tại trên máy này chưa
    const conflict = await prisma.machineItemAssignment.findUnique({
      where: { machineId_itemId: { machineId, itemId: newItemId } },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "Mặt hàng mới đã được gán cho máy này rồi" },
        { status: 400 },
      );
    }

    // Cập nhật itemId
    const updated = await prisma.machineItemAssignment.update({
      where: { id: existing.id },
      data: { itemId: newItemId },
      include: { item: { select: { id: true, name: true } } },
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    console.error("Assignment PATCH error:", e);
    return NextResponse.json(
      { error: e.message || "Lỗi cập nhật" },
      { status: 500 },
    );
  }
}
```

### 1.2 API cập nhật lô hàng cho máy

Thêm route mới: `src/app/api/machines/[id]/update-lot/route.ts`

Hoặc đơn giản hơn: **tái dùng** `PUT /api/machines/[id]` — chỉ cần đảm bảo nó nhận field `currentLotId`.

**Kiểm tra trước**: đọc file `src/app/api/machines/[id]/route.ts`, xem hàm PUT đã nhận `currentLotId` trong data update chưa.

- **Nếu đã có** → không cần tạo API mới, frontend gọi thẳng `PUT /api/machines/{id}` với `{ currentLotId }`.
- **Nếu chưa có** → thêm `currentLotId` vào danh sách fields được phép update.

```typescript
// Trong PUT handler của /api/machines/[id]/route.ts
// Thêm currentLotId vào data object:
const data: any = {};
if (body.currentLotId !== undefined) data.currentLotId = body.currentLotId;
// ... các field khác giữ nguyên
```

---

## 2. Frontend — Sửa `src/app/production/daily-input-grid/page.tsx`

### 2.1 Ghi ngược mặt hàng cho máy multi-item

Trong hàm `handleSave`, đoạn xử lý `itemChangedRows` hiện tại chỉ gọi `POST /api/machines/batch` — chỉ đúng cho máy thường. Cần thêm logic cho máy multi-item.

**Tìm đoạn code này** (khoảng dòng 493–505):

```typescript
// Cập nhật điều phối nếu mặt hàng thay đổi (chỉ primary rows)
const itemChangedRows = dirty.filter(r => !r.isSubRow && r.itemId !== r.originalItemId && r.itemId !== 0);
for (const r of itemChangedRows) {
  const res = await fetch("/api/machines/batch", { ... });
  ...
}
```

**Thay bằng:**

```typescript
// Cập nhật điều phối nếu mặt hàng thay đổi
const itemChangedRows = dirty.filter(
  (r) => r.itemId !== r.originalItemId && r.itemId !== 0,
);
for (const r of itemChangedRows) {
  const isMultiItem = !!machineAssignments[r.machineId];

  if (isMultiItem) {
    // Máy multi-item: PATCH assignment cụ thể (đổi oldItemId → newItemId)
    const res = await fetch(`/api/machines/${r.machineId}/assignments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oldItemId: r.originalItemId,
        newItemId: r.itemId,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(
        `Lỗi cập nhật assignment máy ${r.machineName}: ${data.error ?? ""}`,
      );
    }
  } else {
    // Máy thường: batch update currentItemId (logic cũ giữ nguyên)
    if (!r.isSubRow) {
      const res = await fetch("/api/machines/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineIds: [r.machineId], itemId: r.itemId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(
          `Không thể cập nhật điều phối máy ${r.machineName}: ${data.error ?? ""}`,
        );
      }
    }
  }
}
```

Lưu ý: với máy multi-item, **cả primary row lẫn sub-row** (isSubRow) đều có thể đổi mặt hàng → bỏ filter `!r.isSubRow` cho nhánh multi-item.

### 2.2 Ghi ngược lô hàng (cả 2 loại máy)

Trong hàm `handleSave`, **thêm đoạn mới** ngay sau đoạn ghi ngược mặt hàng, trước khi gọi `Promise.allSettled` lưu production logs:

```typescript
// Ghi ngược lô hàng nếu thay đổi
// Cần thêm field originalLotNumber vào RowData để so sánh
const lotChangedRows = dirty.filter(
  (r) => !r.isSubRow && r.currentLotNumber !== r.originalLotNumber,
);
for (const r of lotChangedRows) {
  // Tìm lotId từ lotNumber
  const lot = lots.find((l) => l.lotNumber === r.currentLotNumber);
  const lotId = lot?.id ?? null;

  const res = await fetch(`/api/machines/${r.machineId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentLotId: lotId }),
  });
  if (!res.ok) {
    console.error(`Lỗi cập nhật lô cho máy ${r.machineName}`);
    // Không throw — lô là phụ, không nên chặn lưu sản lượng
  }
}
if (lotChangedRows.length > 0) {
  message.info(`Đã cập nhật lô cho ${lotChangedRows.length} máy`);
}
```

### 2.3 Thêm field `originalLotNumber` vào interface `RowData`

```typescript
interface RowData {
  // ... các field hiện tại ...
  originalLotNumber?: string | null; // Thêm mới — để detect thay đổi lô
}
```

### 2.4 Gán `originalLotNumber` khi build rows

Trong hàm `handleLoad`, tại mọi chỗ tạo `RowData` mới (3 nơi: máy multi-item, máy chưa có log, máy có log), thêm:

```typescript
originalLotNumber: m.currentLot?.lotNumber ?? null,
```

### 2.5 Reset `originalLotNumber` sau khi lưu thành công

Trong `setRows` callback sau khi lưu (khoảng dòng 554):

```typescript
setRows((prev) =>
  prev.map((r) => {
    if (!r.isDirty) return r;
    const newId = rowKeyToLogId.get(r.rowKey);
    return {
      ...r,
      isDirty: false,
      originalItemId: r.itemId,
      originalLotNumber: r.currentLotNumber, // Thêm dòng này
      existingLogId: newId ?? r.existingLogId,
    };
  }),
);
```

### 2.6 Bỏ hiển thị cọc (fromSpindle/toSpindle)

Trong hàm `handleLoad`, đoạn build rows cho máy multi-item (khoảng dòng 267), tìm:

```typescript
const itemLabel = `${a.item.name}${a.fromSpindle ? ` (cọc ${a.fromSpindle}-${a.toSpindle})` : ""}`;
```

**Đổi thành:**

```typescript
const itemLabel = a.item.name;
```

---

## 3. Tóm tắt thay đổi

| File                                             | Thay đổi                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `src/app/api/machines/[id]/assignments/route.ts` | Thêm hàm `PATCH` — cập nhật 1 assignment                                                      |
| `src/app/api/machines/[id]/route.ts`             | Đảm bảo PUT nhận `currentLotId`                                                               |
| `src/app/production/daily-input-grid/page.tsx`   | Sửa `handleSave`: phân nhánh máy thường/multi-item khi ghi ngược mặt hàng + thêm ghi ngược lô |
| `src/app/production/daily-input-grid/page.tsx`   | Thêm `originalLotNumber` vào `RowData` + gán trong `handleLoad` + reset sau lưu               |
| `src/app/production/daily-input-grid/page.tsx`   | Bỏ hiển thị cọc trong itemLabel máy multi-item                                                |

---

## 4. Verify

```bash
# 1. PATCH endpoint tồn tại
grep -n "PATCH" src/app/api/machines/\[id\]/assignments/route.ts

# 2. Ghi ngược mặt hàng multi-item
grep -n "oldItemId\|PATCH\|isMultiItem" src/app/production/daily-input-grid/page.tsx

# 3. Ghi ngược lô
grep -n "originalLotNumber\|currentLotId\|lotChangedRows" src/app/production/daily-input-grid/page.tsx

# 4. Cọc đã bỏ
grep -n "fromSpindle\|toSpindle\|cọc" src/app/production/daily-input-grid/page.tsx
# Kỳ vọng: không còn dòng nào hiển thị cọc trên UI
```

---

## 5. Test thủ công

1. **Máy thường** — đổi mặt hàng trên trang nhập liệu → Lưu → vào `/machines` kiểm tra `currentItemId` đã đổi ✓ (hành vi cũ, không đổi)
2. **Máy multi-item** — đổi 1 trong 2 mặt hàng → Lưu → vào `/machines` → mở modal điều phối → kiểm tra assignment đã cập nhật đúng mặt hàng mới ✓
3. **Lô hàng** — đổi lô trên bất kỳ máy nào → Lưu → vào `/machines` kiểm tra `currentLotId` đã cập nhật ✓
4. **Conflict check** — máy multi-item có [Sợi A, Sợi B], đổi Sợi A → Sợi B → API trả lỗi "đã được gán" ✓
