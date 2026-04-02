"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Button,
  Space,
  Tag,
  Card,
  Descriptions,
  Tabs,
  Spin,
  Empty,
  message,
  Popconfirm,
} from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined, StopOutlined } from "@ant-design/icons";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import dayjs from "dayjs";
import dynamic from "next/dynamic";

// Lazy-load progress tab (chart libraries)
const OrderProgressTab = dynamic(
  () => import("@/components/kdsx/OrderProgressTab"),
  { loading: () => <Spin style={{ display: "block", margin: "32px auto" }} /> },
);

const { Title } = Typography;

type OrderStatus = "ACTIVE" | "DONE" | "OVERDUE" | "CANCELLED";

interface SalesOrderItem {
  id: number;
  itemId: number;
  item: { id: number; name: string; code: string | null };
  plannedQty: number;
  allocatedQty: number;
  unitPrice: number;
  note: string | null;
}

interface OrderDetail {
  id: number;
  orderNo: string;
  status: OrderStatus;
  isActive: boolean;
  deliveryDate: string;
  startDate: string | null;
  signedDate: string | null;
  completedDate: string | null;
  note: string | null;
  customer: { id: number; name: string; code: string | null };
  factory: { id: number; name: string };
  items: SalesOrderItem[];
}

const STATUS_BADGE: Record<OrderStatus, { color: string; text: string }> = {
  ACTIVE:    { color: "green",   text: "Đang sản xuất" },
  DONE:      { color: "blue",    text: "Hoàn thành" },
  OVERDUE:   { color: "red",     text: "Quá hạn" },
  CANCELLED: { color: "default", text: "Đã hủy" },
};

const fmtDate = (d: string | null | undefined) =>
  d ? dayjs(d).format("DD/MM/YYYY") : "—";
const fmtKg = (v: number) => `${v.toLocaleString("vi-VN")} kg`;

export default function KdsxSalesOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const { data: session } = useSession();
  const isManager =
    (session?.user as any)?.role === "ADMIN" ||
    (session?.user as any)?.accessLevel === "MANAGER";

  // Auto-open progress tab when URL has ?tab=progress
  const defaultTab = searchParams?.get("tab") === "progress" ? "progress" : "info";

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kdsx/sales-orders/${id}`);
      if (!res.ok) { router.push("/kdsx/sales-orders"); return; }
      setOrder(await res.json());
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const handleStatusChange = async (status: "DONE" | "CANCELLED") => {
    try {
      if (status === "DONE") setCompleting(true);
      else setCancelling(true);
      const res = await fetch(`/api/kdsx/sales-orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      message.success(status === "DONE" ? "Đã đánh dấu hoàn thành" : "Đã hủy hợp đồng");
      fetchOrder();
    } catch (e: any) {
      message.error(e.message ?? "Lỗi");
    } finally {
      setCompleting(false);
      setCancelling(false);
    }
  };

  if (loading) return <div style={{ padding: 48, textAlign: "center" }}><Spin size="large" /></div>;
  if (!order) return <div style={{ padding: 24 }}><Empty description="Không tìm thấy hợp đồng" /></div>;

  const canAct = order.status === "ACTIVE" || order.status === "OVERDUE";
  const statusCfg = STATUS_BADGE[order.status] ?? { color: "default", text: order.status };

  const totalQty = order.items.reduce((s, i) => s + i.plannedQty, 0);
  const totalAlloc = order.items.reduce((s, i) => s + i.allocatedQty, 0);

  const tabItems = [
    {
      key: "info",
      label: "Thông tin hợp đồng",
      children: (
        <Card size="small">
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
            <Descriptions.Item label="Số HĐ">{order.orderNo}</Descriptions.Item>
            <Descriptions.Item label="Khách hàng">{order.customer.name}</Descriptions.Item>
            <Descriptions.Item label="Nhà máy">{order.factory.name}</Descriptions.Item>
            <Descriptions.Item label="Ngày ký">{fmtDate(order.signedDate)}</Descriptions.Item>
            <Descriptions.Item label="Deadline giao hàng">
              {fmtDate(order.deliveryDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Ngày bắt đầu SX">
              {fmtDate(order.startDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Ngày hoàn thành">
              {fmtDate(order.completedDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Hiệu lực">
              <Tag color={order.isActive ? "green" : "red"}>
                {order.isActive ? "Hiệu lực" : "Hết hiệu lực"}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Tiến độ tổng">
              {fmtKg(totalAlloc)} / {fmtKg(totalQty)}
            </Descriptions.Item>
            {order.note && (
              <Descriptions.Item label="Ghi chú" span={3}>{order.note}</Descriptions.Item>
            )}
          </Descriptions>

          <div style={{ marginTop: 16 }}>
            <Title level={5}>Chi tiết mặt hàng</Title>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  {["Mặt hàng", "Số lượng HĐ", "Đơn giá (USD/kg)", "Ghi chú"].map((h) => (
                    <th
                      key={h}
                      style={{ padding: "6px 8px", border: "1px solid #f0f0f0", textAlign: "left" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.items.map((it) => (
                  <tr key={it.id}>
                    <td style={{ padding: "6px 8px", border: "1px solid #f0f0f0" }}>
                      {it.item.code ? <Tag>{it.item.code}</Tag> : null}{it.item.name}
                    </td>
                    <td style={{ padding: "6px 8px", border: "1px solid #f0f0f0", textAlign: "right" }}>
                      {fmtKg(it.plannedQty)}
                    </td>
                    <td style={{ padding: "6px 8px", border: "1px solid #f0f0f0", textAlign: "right" }}>
                      {it.unitPrice.toFixed(3)}
                    </td>
                    <td style={{ padding: "6px 8px", border: "1px solid #f0f0f0" }}>
                      {it.note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ),
    },
    {
      key: "progress",
      label: "Tiến độ sản xuất",
      children: <OrderProgressTab orderId={Number(id)} />,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/kdsx/sales-orders")}>
          Quay lại
        </Button>
        <Title level={4} style={{ margin: 0 }}>{order.orderNo}</Title>
        <Tag color={statusCfg.color}>{statusCfg.text}</Tag>
        <div style={{ flex: 1 }} />
        {isManager && canAct && (
          <Space>
            <Popconfirm
              title="Xác nhận đánh dấu hoàn thành hợp đồng này?"
              onConfirm={() => handleStatusChange("DONE")}
              okText="Hoàn thành"
            >
              <Button type="primary" icon={<CheckCircleOutlined />} loading={completing}>
                Đánh dấu hoàn thành
              </Button>
            </Popconfirm>
            <Popconfirm
              title="Xác nhận hủy hợp đồng này? Không thể hoàn tác."
              onConfirm={() => handleStatusChange("CANCELLED")}
              okText="Xác nhận hủy"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<StopOutlined />} loading={cancelling}>
                Hủy HĐ
              </Button>
            </Popconfirm>
          </Space>
        )}
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        destroyInactiveTabPane={false}
      />
    </div>
  );
}
