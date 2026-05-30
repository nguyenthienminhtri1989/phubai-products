# SPEC: Đổi/Thêm/Bỏ Mặt Hàng Giữa Ca + Hỗ Trợ Cùng Mặt Hàng Khác Lô

> **Phiên bản**: 1.0 — 2026-05-30
> **Mục đích**:
>
> 1. Sửa Bug 1: Trang nhập liệu mobile máy ống không hiển thị đủ mặt hàng đã được gán khi đã có log của ca
> 2. Cho phép 1 máy chạy 2 mặt hàng cùng tên nhưng khác lô (case máy NM1 chạy giùm NM2)
> 3. Tách rõ 3 thao tác giữa ca: **Sửa sai** / **Đổi mặt hàng** / **Thêm song song** / **Bỏ mặt hàng**
> 4. Bảo đảm tính toàn vẹn dữ liệu: chống lưu trùng (máy + ngày + ca + sợi + lô) ở cả 3 tầng (DB / API / UI)
>
> **Đọc trước**: `prisma/schema.prisma`, `src/app/machines/page.tsx`, `src/app/production/mobile-winding/page.tsx`, `src/app/api/machines/[id]/assignments/route.ts`, `src/app/api/production/daily-input/route.ts`

---

## 1. BỐI CẢNH NGHIỆP VỤ

### Vấn đề hiện tại

**Bug 1**: Trên trang `mobile-winding`, hàm `buildMachineItems` đang theo logic `if logs.length > 0 → chỉ build từ logs, else → build từ assignments`. Hệ quả: máy có 4 assignment, mới nhập 2 log → 2 mặt hàng còn lại bị giấu trong các lần mở lại trang.

**Bug 2 (mở rộng)**: Constraint hiện tại của `ProductionLog`:

```prisma
@@unique([machineId, recordDate, shift, itemId])
```

Không cho phép cùng máy + ngày + ca + sợi nhưng **khác lô**. Trong khi thực tế máy đánh ống số 3 (NM1) có thể đồng thời chạy sợi **30CM/MD** từ 2 lô khác nguồn gốc (lô L-NM1-007 của NM1 và lô L-NM2-003 chạy giùm cho NM2) — đây là 2 dòng dữ liệu khác nhau cần lưu được.

**Lý do nghiệp vụ phải phân biệt**: Sợi 30CM/MD từ máy con NM1 và NM2 có cùng tên thị trường nhưng **chi phí sản xuất khác nhau** (giá thành sợi con đã lock theo lô gốc). Hợp đồng bán sợi này sau đó đi vào allocation engine — phải biết lô nào của NM nào để rót đúng hợp đồng.

**Vấn đề về thao tác giữa ca**: Code hiện tại chỉ có 2 nút (✏️ Edit và ➕ Thêm), không đủ để xử lý 5 tình huống thực tế:
| Tình huống | Log cũ | Assignment | Cần thao tác |
|---|---|---|---|
| Sửa sai (MH cũ chưa từng chạy) | XÓA | Đổi item | ✏️ Sửa sai |
| Đổi MH giữa ca (MH cũ đã chạy nửa ca) | GIỮ | Đổi item | 🔄 Đổi |
| Đổi nhiều dòng cùng lúc (A→C, B→D) | GIỮ cả 2 | Đổi 2 item | 🔄 hai lần |
| Bỏ MH giữa ca (dừng B, chỉ còn A) | GIỮ B | Xóa khỏi assignment | 🔄 với option "Bỏ" |
| Thêm MH song song (A,B → A,B,C) | (tạo log C) | Thêm dòng mới | ➕ Thêm |

### Bối cảnh quan trọng — Luồng nhập liệu thực tế

Hiện tại công nhân vẫn ghi sổ giấy trong ca, và **chỉ ngồi nhập vào hệ thống khi kết thúc ca**. Lúc đó họ nhìn vào sổ và cần nhập đủ tất cả các con số đã xảy ra trong ca: kể cả sản lượng của MH đã bị đổi/dừng giữa ca. Hệ quả với thiết kế UI:

- Modal Đổi/Dừng giữa ca **phải bao gói** việc nhập sản lượng MH cũ vào cùng 1 thao tác — không được cập nhật assignment trước rồi mới quay lại nhập MH cũ
- Dòng `isExtra` (MH đã dừng/đổi giữa ca) vẫn cho phép sửa lại số sản lượng — chỉ khóa item/lot
- `buildMachineItems` phải merge log ∪ assignment để hiển thị cả các MH đã bị đổi/dừng (qua log) lẫn các MH hiện tại (qua assignment)

---

## 2. PHẠM VI THAY ĐỔI

| Tầng      | File                                             | Thay đổi                                                                                                                                                                      |
| --------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema    | `prisma/schema.prisma`                           | Sửa unique constraint của `ProductionLog` và `MachineItemAssignment`                                                                                                          |
| Migration | SQL thủ công                                     | DROP unique cũ + tạo 2 partial unique index                                                                                                                                   |
| API       | `src/app/api/production/daily-input/route.ts`    | Refactor `upsert` → `findFirst + update/create` (key 5 cột có lot)                                                                                                            |
| API       | `src/app/api/machines/[id]/assignments/route.ts` | PUT: validate "trùng item phải khác lô"; PATCH: bỏ check duplicate cũ, thay bằng validate có lot                                                                              |
| UI        | `src/app/machines/page.tsx`                      | Validate client trong `handleSaveAssignments`: trùng (item, lot) → block                                                                                                      |
| UI        | `src/app/production/mobile-winding/page.tsx`     | (1) Fix `buildMachineItems` merge logs∪assignments. (2) Tách thao tác: ✏️ Sửa sai / 🔄 Đổi / ➕ Thêm — mỗi modal chọn cả lô. (3) Validate trùng (item, lot) trong state local |

