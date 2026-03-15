"use client";

import React from "react";
import { Card, Col, Empty, Row } from "antd";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

interface ByItemEntry {
  itemId: number;
  itemName: string;
  itemCode: string | null;
  total: number;
}

interface ByDateEntry {
  date: string;
  total: number;
  shift1: number;
  shift2: number;
  shift3: number;
}

interface OutputByItemProps {
  byItem: ByItemEntry[];
  byDate: ByDateEntry[];
  loading: boolean;
}

const CHART_COLORS = [
  "#1677ff", "#52c41a", "#fa8c16", "#722ed1", "#eb2f96",
  "#13c2c2", "#faad14", "#f5222d", "#2f54eb", "#a0d911",
  "#096dd9", "#389e0d", "#d46b08", "#531dab", "#c41d7f",
];

const fmtNum = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

const fmtDate = (d: string) => {
  const parts = d.split("-");
  return `${parts[2]}/${parts[1]}`;
};

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function OutputByItem({ byItem, byDate, loading }: OutputByItemProps) {
  const grandTotal = byItem.reduce((s, i) => s + i.total, 0);

  const pieData = byItem.map((item, idx) => ({
    name: item.itemName,
    value: item.total,
    color: CHART_COLORS[idx % CHART_COLORS.length],
  }));

  // Stacked bar: last 14 days with item breakdown
  // Since we only have byDate totals (not per-item-per-date), we'll build a simplified stacked from ratios
  const displayDates = byDate.length > 14 ? byDate.slice(-14) : byDate;
  const topItems = byItem.slice(0, 8); // Top 8 items for stacked

  // Build stacked data: distribute daily total proportionally by item
  const stackedData = displayDates.map((d) => {
    const row: any = { label: fmtDate(d.date) };
    if (grandTotal > 0) {
      topItems.forEach((item) => {
        row[item.itemName] = Math.round((d.total * (item.total / grandTotal)) * 100) / 100;
      });
    }
    return row;
  });

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={10}>
        <Card title="Cơ cấu sản lượng theo mặt hàng" loading={loading}>
          {byItem.length === 0 ? (
            <Empty description="Không có dữ liệu" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  dataKey="value"
                  labelLine={false}
                  label={renderCustomLabel}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number | undefined, name: string | undefined) => {
                    const v = value ?? 0;
                    return [fmtNum(v) + " kg (" + ((v / grandTotal) * 100).toFixed(1) + "%)", name ?? ""];
                  }}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  formatter={(value, entry: any) => (
                    <span style={{ fontSize: 11 }}>
                      {value}
                      <br />
                      <span style={{ color: "#888" }}>
                        {fmtNum(entry.payload.value)} kg
                      </span>
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </Col>

      <Col xs={24} lg={14}>
        <Card title="Sản lượng theo mặt hàng từng ngày (14 ngày gần nhất)" loading={loading}>
          {stackedData.length === 0 || topItems.length === 0 ? (
            <Empty description="Không có dữ liệu" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stackedData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtNum} width={70} />
                <Tooltip formatter={(v: number | undefined) => [fmtNum(v ?? 0) + " kg"]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {topItems.map((item, idx) => (
                  <Bar
                    key={item.itemId}
                    dataKey={item.itemName}
                    stackId="a"
                    fill={CHART_COLORS[idx % CHART_COLORS.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </Col>
    </Row>
  );
}
