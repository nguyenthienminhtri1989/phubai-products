# SPEC — Tab "Báo cáo theo nguồn sợi" trong `/production/history`

> **Phiên bản:** 1.0 — 2026-06-24
> **Vai trò:** Bổ sung báo cáo chuyên biệt cho công đoạn ống — phân tách sản lượng/doanh thu theo nguồn sợi (G33/TQ/G37) và quy về nhà máy doanh thu (NM1/NM2). Đặt làm tab phụ trong trang `/production/history` hiện có, không tạo route/menu mới.
> **Phụ thuộc:** `SPEC_SOURCE_PROCESS_FOR_REVENUE` và `SPEC_PATCH_SOURCE_PROCESS_PER_ITEM` đã triển khai (`ProductionLog.sourceProcessId`, `Process.revenueFactoryId` đã có dữ liệu).

---

## BỐI CẢNH

Trang `/production/history` hiện tại là tra cứu lịch sử chi tiết toàn nhà máy (mọi công đoạn) với filter đa cấp, bảng chi tiết edit/delete admin, biểu đồ phân bố theo process, export Excel. Phục vụ vận hành và admin.

Báo cáo phân tách doanh thu theo nguồn sợi có mục tiêu khác hẳn — phục vụ phòng KD/lãnh đạo, format giống Excel TH-DT (Ngày × Nguồn sợi), không cần edit/delete, scope chỉ công đoạn ống (`isRevenueProcess = true`).

**Giải pháp:** Refactor `page.tsx` thành wrapper `<Tabs>`, giữ logic cũ nguyên vẹn trong tab "Lịch sử chi tiết", thêm tab thứ 2 "Báo cáo theo nguồn sợi" với UI/API chuyên biệt.

---

## ĐỌC TRƯỚC KHI CODE

- `src/app/production/history/page.tsx` (file sẽ refactor thành wrapper)
- `src/app/api/production/history/route.ts` (tham chiếu pattern API + response format)
- `prisma/schema.prisma` (Process, ProductionLog, Machine với các field source\*)
- `src/utils/itemColors.ts`, `src/utils/naturalSort.ts` (tái dùng)

---

## 1. CẤU TRÚC FILE

### 1.1 Refactor `src/app/production/history/page.tsx` thành wrapper Tabs

```tsx
"use client";

import { Tabs } from "antd";
import HistoryDetailTab from "./components/HistoryDetailTab";
import WindingReportTab from "./components/WindingReportTab";

export default function ProductionHistoryPage() {
  return (
    <div style={{ padding: 20 }}>
      <Tabs
        defaultActiveKey="detail"
        items={[
          {
            key: "detail",
            label: "Lịch sử chi tiết",
            children: <HistoryDetailTab />,
          },
          {
            key: "report",
            label: "Báo cáo theo nguồn sợi",
            children: <WindingReportTab />,
          },
        ]}
        destroyInactiveTabPane={false}
      />
    </div>
  );
}
```

> `destroyInactiveTabPane={false}` để giữ state (filter, dữ liệu đã load) khi user switch tab — không reload mỗi lần.

### 1.2 Tạo `src/app/production/history/components/HistoryDetailTab.tsx`

**Move toàn bộ nội dung component hiện tại** (state, useEffect, filter, dashboard, table, modal edit/delete, export) từ `page.tsx` vào file mới này. Đổi tên function từ `ProductionHistoryPage` → `HistoryDetailTab`. **KHÔNG đổi logic gì**, chỉ chuyển vị trí.

Bỏ wrapper `<div style={{ padding: 20 }}>` vì layout cha (Tabs) đã có padding.

### 1.3 Tạo `src/app/production/history/components/WindingReportTab.tsx`

Component mới — chi tiết ở mục 3.

---

## 2. API MỚI

### 2.1 File mới: `src/app/api/production/winding-report/route.ts`

**POST body:**