**KHÔNG đụng tới**:

- Cột `lotId` trong `ProductionLog` (giữ nullable cho máy không cần lô)
- Cột `lotId` trong `MachineItemAssignment` (giữ nullable)
- API `/api/lots` (đã hỗ trợ filter)
- Logic upsert của các API khác không liên quan

---

## 3. THAY ĐỔI SCHEMA

### 3.1. `ProductionLog`

**File**: `prisma/schema.prisma` — model `ProductionLog`

```prisma
model ProductionLog {
  // ... giữ nguyên các field hiện có ...

  // XÓA dòng này:
  // @@unique([machineId, recordDate, shift, itemId])

  // KHÔNG thêm @@unique mới — vì Prisma chưa hỗ trợ partial unique index
  // Sẽ tạo bằng SQL thủ công trong migration (xem mục 4)

  // Giữ nguyên các @@index hiện có
  @@index([recordDate])
  @@index([recordDate, machineId])
  @@index([machineId, shift])
  @@index([itemId])
  @@index([lotId])
  @@map("production_logs")
}
```

### 3.2. `MachineItemAssignment`

**File**: `prisma/schema.prisma` — model `MachineItemAssignment`

```prisma
model MachineItemAssignment {
  // ... giữ nguyên các field hiện có ...

  // SỬA dòng này:
  // @@unique([machineId, itemId])
  // THÀNH:
  // (xóa luôn, sẽ tạo partial index bằng SQL — tương tự ProductionLog)

  @@index([machineId])
  @@map("machine_item_assignments")
}
```

---

## 4. MIGRATION

### 4.1. Sinh migration

```bash
npx prisma migrate dev --name shift_item_change_multi_lot
```

Prisma sẽ sinh ra file `migration.sql` chứa `DROP CONSTRAINT` cho 2 unique cũ. **Sửa file SQL bằng tay** để thêm partial index:

### 4.2. Nội dung file migration.sql cuối cùng

```sql
-- 1. ProductionLog: xóa unique cũ, tạo 2 partial unique index
--    Tên constraint cũ có thể khác tùy phiên bản Prisma, kiểm tra bằng:
--    SELECT conname FROM pg_constraint WHERE conrelid = 'production_logs'::regclass;
DROP INDEX IF EXISTS "production_logs_machineId_recordDate_shift_itemId_key";
ALTER TABLE "production_logs"
  DROP CONSTRAINT IF EXISTS "production_logs_machineId_recordDate_shift_itemId_key";

-- Khi log CÓ lô: unique theo 5 cột (cho phép cùng máy/ngày/ca/item khác lô)
CREATE UNIQUE INDEX IF NOT EXISTS "prod_log_unique_with_lot"
  ON "production_logs" ("machineId", "recordDate", "shift", "itemId", "lotId")
  WHERE "lotId" IS NOT NULL;

-- Khi log KHÔNG có lô: unique theo 4 cột (chống dup âm thầm khi lotId NULL)
CREATE UNIQUE INDEX IF NOT EXISTS "prod_log_unique_no_lot"
  ON "production_logs" ("machineId", "recordDate", "shift", "itemId")
  WHERE "lotId" IS NULL;

-- 2. MachineItemAssignment: tương tự
DROP INDEX IF EXISTS "machine_item_assignments_machineId_itemId_key";
ALTER TABLE "machine_item_assignments"
  DROP CONSTRAINT IF EXISTS "machine_item_assignments_machineId_itemId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "machine_assignment_unique_with_lot"
  ON "machine_item_assignments" ("machineId", "itemId", "lotId")
  WHERE "lotId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "machine_assignment_unique_no_lot"
  ON "machine_item_assignments" ("machineId", "itemId")
  WHERE "lotId" IS NULL;
```

### 4.3. Deploy lên production

Theo kinh nghiệm migration trước (P3018/42710 schema drift):

```bash
# 1. Đẩy code có schema mới + migration file lên production
git pull

# 2. Thử migrate
npx prisma migrate deploy

# 3a. Nếu OK → DONE
# 3b. Nếu fail do schema drift → chạy SQL thủ công, sau đó:
psql -U ... -d ... -f prisma/migrations/<timestamp>_shift_item_change_multi_lot/migration.sql
npx prisma migrate resolve --applied <tên_migration>

# 4. Generate client
npx prisma generate
```

---

## 5. THAY ĐỔI API

### 5.1. `/api/production/daily-input/route.ts` — Refactor POST

**Vấn đề**: Code hiện tại dùng `prisma.productionLog.upsert` với composite key 4 cột (`machineId_recordDate_shift_itemId`). Sau khi đổi schema, composite key này **không còn tồn tại** → upsert lỗi compile.

**Giải pháp**: Đổi sang `findFirst` + `update/create` thủ công, dùng key 5 cột bao gồm `lotId`.

**Code mới** (thay từ dòng "// 4. SỬ DỤNG UPSERT" đến hết block upsert):

```typescript
// 4. Find existing log với key 5 cột (bao gồm lotId)
//    Phải tách 2 nhánh vì lotId nullable: lotId=NULL khác với lotId=<số>
let existing;
if (lotId == null) {
  existing = await prisma.productionLog.findFirst({
    where: {
      machineId,
      recordDate: dateObj,
      shift,
      itemId,
      lotId: null,
    },
  });
} else {
  existing = await prisma.productionLog.findFirst({
    where: {
      machineId,
      recordDate: dateObj,
      shift,
      itemId,
      lotId,
    },
  });
}

const savedLog = existing
  ? await prisma.productionLog.update({
      where: { id: existing.id },
      data: { ...dataToSave, lotId },
    })
  : await prisma.productionLog.create({
      data: { ...dataToSave, lotId },
    });
```

