"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Table,
  Progress,
  Space,
  Typography,
  Tabs,
  Empty,
  Button,
  Tag,
  message,
  Spin,
} from "antd";
import { SyncOutlined } from "@ant-design/icons";
import { useSession } from "next-auth/react";
import dayjs from "dayjs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const { Text } = Typography;

// ── Types ────────────────────────────────────────────────────────────────────
interface CumulativePoint {
  date: string;
  qty: number;
  cumulative: number;
}

interface OrderItemDetail {
  id: number;
  itemId: number;
  item: { id: number; name: string; code: string | null };
  plannedQty: number;
  allocatedQty: number;
  remainingQty: number;
  progressPct: number;
  estimatedDoneDate: string | null;
  cumulativeData: CumulativePoint[];
}

interface OrderDetail {
  id: number;
  orderNo: string;
  factoryId: number;
  status: string;
  deliveryDate: string;
  startDate: string | null;
  items: OrderItemDetail[];
}

const fmtKg = (v: number) => `${v.toLocaleString("vi-VN")} kg`;
const fmtDate = (d: string | null | undefined) =>
  d ? dayjs(d).format("DD/MM/YYYY") : "—";

// ── Chart builder ────────────────────────────────────────────────────────────
function buildChartData(item: OrderItemDetail, startDate: string | null, deliveryDate: string) {
  if (!item.cumulativeData || item.cumulativeData.length === 0) return [];

  const start = startDate
    ? dayjs(startDate)
    : dayjs(item.cumulativeData[0].date);
  const end = dayjs(deliveryDate);
  const totalDays = Math.max(1, end.diff(start, "day"));

  return item.cumulativeData.map(({ date, cumulative }) => {
    const dayOffset = Math.max(0, dayjs(date).diff(start, "day"));
    const ideal = Math.min(item.plannedQty, (item.plannedQty * dayOffset) / totalDays);
    return {
      date,
      label: dayjs(date).format("DD/MM"),
      actual: Math.round(cumulative),
      target: item.plannedQty,
      ideal: Math.round(ideal),
    };
  });
}

// ── Item progress color ───────────────────────────────────────────────────────
function itemProgressStatus(
  estimatedDoneDate: string | null,
  deliveryDate: string,
  orderStatus: string,
): "success" | "exception" | "active" | "normal" {
  if (orderStatus === "OVERDUE") return "exception";
  if (!estimatedDoneDate) return "active"; // no benchmark → neutral
  if (dayjs(estimatedDoneDate).isAfter(dayjs(deliveryDate))) return "exception";
  return "success";
}

// ── Main Component ────────────────────────────────────────────────────────────
interface Props {
  orderId: number;
}

