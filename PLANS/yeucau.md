# SPEC: Cơ cấu NVL theo mặt hàng theo tháng (ItemMonthlyMaterial)

> **Ngày:** 2026-05-28
> **Mục đích:** Cho phép kế toán chọn loại bông + loại xơ cho từng mặt hàng theo từng tháng. Calculator query đúng giá NVL khi tính CP biến đổi, không còn lấy `cottonPrices[0]` mặc định.
> **Phạm vi:** Schema + Migration + API + UI + Sửa Calculator

---

## BỐI CẢNH NGHIỆP VỤ

Hiện tại:

- `MaterialPrice` lưu giá theo (materialType, yearMonth) — VD: Cotton AUS = 1.74 USD T5/2026
- `RawMaterialRate` lưu tỷ lệ pha (cottonRatio) + định mức tiêu hao (cottonRate, peRate) cho từng mặt hàng
- Calculator hiện lấy `cottonPrices[0]` và `pePrices[0]` → SAI khi có nhiều loại bông/xơ (Cotton Úc/Mỹ/Brazil/Tây Phi, PE Benma, Modal Liva Eco)

Thực tế:

- Mỗi mặt hàng trong 1 tháng dùng **đúng 1 loại bông** và **đúng 1 loại xơ** (không trộn)
- Tỷ lệ pha cố định theo dòng sợi (đã có)
- Định mức tiêu hao cố định theo dòng sợi (đã có)
- Cái thay đổi theo tháng: dùng loại bông nào, loại xơ nào
- NVL mua chung cho 3 nhà máy → không phân factory

---

## 1. SCHEMA

### File: `prisma/schema.prisma`

Thêm model mới:

```prisma
/// Cơ cấu NVL của mặt hàng theo tháng.
/// Mỗi đầu tháng kế toán chọn: mặt hàng X tháng này dùng loại bông nào, xơ nào.
/// Calculator query đúng MaterialPrice theo lựa chọn này.
model ItemMonthlyMaterial {
  id                   Int    @id @default(autoincrement())
  itemId               Int
  yearMonth            String @db.VarChar(7)  // "2026-05"

  /// Loại bông dùng (Cotton AUS, US-PVC, Brazil...). NULL nếu không dùng cotton (hiếm).
  cottonMaterialTypeId Int?
  /// Loại xơ nhân tạo (PE Benma, Modal Liva Eco...). NULL nếu sợi thuần cotton.
  peMaterialTypeId     Int?

  note                 String?

  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  item                 Item          @relation(fields: [itemId], references: [id], onDelete: Cascade)
  cottonMaterialType   MaterialType? @relation("ItemMonthlyCotton", fields: [cottonMaterialTypeId], references: [id])
  peMaterialType       MaterialType? @relation("ItemMonthlyPe",     fields: [peMaterialTypeId],     references: [id])

  @@unique([itemId, yearMonth])
  @@index([yearMonth])
  @@map("item_monthly_materials")
}
```

### Bổ sung relation ngược:

```prisma
model Item {
  // ... fields hiện có ...
  monthlyMaterials ItemMonthlyMaterial[]
}

model MaterialType {
  // ... fields hiện có ...
  itemMonthlyCotton ItemMonthlyMaterial[] @relation("ItemMonthlyCotton")
  itemMonthlyPe     ItemMonthlyMaterial[] @relation("ItemMonthlyPe")
}
```

> Cần 2 relation đặt tên vì 1 model `MaterialType` được tham chiếu 2 lần từ `ItemMonthlyMaterial` (cottonMaterialTypeId + peMaterialTypeId).

---

## 2. MIGRATION

### Tạo migration

```bash
npx prisma migrate dev --name add_item_monthly_material
```

### SỬA file migration.sql thành idempotent (theo pattern SPEC 0)