**Lưu ý**: Phần code phía sau (mục 5 cập nhật `machine.currentItemId`, mục 6 allocation engine comment) **giữ nguyên**.

**Xử lý lỗi P2002**: Vẫn giữ catch block, nhưng giờ P2002 sẽ xảy ra khi UI bỏ qua validation. Message error sửa cho rõ:

```typescript
detail: error.code === "P2002"
    ? "Bản ghi này (máy + ngày + ca + sợi + lô) đã tồn tại. Vui lòng chọn lô khác hoặc kiểm tra dữ liệu hiện có."
    : error.message,
```

### 5.2. `/api/machines/[id]/assignments/route.ts` — Sửa PUT

**Vấn đề hiện tại**: PUT đang `deleteMany` + `createMany`. Khi 2 dòng trong body có cùng `(itemId, lotId)` → Postgres không catch được (vì partial index mới chỉ chống khi không có lot, hoặc cùng cả lot khác null). Cần **validate server-side trước khi ghi**.

**Thêm validation đầu hàm PUT** (sau khi parse body):

```typescript
const assignments: {
  itemId: number;
  lotId?: number | null;
  fromSpindle?: number;
  toSpindle?: number;
  sortOrder?: number;
}[] = body.assignments ?? [];

// VALIDATION: phát hiện trùng (itemId, lotId) trong cùng request
const seen = new Map<string, number>();
for (let i = 0; i < assignments.length; i++) {
  const a = assignments[i];
  const key = `${a.itemId}:${a.lotId ?? "null"}`;
  if (seen.has(key)) {
    return NextResponse.json(
      {
        error:
          a.lotId == null
            ? `Mặt hàng "${a.itemId}" được gán 2 lần cho máy này. Nếu chạy 2 lô khác nhau cùng mặt hàng, vui lòng chọn lô cụ thể cho từng dòng.`
            : `Mặt hàng "${a.itemId}" + lô "${a.lotId}" được gán 2 lần. Mỗi cặp mặt hàng + lô chỉ được 1 dòng.`,
      },
      { status: 400 },
    );
  }
  seen.set(key, i);
}

// CẢNH BÁO: nếu có dòng cùng itemId mà không có lot → nguy hiểm
const itemCount = new Map<number, number>();
for (const a of assignments) {
  itemCount.set(a.itemId, (itemCount.get(a.itemId) ?? 0) + 1);
}
for (const [itemId, count] of itemCount) {
  if (count > 1) {
    // Có >1 dòng cùng itemId → tất cả dòng đó phải có lotId
    const sameItem = assignments.filter((a) => a.itemId === itemId);
    const missingLot = sameItem.some((a) => a.lotId == null);
    if (missingLot) {
      return NextResponse.json(
        {
          error: `Có ${count} dòng cùng mặt hàng "${itemId}" — tất cả các dòng này phải chọn lô cụ thể để phân biệt.`,
        },
        { status: 400 },
      );
    }
  }
}

// ... tiếp tục deleteMany + createMany như cũ ...
```

### 5.3. `/api/machines/[id]/assignments/route.ts` — Sửa PATCH

**PATCH** hiện tại tìm assignment qua `machineId_itemId` (composite unique cũ). Sau khi đổi schema, composite key này **không còn**. Cần refactor.

**Quyết định**: Theo lựa chọn của Trí (phương án (c)) — **bỏ luôn PATCH endpoint**. Frontend dùng PUT thay-thế-toàn-bộ. Tuy nhiên trong code mobile-winding hiện tại có gọi PATCH (xem `handleSave` đoạn `itemChanged`). Sẽ refactor frontend ở mục 7 để không cần PATCH nữa.

**Cách triển khai**: Có thể **xóa hẳn handler PATCH** trong file route.ts, hoặc giữ và đánh deprecated. Khuyến nghị xóa để tránh nhầm lẫn về sau.

---

## 6. THAY ĐỔI UI — `src/app/machines/page.tsx`

### 6.1. Validation client trong `handleSaveAssignments`

Trước khi gọi `fetch PUT`, validate trong values.assignments — bắt trùng (item, lot) và "cùng item nhưng thiếu lot".

**Sửa hàm `handleSaveAssignments`** (dòng 265-288), thêm block validate ngay sau `if (!multiItemMachine) return`:

```typescript
const handleSaveAssignments = async (values: any) => {
  if (!multiItemMachine) return;

  const assignments = values.assignments ?? [];

  // VALIDATE: trùng (itemId, lotId)
  const seen = new Map<string, number>();
  const itemCount = new Map<number, number>();

  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    if (!a.itemId) continue; // Bỏ qua dòng chưa chọn item

    const key = `${a.itemId}:${a.lotId ?? "null"}`;
    if (seen.has(key)) {
      const itemName = items.find((it) => it.id === a.itemId)?.name ?? a.itemId;
      message.error(
        a.lotId == null
          ? `Dòng ${i + 1}: Mặt hàng "${itemName}" bị trùng. Khi gán cùng mặt hàng cho 2 lô khác nhau, cả 2 dòng đều phải chọn lô cụ thể.`
          : `Dòng ${i + 1}: Cặp mặt hàng "${itemName}" + lô đã có ở dòng ${seen.get(key)! + 1}. Mỗi cặp chỉ được 1 dòng.`,
      );
      return;
    }
    seen.set(key, i);
    itemCount.set(a.itemId, (itemCount.get(a.itemId) ?? 0) + 1);
  }

  // VALIDATE: nếu có >1 dòng cùng item, tất cả dòng đó phải có lotId
  for (const [itemId, count] of itemCount) {
    if (count > 1) {
      const sameItem = assignments.filter((a: any) => a.itemId === itemId);
      const missingLot = sameItem.some((a: any) => a.lotId == null);
      if (missingLot) {
        const itemName = items.find((it) => it.id === itemId)?.name ?? itemId;
        message.error(
          `Mặt hàng "${itemName}" có ${count} dòng — tất cả các dòng cùng mặt hàng phải chọn lô cụ thể để phân biệt.`,
        );
        return;
      }
    }
  }

  setMultiItemSaving(true);
  // ... phần còn lại giữ nguyên (fetch PUT, message success, etc.) ...
};
```

