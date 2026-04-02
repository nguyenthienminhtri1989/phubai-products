"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Button,
  Space,
  Tag,
  Badge,
  Card,
  Row,
  Col,
  Progress,
  Table,
  Descriptions,
  Modal,
  Input,
  Spin,
  Empty,
  Tabs,
  message,
  Popconfirm,
} from "antd";
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { useRouter, useParams } from "next/navigation";
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

const { Title, Text } = Typography;

// ── Types ─────────────────────────────────────────────────────────────────
type OrderStatus = "ACTIVE" | "DONE" | "OVERDUE" | "CANCELLED";

interface Allocation {
  productionDate: string;
  allocatedQty: number;
}

interface OrderItemDetail {
  id: number;
  itemId: number;
  item: { id: number; name: string; code: string | null };
  plannedQty: number;
  allocatedQty: number;
  unitPrice: number;
  allocations: Allocation[];
  remainingQty: number;
  progressPct: number;
  estimatedDoneDate: string | null;
}

interface OrderDetail {
  id: number;
  orderNo: string;
  status: OrderStatus;
  deliveryDate: string;
  startDate: string | null;
  completedDate: string | null;
  note: string | null;
  customer: { id: number; name: string; code: string | null };
  factory: { id: number; name: string };
  items: OrderItemDetail[];
}

// ── Constants ──────────────────────────────────────────────────────────────
const STATUS_BADGE: Record<OrderStatus, { color: string; text: string }> = {
  ACTIVE:    { color: "green",   text: "Đang sản xuất" },
  DONE:      { color: "blue",    text: "Hoàn thành" },
  OVERDUE:   { color: "red",     text: "Quá hạn" },
  CANCELLED: { color: "default", text: "Đã hủy" },
};

const fmtKg  = (v: number) => `${v.toLocaleString("vi-VN")} kg`;
const fmtDate = (d: string | null | undefined) => d ? dayjs(d).format("DD/MM/YYYY") : "—";