```sql
CREATE TABLE IF NOT EXISTS "item_monthly_materials" (
  "id" SERIAL PRIMARY KEY,
  "itemId" INTEGER NOT NULL,
  "yearMonth" VARCHAR(7) NOT NULL,
  "cottonMaterialTypeId" INTEGER,
  "peMaterialTypeId" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "item_monthly_materials_itemId_yearMonth_key"
  ON "item_monthly_materials"("itemId", "yearMonth");
CREATE INDEX IF NOT EXISTS "item_monthly_materials_yearMonth_idx"
  ON "item_monthly_materials"("yearMonth");

DO $$ BEGIN
  ALTER TABLE "item_monthly_materials" ADD CONSTRAINT "imm_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "item_monthly_materials" ADD CONSTRAINT "imm_cotton_fkey"
    FOREIGN KEY ("cottonMaterialTypeId") REFERENCES "material_types"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "item_monthly_materials" ADD CONSTRAINT "imm_pe_fkey"
    FOREIGN KEY ("peMaterialTypeId") REFERENCES "material_types"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

### Deploy lên server (theo SPEC 0 mục DEPLOY)

```bash
# Backup
pg_dump ... -f backup_$(date +%Y%m%d_%H%M).dump

# Migrate
npx prisma migrate deploy
# Nếu lỗi P3018 → chạy SQL thủ công + prisma migrate resolve --applied

npx prisma generate
npm run build
pm2 restart phubai-erp
```

---

## 3. API CRUD

### File MỚI: `src/app/api/kdsx/item-monthly-materials/route.ts`

#### GET — Lấy danh sách cho 1 tháng

```
GET /api/kdsx/item-monthly-materials?yearMonth=2026-05
```

Logic:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const yearMonth = new URL(req.url).searchParams.get("yearMonth") ?? "";
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { error: "yearMonth không hợp lệ" },
      { status: 400 },
    );
  }

  // Lấy tất cả mặt hàng active + định mức + cấu hình NVL tháng này
  const items = await prisma.item.findMany({
    where: { isActive: true },
    include: {
      // Định mức hiệu lực — RawMaterialRate effectiveTo IS NULL
      rawMaterialRates: {
        where: { effectiveTo: null },
        take: 1,
        orderBy: { effectiveFrom: "desc" },
      },
      monthlyMaterials: {
        where: { yearMonth },
        include: {
          cottonMaterialType: {
            select: { id: true, name: true, category: true },
          },
          peMaterialType: { select: { id: true, name: true, category: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Format response
  const rows = items.map((item) => {
    const rate = item.rawMaterialRates[0];
    const mm = item.monthlyMaterials[0];
    return {
      itemId: item.id,
      itemName: item.name,
      cottonRatio: rate?.cottonRatio ?? null,
      cottonRate: rate?.cottonRate ?? null,
      peRate: rate?.peRate ?? null,
      isPureCotton: (rate?.cottonRatio ?? 1) >= 1.0,
      cottonMaterialType: mm?.cottonMaterialType ?? null,
      peMaterialType: mm?.peMaterialType ?? null,
      note: mm?.note ?? null,
    };
  });

  return NextResponse.json({ rows });
}
```

#### POST — Lưu nhiều dòng cùng lúc (upsert)

```
POST /api/kdsx/item-monthly-materials
Body: { yearMonth, items: [...] }
```

```typescript
export async function POST(req: NextRequest) {
  const { yearMonth, items } = await req.json();
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { error: "yearMonth không hợp lệ" },
      { status: 400 },
    );
  }

  for (const it of items) {
    await prisma.itemMonthlyMaterial.upsert({
      where: { itemId_yearMonth: { itemId: it.itemId, yearMonth } },
      create: {
        itemId: it.itemId,
        yearMonth,
        cottonMaterialTypeId: it.cottonMaterialTypeId ?? null,
        peMaterialTypeId: it.peMaterialTypeId ?? null,
        note: it.note ?? null,
      },
      update: {
        cottonMaterialTypeId: it.cottonMaterialTypeId ?? null,
        peMaterialTypeId: it.peMaterialTypeId ?? null,
        note: it.note ?? null,
      },
    });
  }
  return NextResponse.json({ success: true, saved: items.length });
}
```

### File MỚI: `src/app/api/kdsx/item-monthly-materials/copy-from-previous/route.ts`