### 6.2. UI Modal phân công (multi-item) — cho phép trùng item

Hiện tại modal đã render `Form.List` cho phép thêm/xóa dòng. **Không cần đổi UI**, chỉ cần validate ở client là đủ.

Tuy nhiên Select item trong từng dòng có thể đang filter các item đã chọn ở dòng trên (tránh trùng). **Bỏ filter đó đi** — cho phép user chọn cùng item, miễn là khác lô.

Tìm trong modal phần render `Select` cho `itemId`, nếu có `filterOption` hoặc `options` đã lọc theo "item đã dùng ở dòng khác" → **xóa logic lọc**.

---

## 7. THAY ĐỔI UI — `src/app/production/mobile-winding/page.tsx`

### 7.1. Fix Bug 1 — `buildMachineItems`

**Vấn đề**: Hàm hiện tại có logic `if logs.length > 0 → chỉ build từ logs; else → build từ assignments`. Cần đổi thành **merge cả 2 nguồn**.

**Code mới** (thay toàn bộ block dòng 199-219 của hàm `buildMachineItems`):

```typescript
const buildMachineItems = (machine: any): ItemInput[] => {
  const logs = machine.todayLogs ?? [];
  const assignments = machine.itemAssignments ?? [];
  const items: ItemInput[] = [];
  const usedLogIds = new Set<number>();

  // 1. Đi qua TẤT CẢ assignments theo sortOrder
  //    Mỗi assignment: tìm log tương ứng (cùng itemId, cùng lotId)
  for (const a of assignments) {
    // Tìm log match theo (itemId, lotId)
    const log = logs.find(
      (l: any) =>
        l.itemId === a.itemId && (l.lotId ?? null) === (a.lotId ?? null),
    );

    if (log) {
      usedLogIds.add(log.id);
      items.push({
        itemId: a.itemId,
        itemName: a.item?.name ?? log.item?.name ?? "",
        lotId: a.lotId ?? null,
        lotNumber: a.lot?.lotNumber ?? null,
        outputKg: log.finalOutput ?? 0,
        existingLogId: log.id,
        fromSpindle: a.fromSpindle ?? null,
        toSpindle: a.toSpindle ?? null,
        isExtra: false,
        originalItemId: a.itemId,
        originalLotId: a.lotId ?? null,
      });
    } else {
      // Assignment chưa có log → slot rỗng chờ nhập
      items.push({
        itemId: a.itemId,
        itemName: a.item?.name ?? "",
        lotId: a.lotId ?? null,
        lotNumber: a.lot?.lotNumber ?? null,
        outputKg: 0,
        existingLogId: undefined,
        fromSpindle: a.fromSpindle ?? null,
        toSpindle: a.toSpindle ?? null,
        isExtra: false,
        originalItemId: a.itemId,
        originalLotId: a.lotId ?? null,
      });
    }
  }

  // 2. Đi qua các log CÒN LẠI (không match assignment nào)
  //    Đây là các MH đã được thêm/đổi giữa ca trong quá khứ nhưng giờ không còn trong assignment
  //    (VD: đã bỏ MH B giữa ca → assignment không còn B nhưng log B vẫn còn)
  for (const log of logs) {
    if (usedLogIds.has(log.id)) continue;
    items.push({
      itemId: log.itemId,
      itemName: log.item?.name ?? "",
      lotId: log.lotId ?? null,
      lotNumber: log.lot?.lotNumber ?? null,
      outputKg: log.finalOutput ?? 0,
      existingLogId: log.id,
      fromSpindle: null,
      toSpindle: null,
      isExtra: true, // Đánh dấu là dòng "ngoài assignment"
      originalItemId: undefined, // Không có gốc trong assignment hiện tại
      originalLotId: undefined,
    });
  }

  return items;
};
```

**Lưu ý**: Interface `ItemInput` cần thêm field `lotId`, `lotNumber`, `originalLotId`. Tìm interface và bổ sung:

```typescript
interface ItemInput {
  itemId: number;
  itemName: string;
  lotId: number | null; // ← THÊM
  lotNumber: string | null; // ← THÊM
  outputKg: number;
  existingLogId?: number;
  fromSpindle: number | null;
  toSpindle: number | null;
  isExtra: boolean;
  originalItemId?: number;
  originalLotId?: number | null; // ← THÊM
}
```

Đồng thời `todayLogs` từ API `daily-status` cần include `lot` — kiểm tra `src/app/api/production/daily-status/route.ts`, sửa `productionLogs.include` để có:

```typescript
productionLogs: {
    where: { recordDate: targetDate, shift: parseInt(shift) },
    include: {
        item: { select: { id: true, name: true } },
        lot: { select: { id: true, lotNumber: true } },   // ← THÊM
    },
    orderBy: { id: "asc" },
},
```

### 7.2. Tách 3 thao tác giữa ca — UI

**Hiện trạng**: Mỗi dòng MH có nút ✏️ Edit; dưới cùng có nút ➕ Thêm mặt hàng giữa ca.

