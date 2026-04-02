"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Tabs,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Popconfirm,
  message,
  Tag,
  Row,
  Col,
  Alert,
  Descriptions,
  Tooltip,
  Spin,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SendOutlined,
  CheckOutlined,
  SettingOutlined,
  RollbackOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { use } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import FixedCostTable from "@/components/kdsx/FixedCostTable";

const { Title, Text } = Typography;

const REQUIRED_COST_TYPES = ["TIEN_LUONG", "TIEN_DIEN", "KHAU_HAO"] as const;
const REQUIRED_COST_LABELS: Record<string, string> = {
  TIEN_LUONG: "Tiền lương",
  TIEN_DIEN: "Tiền điện",
  KHAU_HAO: "Khấu hao",
};

interface Item { id: number; name: string; code: string | null; }
interface SalesOrderItem {
  id: number;
  itemId: number;
  unitPrice: number;
  order: { id: number; orderNo: string };
}
interface PlanLineItem {
  id: number;
  itemId: number;
  item: Item;
  salesOrderItemId: number | null;
  salesOrderItem: SalesOrderItem | null;
  qty: number;
  unitPriceUsd: number;
  revenueVnd: number | null;
  cottonCostVnd: number | null;
  peCostVnd: number | null;
  sellingCostVnd: number | null;
  gcDoubleTwistVnd: number | null;
  wasteRecoveryVnd: number | null;
  grossProfitVnd: number | null;
  note: string | null;
}
interface FixedCostEntry {
  id: number;
  costType: string;
  amountVnd: number;
  note: string | null;
}
interface Plan {
  id: number;
  factoryId: number;
  factory: { id: number; name: string };
  yearMonth: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED";
  note: string | null;
  lineItems: PlanLineItem[];
  fixedCosts: FixedCostEntry[];
}

function fmtBillion(v: number | null | undefined) {
  if (v === null || v === undefined) return "0";
  return (v / 1e9).toFixed(3);
}
function fmtTy(v: number | null | undefined) {
  if (v === null || v === undefined) return "-";
  return `${(v / 1e9).toFixed(3)} tỷ`;
}

const STATUS_COLOR = { DRAFT: "default", SUBMITTED: "blue", APPROVED: "green" } as const;
const STATUS_LABEL = { DRAFT: "Nháp", SUBMITTED: "Đã nộp", APPROVED: "Đã duyệt" } as const;