```typescript
// POST — copy cấu hình từ tháng trước
export async function POST(req: NextRequest) {
  const { yearMonth, sourceYearMonth } = await req.json();
  const sources = await prisma.itemMonthlyMaterial.findMany({
    where: { yearMonth: sourceYearMonth },
  });
  let copied = 0;
  for (const s of sources) {
    await prisma.itemMonthlyMaterial.upsert({
      where: { itemId_yearMonth: { itemId: s.itemId, yearMonth } },
      create: {
        itemId: s.itemId,
        yearMonth,
        cottonMaterialTypeId: s.cottonMaterialTypeId,
        peMaterialTypeId: s.peMaterialTypeId,
        note: s.note
          ? `Copy từ ${sourceYearMonth}: ${s.note}`
          : `Copy từ ${sourceYearMonth}`,
      },
      update: {}, // Đã có thì giữ nguyên (không ghi đè)
    });
    copied++;
  }
  return NextResponse.json({ copied });
}
```

---

## 4. UI TRANG MỚI: `/kdsx/item-monthly-materials`

### Triết lý thiết kế — TỐI THIỂU THAO TÁC

Thực tế: 80-90% mặt hàng trong 1 tháng dùng chung loại bông, chỉ vài mặt hàng đặc biệt. Vì vậy UI cần các tiện ích hàng loạt:

1. **Checkbox + thanh hành động hàng loạt** — tích nhiều dòng, đặt loại bông/xơ cho tất cả 1 lượt
2. **Link "Đặt tất cả →" trên header cột** — áp 1 loại cho TOÀN bảng (logic bỏ qua dòng không phù hợp)
3. **Highlight ô khác đa số** (màu vàng nhạt) — dòng nào dùng loại NVL khác với "đa số" thì nổi lên để review
4. **Quick filter** — lọc theo trạng thái: chưa cấu hình, dùng loại X, sợi thuần,...

Quy trình điển hình đầu tháng: vào trang → "Copy tháng trước" → đa số đúng → tích 2-3 dòng đặc biệt → thanh xanh hiện → chọn loại mới → "Áp dụng" → Lưu. Tổng cộng ~30 giây.

### File MỚI: `src/app/kdsx/item-monthly-materials/page.tsx`