**Sau khi sửa**: Mỗi dòng MH có **2 nút** (✏️ Sửa sai + 🔄 Đổi); dưới cùng giữ **1 nút** (➕ Thêm song song).

#### 7.2.1. Modal ✏️ Sửa sai (đã có, mở rộng)

**Khi nào dùng**: Assignment ghi nhầm mặt hàng/lô từ đầu ca — MH cũ thực ra **chưa từng chạy**.

**Fields trong modal**:

- Chọn mặt hàng mới (required)
- Chọn lô mới (required nếu trên 1 máy đã có dòng khác cùng item, hoặc nếu công đoạn yêu cầu lô — máy ống NM1/NM2)
- Cọc từ / Cọc đến (optional)

**Hành động khi save**:

1. Nếu có `existingLogId` → `DELETE /api/production/daily-input?id={existingLogId}`
2. PUT toàn bộ assignment mới (gọi `/api/machines/{machineId}/assignments` với danh sách đã sửa)
3. POST log mới với (newItemId, newLotId) — nếu user có nhập sản lượng cho dòng này

#### 7.2.2. Modal 🔄 Đổi giữa ca (mới)

**Khi nào dùng**: MH cũ đã chạy được một phần ca thật, giờ chuyển sang MH khác (hoặc dừng hẳn).

**Bối cảnh quan trọng — luồng nhập liệu cuối ca**:
Hiện tại công nhân vẫn ghi sổ trong ca và chỉ ngồi nhập máy tính khi kết thúc ca. Lúc nhập, họ nhìn vào sổ và thấy: "B chạy 500kg rồi đổi sang C, C chạy 300kg". Họ cần nhập đủ 3 con số trong cùng phiên nhập. Vì vậy modal Đổi phải **bao gói** việc nhập sản lượng MH cũ vào trong cùng 1 thao tác — KHÔNG được PUT assignment trước rồi mới quay lại nhập MH cũ, vì sau khi PUT thì MH cũ chỉ còn dạng "isExtra" và nếu chưa có log thì biến mất khỏi UI.

**Layout modal**:

```
┌─ Đổi mặt hàng giữa ca ──────────────────┐
│ Mặt hàng đang dừng: 30CM/MD (Lô L-007)  │
│                                          │
│ Sản lượng đã chạy: [_____] kg *required │  ← BẮT BUỘC
│   (Nếu đã từng nhập trước đó, số cũ sẽ  │
│    được load vào ô này, cho phép sửa)   │
│                                          │
│ ─── Chuyển sang ───                     │
│ [○ Đổi sang mặt hàng khác]              │
│   Mặt hàng mới:  [Select.........]      │
│   Lô mới:        [Select.........]      │
│   Cọc:           [____] đến [____]      │
│                                          │
│ [○ Dừng hẳn (không chạy MH này nữa)]    │
│                                          │
│           [Hủy]  [Xác nhận đổi]         │
└──────────────────────────────────────────┘
```

**Hành động khi save (theo thứ tự nghiêm ngặt)**:

1. **Lưu sản lượng MH cũ trước**:
   - Nếu `row.existingLogId` có → `POST /api/production/daily-input` với cùng (itemId cũ, lotId cũ) — upsert tự update
   - Nếu chưa có → `POST` tạo mới với `finalOutput = số vừa nhập`
2. **Sau đó PUT assignment**:
   - Option **Đổi sang MH khác**: assignment mới thay dòng cũ thành (newItemId, newLotId, fromSpindle, toSpindle)
   - Option **Dừng hẳn**: assignment mới lọc bỏ dòng cũ
3. **Reload data** từ `daily-status`

**Validation modal**:

- Sản lượng đã chạy: bắt buộc, > 0
- Nếu option = Đổi: bắt buộc chọn MH mới + (nếu trùng MH với dòng khác) phải chọn lô mới
- Nếu option = Đổi: kiểm tra (newItemId, newLotId) không trùng dòng nào khác đang có trên máy

#### 7.2.3. Modal ➕ Thêm song song (sửa logic)

**Code hiện tại** (`addExtraItem`) chỉ tạo `ItemInput` mới trong state, khi save chỉ POST log → **không cập nhật assignment**.

**Sửa**: Thêm dòng vào assignment cũng.

**Fields trong modal**:

- Chọn mặt hàng (required)
- Chọn lô (required nếu trùng item với dòng khác)
- Cọc từ / Cọc đến (optional)

**Hành động khi save**:

1. PUT assignment mới (thêm 1 dòng vào danh sách)
2. POST log mới (nếu user có nhập sản lượng ngay)

### 7.3. Refactor `handleSave` — bỏ gọi PATCH

**Hiện tại**: `handleSave` có logic `if (itemChanged) → DELETE log + POST log + PATCH /assignments`. PATCH này phụ thuộc composite unique cũ — đã bỏ.

**Thay bằng**: Mỗi modal (Sửa sai / Đổi / Thêm) tự gọi PUT đầy đủ.

**Cách triển khai**:

- Bỏ logic `itemChanged` ra khỏi `handleSave` (handleSave chỉ còn xử lý nhập sản lượng thuần — POST log)
- Mỗi modal có hàm save riêng (`handleEditCorrection`, `handleChangeItem`, `handleAddItem`) tự gọi PUT assignment + POST/DELETE log

**Pseudocode cho 3 modal**:

