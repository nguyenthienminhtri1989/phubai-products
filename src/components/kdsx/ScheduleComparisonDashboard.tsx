"use client";

import React, { useState, useEffect } from "react";
import { Spin, Table, Tag, Typography } from "antd";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, Line, LabelList
} from "recharts";

const { Text } = Typography;

interface SummaryItem {
  itemId: number;
  itemName: string;
  totalKg: number;
  totalTons: number;
  segmentCount: number;
  machinesInvolved: number[];
}

interface Segment {
  machineId: number;
  itemId: number;
  fromDay: number;
  toDay: number;
  kgPerDay: number;
}

interface ScheduleComparisonDashboardProps {
  scheduleId: number;
  summary: SummaryItem[];   // KH summary từ parent
  yearMonth: string;
  itemColors: Record<string, string>;
  segments: Segment[];
  holidays: number[];
  totalDays: number;
  benchmarkMap?: Record<string, number>; // Định mức theo "machineId-itemId"
  factoryId?: number;  // Dùng với processId để gọi /api/kdsx/item-totals
  processId?: number;  // Nếu null/undefined → fallback về tính local
}

interface ActualGrid {
  [machineId: number]: {
    [day: number]: { [itemId: number]: number };
  };
}

function getColor(itemId: number, itemColors: Record<string, string>): string {
  if (itemColors[String(itemId)]) return itemColors[String(itemId)];
  const DEFAULT_COLORS = [
    "#4CAF50", "#2196F3", "#FF9800", "#9C27B0", "#F44336",
    "#00BCD4", "#FFEB3B", "#E91E63", "#3F51B5", "#8BC34A",
    "#FF5722", "#607D8B", "#009688", "#795548", "#CDDC39", "#673AB7",
  ];
  return DEFAULT_COLORS[parseInt(String(itemId)) % DEFAULT_COLORS.length];
}

function ratioTag(ratio: number) {
  if (ratio >= 100) return <Tag color="success">{ratio.toFixed(1)}%</Tag>;
  if (ratio >= 90) return <Tag color="warning">{ratio.toFixed(1)}%</Tag>;
  return <Tag color="error">{ratio.toFixed(1)}%</Tag>;
}

