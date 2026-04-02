"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Table,
  Button,
  Space,
  Tag,
  Badge,
  Select,
  DatePicker,
  Tabs,
  Card,
  Row,
  Col,
  Progress,
  Modal,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Tooltip,
  Spin,
  message,
  Empty,
  Divider,
} from "antd";
import {
  PlusOutlined,
  EyeOutlined,
  StopOutlined,
  ReloadOutlined,
  WarningOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dayjs from "dayjs";

const { Title, Text } = Typography;

// ── Types ─────────────────────���─────────────────────────���─────────────────
type OrderStatus = "ACTIVE" | "DONE" | "OVERDUE" | "CANCELLED";

interface Factory { id: number; name: string }
interface Customer { id: number; name: string; code: string | null }
interface Item { id: number; name: string; code: string | null }

interface SalesOrderItem {
  id: number;
  itemId: number;
  item: { id: number; name: string; code: string | null };
  plannedQty: number;
  allocatedQty: number;
  unitPrice: number;
}

interface SalesOrder {
  id: number;
  orderNo: string;
  status: OrderStatus;
  deliveryDate: string;
  customerId: number;
  factoryId: number;
  customer: { id: number; name: string };
  factory: { id: number; name: string };
  items: SalesOrderItem[];
}

interface OrderProgress {
  id: number;
  contractCode: string;
  customerName: string;
  deliveryDate: string;
  status: OrderStatus;
  daysUntilDeadline: number;
  overallProgressPct: number;
  isAtRisk: boolean;
  items: {
    itemId: number;
    itemName: string;
    qtyOrdered: number;
    allocatedQty: number;
    remainingQty: number;
    progressPct: number;
    estimatedDoneDate: string | null;
  }[];
}

// ── Constants ─────────────────────────────────────────────────���───────────
const STATUS_BADGE: Record<OrderStatus, { color: string; text: string }> = {
  ACTIVE:    { color: "green",   text: "Đang sản xuất" },
  DONE:      { color: "blue",    text: "Hoàn thành" },
  OVERDUE:   { color: "red",     text: "Quá hạn" },
  CANCELLED: { color: "default", text: "Đã hủy" },
};

const fmtKg = (v: number) => `${v.toLocaleString("vi-VN")} kg`;
const fmtDate = (d: string) => dayjs(d).format("DD/MM/YYYY");

// ── Progress bar color logic ───────────────────────────────────────────────
function progressStrokeColor(
  status: OrderStatus,
  estimatedDoneDate: string | null,
  deliveryDate: string,
): string {
  if (status === "OVERDUE") return "#ff4d4f";
  if (!estimatedDoneDate) return "#d9d9d9"; // no benchmark
  if (dayjs(estimatedDoneDate).isAfter(dayjs(deliveryDate))) return "#fa8c16"; // at risk
  return "#52c41a"; // on track
}

// ── Main Component ────────────────────────────────────────────────────────��
export default function SalesOrdersPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const isManager = isAdmin || (session?.user as any)?.accessLevel === "MANAGER";

  // Filter state
  const [factoryId, setFactoryId] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterMonth, setFilterMonth] = useState<string | undefined>();
  const [filterCustomer, setFilterCustomer] = useState<number | undefined>();

  // Data state
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [progressData, setProgressData] = useState<OrderProgress[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("list");

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [createItems, setCreateItems] = useState<
    { itemId?: number; qtyOrdered?: number; unitPrice?: number; deliveryDate?: string }[]
  >([{}]);
  const [creating, setCreating] = useState(false);

  // Cancel modal
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // ── Load reference data once ────────────���────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch("/api/factories").then((r) => r.json()),
      fetch("/api/kdsx/customers").then((r) => r.json()),
      fetch("/api/items").then((r) => r.json()),
    ]).then(([f, c, it]) => {
      setFactories(Array.isArray(f) ? f : []);
      setCustomers(Array.isArray(c) ? c : []);
      setItems(Array.isArray(it) ? it : []);
    });
  }, []);

  // ── Fetch list ───────────────────────────────────────────────────────��────
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (factoryId) params.set("factoryId", String(factoryId));
      if (filterCustomer) params.set("customerId", String(filterCustomer));
      // status + month filtering handled client-side until corrected Part 3 redesigns this page
      const res = await fetch(`/api/kdsx/sales-orders?${params}`);
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [factoryId, filterStatus, filterMonth, filterCustomer]);

  // ── Fetch progress ────────────────────────────────────────────────────────
  const fetchProgress = useCallback(async () => {
    if (!factoryId) { setProgressData([]); return; }
    setProgressLoading(true);
    try {
      const params = new URLSearchParams({ factoryId: String(factoryId) });
      const res = await fetch(`/api/kdsx/sales-orders/progress?${params}`);
      const data = await res.json();
      setProgressData(Array.isArray(data) ? data : []);
    } finally {
      setProgressLoading(false);
    }
  }, [factoryId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { if (activeTab === "progress") fetchProgress(); }, [activeTab, fetchProgress]);

  // ── Recalculate ───────────────────────────────────────────────────────────
  const handleRecalculate = async () => {
    if (!factoryId) { message.warning("Chọn nhà máy trước"); return; }
    setRecalcLoading(true);
    try {
      const today = dayjs();
      const from = today.subtract(90, "day").format("YYYY-MM-DD");
      const to = today.format("YYYY-MM-DD");
      const res = await fetch("/api/kdsx/sales-orders/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factoryId, fromDate: from, toDate: to }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      message.success("Đã cập nhật tiến độ");
      fetchProgress();
      fetchOrders();
    } catch (e: any) {
      message.error(e.message ?? "Lỗi cập nhật");
    } finally {
      setRecalcLoading(false);
    }
  };

  // ── Create order ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreating(true);
      const payload = {
        orderNo: values.contractCode,
        customerId: values.customerId,
        factoryId: values.factoryId,
        deliveryDate: values.deliveryDate?.format("YYYY-MM-DD"),
        startDate: values.startDate?.format("YYYY-MM-DD"),
        note: values.note,
        items: createItems.map((it) => ({
          itemId: it.itemId,
          plannedQty: it.qtyOrdered,
          unitPrice: it.unitPrice ?? 0,
        })),
      };
      const res = await fetch("/api/kdsx/sales-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      message.success("Tạo hợp đồng thành công");
      setCreateOpen(false);
      createForm.resetFields();
      setCreateItems([{}]);
      fetchOrders();
    } catch (e: any) {
      message.error(e.message ?? "Lỗi tạo hợp đồng");
    } finally {
      setCreating(false);
    }
  };

  // ── Cancel order ──────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!cancelId) return;
    if (!cancelReason || cancelReason.trim().length < 5) {
      message.warning("Lý do hủy tối thiểu 5 ký tự");
      return;
    }
    setCancelling(true);
    try {
      const res = await fetch(`/api/kdsx/sales-orders/${cancelId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      message.success("Đã hủy hợp đồng");
      setCancelId(null);
      setCancelReason("");
      fetchOrders();
      if (activeTab === "progress") fetchProgress();
    } catch (e: any) {
      message.error(e.message ?? "Lỗi hủy hợp đồng");
    } finally {
      setCancelling(false);
    }
  };

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    {
      title: "Mã HĐ",
      dataIndex: "orderNo",
      key: "orderNo",
      render: (v: string, row: SalesOrder) => (
        <Button type="link" onClick={() => router.push(`/sales-orders/${row.id}`)} style={{ padding: 0 }}>
          {v}
        </Button>
      ),
    },
    {
      title: "Khách hàng",
      dataIndex: ["customer", "name"],
      key: "customer",
    },
    {
      title: "Mặt hàng",
      key: "items",
      render: (_: any, row: SalesOrder) => (
        <Space size={4} wrap>
          {row.items.map((it) => (
            <Tag key={it.id} style={{ margin: 0 }}>{it.item.name}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "Cần giao (kg)",
      key: "plannedQty",
      align: "right" as const,
      render: (_: any, row: SalesOrder) =>
        fmtKg(row.items.reduce((s, i) => s + i.plannedQty, 0)),
    },
    {
      title: "Đã SX (kg)",
      key: "allocatedQty",
      align: "right" as const,
      render: (_: any, row: SalesOrder) =>
        fmtKg(row.items.reduce((s, i) => s + i.allocatedQty, 0)),
    },
    {
      title: "Còn lại (kg)",
      key: "remaining",
      align: "right" as const,
      render: (_: any, row: SalesOrder) => {
        const rem = row.items.reduce((s, i) => s + Math.max(0, i.plannedQty - i.allocatedQty), 0);
        return <Text type={rem > 0 ? "danger" : "secondary"}>{fmtKg(rem)}</Text>;
      },
    },
    {
      title: "Deadline",
      dataIndex: "deliveryDate",
      key: "deliveryDate",
      render: (v: string, row: SalesOrder) => {
        const isOverdue = row.status === "OVERDUE" || dayjs(v).isBefore(dayjs(), "day");
        return <Text type={isOverdue && row.status !== "DONE" ? "danger" : undefined}>{fmtDate(v)}</Text>;
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (s: OrderStatus) => (
        <Badge color={STATUS_BADGE[s].color} text={STATUS_BADGE[s].text} />
      ),
    },
    {
      title: "Rủi ro",
      key: "risk",
      align: "center" as const,
      render: (_: any, row: SalesOrder) => {
        const prog = progressData.find((p) => p.id === row.id);
        return prog?.isAtRisk ? (
          <Tooltip title="Dự kiến không kịp deadline">
            <WarningOutlined style={{ color: "#fa8c16", fontSize: 16 }} />
          </Tooltip>
        ) : null;
      },
    },
    {
      title: "Thao tác",
      key: "actions",
      render: (_: any, row: SalesOrder) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => router.push(`/sales-orders/${row.id}`)}>
            Xem
          </Button>
          {isManager && row.status !== "DONE" && row.status !== "CANCELLED" && (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => { setCancelId(row.id); setCancelReason(""); }}
            >
              Hủy
            </Button>
          )}
        </Space>
      ),
    },
  ];

  // ── Filter bar ───────────────────────────────��────────────────────────────
  const filterBar = (
    <Space wrap style={{ marginBottom: 16 }}>
      <Select
        allowClear
        placeholder="Nhà máy"
        style={{ width: 140 }}
        value={factoryId}
        onChange={setFactoryId}
        options={factories.map((f) => ({ value: f.id, label: f.name }))}
      />
      <Select
        allowClear
        placeholder="Trạng thái"
        style={{ width: 160 }}
        value={filterStatus}
        onChange={setFilterStatus}
        options={[
          { value: "ACTIVE",    label: "Đang sản xuất" },
          { value: "DONE",      label: "Hoàn thành" },
          { value: "OVERDUE",   label: "Quá hạn" },
          { value: "CANCELLED", label: "Đã hủy" },
        ]}
      />
      <DatePicker
        picker="month"
        placeholder="Tháng giao hàng"
        format="MM/YYYY"
        onChange={(d) => setFilterMonth(d ? d.format("YYYY-MM") : undefined)}
      />
      <Select
        allowClear
        placeholder="Khách hàng"
        style={{ width: 180 }}
        showSearch
        optionFilterProp="label"
        value={filterCustomer}
        onChange={setFilterCustomer}
        options={customers.map((c) => ({ value: c.id, label: c.name }))}
      />
      <Button icon={<ReloadOutlined />} onClick={fetchOrders}>Làm mới</Button>
    </Space>
  );

  // ── Tab 1: List ────────────────────────────────────────────────────────��──
  const listTab = (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {filterBar}
        {isManager && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Tạo hợp đồng
          </Button>
        )}
      </div>
      <Table
        dataSource={orders}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 900 }}
        pagination={{ pageSize: 20, showTotal: (t) => `${t} hợp đồng` }}
      />
    </div>
  );

  // ── Tab 2: Progress dashboard ─────────────────────────────���───────────────
  const activeOrders = progressData.filter((o) => o.status === "ACTIVE" || o.status === "OVERDUE");

  const progressTab = (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <Select
            allowClear
            placeholder="Nhà máy"
            style={{ width: 140 }}
            value={factoryId}
            onChange={setFactoryId}
          >
            {factories.map((f) => <Select.Option key={f.id} value={f.id}>{f.name}</Select.Option>)}
          </Select>
          <Text type="secondary">{activeOrders.length} hợp đồng đang sản xuất</Text>
        </Space>
        <Button
          type="primary"
          icon={<ReloadOutlined spin={recalcLoading} />}
          loading={recalcLoading}
          disabled={recalcLoading || !factoryId}
          onClick={handleRecalculate}
        >
          Cập nhật tiến độ
        </Button>
      </div>

      {progressLoading ? (
        <div style={{ textAlign: "center", padding: 48 }}><Spin size="large" /></div>
      ) : !factoryId ? (
        <Empty description="Chọn nhà máy để xem tiến độ" />
      ) : activeOrders.length === 0 ? (
        <Empty description="Không có hợp đồng đang sản xuất" />
      ) : (
        <Row gutter={[16, 16]}>
          {activeOrders.map((order) => (
            <Col key={order.id} xs={24} lg={12} xl={8}>
              <Card
                size="small"
                title={
                  <Space>
                    <Button
                      type="link"
                      style={{ padding: 0, fontWeight: 600 }}
                      onClick={() => router.push(`/sales-orders/${order.id}`)}
                    >
                      {order.contractCode}
                    </Button>
                    <Text type="secondary">— {order.customerName}</Text>
                  </Space>
                }
                extra={
                  <Space size={4}>
                    {order.isAtRisk && (
                      <Tooltip title="Dự kiến không kịp deadline">
                        <Tag color="orange" icon={<WarningOutlined />}>Rủi ro</Tag>
                      </Tooltip>
                    )}
                    <Tag color={order.status === "OVERDUE" ? "red" : "green"}>
                      {STATUS_BADGE[order.status].text}
                    </Tag>
                  </Space>
                }
              >
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Deadline: <Text strong>{fmtDate(order.deliveryDate)}</Text>
                    {order.daysUntilDeadline < 0
                      ? <Text type="danger"> (quá {Math.abs(order.daysUntilDeadline)} ngày)</Text>
                      : <Text type="secondary"> (còn {order.daysUntilDeadline} ngày)</Text>
                    }
                  </Text>
                </div>

                {order.items.map((item, idx) => {
                  const strokeColor = progressStrokeColor(order.status, item.estimatedDoneDate, order.deliveryDate);
                  const isOnTime = item.estimatedDoneDate
                    ? !dayjs(item.estimatedDoneDate).isAfter(dayjs(order.deliveryDate))
                    : null;

                  return (
                    <div key={item.itemId} style={{ marginBottom: idx < order.items.length - 1 ? 12 : 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <Text strong style={{ fontSize: 13 }}>{item.itemName}</Text>
                        <Text style={{ fontSize: 12 }}>{item.progressPct.toFixed(1)}%</Text>
                      </div>
                      <Progress
                        percent={Math.min(100, item.progressPct)}
                        showInfo={false}
                        strokeColor={strokeColor}
                        size="small"
                        style={{ marginBottom: 2 }}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <Text type="secondary">
                          {fmtKg(item.allocatedQty)} / {fmtKg(item.qtyOrdered)}
                        </Text>
                        {item.estimatedDoneDate ? (
                          <Text type={isOnTime ? "success" : "warning"}>
                            DK xong: {fmtDate(item.estimatedDoneDate)} {isOnTime ? "✓" : "⚠"}
                          </Text>
                        ) : (
                          <Text type="secondary">Chưa có định mức</Text>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );

  // ── Create modal ────────────────────────────────��─────────────────────────
  const createModal = (
    <Modal
      title="Tạo hợp đồng mới"
      open={createOpen}
      onOk={handleCreate}
      onCancel={() => { setCreateOpen(false); createForm.resetFields(); setCreateItems([{}]); }}
      confirmLoading={creating}
      width={700}
      okText="Tạo hợp đồng"
    >
      <Form form={createForm} layout="vertical" size="small">
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="contractCode" label="Số hợp đồng" rules={[{ required: true }]}>
              <Input placeholder="VD: 431PB26" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="factoryId" label="Nhà máy" rules={[{ required: true }]}>
              <Select options={factories.map((f) => ({ value: f.id, label: f.name }))} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="customerId" label="Khách hàng" rules={[{ required: true }]}>
              <Select
                showSearch
                optionFilterProp="label"
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="deliveryDate" label="Deadline giao hàng" rules={[{ required: true }]}>
              <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" disabledDate={(d) => d.isBefore(dayjs(), "day")} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="startDate" label="Ngày bắt đầu SX">
              <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="note" label="Ghi chú">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>

        <Divider plain style={{ fontSize: 13 }}>Mặt hàng</Divider>

        {createItems.map((item, idx) => (
          <Row key={idx} gutter={8} style={{ marginBottom: 8 }} align="middle">
            <Col span={8}>
              <Select
                placeholder="Mặt hàng"
                style={{ width: "100%" }}
                showSearch
                optionFilterProp="label"
                value={item.itemId}
                onChange={(v) => {
                  const next = [...createItems];
                  next[idx] = { ...next[idx], itemId: v };
                  setCreateItems(next);
                }}
                options={items.map((i) => ({ value: i.id, label: i.name }))}
              />
            </Col>
            <Col span={6}>
              <InputNumber
                placeholder="Số lượng (kg)"
                style={{ width: "100%" }}
                min={1}
                value={item.qtyOrdered}
                onChange={(v) => {
                  const next = [...createItems];
                  next[idx] = { ...next[idx], qtyOrdered: v ?? undefined };
                  setCreateItems(next);
                }}
              />
            </Col>
            <Col span={6}>
              <InputNumber
                placeholder="Đơn giá (USD)"
                style={{ width: "100%" }}
                min={0}
                value={item.unitPrice}
                onChange={(v) => {
                  const next = [...createItems];
                  next[idx] = { ...next[idx], unitPrice: v ?? undefined };
                  setCreateItems(next);
                }}
              />
            </Col>
            <Col span={4}>
              {createItems.length > 1 && (
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => setCreateItems(createItems.filter((_, i) => i !== idx))}
                />
              )}
            </Col>
          </Row>
        ))}

        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setCreateItems([...createItems, {}])}
        >
          Thêm mặt hàng
        </Button>
      </Form>
    </Modal>
  );

  // ── Cancel modal ──────────────────────────────────────────────────────────
  const cancelModal = (
    <Modal
      title="Hủy hợp đồng"
      open={cancelId !== null}
      onOk={handleCancel}
      onCancel={() => { setCancelId(null); setCancelReason(""); }}
      confirmLoading={cancelling}
      okText="Xác nhận hủy"
      okButtonProps={{ danger: true }}
    >
      <p>Nhập lý do hủy hợp đồng (tối thiểu 5 ký tự):</p>
      <Input.TextArea
        rows={3}
        value={cancelReason}
        onChange={(e) => setCancelReason(e.target.value)}
        placeholder="VD: Khách hàng hủy đơn do thay đổi quy cách..."
      />
    </Modal>
  );

  // ── Render ─────────────────────────────────���───────────────────────────���──
  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>Theo dõi Đơn hàng</Title>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: "list",     label: "Danh sách hợp đồng", children: listTab },
          { key: "progress", label: "Dashboard tiến độ",  children: progressTab },
        ]}
      />

      {createModal}
      {cancelModal}
    </div>
  );
}