```typescript
// ✏️ Sửa sai
const handleEditCorrection = async (row: ItemInput, newItemId: number, newLotId: number | null, ...) => {
    // 1. Xóa log cũ (nếu có)
    if (row.existingLogId) {
        await fetch(`/api/production/daily-input?id=${row.existingLogId}`, { method: 'DELETE' });
    }
    // 2. PUT assignment mới (thay dòng cũ bằng item+lot mới)
    const newAssignments = currentAssignments.map(a =>
        (a.itemId === row.originalItemId && (a.lotId ?? null) === (row.originalLotId ?? null))
            ? { ...a, itemId: newItemId, lotId: newLotId, fromSpindle, toSpindle }
            : a
    );
    await fetch(`/api/machines/${machineId}/assignments`, {
        method: 'PUT',
        body: JSON.stringify({ assignments: newAssignments }),
    });
    // 3. Reload data
    await fetchMachineData();
};

// 🔄 Đổi giữa ca (option A: đổi sang MH khác)
// PHẢI nhận oldOutputKg — sản lượng đã chạy của MH cũ — vì công nhân chốt cuối ca
const handleChangeItem = async (
    row: ItemInput,
    oldOutputKg: number,           // ← Sản lượng MH cũ (bắt buộc)
    newItemId: number,
    newLotId: number | null,
    newFromSpindle: number | null,
    newToSpindle: number | null
) => {
    // 1. LƯU SẢN LƯỢNG MH CŨ TRƯỚC (upsert qua POST daily-input)
    //    Phải làm trước PUT assignment để đảm bảo log MH cũ được lưu đúng (machineId, date, shift, itemId cũ, lotId cũ)
    await fetch('/api/production/daily-input', {
        method: 'POST',
        body: JSON.stringify({
            recordDate: dateStr,
            shift: selectedShift,
            machineId,
            itemId: row.itemId,          // itemId CŨ
            lotId: row.lotId,            // lotId CŨ
            startIndex: 0,
            endIndex: 0,
            inputNE: 0,
            finalOutput: oldOutputKg,
            note: 'Đã dừng giữa ca',
        }),
    });

    // 2. PUT assignment mới
    const newAssignments = currentAssignments.map(a =>
        (a.itemId === row.originalItemId && (a.lotId ?? null) === (row.originalLotId ?? null))
            ? { ...a, itemId: newItemId, lotId: newLotId, fromSpindle: newFromSpindle, toSpindle: newToSpindle }
            : a
    );
    await fetch(`/api/machines/${machineId}/assignments`, {
        method: 'PUT',
        body: JSON.stringify({ assignments: newAssignments }),
    });

    // 3. Reload
    await fetchMachineData();
};

// 🔄 Đổi giữa ca (option B: dừng hẳn)
const handleStopItem = async (
    row: ItemInput,
    oldOutputKg: number               // ← Sản lượng MH cũ (bắt buộc)
) => {
    // 1. LƯU SẢN LƯỢNG MH CŨ
    await fetch('/api/production/daily-input', {
        method: 'POST',
        body: JSON.stringify({
            recordDate: dateStr,
            shift: selectedShift,
            machineId,
            itemId: row.itemId,
            lotId: row.lotId,
            startIndex: 0,
            endIndex: 0,
            inputNE: 0,
            finalOutput: oldOutputKg,
            note: 'Đã dừng giữa ca',
        }),
    });

    // 2. PUT assignment mới (lọc bỏ dòng này)
    const newAssignments = currentAssignments.filter(a =>
        !(a.itemId === row.originalItemId && (a.lotId ?? null) === (row.originalLotId ?? null))
    );
    await fetch(`/api/machines/${machineId}/assignments`, {
        method: 'PUT',
        body: JSON.stringify({ assignments: newAssignments }),
    });

    // 3. Reload
    await fetchMachineData();
};

// ➕ Thêm song song
const handleAddItem = async (newItemId: number, newLotId: number | null, ...) => {
    // 1. PUT assignment mới (thêm dòng vào cuối)
    const newAssignments = [
        ...currentAssignments,
        { itemId: newItemId, lotId: newLotId, fromSpindle, toSpindle, sortOrder: currentAssignments.length },
    ];
    await fetch(`/api/machines/${machineId}/assignments`, {
        method: 'PUT',
        body: JSON.stringify({ assignments: newAssignments }),
    });
    await fetchMachineData();
    // 2. (Optional) Nếu user có nhập sản lượng ngay → POST log
};
```

### 7.4. Validation UI mobile-winding — chống trùng (item, lot)

Trong cả 3 modal (Sửa sai / Đổi / Thêm), trước khi save, validate:

```typescript
// Sau khi user chọn newItemId + newLotId, trước khi gọi API:
const conflictRow = currentItems.find(
  (other) =>
    other !== editingRow && // không so với chính nó
    other.itemId === newItemId &&
    (other.lotId ?? null) === (newLotId ?? null),
);

if (conflictRow) {
  if (newLotId == null) {
    message.error(
      `Máy này đang có dòng "${itemName}" khác chưa chọn lô. Vui lòng chọn lô cụ thể cho cả 2 dòng để phân biệt.`,
    );
  } else {
    message.error(`Cặp mặt hàng "${itemName}" + lô đã tồn tại trên máy này.`);
  }
  return;
}
```

### 7.5. Hiển thị lô + dòng "đã dừng giữa ca"

Mỗi dòng MH trên trang nhập liệu hiện chỉ hiện tên MH. **Thêm tag lô** bên cạnh để công nhân phân biệt 2 dòng cùng MH khác lô:

```tsx
<div>
  <Tag color="blue">{item.itemName}</Tag>
  {item.lotNumber && (
    <Tag color="orange" style={{ fontSize: 11 }}>
      Lô: {item.lotNumber}
    </Tag>
  )}
  {item.isExtra && (
    <Tag color="default" style={{ fontSize: 11 }}>
      Đã dừng giữa ca
    </Tag>
  )}
</div>
```

**Cách xử lý dòng `isExtra = true`** (MH đã bị đổi/dừng giữa ca):

