"use client";

import React from "react";
import { Card, Col, Empty, Row, Tag } from "antd";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";

interface ByMachineEntry {
  machineId: number;
  machineName: string;
  processName: string;
  total: number;
}

interface ByDateEntry {
  date: string;
  [key: string]: number | string;
}

interface OutputByMachineProps {
  byMachine: ByMachineEntry[];
  byDate: Array<{ date: string; total: number; shift1: number; shift2: number; shift3: number }>;
  selectedMachineIds: number[];
  loading: boolean;
  onMachineClick: (machineId: number) => void;
}

const CHART_COLORS = [
  "#1677ff", "#52c41a", "#fa8c16", "#722ed1", "#eb2f96",
  "#13c2c2", "#faad14", "#f5222d", "#2f54eb", "#a0d911",
];

const fmtNum = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

export default function OutputByMachine({
  byMachine,
  byDate,
  selectedMachineIds,
  loading,
  onMachineClick,
}: OutputByMachineProps) {
  // Horizontal bar chart data (sorted desc, top 20)
  const chartData = [...byMachine].reverse(); // recharts horizontal: low → high from top

  // Multi-line trend for selected machines (1–5)
  const showTrend = selectedMachineIds.length >= 1 && selectedMachineIds.length <= 5;
  const selectedMachines = byMachine.filter((m) => selectedMachineIds.includes(m.machineId));

  // Rebuild byDate to have per-machine columns — simplified: we don't have per-machine per-date
  // The trend data would need raw logs; since we only have summary, show a note when not applicable
  // We'll show selected machine totals as a simple comparison bar instead
  const trendNote =
    selectedMachineIds.length > 0 && !showTrend
      ? "Chọn 1–5 máy để xem xu hướng"
      : "";

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={16}>
        <Card title="Xếp hạng máy theo sản lượng (Top 20)" loading={loading}>
          {byMachine.length === 0 ? (
            <Empty description="Không có dữ liệu" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 28)}>
              <BarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 5, right: 40, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtNum} />
                <YAxis
                  type="category"
                  dataKey="machineName"
                  tick={{ fontSize: 11 }}
                  width={90}
                />
                <Tooltip
                  formatter={(v: number | undefined) => [fmtNum(v ?? 0) + " kg", "Sản lượng"]}
                  labelFormatter={(label) => `Máy: ${label}`}
                />
                <Bar
                  dataKey="total"
                  fill="#1677ff"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(entry: any) => onMachineClick(entry.machineId)}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </Col>

      <Col xs={24} lg={8}>
        <Card
          title="Máy đã chọn"
          loading={loading}
          extra={
            selectedMachines.length > 0 ? (
              <Tag color="blue">{selectedMachines.length} máy</Tag>
            ) : null
          }
        >
          {selectedMachines.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Click vào máy trên biểu đồ để xem chi tiết"
              style={{ padding: "20px 0" }}
            />
          ) : (
            <div>
              {selectedMachines.map((m, idx) => (
                <div
                  key={m.machineId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                >
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: CHART_COLORS[idx % CHART_COLORS.length],
                        marginRight: 8,
                      }}
                    />
                    <span style={{ fontWeight: 500 }}>{m.machineName}</span>
                    <div style={{ fontSize: 11, color: "#888", marginLeft: 18 }}>{m.processName}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: CHART_COLORS[idx % CHART_COLORS.length] }}>
                    {fmtNum(m.total)} kg
                  </div>
                </div>
              ))}
              {trendNote && (
                <div style={{ color: "#888", fontSize: 12, marginTop: 12 }}>{trendNote}</div>
              )}
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}
