"use client";

import React from "react";
import { Card, Col, Empty, Row, Table } from "antd";
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

interface ByDateEntry {
  date: string;
  total: number;
  shift1: number;
  shift2: number;
  shift3: number;
}

interface OutputByShiftProps {
  data: ByDateEntry[];
  loading: boolean;
}

const SHIFT_COLORS = {
  shift1: "#1677ff",
  shift2: "#52c41a",
  shift3: "#fa8c16",
};

const fmtDate = (d: string) => {
  const parts = d.split("-");
  return `${parts[2]}/${parts[1]}`;
};

const fmtNum = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

export default function OutputByShift({ data, loading }: OutputByShiftProps) {
  // Only show last 14 days if range is long
  const chartData = (data.length > 14 ? data.slice(-14) : data).map((d) => ({
    ...d,
    label: fmtDate(d.date),
  }));

  // Summary table
  const totalShift1 = data.reduce((s, d) => s + d.shift1, 0);
  const totalShift2 = data.reduce((s, d) => s + d.shift2, 0);
  const totalShift3 = data.reduce((s, d) => s + d.shift3, 0);
  const grandTotal = totalShift1 + totalShift2 + totalShift3;

  const pct = (v: number) =>
    grandTotal > 0 ? ((v / grandTotal) * 100).toFixed(1) + "%" : "—";

  const summaryData = [
    { ca: "Ca 1", total: totalShift1, pct: pct(totalShift1), color: SHIFT_COLORS.shift1 },
    { ca: "Ca 2", total: totalShift2, pct: pct(totalShift2), color: SHIFT_COLORS.shift2 },
    { ca: "Ca 3", total: totalShift3, pct: pct(totalShift3), color: SHIFT_COLORS.shift3 },
    { ca: "Tổng", total: grandTotal, pct: "100%", color: "#595959" },
  ];

  const columns = [
    { title: "Ca", dataIndex: "ca", key: "ca", render: (v: string, r: any) => (
      <span style={{ color: r.color, fontWeight: r.ca === "Tổng" ? 700 : 400 }}>{v}</span>
    )},
    {
      title: "Sản lượng (kg)",
      dataIndex: "total",
      key: "total",
      align: "right" as const,
      render: (v: number, r: any) => (
        <span style={{ fontWeight: r.ca === "Tổng" ? 700 : 400 }}>{fmtNum(v)}</span>
      ),
    },
    { title: "Tỷ lệ", dataIndex: "pct", key: "pct", align: "right" as const },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={16}>
        <Card title="Sản lượng theo ca (14 ngày gần nhất)" loading={loading}>
          {chartData.length === 0 ? (
            <Empty description="Không có dữ liệu" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtNum} width={70} />
                <Tooltip formatter={(v: number | undefined) => [fmtNum(v ?? 0) + " kg"]} />
                <Legend />
                <Bar dataKey="shift1" name="Ca 1" fill={SHIFT_COLORS.shift1} radius={[2, 2, 0, 0]} />
                <Bar dataKey="shift2" name="Ca 2" fill={SHIFT_COLORS.shift2} radius={[2, 2, 0, 0]} />
                <Bar dataKey="shift3" name="Ca 3" fill={SHIFT_COLORS.shift3} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </Col>
      <Col xs={24} lg={8}>
        <Card title="Tổng hợp theo ca" loading={loading} style={{ height: "100%" }}>
          <Table
            dataSource={summaryData}
            columns={columns}
            rowKey="ca"
            pagination={false}
            size="small"
          />
        </Card>
      </Col>
    </Row>
  );
}