export default function OrderProgressTab({ orderId }: Props) {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalcLoading, setRecalcLoading] = useState(false);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kdsx/sales-orders/${orderId}`);
      if (res.ok) setOrder(await res.json());
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const handleRecalculate = async () => {
    if (!order) return;
    setRecalcLoading(true);
    try {
      // Tính lại 90 ngày gần nhất cho nhà máy này
      const today = dayjs();
      const res = await fetch("/api/kdsx/sales-orders/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factoryId: order.factoryId,
          fromDate: today.subtract(90, "day").format("YYYY-MM-DD"),
          toDate: today.format("YYYY-MM-DD"),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      message.success("Đã cập nhật tiến độ");
      fetchOrder();
    } catch (e: any) {
      message.error(e.message ?? "Lỗi cập nhật");
    } finally {
      setRecalcLoading(false);
    }
  };

  if (loading) return <div style={{ padding: 32, textAlign: "center" }}><Spin /></div>;
  if (!order) return <Empty description="Không tải được dữ liệu" />;

  // ── Progress table ──────────────────────────────────────────────────────
  const progressColumns = [
    {
      title: "Mặt hàng",
      key: "name",
      render: (_: unknown, r: OrderItemDetail) => (
        <Space>
          {r.item.code && <Tag>{r.item.code}</Tag>}
          {r.item.name}
        </Space>
      ),
    },
    {
      title: "Cần giao",
      dataIndex: "plannedQty",
      align: "right" as const,
      render: (v: number) => fmtKg(v),
    },
    {
      title: "Đã SX",
      dataIndex: "allocatedQty",
      align: "right" as const,
      render: (v: number) => fmtKg(v),
    },
    {
      title: "Còn lại",
      dataIndex: "remainingQty",
      align: "right" as const,
      render: (v: number) => (
        <Text type={v > 0 ? "danger" : "secondary"}>{fmtKg(v)}</Text>
      ),
    },
    {
      title: "Tiến độ",
      dataIndex: "progressPct",
      width: 220,
      render: (pct: number, row: OrderItemDetail) => {
        const surplusQty = Math.max(0, row.allocatedQty - row.plannedQty);
        return (
          <>
            <Space>
              <Progress
                percent={Math.min(100, pct)}
                size="small"
                style={{ width: 110, margin: 0 }}
                status={itemProgressStatus(row.estimatedDoneDate, order.deliveryDate, order.status)}
              />
              <Text style={{ fontSize: 12, whiteSpace: "nowrap" }}>{pct.toFixed(1)}%</Text>
            </Space>
            {surplusQty > 0 && (
              <div style={{ fontSize: 11, color: "#52c41a", marginTop: 2 }}>
                +{surplusQty.toLocaleString("vi-VN")} kg dư
              </div>
            )}
          </>
        );
      },
    },
    {
      title: "Dự kiến xong",
      dataIndex: "estimatedDoneDate",
      render: (d: string | null, row: OrderItemDetail) => {
        if (!d) return <Text type="secondary">— (chưa có ĐM)</Text>;
        const late = dayjs(d).isAfter(dayjs(order.deliveryDate));
        return (
          <Text type={late ? "warning" : "success"}>
            {fmtDate(d)} {late ? "⚠" : "✓"}
          </Text>
        );
      },
    },
  ];

  // ── Chart tabs ──────────────────────────────────────────────────────────
  const chartTabs = order.items.map((item) => {
    const chartData = buildChartData(item, order.startDate, order.deliveryDate);
    return {
      key: String(item.id),
      label: item.item.name,
      children:
        chartData.length === 0 ? (
          <Empty description="Chưa có dữ liệu sản xuất" style={{ padding: 32 }} />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(v: number | undefined, name: string | undefined) =>
                  [
                    v != null ? fmtKg(v) : "—",
                    name === "actual"
                      ? "Thực tế tích lũy"
                      : name === "target"
                      ? "Kế hoạch"
                      : "Tiến độ lý tưởng",
                  ] as [string, string]
                }
                labelFormatter={(l) => `Ngày ${l}`}
              />
              <Legend
                formatter={(v) =>
                  v === "actual"
                    ? "Thực tế tích lũy"
                    : v === "target"
                    ? "Kế hoạch"
                    : "Tiến độ lý tưởng"
                }
              />
              <Line
                type="monotone"
                dataKey="target"
                stroke="#ff4d4f"
                strokeDasharray="6 3"
                dot={false}
                strokeWidth={1.5}
              />
              <Line
                type="monotone"
                dataKey="ideal"
                stroke="#fa8c16"
                strokeDasharray="4 4"
                dot={false}
                strokeWidth={1.5}
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#1677ff"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <ReferenceLine
                x={dayjs(order.deliveryDate).format("DD/MM")}
                stroke="#ff4d4f"
                strokeDasharray="3 3"
                label={{ value: "Deadline", position: "top", fontSize: 11, fill: "#ff4d4f" }}
              />
            </LineChart>
          </ResponsiveContainer>
        ),
    };
  });

  return (
    <div>
      {/* Header actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        {isAdmin && (
          <Button
            icon={<SyncOutlined spin={recalcLoading} />}
            loading={recalcLoading}
            onClick={handleRecalculate}
          >
            Tính lại tiến độ
          </Button>
        )}
      </div>

      {/* Progress table */}
      <Table
        dataSource={order.items}
        columns={progressColumns}
        rowKey="id"
        pagination={false}
        size="small"
        scroll={{ x: 700 }}
        style={{ marginBottom: 24 }}
      />

      {/* Chart */}
      <div>
        <Text strong style={{ display: "block", marginBottom: 8 }}>
          Biểu đồ sản lượng tích lũy
        </Text>
        {order.items.length === 0 ? (
          <Empty description="Không có mặt hàng" />
        ) : order.items.length === 1 ? (
          chartTabs[0].children
        ) : (
          <Tabs items={chartTabs} size="small" />
        )}
        <div style={{ marginTop: 8, fontSize: 12, color: "#999" }}>
          <Space size={16}>
            <span><span style={{ color: "#1677ff" }}>─</span> Thực tế tích lũy</span>
            <span><span style={{ color: "#ff4d4f" }}>╌</span> Kế hoạch</span>
            <span><span style={{ color: "#fa8c16" }}>╌</span> Tiến độ lý tưởng</span>
          </Space>
        </div>
      </div>
    </div>
  );
}