// ── Chart builder ──────────────────────────────────────────────────────────
function buildChartData(
  item: OrderItemDetail,
  startDate: string | null,
  deliveryDate: string,
) {
  if (!item.allocations || item.allocations.length === 0) return [];

  // Group allocations by date and sort
  const byDate = new Map<string, number>();
  for (const a of item.allocations) {
    const d = a.productionDate.split("T")[0];
    byDate.set(d, (byDate.get(d) ?? 0) + a.allocatedQty);
  }
  const sortedDates = Array.from(byDate.keys()).sort();

  // Ideal progress: linear from startDate → deliveryDate
  const start = startDate ? dayjs(startDate) : dayjs(sortedDates[0]);
  const end = dayjs(deliveryDate);
  const totalDays = Math.max(1, end.diff(start, "day"));

  let cumulative = 0;
  return sortedDates.map((date) => {
    cumulative += byDate.get(date)!;
    const dayOffset = Math.max(0, dayjs(date).diff(start, "day"));
    const ideal = Math.min(item.plannedQty, (item.plannedQty * dayOffset) / totalDays);
    return {
      date,
      label: dayjs(date).format("DD/MM"),
      actual: Math.round(cumulative),
      target: item.plannedQty,
      ideal:  Math.round(ideal),
    };
  });
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function SalesOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const isManager = isAdmin || (session?.user as any)?.accessLevel === "MANAGER";

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Cancel modal
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Complete
  const [completing, setCompleting] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────
  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kdsx/sales-orders/${id}`);
      if (!res.ok) { router.push("/sales-orders"); return; }
      setOrder(await res.json());
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  // ── Actions ────────────────────────────────────────────────────────────
  const handleComplete = async () => {
    setCompleting(true);
    try {
      const res = await fetch(`/api/kdsx/sales-orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      message.success("Đã đánh dấu hoàn thành");
      fetchOrder();
    } catch (e: any) {
      message.error(e.message ?? "Lỗi");
    } finally {
      setCompleting(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason || cancelReason.trim().length < 5) {
      message.warning("Lý do hủy tối thiểu 5 ký tự");
      return;
    }
    setCancelling(true);
    try {
      const res = await fetch(`/api/kdsx/sales-orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      message.success("Đã hủy hợp đồng");
      setCancelOpen(false);
      setCancelReason("");
      fetchOrder();
    } catch (e: any) {
      message.error(e.message ?? "Lỗi");
    } finally {
      setCancelling(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) return <div style={{ padding: 48, textAlign: "center" }}><Spin size="large" /></div>;
  if (!order)  return <div style={{ padding: 24 }}><Empty description="Không tìm thấy hợp đồng" /></div>;

  const canAct = order.status === "ACTIVE" || order.status === "OVERDUE";
  const statusCfg = STATUS_BADGE[order.status];

  // Total progress
  const totalQty = order.items.reduce((s, i) => s + i.plannedQty, 0);
  const totalAlloc = order.items.reduce((s, i) => s + i.allocatedQty, 0);
  const totalProgress = totalQty > 0 ? Math.min(100, (totalAlloc / totalQty) * 100) : 0;

  // ── Progress table ─────────────────────────────────────────────��─────
  const progressColumns = [
    {
      title: "Mặt hàng",
      dataIndex: ["item", "name"],
      key: "name",
    },
    {
      title: "Cần giao",
      dataIndex: "plannedQty",
      key: "plannedQty",
      align: "right" as const,
      render: (v: number) => fmtKg(v),
    },
    {
      title: "Đã SX",
      dataIndex: "allocatedQty",
      key: "allocatedQty",
      align: "right" as const,
      render: (v: number) => fmtKg(v),
    },
    {
      title: "Còn lại",
      dataIndex: "remainingQty",
      key: "remainingQty",
      align: "right" as const,
      render: (v: number) => <Text type={v > 0 ? "danger" : "secondary"}>{fmtKg(v)}</Text>,
    },
    {
      title: "Tiến độ",
      dataIndex: "progressPct",
      key: "progressPct",
      width: 180,
      render: (pct: number, row: OrderItemDetail) => (
        <Space>
          <Progress
            percent={Math.min(100, pct)}
            size="small"
            style={{ width: 100, margin: 0 }}
            status={row.remainingQty === 0 ? "success" : "active"}
          />
          <Text style={{ fontSize: 12 }}>{pct.toFixed(1)}%</Text>
        </Space>
      ),
    },
    {
      title: "Dự kiến xong",
      dataIndex: "estimatedDoneDate",
      key: "estimatedDoneDate",
      render: (d: string | null, row: OrderItemDetail) => {
        if (!d) return <Text type="secondary">—</Text>;
        const onTime = !dayjs(d).isAfter(dayjs(order.deliveryDate));
        return (
          <Text type={onTime ? "success" : "warning"}>
            {fmtDate(d)} {onTime ? "✓" : "⚠"}
          </Text>
        );
      },
    },
  ];

  // ── Chart tabs (1 per item) ──────────────────────────────────────────
  const chartTabs = order.items.map((item) => {
    const chartData = buildChartData(item, order.startDate, order.deliveryDate);
    return {
      key: String(item.id),
      label: item.item.name,
      children: chartData.length === 0 ? (
        <Empty description="Chưa có dữ liệu sản xuất" style={{ padding: 32 }} />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(v: number | undefined, name: string | undefined) => [
                v != null ? fmtKg(v) : "—",
                name === "actual" ? "Thực tế tích lũy"
                  : name === "target" ? "Kế hoạch"
                  : "Tiến độ lý tưởng",
              ] as [string, string]}
              labelFormatter={(l) => `Ngày ${l}`}
            />
            <Legend
              formatter={(v) =>
                v === "actual" ? "Thực tế tích lũy"
                  : v === "target" ? "Kế hoạch"
                  : "Tiến độ lý tưởng"
              }
            />
            {/* Target: đường ngang mục tiêu */}
            <Line
              type="monotone"
              dataKey="target"
              stroke="#ff4d4f"
              strokeDasharray="6 3"
              dot={false}
              strokeWidth={1.5}
            />
            {/* Ideal: tiến độ tuyến tính lý tưởng */}
            <Line
              type="monotone"
              dataKey="ideal"
              stroke="#fa8c16"
              strokeDasharray="4 4"
              dot={false}
              strokeWidth={1.5}
            />
            {/* Actual: thực tế tích lũy */}
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#1677ff"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            {/* Deadline marker */}
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
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/sales-orders")}>
          Quay lại
        </Button>
        <Title level={4} style={{ margin: 0 }}>{order.orderNo}</Title>
        <Badge color={statusCfg.color} text={statusCfg.text} />
        <div style={{ flex: 1 }} />
        {isManager && canAct && (
          <Space>
            <Popconfirm
              title="Xác nhận hoàn thành hợp đồng này?"
              onConfirm={handleComplete}
              okText="Hoàn thành"
            >
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={completing}
              >
                Đánh dấu hoàn thành
              </Button>
            </Popconfirm>
            <Button
              danger
              icon={<StopOutlined />}
              onClick={() => { setCancelOpen(true); setCancelReason(""); }}
            >
              Hủy HĐ
            </Button>
          </Space>
        )}
      </div>

      <Row gutter={[16, 16]}>
        {/* Section 1: Info */}
        <Col span={24}>
          <Card title="Thông tin hợp đồng" size="small">
            <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
              <Descriptions.Item label="Số HĐ">{order.orderNo}</Descriptions.Item>
              <Descriptions.Item label="Khách hàng">{order.customer.name}</Descriptions.Item>
              <Descriptions.Item label="Nhà máy">{order.factory.name}</Descriptions.Item>
              <Descriptions.Item label="Deadline">{fmtDate(order.deliveryDate)}</Descriptions.Item>
              <Descriptions.Item label="Ngày bắt đầu">{fmtDate(order.startDate)}</Descriptions.Item>
              <Descriptions.Item label="Ngày hoàn thành">{fmtDate(order.completedDate)}</Descriptions.Item>
              <Descriptions.Item label="Tiến độ tổng" span={3}>
                <Space>
                  <Progress
                    percent={Math.round(totalProgress * 10) / 10}
                    style={{ width: 200, margin: 0 }}
                    status={totalProgress >= 100 ? "success" : "active"}
                  />
                  <Text>{fmtKg(totalAlloc)} / {fmtKg(totalQty)}</Text>
                </Space>
              </Descriptions.Item>
              {order.note && (
                <Descriptions.Item label="Ghi chú" span={3}>{order.note}</Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        </Col>

        {/* Section 2: Progress per item */}
        <Col span={24}>
          <Card title="Tiến độ từng mặt hàng" size="small">
            <Table
              dataSource={order.items}
              columns={progressColumns}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 600 }}
            />
          </Card>
        </Col>

        {/* Section 3: Cumulative chart */}
        <Col span={24}>
          <Card title="Biểu đồ sản lượng tích lũy" size="small">
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
                <span><span style={{ color: "#ff4d4f" }}>╌</span> Kế hoạch (mục tiêu)</span>
                <span><span style={{ color: "#fa8c16" }}>╌</span> Tiến độ lý tưởng</span>
              </Space>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Cancel modal */}
      <Modal
        title="Hủy hợp đồng"
        open={cancelOpen}
        onOk={handleCancel}
        onCancel={() => { setCancelOpen(false); setCancelReason(""); }}
        confirmLoading={cancelling}
        okText="Xác nhận hủy"
        okButtonProps={{ danger: true }}
      >
        <p>Nhập lý do hủy hợp đồng <strong>{order.orderNo}</strong>:</p>
        <Input.TextArea
          rows={3}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Tối thiểu 5 ký tự..."
        />
      </Modal>
    </div>
  );
}
