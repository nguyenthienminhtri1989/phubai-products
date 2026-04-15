"use client";

import React from "react";
import { Card, Empty } from "antd";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ByDateEntry {
  date: string;
  total: number;
  avgEfficiency?: number | null;
}

interface OutputByDateProps {
  data: ByDateEntry[];
  loading: boolean;
  title?: string;
}

const fmtDate = (d: string) => {
  const parts = d.split("-");
  return `${parts[2]}/${parts[1]}`;
};

const fmtNum = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #d9d9d9", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Ngày {label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value != null ? (p.dataKey === "avgEfficiency" ? `${p.value.toFixed(1)}%` : `${fmtNum(p.value)} kg`) : "—"}
        </div>
      ))}
    </div>
  );
};

export default function OutputByDate({ data, loading, title = "Sản lượng theo ngày" }: OutputByDateProps) {
  const displayData = data.map((d) => ({ ...d, label: fmtDate(d.date) }));
  const hasEfficiency = displayData.some((d) => d.avgEfficiency != null);

  return (
    <Card title={title} loading={loading} style={{ height: "100%" }}>
      {displayData.length === 0 ? (
        <Empty description="Không có dữ liệu" />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={displayData} margin={{ top: 5, right: hasEfficiency ? 50 : 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              interval={displayData.length > 20 ? Math.floor(displayData.length / 10) : 0}
            />
            {/* Trục Y trái — sản lượng (kg) */}
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => fmtNum(v)}
              width={70}
            />
            {/* Trục Y phải — hiệu suất (%) — chỉ hiện khi có dữ liệu */}
            {hasEfficiency && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: "#fa8c16" }}
                tickFormatter={(v) => `${v}%`}
                domain={[70, 100]}
                width={42}
              />
            )}
            <Tooltip content={<CustomTooltip />} />
            {hasEfficiency && <Legend wrapperStyle={{ fontSize: 12 }} />}
            <Bar
              yAxisId="left"
              dataKey="total"
              name="Sản lượng"
              fill="#1677ff"
              fillOpacity={0.75}
              radius={[2, 2, 0, 0]}
              maxBarSize={40}
            />
            {hasEfficiency && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avgEfficiency"
                name="Hiệu suất TB"
                stroke="#fa8c16"
                strokeWidth={2}
                dot={displayData.length <= 30}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