export default function PlanDetailPage({
  params,
}: {
  params: Promise<{ factoryId: string; yearMonth: string }>;
}) {
  const { factoryId, yearMonth } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const isManager = (session?.user as any)?.accessLevel === "MANAGER";

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [salesOrderItems, setSalesOrderItems] = useState<SalesOrderItem[]>([]);
  const [lineItemModal, setLineItemModal] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<PlanLineItem | null>(null);
  const [paramModal, setParamModal] = useState(false);
  const [paramForm] = Form.useForm();
  const [lineItemForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [hasParam, setHasParam] = useState(false);

  // Submit checklist modal
  const [submitCheckModal, setSubmitCheckModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Revert modal
  const [revertModal, setRevertModal] = useState(false);
  const [revertReason, setRevertReason] = useState("");
  const [reverting, setReverting] = useState(false);

  // Unapprove modal
  const [unapproveModal, setUnapproveModal] = useState(false);
  const [unapproveReason, setUnapproveReason] = useState("");
  const [unapproving, setUnapproving] = useState(false);

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kdsx/monthly-plans?factoryId=${factoryId}&yearMonth=${yearMonth}`);
      if (!res.ok) return;
      const plans: Plan[] = await res.json();
      if (plans.length === 0) {
        setPlan(null);
        return;
      }
      const detailRes = await fetch(`/api/kdsx/monthly-plans/${plans[0].id}`);
      if (detailRes.ok) setPlan(await detailRes.json());

      const paramRes = await fetch(`/api/kdsx/input-params?factoryId=${factoryId}&yearMonth=${yearMonth}`);
      if (paramRes.ok) {
        const param = await paramRes.json();
        setHasParam(!!param);
        if (param) paramForm.setFieldsValue(param);
      }
    } finally {
      setLoading(false);
    }
  }, [factoryId, yearMonth, paramForm]);

  const fetchItems = useCallback(async () => {
    const [itemsRes, soRes] = await Promise.all([
      fetch("/api/items"),
      fetch(`/api/kdsx/sales-orders?factoryId=${factoryId}&isActive=true`),
    ]);
    if (itemsRes.ok) setItems(await itemsRes.json());
    if (soRes.ok) {
      const orders = await soRes.json();
      const soItems: SalesOrderItem[] = [];
      for (const o of orders) {
        for (const oi of o.items || []) {
          soItems.push({ ...oi, order: { id: o.id, orderNo: o.orderNo } });
        }
      }
      setSalesOrderItems(soItems);
    }
  }, [factoryId]);

  useEffect(() => {
    fetchPlan();
    fetchItems();
  }, [fetchPlan, fetchItems]);

  // Tính tổng
  const totalRevenue = plan?.lineItems.reduce((s, li) => s + (li.revenueVnd ?? 0), 0) ?? 0;
  const totalFixedCost = plan?.fixedCosts
    .filter((fc) => fc.costType !== "DOANH_THU_HDTC")
    .reduce((s, fc) => s + fc.amountVnd, 0) ?? 0;
  const financialIncome = plan?.fixedCosts.find((fc) => fc.costType === "DOANH_THU_HDTC")?.amountVnd ?? 0;
  const totalGrossProfit = plan?.lineItems.reduce((s, li) => s + (li.grossProfitVnd ?? 0), 0) ?? 0;
  const netProfit = totalGrossProfit - totalFixedCost + financialIncome;

  // Checklist trước khi submit
  const hasLineItems = (plan?.lineItems.length ?? 0) > 0;
  const invalidLines = plan?.lineItems.filter((l) => l.qty <= 0 || l.unitPriceUsd <= 0) ?? [];
  const hasValidLines = invalidLines.length === 0;
  const enteredFixedCostTypes = new Set(
    (plan?.fixedCosts ?? []).filter((f) => f.amountVnd > 0).map((f) => f.costType)
  );
  const hasAnyFixedCost = enteredFixedCostTypes.size > 0;
  const missingRequired = REQUIRED_COST_TYPES.filter((t) => !enteredFixedCostTypes.has(t));
  const canSubmit = hasLineItems && hasValidLines && hasAnyFixedCost && missingRequired.length === 0;

  async function handleSaveParam() {
    try {
      const values = await paramForm.validateFields();
      setSaving(true);
      const res = await fetch("/api/kdsx/input-params", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factoryId: Number(factoryId), yearMonth, ...values }),
      });
      if (res.ok) {
        message.success("Đã lưu thông số tháng");
        setHasParam(true);
        setParamModal(false);
      } else {
        const err = await res.json();
        message.error(err.error || "Lỗi lưu");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveLineItem() {
    if (!plan) return;
    try {
      const values = await lineItemForm.validateFields();
      setSaving(true);
      const url = editingLineItem
        ? `/api/kdsx/monthly-plans/${plan.id}/line-items/${editingLineItem.id}`
        : `/api/kdsx/monthly-plans/${plan.id}/line-items`;
      const method = editingLineItem ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || "Lỗi lưu dòng sợi");
        return;
      }
      message.success(editingLineItem ? "Đã cập nhật" : "Đã thêm dòng sợi");
      setLineItemModal(false);
      fetchPlan();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLineItem(lineItemId: number) {
    if (!plan) return;
    const res = await fetch(`/api/kdsx/monthly-plans/${plan.id}/line-items/${lineItemId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      message.success("Đã xóa");
      fetchPlan();
    } else {
      message.error("Không thể xóa");
    }
  }

  async function handleConfirmSubmit() {
    if (!plan) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/kdsx/monthly-plans/${plan.id}/submit`, { method: "POST" });
      if (res.ok) {
        message.success("Đã nộp kế hoạch");
        setSubmitCheckModal(false);
        fetchPlan();
      } else {
        const err = await res.json();
        if (Array.isArray(err.errors)) {
          err.errors.forEach((e: string) => message.error(e));
        } else {
          message.error(err.error || "Lỗi trình duyệt");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove() {
    if (!plan) return;
    const res = await fetch(`/api/kdsx/monthly-plans/${plan.id}/approve`, { method: "POST" });
    if (res.ok) {
      message.success("Đã duyệt kế hoạch");
      fetchPlan();
    } else {
      const err = await res.json();
      message.error(err.error || "Lỗi");
    }
  }

  async function handleDeletePlan() {
    if (!plan) return;
    const res = await fetch(`/api/kdsx/monthly-plans/${plan.id}`, { method: "DELETE" });
    if (res.ok) {
      message.success("Đã xóa kế hoạch");
      router.push("/kdsx/plans");
    } else {
      const err = await res.json();
      message.error(err.error || "Lỗi xóa");
    }
  }

  async function handleUnapprove() {
    if (!plan) return;
    if (unapproveReason.trim().length < 5) {
      message.warning("Lý do hủy duyệt phải có ít nhất 5 ký tự");
      return;
    }
    setUnapproving(true);
    try {
      const res = await fetch(`/api/kdsx/monthly-plans/${plan.id}/unapprove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: unapproveReason.trim() }),
      });
      if (res.ok) {
        message.success("Đã hủy duyệt — kế hoạch có thể chỉnh sửa lại");
        setUnapproveModal(false);
        setUnapproveReason("");
        fetchPlan();
      } else {
        const err = await res.json();
        message.error(err.error || "Lỗi hủy duyệt");
      }
    } finally {
      setUnapproving(false);
    }
  }

  async function handleRevert() {
    if (!plan) return;
    if (revertReason.trim().length < 10) {
      message.warning("Lý do hoàn trả phải có ít nhất 10 ký tự");
      return;
    }
    setReverting(true);
    try {
      const res = await fetch(`/api/kdsx/monthly-plans/${plan.id}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: revertReason.trim() }),
      });
      if (res.ok) {
        message.success("Đã hoàn trả về Nháp — kế hoạch có thể chỉnh sửa lại");
        setRevertModal(false);
        setRevertReason("");
        fetchPlan();
      } else {
        const err = await res.json();
        message.error(err.error || "Lỗi hoàn trả");
      }
    } finally {
      setReverting(false);
    }
  }

  function openAddLineItem() {
    if (!hasParam) {
      message.warning("Hãy nhập thông số tháng trước khi thêm dòng sợi");
      return;
    }
    setEditingLineItem(null);
    lineItemForm.resetFields();
    setLineItemModal(true);
  }

  function openEditLineItem(li: PlanLineItem) {
    setEditingLineItem(li);
    lineItemForm.setFieldsValue({
      itemId: li.itemId,
      salesOrderItemId: li.salesOrderItemId,
      qty: li.qty,
      unitPriceUsd: li.unitPriceUsd,
      note: li.note,
    });
    setLineItemModal(true);
  }

  const isDraft = plan?.status === "DRAFT";
  const isSubmitted = plan?.status === "SUBMITTED";
  const isApproved = plan?.status === "APPROVED";
  const canEdit = isDraft;

  const lineItemColumns = [
    { title: "STT", key: "stt", width: 50, render: (_: unknown, __: unknown, idx: number) => idx + 1 },
    { title: "Loại sợi", key: "item", render: (_: unknown, r: PlanLineItem) => r.item.name },
    {
      title: "HĐ",
      key: "order",
      render: (_: unknown, r: PlanLineItem) => r.salesOrderItem?.order.orderNo || "-",
    },
    { title: "SL (kg)", dataIndex: "qty", key: "qty", render: (v: number) => v.toLocaleString() },
    { title: "Giá (USD/kg)", dataIndex: "unitPriceUsd", key: "price" },
    { title: "DT (tỷ)", key: "rev", render: (_: unknown, r: PlanLineItem) => fmtBillion(r.revenueVnd) },
    { title: "CP Bông (tỷ)", key: "cotton", render: (_: unknown, r: PlanLineItem) => fmtBillion(r.cottonCostVnd) },
    { title: "CP PE (tỷ)", key: "pe", render: (_: unknown, r: PlanLineItem) => fmtBillion(r.peCostVnd) },
    { title: "CP BH (tỷ)", key: "sell", render: (_: unknown, r: PlanLineItem) => fmtBillion(r.sellingCostVnd) },
    { title: "CP GC (tỷ)", key: "gc", render: (_: unknown, r: PlanLineItem) => fmtBillion(r.gcDoubleTwistVnd) },
    { title: "Phế (tỷ)", key: "waste", render: (_: unknown, r: PlanLineItem) => fmtBillion(r.wasteRecoveryVnd) },
    {
      title: "LN gộp (tỷ)",
      key: "profit",
      render: (_: unknown, r: PlanLineItem) => (
        <Text type={(r.grossProfitVnd ?? 0) >= 0 ? "success" : "danger"}>
          {fmtBillion(r.grossProfitVnd)}
        </Text>
      ),
    },
    {
      title: "",
      key: "action",
      width: 90,
      render: (_: unknown, row: PlanLineItem) =>
        canEdit ? (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditLineItem(row)} />
            <Popconfirm title="Xóa dòng này?" onConfirm={() => handleDeleteLineItem(row.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  const [yr, mo] = yearMonth.split("-");

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;

  if (!plan) {
    return (
      <div>
        <Title level={3}>Kế hoạch T{mo}/{yr} — NM {factoryId}</Title>
        <Alert
          type="info"
          message="Chưa có kế hoạch cho tháng này"
          description="Vào trang Kế hoạch tháng để tạo mới"
          showIcon
        />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Kế hoạch T{mo}/{yr} — {plan.factory.name}
          </Title>
          <Tag color={STATUS_COLOR[plan.status]} style={{ marginTop: 4 }}>
            {STATUS_LABEL[plan.status]}
          </Tag>
        </div>
        <Space>
          <Button icon={<SettingOutlined />} onClick={() => setParamModal(true)}>
            Thông số tháng {!hasParam && <Tag color="red">!</Tag>}
          </Button>

          {/* Xóa kế hoạch: DRAFT cho admin/manager, SUBMITTED chỉ admin */}
          {isDraft && (isAdmin || isManager) && (
            <Popconfirm
              title={`Xóa kế hoạch T${mo}/${yr} — ${plan.factory.name}?`}
              description={`Toàn bộ ${plan.lineItems.length} dòng sợi và chi phí cố định sẽ bị xóa vĩnh viễn.`}
              onConfirm={handleDeletePlan}
              okText="Xác nhận xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />}>Xóa kế hoạch</Button>
            </Popconfirm>
          )}

          {/* Hoàn trả về Nháp: chỉ admin, chỉ SUBMITTED */}
          {isSubmitted && isAdmin && (
            <Button
              icon={<RollbackOutlined />}
              onClick={() => { setRevertReason(""); setRevertModal(true); }}
            >
              Hoàn trả về Nháp
            </Button>
          )}

          {/* Trình duyệt: chỉ DRAFT */}
          {isDraft && (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => setSubmitCheckModal(true)}
            >
              Trình duyệt
            </Button>
          )}

          {/* Duyệt: SUBMITTED, admin */}
          {isSubmitted && isAdmin && (
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={handleApprove}
              style={{ background: "#52c41a" }}
            >
              Duyệt
            </Button>
          )}

          {/* Hủy duyệt: APPROVED, admin only */}
          {isApproved && isAdmin && (
            <Button
              danger
              icon={<StopOutlined />}
              onClick={() => { setUnapproveReason(""); setUnapproveModal(true); }}
            >
              Hủy duyệt
            </Button>
          )}
        </Space>
      </div>

      <Tabs
        defaultActiveKey="lines"
        items={[
          {
            key: "lines",
            label: "Dòng sợi",
            children: (
              <div>
                {canEdit && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={openAddLineItem}
                    style={{ marginBottom: 12 }}
                  >
                    Thêm dòng sợi
                  </Button>
                )}
                <Table
                  dataSource={plan.lineItems}
                  columns={lineItemColumns}
                  rowKey="id"
                  pagination={false}
                  bordered
                  size="small"
                  scroll={{ x: 1200 }}
                />
              </div>
            ),
          },
          {
            key: "fixed",
            label: "Chi phí cố định",
            children: (
              <FixedCostTable
                monthlyPlanId={plan.id}
                yearMonth={plan.yearMonth}
                factoryId={plan.factoryId}
                readonly={!canEdit}
                onSaved={fetchPlan}
              />
            ),
          },
          {
            key: "summary",
            label: "Tổng kết",
            children: (
              <Descriptions bordered column={2} size="middle">
                <Descriptions.Item label="Tổng sản lượng" span={2}>
                  <Text strong>{plan.lineItems.reduce((s, li) => s + li.qty, 0).toLocaleString("vi-VN")} kg</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Tổng doanh thu">
                  <Text strong style={{ color: "#3f8600" }}>{fmtTy(totalRevenue)}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Lợi nhuận gộp">
                  <Text strong style={{ color: totalGrossProfit >= 0 ? "#3f8600" : "#cf1322" }}>
                    {fmtTy(totalGrossProfit)}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="CP nguyên vật liệu">
                  <Text style={{ color: "#cf1322" }}>
                    {fmtTy(plan.lineItems.reduce((s, li) => s + (li.cottonCostVnd ?? 0) + (li.peCostVnd ?? 0), 0))}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="CP bán hàng & gia công">
                  <Text style={{ color: "#cf1322" }}>
                    {fmtTy(plan.lineItems.reduce((s, li) => s + (li.sellingCostVnd ?? 0) + (li.gcDoubleTwistVnd ?? 0), 0))}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Phế thu hồi">
                  <Text style={{ color: "#3f8600" }}>
                    -{fmtTy(plan.lineItems.reduce((s, li) => s + (li.wasteRecoveryVnd ?? 0), 0))}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Tổng CP cố định (trừ HĐTC)">
                  <Text style={{ color: "#cf1322" }}>{fmtTy(totalFixedCost)}</Text>
                </Descriptions.Item>
                {financialIncome > 0 && (
                  <Descriptions.Item label="Doanh thu HĐTC">
                    <Text style={{ color: "#3f8600" }}>+{fmtTy(financialIncome)}</Text>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label={<Text strong style={{ fontSize: 15 }}>LỢI NHUẬN RÒNG</Text>} span={2}>
                  {plan.fixedCosts.length === 0 ? (
                    <Tooltip title="Chưa nhập đủ chi phí cố định">
                      <Text type="secondary">--</Text>
                    </Tooltip>
                  ) : (
                    <Text strong style={{ fontSize: 18, color: netProfit >= 0 ? "#3f8600" : "#cf1322" }}>
                      {fmtTy(netProfit)}
                    </Text>
                  )}
                </Descriptions.Item>
              </Descriptions>
            ),
          },
        ]}
      />

      {/* Audit trail — hiển thị khi note có [Hủy duyệt ...] */}
      {plan.note && plan.note.includes("[Hủy duyệt") && (() => {
        const auditLines = plan.note
          .split("---")[0]
          .split("\n")
          .filter((l) => l.startsWith("[Hủy duyệt"));
        if (auditLines.length === 0) return null;
        return (
          <div style={{ marginTop: 16, background: "#fff2f0", border: "1px solid #ffccc7", borderRadius: 6, padding: "10px 14px" }}>
            <Text strong style={{ color: "#cf1322" }}>Lịch sử thay đổi trạng thái</Text>
            {auditLines.map((line, i) => {
              const match = line.match(/^\[Hủy duyệt lúc (.+?) bởi (.+?)\] (.+)$/);
              if (!match) return <div key={i} style={{ marginTop: 6, fontSize: 13 }}>🔴 {line}</div>;
              const [, time, user, reason] = match;
              return (
                <div key={i} style={{ marginTop: 6, fontSize: 13 }}>
                  🔴 Hủy duyệt lúc <strong>{time}</strong> bởi <strong>{user}</strong>
                  <div style={{ marginLeft: 20, color: "#595959" }}>"{reason}"</div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Modal thông số tháng */}
      <Modal
        title="Thông số đầu vào tháng"
        open={paramModal}
        onOk={handleSaveParam}
        onCancel={() => setParamModal(false)}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        width={700}
      >
        <Form form={paramForm} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="exchangeRate" label="Tỷ giá (VNĐ/USD)" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: "100%" }} placeholder="VD: 25000" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="avgCottonPrice" label="Giá bông BQ tính toán (USD/kg)">
                <InputNumber min={0} step={0.001} style={{ width: "100%" }} placeholder="Tự động tính" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="cottonUsaPrice" label="Giá bông USA (USD/kg)">
                <InputNumber min={0} step={0.001} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cottonUsaRatio" label="Tỷ lệ bông USA (0-1)">
                <InputNumber min={0} max={1} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="warehouseFee" label="Phí về kho (USD/kg)">
                <InputNumber min={0} step={0.001} style={{ width: "100%" }} placeholder="0.02" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="cottonBrazilPrice" label="Giá bông Brazil (USD/kg)">
                <InputNumber min={0} step={0.001} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cottonBrazilRatio" label="Tỷ lệ bông Brazil (0-1)">
                <InputNumber min={0} max={1} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="peBenmaPrice" label="Giá PE Benma (USD/kg)">
                <InputNumber min={0} step={0.001} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="wastePrice" label="Giá phế liệu (VNĐ/kg)">
                <InputNumber min={0} style={{ width: "100%" }} placeholder="VD: 3000" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal thêm/sửa dòng sợi */}
      <Modal
        title={editingLineItem ? "Sửa dòng sợi" : "Thêm dòng sợi"}
        open={lineItemModal}
        onOk={handleSaveLineItem}
        onCancel={() => setLineItemModal(false)}
        confirmLoading={saving}
        okText="Lưu & Tính toán"
        cancelText="Hủy"
        width={600}
      >
        <Alert
          type="info"
          message="Server sẽ tự động tính DT, CP, LN dựa trên định mức và thông số tháng"
          style={{ marginBottom: 16 }}
        />
        <Form form={lineItemForm} layout="vertical">
          <Form.Item name="itemId" label="Loại sợi" rules={[{ required: true }]}>
            <Select
              options={items.map((i) => ({ label: i.name, value: i.id }))}
              showSearch
              optionFilterProp="label"
              placeholder="Chọn loại sợi"
            />
          </Form.Item>
          <Form.Item name="salesOrderItemId" label="Hợp đồng (tùy chọn)">
            <Select
              options={salesOrderItems.map((oi) => ({
                label: `${oi.order.orderNo} — ${items.find((i) => i.id === oi.itemId)?.name ?? oi.itemId} — ${oi.unitPrice} USD/kg`,
                value: oi.id,
              }))}
              showSearch
              optionFilterProp="label"
              placeholder="Chọn dòng HĐ"
              allowClear
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="qty" label="Số lượng (kg)" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unitPriceUsd" label="Đơn giá (USD/kg)" rules={[{ required: true }]}>
                <InputNumber min={0} step={0.001} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="note" label="Ghi chú">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal checklist trình duyệt */}
      <Modal
        title={`Xác nhận trình duyệt kế hoạch tháng ${mo}/${yr}`}
        open={submitCheckModal}
        onOk={handleConfirmSubmit}
        onCancel={() => setSubmitCheckModal(false)}
        okText="Xác nhận trình duyệt"
        cancelText="Hủy"
        okButtonProps={{ disabled: !canSubmit }}
        confirmLoading={submitting}
        width={520}
      >
        <p style={{ marginBottom: 12 }}>Vui lòng kiểm tra trước khi trình:</p>
        <div style={{ marginBottom: 12 }}>
          {/* ① Dòng sợi */}
          <div style={{ marginBottom: 6 }}>
            {hasLineItems && hasValidLines ? "✅" : "❌"}{" "}
            {!hasLineItems
              ? "Chưa có dòng sợi nào trong kế hoạch"
              : invalidLines.length > 0
              ? `${invalidLines.length} dòng sợi có số lượng hoặc đơn giá bằng 0`
              : `${plan.lineItems.length} dòng sợi đã nhập đầy đủ`}
          </div>
          {/* ② Có chi phí cố định */}
          <div style={{ marginBottom: 6 }}>
            {hasAnyFixedCost ? "✅" : "❌"}{" "}
            {hasAnyFixedCost
              ? `Chi phí cố định đã nhập (${fmtTy(totalFixedCost)})`
              : "Chưa nhập chi phí cố định tháng"}
          </div>
          {/* ③ Các khoản bắt buộc */}
          {REQUIRED_COST_TYPES.map((t) => (
            <div key={t} style={{ marginBottom: 6 }}>
              {enteredFixedCostTypes.has(t) ? "✅" : "❌"}{" "}
              {enteredFixedCostTypes.has(t)
                ? `${REQUIRED_COST_LABELS[t]} đã nhập`
                : `${REQUIRED_COST_LABELS[t]} = 0 (khoản bắt buộc)`}
            </div>
          ))}
          {/* Lợi nhuận */}
          <div style={{ marginBottom: 6 }}>
            ✅ Lợi nhuận ước tính:{" "}
            <Text strong style={{ color: netProfit >= 0 ? "#3f8600" : "#cf1322" }}>
              {fmtTy(netProfit)}
            </Text>
          </div>
        </div>
        {!canSubmit && (
          <Alert
            type="warning"
            message="Vui lòng hoàn thiện kế hoạch trước khi trình duyệt"
            style={{ marginBottom: 8 }}
          />
        )}
        <Alert
          type="info"
          message="Sau khi trình duyệt, kế hoạch sẽ bị KHÓA chỉnh sửa. Chỉ Admin mới có thể hoàn trả về Nháp nếu cần sửa."
        />
      </Modal>

      {/* Modal hủy duyệt */}
      <Modal
        title={<span style={{ color: "#ff4d4f" }}>⚠ Hủy duyệt kế hoạch</span>}
        open={unapproveModal}
        onCancel={() => setUnapproveModal(false)}
        footer={[
          <Button key="cancel" onClick={() => setUnapproveModal(false)}>Hủy</Button>,
          <Button
            key="confirm"
            danger
            loading={unapproving}
            disabled={unapproveReason.trim().length < 5}
            onClick={handleUnapprove}
          >
            Xác nhận hủy duyệt
          </Button>,
        ]}
      >
        <p>
          Kế hoạch <strong>T{mo}/{yr} — {plan.factory.name}</strong> sẽ được đưa về trạng thái Nháp (DRAFT).
        </p>
        <ul style={{ color: "#595959", marginBottom: 12 }}>
          <li>Kế toán có thể chỉnh sửa hoặc xóa kế hoạch</li>
          <li>Cần trình duyệt lại nếu muốn dùng làm cơ sở KH/TH</li>
          <li>Lý do hủy duyệt sẽ được ghi lại trong hệ thống</li>
        </ul>
        <Input.TextArea
          rows={3}
          placeholder="Nhập lý do hủy duyệt..."
          value={unapproveReason}
          onChange={(e) => setUnapproveReason(e.target.value)}
          showCount
          maxLength={200}
        />
        {unapproveReason.trim().length > 0 && unapproveReason.trim().length < 5 && (
          <div style={{ color: "#ff4d4f", fontSize: 12, marginTop: 4 }}>
            Tối thiểu 5 ký tự
          </div>
        )}
      </Modal>

      {/* Modal hoàn trả về Nháp */}
      <Modal
        title="Hoàn trả kế hoạch về Nháp"
        open={revertModal}
        onOk={handleRevert}
        onCancel={() => setRevertModal(false)}
        okText="Xác nhận hoàn trả"
        cancelText="Hủy"
        okButtonProps={{ disabled: revertReason.trim().length < 10 }}
        confirmLoading={reverting}
      >
        <p>
          Kế hoạch <strong>T{mo}/{yr} — {plan.factory.name}</strong> sẽ được mở khóa để chỉnh sửa.
        </p>
        <p style={{ color: "#888", marginBottom: 12 }}>
          Kế toán sẽ cần trình duyệt lại sau khi sửa xong.
        </p>
        <Input.TextArea
          rows={3}
          placeholder="Lý do hoàn trả (tối thiểu 10 ký tự)..."
          value={revertReason}
          onChange={(e) => setRevertReason(e.target.value)}
          showCount
          maxLength={500}
        />
        {revertReason.trim().length > 0 && revertReason.trim().length < 10 && (
          <div style={{ color: "#cf1322", fontSize: 12, marginTop: 4 }}>
            Cần ít nhất 10 ký tự
          </div>
        )}
      </Modal>
    </div>
  );
}
