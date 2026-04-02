"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Select,
  Button,
  Row,
  Col,
  Card,
  Progress,
  Tag,
  Space,
  Empty,
  Spin,
  message,
  Badge,
} from "antd";
import { SyncOutlined, RightOutlined, WarningOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dayjs from "dayjs";

const { Title, Text } = Typography;

// ── Types ────────────────────────────────────────────────────────────────────
interface ProgressItem {
  itemId: number;
  itemName: string;
  itemCode: string | null;
  plannedQty: number;
  allocatedQty: number;
  remainingQty: number;
  progressPct: number;
  estimatedDoneDate: string | null;
}

interface OrderProgress {
  id: number;
  orderNo: string;
  customerName: string;
  deliveryDate: string;
  status: "ACTIVE" | "OVERDUE";
  daysUntilDeadline: number;
  overallProgressPct: number;
  isAtRisk: boolean;
  items: ProgressItem[];
}

interface Factory { id: number; name: string; }

const fmtKg = (v: number) => `${v.toLocaleString("vi-VN")} kg`;
const fmtDate = (d: string) => dayjs(d).format("DD/MM/YYYY");

// ── Card border color ─────────────────────────────────────────────────────────
function cardBorderColor(order: OrderProgress): string {
  if (order.status === "OVERDUE") return "#ff4d4f";
  if (order.isAtRisk) return "#fa8c16";
  return "#52c41a";
}

// ── Single order card ─────────────────────────────────────────────────────────
function OrderCard({ order, onViewDetail }: { order: OrderProgress; onViewDetail: (id: number) => void }) {
  const border = cardBorderColor(order);

  return (
    <Card
      size="small"
      style={{ borderLeft: `4px solid ${border}`, height: "100%" }}
      styles={{ body: { padding: "12px 16px" } }}
    >
      {/* Card header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <Text strong style={{ fontSize: 14 }}>{order.orderNo}</Text>
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{order.customerName}</Text>
        </div>
        <Space size={4}>
          {order.isAtRisk && order.status !== "OVERDUE" && (
            <Tag color="orange" icon={<WarningOutlined />}>Rủi ro</Tag>
          )}
          {order.status === "OVERDUE" && <Tag color="red">Quá hạn</Tag>}
        </Space>
      </div>

      <div style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 12, color: "#666" }}>
          Deadline: <strong>{fmtDate(order.deliveryDate)}</strong>
          {" · "}
          {order.daysUntilDeadline >= 0
            ? <span style={{ color: order.daysUntilDeadline <= 3 ? "#ff4d4f" : "#666" }}>
                Còn {order.daysUntilDeadline} ngày
              </span>
            : <span style={{ color: "#ff4d4f" }}>Quá {Math.abs(order.daysUntilDeadline)} ngày</span>
          }
        </Text>
      </div>

      {/* Per-item progress */}
      {order.items.map((item) => {
        const late = item.estimatedDoneDate
          ? dayjs(item.estimatedDoneDate).isAfter(dayjs(order.deliveryDate))
          : false;
        return (
          <div key={item.itemId} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <Text style={{ fontSize: 12 }}>
                {item.itemCode ? <Tag style={{ fontSize: 10, padding: "0 4px" }}>{item.itemCode}</Tag> : null}
                {item.itemName}
              </Text>
              <Text style={{ fontSize: 11, color: "#888" }}>
                {fmtKg(item.allocatedQty)} / {fmtKg(item.plannedQty)}
              </Text>
            </div>
            <Progress
              percent={Math.min(100, item.progressPct)}
              size="small"
              status={
                order.status === "OVERDUE" ? "exception"
                : late ? "exception"
                : item.remainingQty === 0 ? "success"
                : "active"
              }
              strokeColor={late ? "#fa8c16" : undefined}
              style={{ margin: 0 }}
            />
            {item.remainingQty > 0 && (
              <Text style={{ fontSize: 11, color: "#999" }}>
                Còn {fmtKg(item.remainingQty)}
                {item.estimatedDoneDate && (
                  <span style={{ color: late ? "#fa8c16" : "#52c41a" }}>
                    {" · Dự kiến xong "}{fmtDate(item.estimatedDoneDate)}
                    {" "}{late ? "❌" : "✓"}
                  </span>
                )}
              </Text>
            )}
          </div>
        );
      })}

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, borderTop: "1px solid #f0f0f0", paddingTop: 8 }}>
        <Text style={{ fontSize: 12, color: "#888" }}>
          Tổng: {order.overallProgressPct.toFixed(1)}%
        </Text>
        <Button
          type="link"
          size="small"
          icon={<RightOutlined />}
          onClick={() => onViewDetail(order.id)}
          style={{ padding: 0, fontSize: 12 }}
        >
          Xem chi tiết
        </Button>
      </div>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OrderProgressPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryId, setFactoryId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>(["ACTIVE", "OVERDUE"]);

  const [orders, setOrders] = useState<OrderProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);

  // Load factories once
  useEffect(() => {
    fetch("/api/factories")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setFactories(data);
          if (data.length > 0) setFactoryId(data[0].id);
        }
      });
  }, []);

  const fetchProgress = useCallback(async () => {
    if (!factoryId) { setOrders([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        factoryId: String(factoryId),
        status: statusFilter.join(","),
      });
      const res = await fetch(`/api/kdsx/sales-orders/progress?${params}`);
      if (res.ok) setOrders(await res.json());
    } finally {
      setLoading(false);
    }
  }, [factoryId, statusFilter]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  const handleRecalculate = async () => {
    if (!factoryId) { message.warning("Chọn nhà máy trước"); return; }
    setRecalcLoading(true);
    try {
      const today = dayjs();
      const res = await fetch("/api/kdsx/sales-orders/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factoryId,
          fromDate: today.subtract(90, "day").format("YYYY-MM-DD"),
          toDate: today.format("YYYY-MM-DD"),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      message.success("Đã cập nhật tiến độ");
      fetchProgress();
    } catch (e: any) {
      message.error(e.message ?? "Lỗi cập nhật");
    } finally {
      setRecalcLoading(false);
    }
  };

  const handleViewDetail = (id: number) => {
    router.push(`/kdsx/sales-orders/${id}?tab=progress`);
  };

  // Stats
  const atRiskCount = orders.filter((o) => o.isAtRisk).length;
  const overdueCount = orders.filter((o) => o.status === "OVERDUE").length;

  return (
    <div>
      {/* Title + actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}>Tiến độ đơn hàng</Title>
        <Space>
          {isAdmin && (
            <Button
              icon={<SyncOutlined spin={recalcLoading} />}
              loading={recalcLoading}
              onClick={handleRecalculate}
              disabled={!factoryId}
            >
              Cập nhật tiến độ
            </Button>
          )}
        </Space>
      </div>

      {/* Filter bar */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          placeholder="Chọn nhà máy"
          value={factoryId}
          onChange={setFactoryId}
          options={factories.map((f) => ({ label: f.name, value: f.id }))}
          style={{ width: 160 }}
        />
        <Select
          mode="multiple"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { label: "Đang SX", value: "ACTIVE" },
            { label: "Quá hạn", value: "OVERDUE" },
            { label: "Hoàn thành", value: "DONE" },
            { label: "Đã huỷ", value: "CANCELLED" },
          ]}
          style={{ minWidth: 220 }}
          placeholder="Trạng thái"
        />
      </Space>

      {/* Summary badges */}
      {orders.length > 0 && (
        <Space style={{ marginBottom: 16 }}>
          <Badge count={orders.length} color="blue">
            <Tag>Tổng HĐ</Tag>
          </Badge>
          {overdueCount > 0 && (
            <Badge count={overdueCount} color="red">
              <Tag color="red">Quá hạn</Tag>
            </Badge>
          )}
          {atRiskCount > 0 && (
            <Badge count={atRiskCount} color="orange">
              <Tag color="orange">Có rủi ro</Tag>
            </Badge>
          )}
        </Space>
      )}

      {/* Cards grid */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 48 }}><Spin size="large" /></div>
      ) : orders.length === 0 ? (
        <Empty
          description={factoryId ? "Không có đơn hàng nào phù hợp bộ lọc" : "Chọn nhà máy để xem tiến độ"}
          style={{ padding: 48 }}
        />
      ) : (
        <Row gutter={[16, 16]}>
          {orders.map((order) => (
            <Col key={order.id} xs={24} sm={24} md={12} lg={8} xl={8}>
              <OrderCard order={order} onViewDetail={handleViewDetail} />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