- **Vẫn cho phép sửa `outputKg`** — vì công nhân có thể nhớ sai số, cần chỉnh lại
- **KHÓA** không cho đổi item/lot, không cho bấm 🔄, không cho bấm ✏️ (vì đã không còn trong assignment, đổi nữa vô nghĩa)
- Có nút 🗑️ riêng để xóa hẳn log này nếu nhập nhầm (gọi `DELETE /api/production/daily-input?id={existingLogId}`)
- Hiển thị mờ hơn (opacity 0.7 hoặc background xám) để phân biệt với dòng đang chạy

---

## 8. TỔNG HỢP RULES VALIDATION

| Tầng              | Rule                                                                         | Mã lỗi/Phản ứng                  |
| ----------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| DB                | Partial index: cùng (machine, date, shift, item, lot) khi lot != NULL → chặn | P2002                            |
| DB                | Partial index: cùng (machine, date, shift, item) khi lot = NULL → chặn       | P2002                            |
| DB                | Tương tự cho `machine_item_assignments`                                      | P2002                            |
| API               | PUT assignments: trùng (item, lot) trong body → 400                          | "Mặt hàng X + lô Y bị trùng"     |
| API               | PUT assignments: cùng item có >1 dòng nhưng ít nhất 1 dòng thiếu lot → 400   | "Tất cả dòng cùng MH phải có lô" |
| API               | POST daily-input: lỗi P2002 từ DB → 500 với detail rõ                        | "Bản ghi đã tồn tại..."          |
| UI machines       | Validate client trong `handleSaveAssignments` — như API rule                 | `message.error`                  |
| UI mobile-winding | Modal Sửa sai/Đổi/Thêm — chống trùng với dòng khác trong cùng máy            | `message.error` ngăn save        |

---

## 9. TEST CASES

### TC1 — Bug 1 fix

- **Setup**: Máy 10 (multi-item, NM1, công đoạn ống) có 4 assignment: A, B, C, D (đều có lô)
- **Action**: Mở mobile-winding, nhập sản lượng cho A và B, lưu, chuyển máy khác, quay lại máy 10
- **Expected**: Vẫn thấy đủ 4 ô nhập (A có 850kg, B có 700kg, C và D trống)

### TC2 — Cùng item, khác lô trên 1 máy

- **Setup**: Máy 3 NM1, mở modal điều phối trên `machines/page.tsx`
- **Action**: Thêm 2 dòng: dòng 1 = 30CM/MD + lô L-NM1-007; dòng 2 = 30CM/MD + lô L-NM2-003. Bấm Lưu.
- **Expected**: Lưu thành công. Assignment có 2 dòng cùng item, khác lô.

### TC3 — Validation: trùng cả item lẫn lot

- **Setup**: Máy 3, mở modal điều phối
- **Action**: Thêm 2 dòng cùng 30CM/MD + cùng lô L-NM1-007
- **Expected**: Bấm Lưu → `message.error` "Cặp mặt hàng + lô bị trùng"

### TC4 — Validation: cùng item nhưng thiếu lot

- **Setup**: Máy 3, mở modal điều phối
- **Action**: Thêm 2 dòng cùng 30CM/MD, dòng 1 có lô, dòng 2 để trống lô
- **Expected**: Bấm Lưu → `message.error` "Tất cả dòng cùng MH phải chọn lô"

### TC5 — Đổi MH giữa ca (chốt cuối ca, nhìn sổ)

- **Setup**: Máy 1 đầu ca [A, B] (theo assignment). Cuối ca, công nhân ngồi nhập dựa vào sổ ghi: "A chạy đủ ca 1000kg; B chạy 500kg rồi đổi sang C, C chạy 300kg".
- **Action**:
  1. Nhập 1000 vào ô A → save (POST log A bình thường)
  2. Bấm 🔄 trên dòng B → modal mở
  3. Trong modal: nhập **Sản lượng đã chạy = 500**, chọn "Đổi sang MH khác", chọn C + lô C, xác nhận
  4. Sau reload: thấy [A (1000, locked-no, có thể sửa), C (slot mới, rỗng), B (isExtra=true, 500kg, có thể sửa số, khóa item/lot)]
  5. Nhập 300 vào ô C → save
- **Expected**:
  - Assignment cuối = [A, C]
  - ProductionLog có 3 dòng: A=1000, B=500, C=300
  - UI sau reload đầy đủ 3 dòng đúng số

### TC6 — Bỏ MH giữa ca (nhập cuối ca)

- **Setup**: Máy 1 [A, B] đầu ca. Sổ ghi: "A chạy đủ ca 1200kg; B chạy 300kg thì dừng hẳn"
- **Action**:
  1. Nhập 1200 vào ô A → save
  2. Bấm 🔄 trên dòng B → modal mở
  3. Nhập **Sản lượng đã chạy = 300**, chọn "Dừng hẳn", xác nhận
- **Expected**:
  - Assignment cuối = [A]
  - ProductionLog: A=1200, B=300
  - UI sau reload: A (1200), B (isExtra=true, 300, có thể sửa số)

### TC10 — Đổi nhiều dòng cùng lúc (chốt cuối ca)

- **Setup**: Máy 1 [A, B] đầu ca. Sổ ghi: "A chạy 600 thì đổi C, C chạy 400; B chạy 400 thì đổi D, D chạy 350"
- **Action**:
  1. Bấm 🔄 trên A → nhập **600**, đổi sang C + lô C → xác nhận
  2. (Sau reload, thấy A đã thành isExtra với 600, có dòng C mới rỗng)
  3. Bấm 🔄 trên B → nhập **400**, đổi sang D + lô D → xác nhận
  4. (Sau reload, thấy B isExtra với 400, có dòng D mới rỗng)
  5. Nhập 400 cho C, 350 cho D → save