```tsx
"use client";
import { useState, useEffect, useMemo } from "react";
import {
  Table,
  Select,
  DatePicker,
  Button,
  Space,
  message,
  Tag,
  Typography,
  Modal,
  Checkbox,
  Popover,
  Segmented,
  Input,
} from "antd";
import {
  CopyOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  FilterOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

const { Text } = Typography;

interface Row {
  itemId: number;
  itemName: string;
  cottonRatio: number | null;
  cottonRate: number | null;
  peRate: number | null;
  isPureCotton: boolean;
  cottonMaterialType: { id: number; name: string } | null;
  peMaterialType: { id: number; name: string } | null;
}

interface MaterialType {
  id: number;
  name: string;
  category: string;
}

// Option đặc biệt cho dropdown bulk — "(không đổi)" để chỉ đổi 1 cột
const KEEP_AS_IS = -1;
const CLEAR_VALUE = -2;

export default function ItemMonthlyMaterialPage() {
  const [yearMonth, setYearMonth] = useState(dayjs().format("YYYY-MM"));
  const [rows, setRows] = useState<Row[]>([]);
  const [cottonTypes, setCottonTypes] = useState<MaterialType[]>([]);
  const [peTypes, setPeTypes] = useState<MaterialType[]>([]);
  const [loading, setLoading] = useState(false);
  const [edited, setEdited] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Bulk bar state
  const [bulkCotton, setBulkCotton] = useState<number>(KEEP_AS_IS);
  const [bulkPe, setBulkPe] = useState<number>(KEEP_AS_IS);

  // Filter
  const [filter, setFilter] = useState<
    "ALL" | "UNCONFIGURED" | "PURE_COTTON" | "BLEND"
  >("ALL");
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [rowsRes, typesRes] = await Promise.all([
      fetch(`/api/kdsx/item-monthly-materials?yearMonth=${yearMonth}`).then(
        (r) => r.json(),
      ),
      fetch(`/api/kdsx/material-types`).then((r) => r.json()),
    ]);
    setRows(rowsRes.rows ?? []);
    const types = typesRes.materialTypes ?? typesRes ?? [];
    setCottonTypes(types.filter((t: MaterialType) => t.category === "COTTON"));
    setPeTypes(types.filter((t: MaterialType) => t.category === "PE"));
    setLoading(false);
    setEdited(false);
    setSelectedIds([]);
  };

  useEffect(() => {
    fetchData();
  }, [yearMonth]);

  // Lọc dòng hiển thị
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (search && !r.itemName.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (filter === "UNCONFIGURED")
        return !r.cottonMaterialType && !r.peMaterialType;
      if (filter === "PURE_COTTON") return r.isPureCotton;
      if (filter === "BLEND") return !r.isPureCotton && r.cottonRatio != null;
      return true;
    });
  }, [rows, filter, search]);

  // Tính "đa số" để highlight ô khác
  const majorityCotton = useMemo(
    () => findMajority(rows.map((r) => r.cottonMaterialType?.id)),
    [rows],
  );
  const majorityPe = useMemo(
    () =>
      findMajority(
        rows.filter((r) => !r.isPureCotton).map((r) => r.peMaterialType?.id),
      ),
    [rows],
  );

  // Đổi giá trị 1 dòng
  const updateRow = (
    itemId: number,
    field: "cottonMaterialType" | "peMaterialType",
    typeId: number | null,
  ) => {
    setRows((rs) =>
      rs.map((r) => {
        if (r.itemId !== itemId) return r;
        if (typeId == null) return { ...r, [field]: null };
        const list = field === "cottonMaterialType" ? cottonTypes : peTypes;
        const t = list.find((x) => x.id === typeId);
        return { ...r, [field]: t ? { id: t.id, name: t.name } : null };
      }),
    );
    setEdited(true);
  };

  // Áp dụng hàng loạt cho các dòng đã chọn
  const handleBulkApply = () => {
    if (selectedIds.length === 0) {
      message.warning("Chưa chọn dòng nào");
      return;
    }
    if (bulkCotton === KEEP_AS_IS && bulkPe === KEEP_AS_IS) {
      message.warning("Chưa chọn loại NVL nào để áp dụng");
      return;
    }

    setRows((rs) =>
      rs.map((r) => {
        if (!selectedIds.includes(r.itemId)) return r;
        const next = { ...r };
        // Áp cotton
        if (bulkCotton !== KEEP_AS_IS) {
          if (bulkCotton === CLEAR_VALUE) next.cottonMaterialType = null;
          else {
            const t = cottonTypes.find((x) => x.id === bulkCotton);
            if (t) next.cottonMaterialType = { id: t.id, name: t.name };
          }
        }
        // Áp pe — chỉ áp cho dòng KHÔNG phải sợi thuần
        if (bulkPe !== KEEP_AS_IS && !r.isPureCotton) {
          if (bulkPe === CLEAR_VALUE) next.peMaterialType = null;
          else {
            const t = peTypes.find((x) => x.id === bulkPe);
            if (t) next.peMaterialType = { id: t.id, name: t.name };
          }
        }
        return next;
      }),
    );
    setEdited(true);
    message.success(`Đã áp dụng cho ${selectedIds.length} dòng`);
    setBulkCotton(KEEP_AS_IS);
    setBulkPe(KEEP_AS_IS);
  };

  // Đặt tất cả cho 1 cột (từ link header)
  const handleSetAll = (field: "cotton" | "pe", typeId: number) => {
    const list = field === "cotton" ? cottonTypes : peTypes;
    const t = list.find((x) => x.id === typeId);
    if (!t) return;
    setRows((rs) =>
      rs.map((r) => {
        // Cột pe: bỏ qua sợi thuần
        if (field === "pe" && r.isPureCotton) return r;
        const key =
          field === "cotton" ? "cottonMaterialType" : "peMaterialType";
        return { ...r, [key]: { id: t.id, name: t.name } };
      }),
    );
    setEdited(true);
    message.success(`Đã đặt "${t.name}" cho tất cả dòng phù hợp`);
  };

  const handleSave = async () => {
    const payload = rows.map((r) => ({
      itemId: r.itemId,
      cottonMaterialTypeId: r.cottonMaterialType?.id ?? null,
      peMaterialTypeId: r.peMaterialType?.id ?? null,
    }));
    await fetch("/api/kdsx/item-monthly-materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearMonth, items: payload }),
    });
    message.success("Đã lưu cơ cấu NVL");
    fetchData();
  };

  const handleCopyPrev = () => {
    const prev = dayjs(yearMonth).subtract(1, "month").format("YYYY-MM");
    Modal.confirm({
      title: `Copy cơ cấu từ tháng ${prev}?`,
      content:
        "Mặt hàng đã cấu hình ở tháng hiện tại sẽ giữ nguyên. Chỉ điền các mặt hàng còn trống.",
      onOk: async () => {
        const res = await fetch(
          "/api/kdsx/item-monthly-materials/copy-from-previous",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ yearMonth, sourceYearMonth: prev }),
          },
        );
        const data = await res.json();
        message.success(`Đã copy ${data.copied} cấu hình`);
        fetchData();
      },
    });
  };

  // Options cho bulk dropdown — thêm "(không đổi)" và "(xóa)"
  const cottonOptions = [
    { value: KEEP_AS_IS, label: "(không đổi)" },
    { value: CLEAR_VALUE, label: "(xóa giá trị)" },
    ...cottonTypes.map((t) => ({ value: t.id, label: t.name })),
  ];
  const peOptions = [
    { value: KEEP_AS_IS, label: "(không đổi)" },
    { value: CLEAR_VALUE, label: "(xóa giá trị)" },
    ...peTypes.map((t) => ({ value: t.id, label: t.name })),
  ];

  // Popover content "Đặt tất cả"
  const setAllPopover = (field: "cotton" | "pe") => {
    const opts = field === "cotton" ? cottonTypes : peTypes;
    return (
      <div style={{ minWidth: 200 }}>
        <Text strong>
          Đặt {field === "cotton" ? "loại bông" : "loại xơ"} cho tất cả dòng:
        </Text>
        <Select
          autoFocus
          style={{ width: "100%", marginTop: 8 }}
          placeholder="Chọn..."
          options={opts.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => handleSetAll(field, v)}
        />
        {field === "pe" && (
          <Text
            type="secondary"
            style={{ fontSize: 11, display: "block", marginTop: 6 }}
          >
            Sợi 100% cotton sẽ được bỏ qua
          </Text>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* THANH CÔNG CỤ CHÍNH */}
      <Space style={{ marginBottom: 12 }} wrap>
        <DatePicker
          picker="month"
          value={dayjs(yearMonth)}
          format="MM/YYYY"
          onChange={(d) => d && setYearMonth(d.format("YYYY-MM"))}
        />
        <Button icon={<CopyOutlined />} onClick={handleCopyPrev}>
          Copy tháng trước
        </Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          disabled={!edited}
        >
          Lưu
        </Button>
        <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
          {rows.length} mặt hàng ·{" "}
          {rows.filter((r) => r.cottonMaterialType || r.peMaterialType).length}{" "}
          đã cấu hình ·{" "}
          {
            rows.filter((r) => !r.cottonMaterialType && !r.peMaterialType)
              .length
          }{" "}
          còn trống
        </Text>
      </Space>

      {/* THANH BULK ACTION — chỉ hiện khi có dòng được chọn */}
      {selectedIds.length > 0 && (
        <div
          style={{
            background: "#E6F7FF",
            border: "1px solid #91D5FF",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 12,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Text strong style={{ color: "#0958D9" }}>
            <ThunderboltOutlined /> {selectedIds.length} mặt hàng đã chọn
          </Text>
          <Text>·</Text>
          <Text>Loại bông:</Text>
          <Select
            size="small"
            style={{ width: 200 }}
            value={bulkCotton}
            onChange={setBulkCotton}
            options={cottonOptions}
          />
          <Text>Loại xơ:</Text>
          <Select
            size="small"
            style={{ width: 200 }}
            value={bulkPe}
            onChange={setBulkPe}
            options={peOptions}
          />
          <Button size="small" type="primary" onClick={handleBulkApply}>
            Áp dụng cho {selectedIds.length} dòng
          </Button>
          <Button
            size="small"
            onClick={() => setSelectedIds([])}
            style={{ marginLeft: "auto" }}
          >
            Bỏ chọn
          </Button>
        </div>
      )}

      {/* THANH FILTER */}
      <Space style={{ marginBottom: 12 }}>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as typeof filter)}
          options={[
            { label: "Tất cả", value: "ALL" },
            { label: "Chưa cấu hình", value: "UNCONFIGURED" },
            { label: "Sợi thuần", value: "PURE_COTTON" },
            { label: "Sợi pha", value: "BLEND" },
          ]}
        />
        <Input
          placeholder="Tìm mặt hàng..."
          prefix={<FilterOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 200 }}
        />
      </Space>

      {/* BẢNG CHÍNH */}
      <Table
        dataSource={filteredRows}
        rowKey="itemId"
        loading={loading}
        pagination={{ pageSize: 30 }}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as number[]),
        }}
        columns={[
          {
            title: "Mặt hàng",
            dataIndex: "itemName",
            width: 180,
            render: (n) => <Text strong>{n}</Text>,
            sorter: (a, b) => a.itemName.localeCompare(b.itemName),
          },
          {
            title: "Tỷ lệ pha",
            key: "ratio",
            width: 110,
            align: "center",
            render: (_, r) =>
              r.cottonRatio == null ? (
                <Tag>Chưa có ĐM</Tag>
              ) : r.isPureCotton ? (
                <Tag color="orange">100% cotton</Tag>
              ) : (
                <Tag color="blue">{`${Math.round(r.cottonRatio * 100)}/${Math.round((1 - r.cottonRatio) * 100)}`}</Tag>
              ),
          },
          {
            title: (
              <Space>
                <span>Loại bông</span>
                <Popover
                  content={setAllPopover("cotton")}
                  trigger="click"
                  placement="bottomLeft"
                >
                  <a style={{ fontSize: 11, fontWeight: 400 }}>Đặt tất cả →</a>
                </Popover>
              </Space>
            ),
            key: "cotton",
            width: 240,
            render: (_, r) => {
              const isDifferent =
                majorityCotton != null &&
                r.cottonMaterialType?.id != null &&
                r.cottonMaterialType.id !== majorityCotton;
              return (
                <Select
                  placeholder="Chọn loại bông..."
                  allowClear
                  style={{
                    width: "100%",
                    background: isDifferent ? "#FFF7E6" : undefined,
                  }}
                  value={r.cottonMaterialType?.id}
                  onChange={(v) =>
                    updateRow(r.itemId, "cottonMaterialType", v ?? null)
                  }
                  options={cottonTypes.map((t) => ({
                    value: t.id,
                    label: t.name,
                  }))}
                />
              );
            },
          },
          {
            title: (
              <Space>
                <span>Loại xơ</span>
                <Popover
                  content={setAllPopover("pe")}
                  trigger="click"
                  placement="bottomLeft"
                >
                  <a style={{ fontSize: 11, fontWeight: 400 }}>Đặt tất cả →</a>
                </Popover>
              </Space>
            ),
            key: "pe",
            width: 240,
            render: (_, r) => {
              if (r.isPureCotton) {
                return (
                  <Text type="secondary" italic>
                    Sợi thuần — không dùng
                  </Text>
                );
              }
              const isDifferent =
                majorityPe != null &&
                r.peMaterialType?.id != null &&
                r.peMaterialType.id !== majorityPe;
              return (
                <Select
                  placeholder="Chọn loại xơ..."
                  allowClear
                  style={{
                    width: "100%",
                    background: isDifferent ? "#FFF7E6" : undefined,
                  }}
                  value={r.peMaterialType?.id}
                  onChange={(v) =>
                    updateRow(r.itemId, "peMaterialType", v ?? null)
                  }
                  options={peTypes.map((t) => ({ value: t.id, label: t.name }))}
                />
              );
            },
          },
          {
            title: "TH Cotton",
            dataIndex: "cottonRate",
            width: 90,
            align: "center",
            render: (v) => (v != null ? v.toFixed(2) : "—"),
          },
          {
            title: "TH Xơ",
            dataIndex: "peRate",
            width: 90,
            align: "center",
            render: (v, r) =>
              r.isPureCotton ? "—" : v != null ? v.toFixed(2) : "—",
          },
        ]}
      />
    </div>
  );
}

// Helper: tìm giá trị xuất hiện nhiều nhất
function findMajority(values: (number | null | undefined)[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) {
    if (v == null) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let majority: number | null = null;
  let maxCount = 0;
  for (const [k, c] of counts) {
    if (c > maxCount) {
      maxCount = c;
      majority = k;
    }
  }
  // Chỉ tính "đa số" khi có ít nhất 2 dòng cùng giá trị (tránh false-positive khi mới có vài dòng)
  return maxCount >= 2 ? majority : null;
}
```