```typescript
{
  fromDate: string;             // "YYYY-MM-DD"
  toDate: string;
  revenueFactoryIds?: number[]; // filter theo nhà máy doanh thu (NM1, NM2)
  sourceProcessIds?: number[];  // filter theo nguồn sợi (G33, TQ, G37)
  machineIds?: number[];        // filter máy ống
  itemIds?: number[];
  shifts?: number[];
}
```

**Response:**

```typescript
{
  // Tổng theo nhà máy doanh thu (cho dashboard 2 card)
  byRevenueFactory: Array<{
    id: number;
    code: string;
    name: string;
    totalKg: number;
    recordCount: number;
    bySource: Array<{
      sourceProcessId: number;
      sourceName: string;
      kg: number;
    }>;
  }>;

  // Pivot Ngày × Nguồn sợi (cho bảng)
  pivot: Array<{
    date: string; // "YYYY-MM-DD"
    bySource: Record<number, number>; // { sourceProcessId: kg }
    total: number;
  }>;

  // Danh sách nguồn sợi để render header cột (KHÔNG hardcode G33/TQ/G37)
  sourceProcesses: Array<{
    id: number;
    name: string;
    revenueFactory: { id: number; code: string; name: string };
  }>;

  // Cảnh báo
  orphanCount: number; // số log đánh ống trong range thiếu sourceProcessId
  totalKg: number; // tổng toàn bộ (bao gồm orphan)
}
```

