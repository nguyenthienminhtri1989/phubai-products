"use client";

import React from "react";
import { Card, Empty } from "antd";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ByDateEntry {
  date: string;
  total: number;
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

export default function OutputByDate({ data, loading, title = "Sản lượng theo ngày" }: OutputByDateProps) {
  const displayData = data.map((d) => ({ ...d, label: fmtDate(d.date) }));

  return (
    <Card title={title} loading={loading} style={{ height: "100%" }}>
      {displayData.length === 0 ? (
        <Empty description="Không có dữ liệu" />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={displayData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              interval={displayData.length > 20 ? Math.floor(displayData.length / 10) : 0}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => fmtNum(v)}
              width={70}
            />
            <Tooltip
              formatter={(value: number | undefined) => [fmtNum(value ?? 0) + " kg", "Sản lượng"]}
              labelFormatter={(label) => `Ngày ${label}`}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#1677ff"
              strokeWidth={2}
              dot={displayData.length <= 30}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