### Tóm tắt các tiện ích trong UI

| Tiện ích                            | Cách hoạt động                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Checkbox + Bulk bar**             | Tích nhiều dòng → thanh xanh hiện. Có dropdown loại bông + loại xơ. Option "(không đổi)" để chỉ đổi 1 cột. Option "(xóa giá trị)" để clear. |
| **Link "Đặt tất cả →" trên header** | Click → popover chọn loại NVL → áp cho TOÀN bảng. Cột "Loại xơ" tự bỏ qua sợi thuần.                                                        |
| **Highlight vàng**                  | Ô nào dùng loại NVL khác với "đa số" (≥2 dòng cùng giá trị) thì có nền vàng nhạt → review dễ.                                               |
| **Filter Segmented**                | Tất cả / Chưa cấu hình / Sợi thuần / Sợi pha → giảm số dòng hiển thị.                                                                       |
| **Search box**                      | Tìm theo tên mặt hàng.                                                                                                                      |
| **Stats**                           | Hiển thị "28 mặt hàng · 24 đã cấu hình · 4 còn trống" để biết tiến độ.                                                                      |

### Quy trình điển hình đầu tháng (~30 giây)

1. Mở trang → bấm **"Copy tháng trước"** → đa số dòng đã đúng
2. Bấm filter **"Chưa cấu hình"** → chỉ thấy dòng cần điền
3. **Tích chọn các dòng** dùng chung loại bông X → thanh xanh hiện → chọn bông X → "Áp dụng"
4. Lặp lại cho các nhóm khác (nếu có)
5. Bấm **"Lưu"**