### 2.2 Logic backend

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json();
  const {
    fromDate,
    toDate,
    revenueFactoryIds,
    sourceProcessIds,
    machineIds,
    itemIds,
    shifts,
  } = body;

  // UTC date range — theo pattern dự án
  const fromUTC = new Date(`${fromDate}T00:00:00.000Z`);
  const toUTC = new Date(`${toDate}T23:59:59.999Z`);

  // Base where — chỉ công đoạn có isRevenueProcess = true (đánh ống)
  const baseWhere: any = {
    process: { isRevenueProcess: true },
    recordDate: { gte: fromUTC, lte: toUTC },
  };
  if (machineIds?.length) baseWhere.machineId = { in: machineIds };
  if (itemIds?.length) baseWhere.itemId = { in: itemIds };
  if (shifts?.length) baseWhere.shift = { in: shifts };

  // Where cho log đã có sourceProcessId (có filter theo nguồn / nhà máy doanh thu)
  const whereWithSource: any = {
    ...baseWhere,
    sourceProcessId: { not: null },
  };
  if (sourceProcessIds?.length) {
    whereWithSource.sourceProcessId = { in: sourceProcessIds };
  }
  if (revenueFactoryIds?.length) {
    whereWithSource.sourceProcess = {
      revenueFactoryId: { in: revenueFactoryIds },
    };
  }

  // 1. Lấy logs đã có sourceProcessId
  const logs = await prisma.productionLog.findMany({
    where: whereWithSource,
    select: {
      id: true,
      recordDate: true,
      finalOutput: true,
      sourceProcessId: true,
      sourceProcess: {
        select: {
          id: true,
          name: true,
          revenueFactory: { select: { id: true, code: true, name: true } },
        },
      },
    },
    orderBy: { recordDate: "asc" },
  });

  // 2. Đếm orphan logs (thiếu sourceProcessId) — không áp filter source/revenueFactory
  const orphanCount = await prisma.productionLog.count({
    where: {
      ...baseWhere,
      sourceProcessId: null,
    },
  });

  // 3. Build byRevenueFactory
  const rfMap = new Map<number, any>();
  for (const log of logs) {
    const rf = log.sourceProcess?.revenueFactory;
    if (!rf) continue;
    if (!rfMap.has(rf.id)) {
      rfMap.set(rf.id, {
        id: rf.id,
        code: rf.code,
        name: rf.name,
        totalKg: 0,
        recordCount: 0,
        bySourceMap: new Map<
          number,
          { sourceProcessId: number; sourceName: string; kg: number }
        >(),
      });
    }
    const entry = rfMap.get(rf.id);
    entry.totalKg += log.finalOutput;
    entry.recordCount += 1;

    const spId = log.sourceProcessId!;
    if (!entry.bySourceMap.has(spId)) {
      entry.bySourceMap.set(spId, {
        sourceProcessId: spId,
        sourceName: log.sourceProcess!.name,
        kg: 0,
      });
    }
    entry.bySourceMap.get(spId).kg += log.finalOutput;
  }

  const byRevenueFactory = Array.from(rfMap.values())
    .map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      totalKg: e.totalKg,
      recordCount: e.recordCount,
      bySource: Array.from(e.bySourceMap.values()).sort(
        (a: any, b: any) => b.kg - a.kg,
      ),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // 4. Build pivot Ngày × Nguồn sợi
  const pivotMap = new Map<
    string,
    { date: string; bySource: Record<number, number>; total: number }
  >();
  for (const log of logs) {
    const dateKey = log.recordDate.toISOString().split("T")[0];
    if (!pivotMap.has(dateKey)) {
      pivotMap.set(dateKey, { date: dateKey, bySource: {}, total: 0 });
    }
    const row = pivotMap.get(dateKey)!;
    const spId = log.sourceProcessId!;
    row.bySource[spId] = (row.bySource[spId] || 0) + log.finalOutput;
    row.total += log.finalOutput;
  }
  const pivot = Array.from(pivotMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  // 5. Lấy danh sách nguồn sợi để FE render header (lọc theo filter nếu có)
  const sourceProcesses = await prisma.process.findMany({
    where: {
      revenueFactoryId: { not: null },
      ...(revenueFactoryIds?.length
        ? { revenueFactoryId: { in: revenueFactoryIds } }
        : {}),
      ...(sourceProcessIds?.length ? { id: { in: sourceProcessIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      revenueFactory: { select: { id: true, code: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  const totalKg = logs.reduce((s, l) => s + l.finalOutput, 0);

  return NextResponse.json({
    byRevenueFactory,
    pivot,
    sourceProcesses,
    orphanCount,
    totalKg,
  });
}
```

> **Lưu ý hiệu năng:** với khoảng thời gian rộng (vài tháng) số log có thể lớn. Hiện tại build group trên Node.js — đủ với volume Phú Bài (vài nghìn log/tháng). Nếu sau này cần tối ưu, có thể dùng `prisma.productionLog.groupBy` ở DB. Để pattern hiện tại đơn giản trước.

---

## 3. COMPONENT `WindingReportTab`

**File:** `src/app/production/history/components/WindingReportTab.tsx`

### 3.1 Imports & state

```tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  DatePicker,
  Select,
  Button,
  Table,
  Row,
  Col,
  Statistic,
  Space,
  message,
  Tag,
  Alert,
  Divider,
} from "antd";
import {
  SearchOutlined,
  FileExcelOutlined,
  ReloadOutlined,
  FilterOutlined,
  BankOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { naturalSortBy } from "@/utils/naturalSort";

const { RangePicker } = DatePicker;

export default function WindingReportTab() {
  // Dữ liệu danh mục
  const [factories, setFactories] = useState<any[]>([]); // sẽ dùng cho filter Nhà máy doanh thu
  const [sourceOptions, setSourceOptions] = useState<any[]>([]); // 3 nguồn sợi
  const [machines, setMachines] = useState<any[]>([]); // chỉ máy ống
  const [items, setItems] = useState<any[]>([]);

  // Bộ lọc
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf("month"),
    dayjs(),
  ]);
  const [selectedRevenueFactories, setSelectedRevenueFactories] = useState<
    number[]
  >([]);
  const [selectedSources, setSelectedSources] = useState<number[]>([]);
  const [selectedMachines, setSelectedMachines] = useState<number[]>([]);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [selectedShifts, setSelectedShifts] = useState<number[]>([]);

  // Kết quả
  const [byRevenueFactory, setByRevenueFactory] = useState<any[]>([]);
  const [pivot, setPivot] = useState<any[]>([]);
  const [sourceProcesses, setSourceProcesses] = useState<any[]>([]);
  const [orphanCount, setOrphanCount] = useState(0);
  const [totalKg, setTotalKg] = useState(0);

  const [loading, setLoading] = useState(false);

  // ... (load danh mục + handleSearch + render — xem mục 3.2-3.6)
}
```

### 3.2 Load danh mục lúc mount

```tsx
useEffect(() => {
  const fetchData = async () => {
    try {
      const [f, sp, m, i] = await Promise.all([
        fetch("/api/factories").then((r) => r.json()),
        fetch("/api/processes/source-options").then((r) => r.json()), // có sẵn từ SPEC trước
        fetch("/api/machines").then((r) => r.json()),
        fetch("/api/items").then((r) => r.json()),
      ]);

      // Chỉ giữ Factory có process với isRevenueProcess = true gắn revenueFactoryId trỏ về
      // Đơn giản hơn: hiện tại NM1 và NM2 đều có nguồn sợi trỏ về → lấy unique từ sourceOptions
      const revenueFactories = Array.from(
        new Map(
          (Array.isArray(sp) ? sp : [])
            .map((p: any) => p.revenueFactory)
            .filter(Boolean)
            .map((rf: any) => [rf.id, rf]),
        ).values(),
      );

      setFactories(revenueFactories);
      setSourceOptions(Array.isArray(sp) ? sp : []);

      // Chỉ giữ máy ống (process.isRevenueProcess = true)
      const windingMachines = (Array.isArray(m) ? m : []).filter(
        (mc: any) => mc.process?.isRevenueProcess === true,
      );
      setMachines(windingMachines);

      setItems(Array.isArray(i) ? i : []);
    } catch (e) {
      console.error(e);
      message.error("Lỗi tải danh mục");
    }
  };
  fetchData();
  handleSearch();
}, []);
```

### 3.3 Hàm `handleSearch`

```tsx
const handleSearch = async () => {
  setLoading(true);
  try {
    const payload = {
      fromDate: dateRange[0].format("YYYY-MM-DD"),
      toDate: dateRange[1].format("YYYY-MM-DD"),
      revenueFactoryIds: selectedRevenueFactories,
      sourceProcessIds: selectedSources,
      machineIds: selectedMachines,
      itemIds: selectedItems,
      shifts: selectedShifts,
    };

    const res = await fetch("/api/production/winding-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    setByRevenueFactory(data.byRevenueFactory || []);
    setPivot(data.pivot || []);
    setSourceProcesses(data.sourceProcesses || []);
    setOrphanCount(data.orphanCount || 0);
    setTotalKg(data.totalKg || 0);
  } catch (e) {
    message.error("Lỗi tải báo cáo");
  } finally {
    setLoading(false);
  }
};
```

### 3.4 UI — Bộ lọc (giống style trang cũ)

```tsx
<Card
  title={
    <span>
      <FilterOutlined /> Bộ lọc
    </span>
  }
  style={{ marginBottom: 20 }}
  size="small"
>
  <Row gutter={[16, 16]}>
    <Col xs={24} sm={12} md={6}>
      <div style={{ marginBottom: 4, fontWeight: 500 }}>Khoảng thời gian:</div>
      <RangePicker
        value={dateRange}
        onChange={(v) => setDateRange(v as any)}
        style={{ width: "100%" }}
        format="DD/MM/YYYY"
      />
    </Col>
    <Col xs={24} sm={12} md={6}>
      <div style={{ marginBottom: 4, fontWeight: 500 }}>Nhà máy doanh thu:</div>
      <Select
        mode="multiple"
        allowClear
        style={{ width: "100%" }}
        placeholder="Tất cả"
        options={factories.map((f: any) => ({
          label: f.name || f.code,
          value: f.id,
        }))}
        onChange={setSelectedRevenueFactories}
        maxTagCount="responsive"
      />
    </Col>
    <Col xs={24} sm={12} md={6}>
      <div style={{ marginBottom: 4, fontWeight: 500 }}>Nguồn sợi:</div>
      <Select
        mode="multiple"
        allowClear
        style={{ width: "100%" }}
        placeholder="Tất cả nguồn"
        options={sourceOptions
          .filter(
            (p) =>
              !selectedRevenueFactories.length ||
              selectedRevenueFactories.includes(p.revenueFactory?.id),
          )
          .map((p) => ({
            label: `${p.name} → ${p.revenueFactory?.code || "?"}`,
            value: p.id,
          }))}
        onChange={setSelectedSources}
        maxTagCount="responsive"
      />
    </Col>
    <Col xs={24} sm={12} md={6}>
      <div style={{ marginBottom: 4, fontWeight: 500 }}>Máy ống:</div>
      <Select
        mode="multiple"
        allowClear
        style={{ width: "100%" }}
        placeholder="Tất cả"
        options={machines
          .sort((a: any, b: any) => naturalSortBy(a.name, b.name))
          .map((m: any) => ({ label: m.name, value: m.id }))}
        onChange={setSelectedMachines}
        maxTagCount="responsive"
      />
    </Col>
    <Col xs={12} md={6}>
      <div style={{ marginBottom: 4, fontWeight: 500 }}>Ca:</div>
      <Select
        mode="multiple"
        style={{ width: "100%" }}
        placeholder="Tất cả"
        options={[
          { label: "Ca 1", value: 1 },
          { label: "Ca 2", value: 2 },
          { label: "Ca 3", value: 3 },
        ]}
        onChange={setSelectedShifts}
      />
    </Col>
    <Col xs={12} md={6}>
      <div style={{ marginBottom: 4, fontWeight: 500 }}>Mặt hàng:</div>
      <Select
        mode="multiple"
        allowClear
        style={{ width: "100%" }}
        placeholder="Tất cả"
        options={items.map((i: any) => ({ label: i.name, value: i.id }))}
        onChange={setSelectedItems}
        maxTagCount="responsive"
      />
    </Col>
    <Col
      xs={24}
      md={12}
      style={{
        textAlign: "right",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-end",
      }}
    >
      <Space>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setSelectedRevenueFactories([]);
            setSelectedSources([]);
            setSelectedMachines([]);
            setSelectedItems([]);
            setSelectedShifts([]);
          }}
        >
          Reset filter
        </Button>
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={handleSearch}
          loading={loading}
        >
          Xem báo cáo
        </Button>
        <Button
          icon={<FileExcelOutlined />}
          onClick={exportToExcel}
          disabled={pivot.length === 0}
          style={{ color: "green", borderColor: "green" }}
        >
          Xuất Excel
        </Button>
      </Space>
    </Col>
  </Row>
</Card>
```

### 3.5 UI — Cảnh báo orphan + Dashboard 2 card NM

```tsx
{
  orphanCount > 0 && (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 16 }}
      message={`Có ${orphanCount} bản ghi đánh ống chưa gán nguồn sợi`}
      description="Các bản ghi này KHÔNG được tính vào báo cáo dưới đây. Vào trang /machines hoặc /production/winding-input để cấu hình nguồn."
    />
  );
}

<Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
  {byRevenueFactory.map((rf) => (
    <Col xs={24} md={12} key={rf.id}>
      <Card
        variant="borderless"
        style={{
          height: "100%",
          background:
            rf.code === "NM1"
              ? "linear-gradient(to right, #e6f7ff, #ffffff)"
              : "linear-gradient(to right, #fff7e6, #ffffff)",
        }}
      >
        <Statistic
          title={
            <span>
              <BankOutlined /> {rf.name} (theo nguồn sợi)
            </span>
          }
          value={rf.totalKg}
          precision={1}
          suffix="kg"
          styles={{
            content: {
              color: rf.code === "NM1" ? "#1677ff" : "#d48806",
              fontWeight: "bold",
              fontSize: 28,
            },
          }}
        />
        <Divider style={{ margin: "12px 0" }} />
        <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
          {rf.recordCount} bản ghi · phân theo nguồn:
        </div>
        <Space wrap>
          {rf.bySource.map((s: any) => (
            <Tag
              key={s.sourceProcessId}
              color="cyan"
              style={{ padding: "4px 8px" }}
            >
              {s.sourceName}:{" "}
              <b>
                {s.kg.toLocaleString(undefined, { maximumFractionDigits: 1 })}{" "}
                kg
              </b>
            </Tag>
          ))}
        </Space>
      </Card>
    </Col>
  ))}
</Row>;
```

### 3.6 UI — Bảng pivot Ngày × Nguồn sợi

```tsx
const pivotColumns = useMemo(() => {
  const cols: any[] = [
    {
      title: "Ngày",
      dataIndex: "date",
      key: "date",
      width: 110,
      fixed: "left" as const,
      render: (d: string) => dayjs(d).format("DD/MM/YYYY"),
    },
  ];
  // 1 cột cho mỗi nguồn sợi
  sourceProcesses.forEach((sp) => {
    cols.push({
      title: (
        <div>
          <div>{sp.name}</div>
          <Tag color="cyan" style={{ fontSize: 10, margin: 0 }}>
            → {sp.revenueFactory?.code}
          </Tag>
        </div>
      ),
      key: `src-${sp.id}`,
      align: "right" as const,
      render: (_: any, row: any) => {
        const v = row.bySource?.[sp.id];
        return v != null ? (
          <span>
            {v.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </span>
        ) : (
          <span style={{ color: "#ccc" }}>—</span>
        );
      },
    });
  });
  // Cột Tổng
  cols.push({
    title: "Tổng (kg)",
    dataIndex: "total",
    key: "total",
    align: "right" as const,
    fixed: "right" as const,
    width: 120,
    render: (n: number) => (
      <b style={{ color: "#389e0d" }}>
        {n.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      </b>
    ),
  });
  return cols;
}, [sourceProcesses]);

// Row tổng cộng cuối bảng — dùng Table summary
return (
  // ... filter, dashboard ở trên ...

  <Card
    title="Sản lượng theo ngày × nguồn sợi"
    size="small"
    styles={{ body: { padding: 0 } }}
  >
    <Table
      rowKey="date"
      columns={pivotColumns}
      dataSource={pivot}
      loading={loading}
      bordered
      size="middle"
      pagination={false}
      scroll={{ x: "max-content" }}
      summary={() => {
        const totals: Record<number, number> = {};
        let grand = 0;
        pivot.forEach((r) => {
          Object.entries(r.bySource).forEach(([id, kg]) => {
            totals[Number(id)] = (totals[Number(id)] || 0) + (kg as number);
          });
          grand += r.total;
        });
        return (
          <Table.Summary fixed>
            <Table.Summary.Row
              style={{ background: "#fafafa", fontWeight: 600 }}
            >
              <Table.Summary.Cell index={0}>Tổng cộng</Table.Summary.Cell>
              {sourceProcesses.map((sp, idx) => (
                <Table.Summary.Cell key={sp.id} index={idx + 1} align="right">
                  {(totals[sp.id] || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  })}
                </Table.Summary.Cell>
              ))}
              <Table.Summary.Cell
                index={sourceProcesses.length + 1}
                align="right"
              >
                <span style={{ color: "#389e0d" }}>
                  {grand.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  })}
                </span>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        );
      }}
    />
  </Card>
);
```

### 3.7 Hàm `exportToExcel`

Xuất 2 sheets: "Tổng hợp theo NM" + "Pivot ngày × nguồn":

```tsx
const exportToExcel = () => {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Tổng hợp theo NM
  const sheet1Data: any[] = [];
  byRevenueFactory.forEach((rf) => {
    sheet1Data.push({
      "Nhà máy": rf.name,
      "Tổng kg": rf.totalKg,
      "Số bản ghi": rf.recordCount,
      "Chi tiết nguồn": rf.bySource
        .map((s: any) => `${s.sourceName}: ${s.kg.toFixed(1)} kg`)
        .join(" | "),
    });
  });
  const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
  XLSX.utils.book_append_sheet(wb, ws1, "Tổng hợp theo NM");

  // Sheet 2: Pivot ngày × nguồn
  const sheet2Data = pivot.map((row) => {
    const out: any = { Ngày: dayjs(row.date).format("DD/MM/YYYY") };
    sourceProcesses.forEach((sp) => {
      out[sp.name] = row.bySource[sp.id] || 0;
    });
    out["Tổng (kg)"] = row.total;
    return out;
  });
  // Thêm dòng tổng cộng
  const totalsRow: any = { Ngày: "TỔNG CỘNG" };
  let grand = 0;
  sourceProcesses.forEach((sp) => {
    const s = pivot.reduce((acc, r) => acc + (r.bySource[sp.id] || 0), 0);
    totalsRow[sp.name] = s;
  });
  grand = pivot.reduce((acc, r) => acc + r.total, 0);
  totalsRow["Tổng (kg)"] = grand;
  sheet2Data.push(totalsRow);

  const ws2 = XLSX.utils.json_to_sheet(sheet2Data);
  XLSX.utils.book_append_sheet(wb, ws2, "Pivot ngày x nguồn");

  XLSX.writeFile(wb, `BaoCao_NguonSoi_${dayjs().format("DDMM_HHmm")}.xlsx`);
};
```

---

## 4. VERIFY

### 4.1 Cấu trúc tab

- [ ] Truy cập `/production/history` → thấy 2 tab "Lịch sử chi tiết" và "Báo cáo theo nguồn sợi"
- [ ] Tab mặc định: "Lịch sử chi tiết" (giữ nội dung cũ y hệt)
- [ ] Switch sang tab "Báo cáo theo nguồn sợi" và quay lại tab cũ → state tab cũ không bị reset (filter, dữ liệu vẫn còn)

### 4.2 Tab "Lịch sử chi tiết"

- [ ] Filter, biểu đồ, bảng chi tiết, edit/delete admin, export Excel — tất cả hoạt động y như trước khi refactor

### 4.3 Tab "Báo cáo theo nguồn sợi"

- [ ] Mặc định filter `dateRange` = tháng hiện tại
- [ ] Filter "Nhà máy doanh thu" hiển thị NM1, NM2 (lấy từ `sourceProcesses[].revenueFactory`)
- [ ] Filter "Nguồn sợi" hiển thị G33, TQ, G37 với label kèm nhãn nhà máy
- [ ] Filter "Nguồn sợi" lọc theo "Nhà máy doanh thu" (cascade)
- [ ] Filter "Máy ống" chỉ hiển thị máy có `process.isRevenueProcess = true`
- [ ] Bấm "Xem báo cáo" → 2 card NM1/NM2 hiển thị đúng tổng + breakdown theo nguồn
- [ ] Bảng pivot có cột Ngày + 1 cột cho mỗi nguồn sợi + cột Tổng
- [ ] Row tổng cộng cuối bảng cộng đúng từng cột và tổng grand
- [ ] Banner cảnh báo orphan hiển thị khi có log thiếu `sourceProcessId`
- [ ] Khi reset filter → tự gọi lại API trả về full data của tháng

### 4.4 Test kịch bản gốc (multi-item 2 nguồn)

- [ ] Máy ống multi-item chạy 2 mặt hàng: 500kg G37 + 300kg TQ trong cùng ngày
- [ ] Tab báo cáo: card NM1 cộng 300kg (TQ), card NM2 cộng 500kg (G37)
- [ ] Pivot ngày đó: cột G37 = 500, cột TQ = 300, tổng = 800

### 4.5 Export Excel

- [ ] File xuất có 2 sheet: "Tổng hợp theo NM" + "Pivot ngày x nguồn"
- [ ] Sheet pivot có dòng "TỔNG CỘNG" ở cuối

---

## 5. TỔNG KẾT THAY ĐỔI

| File                                                         | Thay đổi                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `src/app/production/history/page.tsx`                        | **Refactor**: thay nội dung thành wrapper `<Tabs>` với 2 tab. Toàn bộ code cũ chuyển vào `HistoryDetailTab`. |
| `src/app/production/history/components/HistoryDetailTab.tsx` | **File mới** — move toàn bộ nội dung component cũ vào đây, đổi tên export, KHÔNG đổi logic.                  |
| `src/app/production/history/components/WindingReportTab.tsx` | **File mới** — component báo cáo theo nguồn sợi (filter + dashboard + pivot + cảnh báo + export).            |
| `src/app/api/production/winding-report/route.ts`             | **File mới** — POST endpoint trả về `byRevenueFactory`, `pivot`, `sourceProcesses`, `orphanCount`.           |

---

## 6. GHI CHÚ CHO CLAUDE CODE

1. **Refactor tab "Lịch sử chi tiết" KHÔNG được đổi logic** — chỉ là move file + đổi tên export. Test kỹ tab này sau refactor để chắc không vỡ gì.

2. **`destroyInactiveTabPane={false}`** quan trọng — nếu để mặc định `true`, mỗi lần switch tab sẽ unmount và mất state (filter, dữ liệu đã load). Trải nghiệm tệ.

3. **Header cột pivot không hardcode G33/TQ/G37** — render động từ `sourceProcesses` trả về từ API. Nếu sau này phòng KD thêm nguồn thứ 4 (vd "G40"), bảng tự nới rộng.

4. **UTC date range** trong API — theo pattern dự án. Không dùng `new Date(year, month-1, 1)`.

5. **Filter chỉ scope `isRevenueProcess = true`** ngay từ API — tab này không cần xử lý công đoạn khác. Trang `/production/history` tab cũ vẫn xử lý mọi công đoạn như cũ.

6. **Endpoint `/api/processes/source-options` đã có sẵn** từ SPEC_SOURCE_PROCESS_FOR_REVENUE — tái dùng, không tạo mới.

7. **Filter "Máy ống" load từ `/api/machines`** rồi filter FE theo `process.isRevenueProcess`. Nếu API hiện chưa include `process.isRevenueProcess` trong select, cần đảm bảo có (xem `src/app/api/machines/route.ts`).

8. **Pivot dùng `pagination={false}`** — báo cáo theo ngày trong 1 tháng tối đa 31 dòng, không cần phân trang. Nếu user filter cả năm có thể tới 365 dòng — vẫn OK với Table không phân trang, có scroll.

9. **Tag NM1/NM2 màu khác nhau** trong card và header pivot — giúp KD đọc nhanh. Chọn 2 màu tương phản rõ (xanh dương cho NM1, vàng/cam cho NM2 như gợi ý code mục 3.5).

10. **Card variant="borderless"** đã có sẵn ở Ant Design 5+, dùng giống style trang cũ.

11. **KHÔNG có edit/delete trên tab báo cáo** — đây là báo cáo read-only. Sửa số liệu phải sang tab "Lịch sử chi tiết".

12. **KHÔNG bổ sung pie chart hoặc trend line ở MVP** — giữ scope nhỏ. Có thể thêm sau nếu phòng KD yêu cầu.

13. **Tải file Excel test mở bằng Excel/LibreOffice xác nhận layout** — đặc biệt sheet "Pivot ngày x nguồn" phải gần giống TH-DT mà phòng KD đang dùng.