- **Expected**:
  - Assignment cuối = [C, D]
  - ProductionLog: 4 dòng — A=600, B=400, C=400, D=350
  - UI cuối: 4 dòng, A và B locked (isExtra), C và D normal

### TC7 — Thêm MH song song giữa ca

- **Setup**: Máy 1 có [A, B] đầu ca
- **Action**: Bấm ➕ → chọn C + lô C → xác nhận
- **Expected**:
  - Assignment thành [A, B, C]
  - Reload UI: thấy 3 ô nhập (A, B đã có data; C rỗng chờ nhập)
  - Ca sau mở lại máy này: vẫn thấy [A, B, C] vì assignment đã được cập nhật

### TC8 — Sửa sai MH (chưa từng chạy)

- **Setup**: Máy 1 có assignment [A], chưa nhập log nào trong ca này
- **Action**: Bấm ✏️ trên dòng A → đổi thành B → xác nhận
- **Expected**:
  - Assignment thành [B]
  - ProductionLog: không có dòng nào (vì A chưa từng có log)

### TC9 — Sửa sai MH (đã lỡ nhập log)

- **Setup**: Máy 1 có assignment [A], lỡ nhập 200kg cho A (nhưng thực ra máy đang chạy B từ đầu ca)
- **Action**: Bấm ✏️ trên dòng A → đổi thành B → xác nhận
- **Expected**:
  - Assignment thành [B]
  - ProductionLog: dòng A bị xóa, không có dòng nào cho ca này
  - (User cần nhập lại sản lượng cho B)

### TC10 — (đã merge vào TC10 mới ở trên — case "Đổi nhiều dòng cùng lúc")

### TC11 — Refresh giữa ca 2 (sang ca mới sau khi đổi)

- **Setup**: Sau TC5, đã sang ca 2
- **Action**: Mở mobile-winding cho máy 1, ca 2
- **Expected**: Chỉ thấy [A, C] (assignment hiện tại). Log B của ca 1 không xuất hiện trong ca 2.

---

## 10. VERIFY CHECKLIST

```bash
# 1. Schema
grep -n "@@unique" prisma/schema.prisma | grep -E "production_logs|machine_item_assignments"
# Expected: KHÔNG còn @@unique cũ

# 2. Migration
ls prisma/migrations/ | grep shift_item_change_multi_lot
psql -d phubai_erp -c "\d production_logs" | grep "prod_log_unique"
# Expected: thấy 2 partial index prod_log_unique_with_lot và prod_log_unique_no_lot

# 3. API daily-input
grep -n "upsert\|findFirst" src/app/api/production/daily-input/route.ts
# Expected: không còn upsert, có findFirst

# 4. API assignments
grep -n "PATCH" src/app/api/machines/\[id\]/assignments/route.ts
# Expected: không còn export async function PATCH

# 5. API daily-status include lot
grep -A 5 "productionLogs:" src/app/api/production/daily-status/route.ts | grep "lot:"
# Expected: thấy lot: { select: { id, lotNumber } }

# 6. UI machines validate
grep -n "Mặt hàng.*trùng\|phải chọn lô" src/app/machines/page.tsx
# Expected: thấy message.error tiếng Việt

# 7. UI mobile-winding buildMachineItems
grep -n "usedLogIds" src/app/production/mobile-winding/page.tsx
# Expected: thấy logic merge mới

# 8. UI mobile-winding 3 thao tác
grep -nE "handleEditCorrection|handleChangeItem|handleStopItem|handleAddItem" src/app/production/mobile-winding/page.tsx
# Expected: thấy 4 hàm
```

### Test integration

1. Tạo dữ liệu test: máy 3 NM1, gán [30CM/MD + L-NM1-007, 30CM/MD + L-NM2-003]
2. Mở mobile-winding ca 1, nhập sản lượng cho cả 2 dòng → save
3. Mở Prisma Studio xem `production_logs` có 2 dòng cùng (machineId=3, date, shift=1, itemId=...) khác lotId
4. Chạy TC1 đến TC11 lần lượt

---

## 11. GHI CHÚ TRIỂN KHAI

1. **Đọc trước**: Spec này, `BUSINESS_LOGIC_CONTEXT.md` (nếu có), và 5 file source liệt kê ở phần đầu.

2. **Thứ tự triển khai khuyến nghị**:
   1. Schema + migration + verify trên DB local
   2. API daily-input refactor → test bằng Postman/Insomnia
   3. API daily-status thêm include lot
   4. API assignments validate + bỏ PATCH
   5. UI machines (validate client)
   6. UI mobile-winding (fix Bug 1 + 3 modal mới)
   7. Chạy TC1-TC11

3. **Schema drift trên production**: Nếu `prisma migrate deploy` fail (P3018/42710), dùng workflow đã quen:
   - Chạy SQL thủ công trên prod
   - `npx prisma migrate resolve --applied <name>`

4. **Backward compat**: Data cũ có `lotId = NULL` vẫn hoạt động bình thường nhờ partial index `prod_log_unique_no_lot` (4 cột). Không backfill.

5. **Performance**: 2 partial index thay 1 unique đầy đủ — không tệ hơn, vì query SUM dashboard không filter `WHERE lotId IS NULL` thì index không liên quan.

6. **Khi nào nên cho phép `lotId = NULL` trong assignment**: Các máy thuộc công đoạn KHÔNG phải máy ống NM1/NM2 (ví dụ sợi con, đậu xe) không cần lô. Logic này quyết định ở UI/form — schema không ép. Trang machines/page.tsx có thể detect `process.code` hoặc tương tự để show/hide cột "Lô" trong form.