### Sidebar

Thêm link sau "Giá NVL":

```tsx
{ key: "item-monthly-materials", label: "Cơ cấu NVL theo tháng",
  icon: <DatabaseOutlined />, path: "/kdsx/item-monthly-materials" }
```

---

## 5. SỬA CALCULATOR

### File: `src/lib/kdsx/calculator-v2.ts`

Tìm chỗ lấy `latestCottonPrice` và `latestPePrice`. SỬA logic để query theo `itemMonthlyMaterial`:

```typescript
// CŨ:
// const cottonPrices = await prisma.materialPrice.findMany({ where: { materialType: { category: "COTTON" } }, ... });
// const latestCottonPrice = cottonPrices[0]?.priceUsd ?? 0;

// MỚI: query theo Item và yearMonth
async function getMaterialPrices(itemId: number, yearMonth: string) {
  // 1. Tìm cấu hình NVL cho item này trong tháng — fallback tháng gần nhất
  const config = await prisma.itemMonthlyMaterial.findFirst({
    where: { itemId, yearMonth: { lte: yearMonth } },
    orderBy: { yearMonth: "desc" },
  });

  let cottonPrice = 0;
  let pePrice = 0;
  let cottonFromMonth: string | null = null;
  let peFromMonth: string | null = null;

  if (config?.cottonMaterialTypeId) {
    const cp = await prisma.materialPrice.findFirst({
      where: {
        materialTypeId: config.cottonMaterialTypeId,
        yearMonth: { lte: yearMonth },
      },
      orderBy: { yearMonth: "desc" },
    });
    cottonPrice = cp?.priceUsd ?? 0;
    cottonFromMonth = cp?.yearMonth ?? null;
  }

  if (config?.peMaterialTypeId) {
    const pp = await prisma.materialPrice.findFirst({
      where: {
        materialTypeId: config.peMaterialTypeId,
        yearMonth: { lte: yearMonth },
      },
      orderBy: { yearMonth: "desc" },
    });
    pePrice = pp?.priceUsd ?? 0;
    peFromMonth = pp?.yearMonth ?? null;
  }

  return {
    cottonPrice,
    pePrice,
    configYearMonth: config?.yearMonth ?? null,
    cottonFromMonth,
    peFromMonth,
    hasConfig: !!config,
  };
}
```

