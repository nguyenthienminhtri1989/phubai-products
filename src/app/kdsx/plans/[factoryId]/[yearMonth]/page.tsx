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
  Checkbox,
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
  ReloadOutlined,
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
  isAutoQty: boolean;
  note: string | null;
}
interface ActualLineItem {
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
  isAutoQty: boolean;
  isAdHoc: boolean;
  note: string | null;
}
interface Actual {
  id: number;
  factoryId: number;
  factory: { id: number; name: string };
  yearMonth: string;
  note: string | null;
  lineItems: ActualLineItem[];
  fixedCosts: FixedCostEntry[];
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

function fmtVnd(v: number | null | undefined): string {
  if (v == null) return "0.00 đ";
  return (
    v.toLocaleString("vi-VN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " đ"
  );
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
  const [actual, setActual] = useState<Actual | null>(null);
  const [viewMode, setViewMode] = useState<"KH" | "TH">("KH");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [salesOrderItems, setSalesOrderItems] = useState<SalesOrderItem[]>([]);
  const [lineItemModal, setLineItemModal] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<PlanLineItem | null>(null);
  const [adHocModal, setAdHocModal] = useState(false);
  const [adHocForm] = Form.useForm();
  const [savingAdHoc, setSavingAdHoc] = useState(false);
  const [isAutoQty, setIsAutoQty] = useState(false);
  const [paramModal, setParamModal] = useState(false);
  const [paramForm] = Form.useForm();
  const [lineItemForm] = Form.useForm();
  const [isDP, setIsDP] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasParam, setHasParam] = useState(false);

  // NVL state
  const [cottonTypes, setCottonTypes] = useState<Array<{ id: number; code: string; name: string; priceUsd: number | null }>>([]);
  const [peTypes, setPeTypes] = useState<Array<{ id: number; code: string; name: string; priceUsd: number | null }>>([]);

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

  // Recalculate
  const [recalculating, setRecalculating] = useState(false);

  const fetchActual = useCallback(async () => {
    const res = await fetch(`/api/kdsx/monthly-actuals?factoryId=${factoryId}&yearMonth=${yearMonth}`);
    if (!res.ok) return;
    const list: Actual[] = await res.json();
    if (list.length === 0) { setActual(null); return; }
    const detailRes = await fetch(`/api/kdsx/monthly-actuals/${list[0].id}`);
    if (detailRes.ok) setActual(await detailRes.json());
  }, [factoryId, yearMonth]);

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
    fetchActual();
    fetchItems();
    fetch(`/api/kdsx/material-prices/by-month?yearMonth=${yearMonth}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setCottonTypes(data.cotton ?? []);
          setPeTypes(data.pe ?? []);
        }
      });
  }, [fetchPlan, fetchActual, fetchItems, yearMonth]);


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
      const { isDP: _isDP, ...rest } = values;
      const body = { ...rest, salesOrderItemId: isDP ? null : (values.salesOrderItemId ?? null) };
      const url = editingLineItem
        ? `/api/kdsx/monthly-plans/${plan.id}/line-items/${editingLineItem.id}`
        : `/api/kdsx/monthly-plans/${plan.id}/line-items`;
      const method = editingLineItem ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  async function handleRecalculate() {
    if (!plan) return;
    setRecalculating(true);
    try {
      const res = await fetch(`/api/kdsx/monthly-plans/${plan.id}/recalculate`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        message.success(`Đã tính lại ${data.updated} dòng sợi`);
        fetchPlan();
      } else {
        const err = await res.json();
        message.error(err.error || "Lỗi tính lại");
      }
    } finally {
      setRecalculating(false);
    }
  }

  async function handleSync() {
    if (!actual) {
      message.warning("Chưa có Thực hiện tháng này. Hệ thống sẽ tự tạo khi sync.");
    }
    setSyncing(true);
    try {
      // Nếu chưa có actual, tạo mới trước
      let actualId = actual?.id;
      if (!actualId) {
        const createRes = await fetch("/api/kdsx/monthly-actuals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ factoryId: Number(factoryId), yearMonth }),
        });
        if (!createRes.ok) {
          const err = await createRes.json();
          message.error(err.error || "Không thể tạo Thực hiện tháng");
          return;
        }
        const created = await createRes.json();
        actualId = created.id;
      }
      const res = await fetch(`/api/kdsx/monthly-actuals/${actualId}/sync`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        message.success(`Đã đồng bộ ${data.syncedItems} mặt hàng`);
        fetchActual();
      } else {
        const err = await res.json();
        message.error(err.error || "Lỗi đồng bộ");
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleDeleteAdHoc(lineItemId: number) {
    if (!actual) return;
    const res = await fetch(`/api/kdsx/monthly-actuals/${actual.id}/line-items/${lineItemId}`, { method: "DELETE" });
    if (res.ok) {
      message.success("Đã xóa HĐ phát sinh");
      fetchActual();
    } else {
      const err = await res.json();
      message.error(err.error || "Không thể xóa");
    }
  }

  async function handleSaveAdHoc() {
    if (!actual) return;
    try {
      const values = await adHocForm.validateFields();
      setSavingAdHoc(true);
      const res = await fetch(`/api/kdsx/monthly-actuals/${actual.id}/line-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        message.success("Đã thêm HĐ phát sinh");
        setAdHocModal(false);
        adHocForm.resetFields();
        fetchActual();
      } else {
        const err = await res.json();
        message.error(err.error || "Lỗi lưu");
      }
    } finally {
      setSavingAdHoc(false);
    }
  }

  function openAddLineItem() {
    if (!hasParam) {
      message.warning("Hãy nhập thông số tháng trước khi thêm dòng sợi");
      return;
    }
    setEditingLineItem(null);
    setIsDP(false);
    setIsAutoQty(false);
    lineItemForm.resetFields();
    setLineItemModal(true);
  }

  function openEditLineItem(li: PlanLineItem) {
    setEditingLineItem(li);
    const dp = !li.salesOrderItemId;
    setIsDP(dp);
    setIsAutoQty(li.isAutoQty);
    lineItemForm.setFieldsValue({
      itemId: li.itemId,
      isDP: dp,
      isAutoQty: li.isAutoQty,
      salesOrderItemId: li.salesOrderItemId ?? undefined,
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
      render: (_: unknown, r: PlanLineItem) =>
        r.salesOrderItemId
          ? r.salesOrderItem?.order.orderNo ?? "-"
          : <Tag>Dự phòng</Tag>,
    },
    {
      title: "SL (kg)", dataIndex: "qty", key: "qty",
      render: (v: number, r: PlanLineItem) => (
        <Space size={4}>
          <span>{v.toLocaleString()}</span>
          {r.isAutoQty && <Tag color="blue" style={{ fontSize: 10, padding: "0 4px" }}>AUTO</Tag>}
        </Space>
      ),
    },
    { title: "Giá (USD/kg)", dataIndex: "unitPriceUsd", key: "price" },
    { title: "Doanh thu (đ)", key: "rev", render: (_: unknown, r: PlanLineItem) => fmtVnd(r.revenueVnd) },
    { title: "CP Bông (đ)", key: "cotton", render: (_: unknown, r: PlanLineItem) => fmtVnd(r.cottonCostVnd) },
    { title: "CP PE (đ)", key: "pe", render: (_: unknown, r: PlanLineItem) => fmtVnd(r.peCostVnd) },
    { title: "CP BH (đ)", key: "sell", render: (_: unknown, r: PlanLineItem) => fmtVnd(r.sellingCostVnd) },
    { title: "CP GC (đ)", key: "gc", render: (_: unknown, r: PlanLineItem) => fmtVnd(r.gcDoubleTwistVnd) },
    { title: "Phế thu hồi (đ)", key: "waste", render: (_: unknown, r: PlanLineItem) => fmtVnd(r.wasteRecoveryVnd) },
    {
      title: "LN gộp (đ)",
      key: "profit",
      render: (_: unknown, r: PlanLineItem) => (
        <Text type={(r.grossProfitVnd ?? 0) >= 0 ? "success" : "danger"}>
          {fmtVnd(r.grossProfitVnd)}
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

  // Cột bảng TH
  const actualColumns = [
    { title: "STT", key: "stt", width: 50, render: (_: unknown, __: unknown, idx: number) => idx + 1 },
    { title: "Loại sợi", key: "item", render: (_: unknown, r: ActualLineItem) => r.item.name },
    {
      title: "HĐ",
      key: "order",
      render: (_: unknown, r: ActualLineItem) => (
        <Space size={4}>
          {r.salesOrderItemId ? r.salesOrderItem?.order.orderNo ?? "-" : <Tag>Dự phòng</Tag>}
          {r.isAdHoc && <Tag color="orange">Phát sinh</Tag>}
          {r.isAutoQty && <Tag color="blue" style={{ fontSize: 10 }}>AUTO</Tag>}
        </Space>
      ),
    },
    { title: "SL TH (kg)", dataIndex: "qty", key: "qty", render: (v: number) => v.toLocaleString() },
    { title: "Giá (USD/kg)", dataIndex: "unitPriceUsd", key: "price" },
    { title: "DT TH (đ)", key: "rev", render: (_: unknown, r: ActualLineItem) => fmtVnd(r.revenueVnd) },
    { title: "CP Bông (đ)", key: "cotton", render: (_: unknown, r: ActualLineItem) => fmtVnd(r.cottonCostVnd) },
    { title: "CP PE (đ)", key: "pe", render: (_: unknown, r: ActualLineItem) => fmtVnd(r.peCostVnd) },
    { title: "CP BH (đ)", key: "sell", render: (_: unknown, r: ActualLineItem) => fmtVnd(r.sellingCostVnd) },
    { title: "Phế thu hồi (đ)", key: "waste", render: (_: unknown, r: ActualLineItem) => fmtVnd(r.wasteRecoveryVnd) },
    {
      title: "LN gộp TH (đ)",
      key: "profit",
      render: (_: unknown, r: ActualLineItem) => (
        <Text type={(r.grossProfitVnd ?? 0) >= 0 ? "success" : "danger"}>
          {fmtVnd(r.grossProfitVnd)}
        </Text>
      ),
    },
    {
      title: "",
      key: "action",
      width: 60,
      render: (_: unknown, row: ActualLineItem) =>
        row.isAdHoc ? (
          <Popconfirm title="Xóa HĐ phát sinh này?" onConfirm={() => handleDeleteAdHoc(row.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
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
            T{mo}/{yr} — {plan.factory.name}
          </Title>
          <Space style={{ marginTop: 4 }}>
            <Tag color={STATUS_COLOR[plan.status]}>{STATUS_LABEL[plan.status]}</Tag>
            <Tag.CheckableTag
              checked={viewMode === "KH"}
              onChange={() => setViewMode("KH")}
              style={{ border: "1px solid #d9d9d9", borderRadius: 4 }}
            >
              📋 Kế hoạch
            </Tag.CheckableTag>
            <Tag.CheckableTag
              checked={viewMode === "TH"}
              onChange={() => setViewMode("TH")}
              style={{ border: "1px solid #d9d9d9", borderRadius: 4 }}
            >
              ✅ Thực hiện
            </Tag.CheckableTag>
          </Space>
        </div>
        <Space>
          <Button icon={<SettingOutlined />} onClick={() => setParamModal(true)}>
            Thông số tháng {!hasParam && <Tag color="red">!</Tag>}
          </Button>

          {/* Tính lại tất cả: chỉ DRAFT */}
          {isDraft && (
            <Button
              icon={<ReloadOutlined />}
              loading={recalculating}
              onClick={handleRecalculate}
              disabled={!hasParam || (plan?.lineItems.length ?? 0) === 0}
              title={!hasParam ? "Cần nhập thông số tháng trước" : ""}
            >
              Tính lại tất cả
            </Button>
          )}

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
            label: viewMode === "KH" ? "KH — Dòng sợi" : "TH — Doanh thu thực hiện",
            children: viewMode === "KH" ? (
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
                  scroll={{ x: 1300 }}
                />
              </div>
            ) : (
              <div>
                <Space style={{ marginBottom: 12 }}>
                  <Button
                    type="primary"
                    icon={<ReloadOutlined />}
                    loading={syncing}
                    onClick={handleSync}
                  >
                    Đồng bộ SL thực tế
                  </Button>
                  {actual && (
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() => { adHocForm.resetFields(); setAdHocModal(true); }}
                    >
                      Thêm HĐ phát sinh
                    </Button>
                  )}
                  {!actual && (
                    <Alert type="info" message="Chưa có dữ liệu TH. Nhấn Đồng bộ để tạo." showIcon style={{ padding: "2px 10px" }} />
                  )}
                </Space>
                {actual && (
                  <>
                    <Table
                      dataSource={actual.lineItems}
                      columns={actualColumns}
                      rowKey="id"
                      pagination={false}
                      bordered
                      size="small"
                      scroll={{ x: 1300 }}
                    />
                    {/* Tổng kết TH nhanh */}
                    <div style={{ marginTop: 12, padding: "10px 16px", background: "#f6ffed", borderRadius: 6, border: "1px solid #b7eb8f" }}>
                      <Space size={32}>
                        <span>🏭 SL TH: <strong>{actual.lineItems.reduce((s, li) => s + li.qty, 0).toLocaleString("vi-VN")} kg</strong></span>
                        <span style={{ color: "#3f8600" }}>💰 DT TH: <strong>{fmtVnd(actual.lineItems.reduce((s, li) => s + (li.revenueVnd ?? 0), 0))}</strong></span>
                        <span style={{ color: actual.lineItems.reduce((s, li) => s + (li.grossProfitVnd ?? 0), 0) >= 0 ? "#3f8600" : "#cf1322" }}>
                          📈 LN gộp TH: <strong>{fmtVnd(actual.lineItems.reduce((s, li) => s + (li.grossProfitVnd ?? 0), 0))}</strong>
                        </span>
                      </Space>
                    </div>
                  </>
                )}
              </div>
            ),
          },
          {
            key: "fixed",
            label: viewMode === "KH" ? "KH — Chi phí cố định" : "TH — Chi phí cố định",
            children: viewMode === "KH" ? (
              <FixedCostTable
                monthlyPlanId={plan.id}
                yearMonth={plan.yearMonth}
                factoryId={plan.factoryId}
                readonly={!canEdit}
                onSaved={fetchPlan}
              />
            ) : (
              actual ? (
                <FixedCostTable
                  monthlyActualId={actual.id}
                  yearMonth={actual.yearMonth}
                  factoryId={actual.factoryId}
                  readonly={false}
                  onSaved={fetchActual}
                />
              ) : (
                <Alert type="info" message="Chưa có dữ liệu TH. Hãy đồng bộ SL thực tế trước." showIcon />
              )
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
                  <Text strong style={{ color: "#3f8600" }}>{fmtVnd(totalRevenue)}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Lợi nhuận gộp">
                  <Text strong style={{ color: totalGrossProfit >= 0 ? "#3f8600" : "#cf1322" }}>
                    {fmtVnd(totalGrossProfit)}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="CP nguyên vật liệu">
                  <Text style={{ color: "#cf1322" }}>
                    {fmtVnd(plan.lineItems.reduce((s, li) => s + (li.cottonCostVnd ?? 0) + (li.peCostVnd ?? 0), 0))}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="CP bán hàng & gia công">
                  <Text style={{ color: "#cf1322" }}>
                    {fmtVnd(plan.lineItems.reduce((s, li) => s + (li.sellingCostVnd ?? 0) + (li.gcDoubleTwistVnd ?? 0), 0))}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Phế thu hồi">
                  <Text style={{ color: "#3f8600" }}>
                    -{fmtVnd(plan.lineItems.reduce((s, li) => s + (li.wasteRecoveryVnd ?? 0), 0))}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Tổng CP cố định (trừ HĐTC)">
                  <Text style={{ color: "#cf1322" }}>{fmtVnd(totalFixedCost)}</Text>
                </Descriptions.Item>
                {financialIncome > 0 && (
                  <Descriptions.Item label="Doanh thu HĐTC">
                    <Text style={{ color: "#3f8600" }}>+{fmtVnd(financialIncome)}</Text>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label={<Text strong style={{ fontSize: 15 }}>LỢI NHUẬN RÒNG</Text>} span={2}>
                  {plan.fixedCosts.length === 0 ? (
                    <Tooltip title="Chưa nhập đủ chi phí cố định">
                      <Text type="secondary">--</Text>
                    </Tooltip>
                  ) : (
                    <Text strong style={{ fontSize: 18, color: netProfit >= 0 ? "#3f8600" : "#cf1322" }}>
                      {fmtVnd(netProfit)}
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

      {/* Modal thông số tháng — đơn giản hóa */}
      <Modal
        title="Thông số đầu vào tháng"
        open={paramModal}
        onOk={handleSaveParam}
        onCancel={() => setParamModal(false)}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        width={520}
      >
        <Form form={paramForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="exchangeRate" label="Tỷ giá (VNĐ/USD)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: "100%" }} placeholder="VD: 25000" />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input placeholder="Ghi chú thêm (tùy chọn)" />
          </Form.Item>
          {/* Giá NVL tháng này — read-only, chỉ xem */}
          {(cottonTypes.length > 0 || peTypes.length > 0) && (
            <div style={{ background: "#f6f8fa", borderRadius: 6, padding: "10px 14px", marginTop: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: "#595959" }}>
                Giá NVL tháng {yearMonth}
              </div>
              {cottonTypes.slice(0, 5).map((t) => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                  <span>🌾 {t.name}</span>
                  <span style={{ color: t.priceUsd ? "#1677ff" : "#ff4d4f" }}>
                    {t.priceUsd ? `${t.priceUsd} USD/kg` : "Chưa nhập giá"}
                  </span>
                </div>
              ))}
              {peTypes.slice(0, 3).map((t) => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                  <span>🔵 {t.name}</span>
                  <span style={{ color: t.priceUsd ? "#1677ff" : "#ff4d4f" }}>
                    {t.priceUsd ? `${t.priceUsd} USD/kg` : "Chưa nhập giá"}
                  </span>
                </div>
              ))}
              <div style={{ marginTop: 8, fontSize: 12, color: "#888" }}>
                ℹ️ Nhập/sửa giá NVL qua trang &quot;Giá NVL theo tháng&quot;
              </div>
            </div>
          )}
        </Form>
      </Modal>


      {/* Modal thêm/sửa dòng sợi KH */}
      <Modal
        title={editingLineItem ? "Sửa dòng sợi" : "Thêm dòng sợi"}
        open={lineItemModal}
        onOk={handleSaveLineItem}
        onCancel={() => { setLineItemModal(false); setIsDP(false); setIsAutoQty(false); }}
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
          <Form.Item name="isDP" valuePropName="checked" style={{ marginBottom: 8 }}>
            <Checkbox
              onChange={(e) => {
                setIsDP(e.target.checked);
                if (e.target.checked) lineItemForm.setFieldValue("salesOrderItemId", undefined);
              }}
            >
              Dự phòng (DP) — không gắn với hợp đồng cụ thể
            </Checkbox>
          </Form.Item>
          <Form.Item name="isAutoQty" valuePropName="checked" style={{ marginBottom: 8 }}>
            <Checkbox
              onChange={(e) => {
                setIsAutoQty(e.target.checked);
                if (e.target.checked) lineItemForm.setFieldValue("qty", undefined);
              }}
            >
              Tự tính SL = Tổng SL mặt hàng − các HĐ khác
            </Checkbox>
          </Form.Item>
          <Form.Item
            name="salesOrderItemId"
            label="Hợp đồng"
            rules={[{ required: !isDP, message: "Vui lòng chọn hợp đồng hoặc đánh dấu Dự phòng" }]}
          >
            <Select
              options={salesOrderItems.map((oi) => ({
                label: `${oi.order.orderNo} — ${items.find((i) => i.id === oi.itemId)?.name ?? oi.itemId} — ${oi.unitPrice} USD/kg`,
                value: oi.id,
              }))}
              showSearch
              optionFilterProp="label"
              placeholder={isDP ? "Không áp dụng (Dự phòng)" : "Chọn dòng HĐ"}
              allowClear
              disabled={isDP}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="qty" label="Số lượng (kg)" rules={[{ required: !isAutoQty, message: "Nhập SL hoặc dùng Tự tính" }]}>
                <InputNumber min={0} style={{ width: "100%" }} disabled={isAutoQty} placeholder={isAutoQty ? "Tự tính từ lịch SX" : ""} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unitPriceUsd" label="Đơn giá (USD/kg)" rules={[{ required: true }]}>
                <InputNumber min={0} step={0.001} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          {/* Chọn loại NVL */}
          {cottonTypes.length > 0 && (
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="cottonMaterialTypeId" label="Loại bông">
                  <Select
                    options={cottonTypes.map((t) => ({
                      label: t.priceUsd ? `${t.name} — ${t.priceUsd} USD/kg` : `${t.name} — Chưa có giá`,
                      value: t.id,
                      disabled: !t.priceUsd,
                    }))}
                    allowClear
                    placeholder="Chọn loại bông"
                    onChange={(val) => {
                      const found = cottonTypes.find((t) => t.id === val);
                      lineItemForm.setFieldValue("cottonPriceUsd", found?.priceUsd ?? undefined);
                    }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="cottonPriceUsd" label="Giá bông (USD/kg)">
                  <InputNumber min={0} step={0.001} precision={3} style={{ width: "100%" }} placeholder="Tự điền khi chọn loại" />
                </Form.Item>
              </Col>
            </Row>
          )}
          {peTypes.length > 0 && (
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="peMaterialTypeId" label="Loại PE (nếu có)">
                  <Select
                    options={peTypes.map((t) => ({
                      label: t.priceUsd ? `${t.name} — ${t.priceUsd} USD/kg` : `${t.name} — Chưa có giá`,
                      value: t.id,
                      disabled: !t.priceUsd,
                    }))}
                    allowClear
                    placeholder="Không dùng PE"
                    onChange={(val) => {
                      const found = peTypes.find((t) => t.id === val);
                      lineItemForm.setFieldValue("pePriceUsd", found?.priceUsd ?? undefined);
                    }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="pePriceUsd" label="Giá PE (USD/kg)">
                  <InputNumber min={0} step={0.001} precision={3} style={{ width: "100%" }} placeholder="Tự điền khi chọn loại" />
                </Form.Item>
              </Col>
            </Row>
          )}
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
              ? `Chi phí cố định đã nhập (${fmtVnd(totalFixedCost)})`
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
              {fmtVnd(netProfit)}
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

      {/* Modal thêm HĐ phát sinh TH */}
      <Modal
        title="Thêm HĐ phát sinh (Thực hiện)"
        open={adHocModal}
        onOk={handleSaveAdHoc}
        onCancel={() => { setAdHocModal(false); adHocForm.resetFields(); }}
        confirmLoading={savingAdHoc}
        okText="Lưu & Tính toán"
        cancelText="Hủy"
        width={600}
      >
        <Alert
          type="warning"
          message="HĐ phát sinh chỉ xuất hiện trong TH, không ảnh hưởng KH"
          style={{ marginBottom: 16 }}
        />
        <Form form={adHocForm} layout="vertical">
          <Form.Item name="itemId" label="Loại sợi" rules={[{ required: true }]}>
            <Select
              options={items.map((i) => ({ label: i.name, value: i.id }))}
              showSearch optionFilterProp="label" placeholder="Chọn loại sợi"
            />
          </Form.Item>
          <Form.Item name="salesOrderItemId" label="Hợp đồng (tùy chọn)">
            <Select
              options={salesOrderItems.map((oi) => ({
                label: `${oi.order.orderNo} — ${items.find((i) => i.id === oi.itemId)?.name ?? oi.itemId} — ${oi.unitPrice} USD/kg`,
                value: oi.id,
              }))}
              showSearch optionFilterProp="label" placeholder="Chọn HĐ hoặc để trống (Dự phòng)" allowClear
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
          {cottonTypes.length > 0 && (
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="cottonMaterialTypeId" label="Loại bông">
                  <Select
                    options={cottonTypes.map((t) => ({
                      label: t.priceUsd ? `${t.name} — ${t.priceUsd} USD/kg` : `${t.name} — Chưa có giá`,
                      value: t.id, disabled: !t.priceUsd,
                    }))}
                    allowClear placeholder="Chọn loại bông"
                    onChange={(val) => {
                      const found = cottonTypes.find((t) => t.id === val);
                      adHocForm.setFieldValue("cottonPriceUsd", found?.priceUsd ?? undefined);
                    }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="cottonPriceUsd" label="Giá bông (USD/kg)">
                  <InputNumber min={0} step={0.001} precision={3} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
          )}
          <Form.Item name="note" label="Ghi chú">
            <Input placeholder="Lý do phát sinh HĐ này..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