export default function ScheduleComparisonDashboard({
  scheduleId,
  summary,
  yearMonth,
  itemColors,
  segments,
  holidays,
  totalDays,
  benchmarkMap = {},
  factoryId,
  processId,
}: ScheduleComparisonDashboardProps) {
  const [grid, setGrid] = useState<ActualGrid>({});
  const [loading, setLoading] = useState(true);
  // apiTotals: kết quả từ getMonthlyItemTotals khi factoryId + processId có sẵn
  const [apiThByItem, setApiThByItem] = useState<Record<number, number> | null>(null);

  useEffect(() => {
    fetch(`/api/kdsx/production-schedule/${scheduleId}/actual`)
      .then(r => r.json())
      .then(data => setGrid(data.grid ?? {}))
      .catch(() => setGrid({}))
      .finally(() => setLoading(false));
  }, [scheduleId]);

  // Fetch tổng TH từ nguồn sự thật duy nhất khi có processId
  useEffect(() => {
    if (!factoryId || !processId) {
      setApiThByItem(null);
      return;
    }
    fetch(
      `/api/kdsx/item-totals?factoryId=${factoryId}&processId=${processId}&yearMonth=${yearMonth}&mode=ACTUAL_PROJECTED`,
    )
      .then(r => r.json())
      .then(data => {
        const byItem: Record<number, number> = {};
        for (const t of data.totals ?? []) byItem[t.itemId] = t.totalKg;
        setApiThByItem(byItem);
      })
      .catch(() => setApiThByItem(null));
  }, [factoryId, processId, yearMonth]);

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>;

  const dayNumbers = Array.from({ length: totalDays }, (_, i) => i + 1);

  // ── Build dữ liệu hỗ trợ cho line chart (vẫn tính local, chỉ visual) ──
  const daysWithActualData = new Set<number>();
  for (const machineIdStr in grid) {
    const machineId = parseInt(machineIdStr);
    for (const dayStr in grid[machineId]) {
      const day = parseInt(dayStr);
      const dayData = grid[machineId][day];
      if (dayData && Object.values(dayData).some((kg) => kg > 0)) {
        daysWithActualData.add(day);
      }
    }
  }
  const rowCombos = new Set<string>();
  for (const machineIdStr in grid) {
    const machineId = parseInt(machineIdStr);
    for (const dayStr in grid[machineId]) {
      const dayData = grid[machineId][parseInt(dayStr)];
      for (const itemIdStr in dayData) {
        rowCombos.add(`${machineId}-${itemIdStr}`);
      }
    }
  }
  for (const seg of segments) {
    rowCombos.add(`${seg.machineId}-${seg.itemId}`);
  }

  const comboRange: Record<string, { firstDay: number; lastDay: number }> = {};
  for (const combo of rowCombos) {
    const [machineIdStr, itemIdStr] = combo.split("-");
    const machineId = parseInt(machineIdStr);
    const itemId = parseInt(itemIdStr);
    let firstDay = totalDays + 1, lastDay = 0;
    const mg = grid[machineId] ?? {};
    for (const dayStr of Object.keys(mg)) {
      const d = parseInt(dayStr);
      if ((mg[d]?.[itemId] ?? 0) > 0) {
        if (d < firstDay) firstDay = d;
        if (d > lastDay) lastDay = d;
      }
    }
    comboRange[combo] = { firstDay, lastDay };
  }

  const lastComboPerMachine = new Map<number, string>();
  for (const combo of rowCombos) {
    const [machineIdStr] = combo.split("-");
    const machineId = parseInt(machineIdStr);
    const existing = lastComboPerMachine.get(machineId);
    if (!existing || comboRange[combo].lastDay > comboRange[existing].lastDay) {
      lastComboPerMachine.set(machineId, combo);
    }
  }

  // ── Tổng TH theo item ──
  // Ưu tiên apiThByItem (từ getMonthlyItemTotals — trung bình thực tế per combo).
  // Fallback về local khi chưa có factoryId/processId (backward compat).
  const thByItem: Record<number, number> = (() => {
    if (apiThByItem !== null) return apiThByItem;
    // Local fallback: dùng benchmark cố định cho ngày chưa nhập
    const local: Record<number, number> = {};
    for (const combo of rowCombos) {
      const [machineIdStr, itemIdStr] = combo.split("-");
      const machineId = parseInt(machineIdStr);
      const itemId = parseInt(itemIdStr);
      const bmKg = benchmarkMap[combo] ?? 0;
      const range = comboRange[combo];
      const isLastCombo = lastComboPerMachine.get(machineId) === combo;
      for (let day = 1; day <= totalDays; day++) {
        if (holidays.includes(day)) continue;
        const actual = grid[machineId]?.[day]?.[itemId] ?? 0;
        if (actual > 0) {
          local[itemId] = (local[itemId] ?? 0) + actual;
        } else if (bmKg > 0 && !daysWithActualData.has(day) && range.lastDay > 0 && day > range.lastDay && isLastCombo) {
          local[itemId] = (local[itemId] ?? 0) + bmKg;
        }
      }
    }
    return local;
  })();

  // Bar chart data: mỗi item 1 nhóm
  const barData = summary.map(item => ({
    name: item.itemName,
    itemId: item.itemId,
    khTons: +(item.totalKg / 1000).toFixed(2),
    thTons: +((thByItem[item.itemId] ?? 0) / 1000).toFixed(2),
    khKg: item.totalKg,
    thKg: thByItem[item.itemId] ?? 0,
    ratio: item.totalKg > 0 ? (thByItem[item.itemId] ?? 0) / item.totalKg * 100 : 0,
  }));

  // Line chart: tích lũy KH và TH theo ngày (tổng tất cả máy)
  // KH: mỗi ngày (trừ nghỉ), cộng tất cả segment
  let khCumul = 0;
  let thCumul = 0;
  const lineData = dayNumbers.map(day => {
    // KH ngày này
    if (!holidays.includes(day)) {
      for (const seg of segments) {
        if (day >= seg.fromDay && day <= seg.toDay) {
          khCumul += seg.kgPerDay;
        }
      }
    }
    // TH ngày này
    if (!holidays.includes(day)) {
      for (const combo of rowCombos) {
        const [machineIdStr, itemIdStr] = combo.split("-");
        const machineId = parseInt(machineIdStr);
        const itemId = parseInt(itemIdStr);
        const actual = grid[machineId]?.[day]?.[itemId] ?? 0;
        const bmKg = benchmarkMap[combo] ?? 0;
        const range = comboRange[combo];
        const isLastComboLine = lastComboPerMachine.get(machineId) === combo;
        if (actual > 0) {
          thCumul += actual;
        } else if (bmKg > 0 && !daysWithActualData.has(day) && range.lastDay > 0 && day > range.lastDay && isLastComboLine) {
          thCumul += bmKg;
        }
      }
    }
    return {
      day: `${day}`,
      kh: +(khCumul / 1000).toFixed(2),
      th: +(thCumul / 1000).toFixed(2),
    };
  });

  // Bảng tổng hợp
  const totalKhKg = barData.reduce((s, i) => s + i.khKg, 0);
  const totalThKg = barData.reduce((s, i) => s + i.thKg, 0);
  const totalRatio = totalKhKg > 0 ? totalThKg / totalKhKg * 100 : 0;

  const tableColumns = [
    {
      title: "Mặt hàng",
      dataIndex: "name",
      key: "name",
      render: (name: string, row: typeof barData[0]) => (
        <span style={{ color: getColor(row.itemId, itemColors), fontWeight: 600 }}>{name}</span>
      ),
    },
    {
      title: "KH (kg)",
      dataIndex: "khKg",
      key: "khKg",
      align: "right" as const,
      render: (v: number) => <Text strong>{v.toLocaleString()}</Text>,
    },
    {
      title: "TH (kg)",
      dataIndex: "thKg",
      key: "thKg",
      align: "right" as const,
      render: (v: number) => <Text strong style={{ color: "#1677ff" }}>{v.toLocaleString()}</Text>,
    },
    {
      title: "Chênh lệch",
      key: "diff",
      align: "right" as const,
      render: (_: unknown, row: typeof barData[0]) => {
        const diff = row.thKg - row.khKg;
        return (
          <Text strong style={{ color: diff >= 0 ? "#52c41a" : "#ff4d4f" }}>
            {diff >= 0 ? "+" : ""}{diff.toLocaleString()}
          </Text>
        );
      },
    },
    {
      title: "Tỷ lệ",
      dataIndex: "ratio",
      key: "ratio",
      align: "center" as const,
      render: (v: number) => ratioTag(v),
    },
  ];

  const tableData = [
    ...barData.map(r => ({ ...r, key: r.itemId })),
    {
      key: "total",
      name: "TỔNG",
      itemId: 0,
      khKg: totalKhKg,
      thKg: totalThKg,
      ratio: totalRatio,
      khTons: 0, thTons: 0,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Bar chart */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>📊 So sánh KH/TH theo mặt hàng (tấn)</div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={barData} margin={{ top: 25, right: 20, left: 0, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-30} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
            <YAxis label={{ value: "Tấn", angle: -90, position: "insideLeft", fontSize: 11 }} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => [`${Number(v ?? 0).toLocaleString()} tấn`]} />
            <Legend />
            <Bar dataKey="khTons" name="Kế hoạch" fill="#1677ff" radius={[3, 3, 0, 0]}>
              <LabelList dataKey="khTons" position="top" style={{ fontSize: 10, fill: "#1677ff", fontWeight: 600 }} />
            </Bar>
            <Bar dataKey="thTons" name="Thực hiện" fill="#52c41a" radius={[3, 3, 0, 0]}>
              <LabelList dataKey="thTons" position="top" style={{ fontSize: 10, fill: "#52c41a", fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Line chart tích lũy */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>📈 Sản lượng tích lũy theo ngày (tấn)</div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={lineData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={1} />
            <YAxis label={{ value: "Tấn", angle: -90, position: "insideLeft", fontSize: 11 }} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => [`${Number(v ?? 0).toLocaleString()} tấn`]} />
            <Legend />
            <Line type="monotone" dataKey="kh" name="Kế hoạch (tích lũy)" stroke="#1677ff" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="th" name="Thực hiện (tích lũy)" stroke="#52c41a" strokeWidth={2} dot={false} strokeDasharray="5 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bảng tổng hợp */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>📋 Bảng tổng hợp KH/TH</div>
        <Table
          columns={tableColumns}
          dataSource={tableData}
          pagination={false}
          size="small"
          rowClassName={(r) => r.key === "total" ? "font-bold" : ""}
          style={{ borderRadius: 6 }}
          summary={() => null}
        />
      </div>
    </div>
  );
}