Trong hàm tính CP cho mỗi line, gọi:

```typescript
const mp = await getMaterialPrices(line.itemId, yearMonth);
const cottonPrice = mp.cottonPrice;
const pePrice = mp.pePrice;

// Công thức GIỮ NGUYÊN, chỉ đổi nguồn giá
const avgCottonPrice = cottonPrice + warehouseFee;
const cottonCostVnd =
  qty * rate.cottonRate * avgCottonPrice * rate.cottonRatio * exchangeRate;

const peCostVnd =
  rate.cottonRatio >= 1.0 || !mp.pePrice
    ? 0
    : qty * rate.peRate * pePrice * (1 - rate.cottonRatio) * exchangeRate;

// Trả về metadata cho warning hiển thị trên dashboard
return {
  ...other,
  cottonCostVnd,
  peCostVnd,
  _materialMeta: {
    hasConfig: mp.hasConfig,
    configYearMonth: mp.configYearMonth,
    cottonFromMonth: mp.cottonFromMonth,
    peFromMonth: mp.peFromMonth,
  },
};
```

---

## 6. CẢNH BÁO TRÊN DASHBOARD

Khi calculator trả `_materialMeta.configYearMonth !== yearMonth` → đang fallback. Dashboard hiện banner:

```tsx
{
  warnings.length > 0 && (
    <Alert
      type="warning"
      showIcon
      message="Một số mặt hàng đang dùng cấu hình NVL của tháng cũ"
      description={
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {warnings.map((w) => (
            <li key={w.itemId}>
              {w.itemName}: dùng cấu hình tháng {w.configYearMonth}
            </li>
          ))}
        </ul>
      }
      action={
        <Button
          size="small"
          onClick={() => router.push("/kdsx/item-monthly-materials")}
        >
          Cập nhật ngay
        </Button>
      }
    />
  );
}
```

---

## 7. VERIFY

- [ ] Migration tạo bảng `item_monthly_materials` OK
- [ ] Bảng có 2 FK đến MaterialType (cotton + pe)
- [ ] `npx prisma generate` OK
- [ ] Trang `/kdsx/item-monthly-materials` hiển thị tất cả mặt hàng active
- [ ] Cột tỷ lệ pha hiển thị đúng (100% / 60-40 / 70-30...)
- [ ] Mặt hàng `cottonRatio >= 1.0` → dropdown PE bị disable
- [ ] Chọn loại bông + xơ → lưu OK
- [ ] Copy từ tháng trước hoạt động đúng (chỉ điền vào ô trống)
- [ ] Calculator dùng đúng giá theo từng mặt hàng
- [ ] Đổi loại bông cho 1 mặt hàng → dashboard CP thay đổi tương ứng
- [ ] Không nhập cấu hình tháng hiện tại → fallback tháng gần nhất + cảnh báo
- [ ] Test với Excel: tổng CP cotton, PE khớp công thức `D × G35 × G4x` và `D × K35 × 0.4 × I35`

---

## 8. SO SÁNH VỚI EXCEL ĐỂ KIỂM TRA

Lấy 2 mặt hàng tiêu biểu:

**30COCD** (100% cotton AUS):

- Cấu hình: cotton = "Bông AUS", pe = NULL
- Excel: `G8 = D8 × 1.74 × 1.14` (cotton 100%, tiêu hao 1.14)
- PM phải ra cùng số khi qty + yearMonth + cấu hình giống

**32CRC** (60% cotton + 40% Modal Liva):

- Cấu hình: cotton = "Bông AUS", pe = "Modal Liva Eco"
- Excel cotton: `G27 = D27 × 1.74 × 0.6 × 1.35`
- Excel modal: `H27 = D27 × 1.72 × 1.04 × 0.4`
- PM phải khớp cả 2 phần

---

## GHI CHÚ CHO CLAUDE CODE

1. **ĐỌC TRƯỚC:** `calculator-v2.ts`, `material-prices/page.tsx`, schema models `MaterialPrice`, `MaterialType`, `RawMaterialRate`, `Item`
2. **KIỂM TRA** `MaterialType.category` có chính xác "COTTON" và "PE" không. Nếu có thêm "MODAL" thì categorize lại logic lọc dropdown (PE + MODAL gộp vào dropdown "Loại xơ")
3. **API material-types** — kiểm tra đã có chưa, nếu chưa thì tạo mới: `GET /api/kdsx/material-types`
4. **KHÔNG SỬA** `RawMaterialRate` — vẫn dùng cho cottonRatio + cottonRate + peRate
5. **Backward compat:** mặt hàng chưa có ItemMonthlyMaterial → fallback tháng gần nhất, không break calculator
6. Đảm bảo migration idempotent (IF NOT EXISTS, DO block) trước khi deploy
