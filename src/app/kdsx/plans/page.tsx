"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Table,
  Button,
  Modal,
  Form,
  Select,
  Space,
  message,
  Tag,
  Input,
  Tooltip,
  Popconfirm,
} from "antd";
import {
  PlusOutlined,
  EyeOutlined,
  DeleteOutlined,
  RollbackOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dayjs from "dayjs";

const { Title } = Typography;

interface Factory { id: number; name: string; }
interface Plan {
  id: number;
  factoryId: number;
  factory: Factory;
  yearMonth: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED";
  note: string | null;
  _count: { lineItems: number; fixedCosts: number };
}

const STATUS_COLOR = { DRAFT: "default", SUBMITTED: "blue", APPROVED: "green" } as const;
const STATUS_LABEL = { DRAFT: "Nháp", SUBMITTED: "Đã nộp", APPROVED: "Đã duyệt" } as const;

export default function PlansPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const [plans, setPlans] = useState<Plan[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [filterFactory, setFilterFactory] = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<string | null>(null);

  // Revert modal
  const [revertTarget, setRevertTarget] = useState<Plan | null>(null);
  const [revertReason, setRevertReason] = useState("");
  const [reverting, setReverting] = useState(false);

  // Unapprove modal
  const [unapproveTarget, setUnapproveTarget] = useState<Plan | null>(null);
  const [unapproveReason, setUnapproveReason] = useState("");
  const [unapproving, setUnapproving] = useState(false);

  const monthOptions = Array.from({ length: 24 }, (_, i) => {
    const m = dayjs().add(12 - i, "month"); // 12 tháng tương lai → hiện tại → 11 tháng quá khứ
    return { label: m.format("MM/YYYY"), value: m.format("YYYY-MM") };
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterFactory) params.set("factoryId", String(filterFactory));
      if (filterMonth) params.set("yearMonth", filterMonth);
      const [plansRes, factoriesRes] = await Promise.all([
        fetch(`/api/kdsx/monthly-plans?${params}`),
        fetch("/api/factories"),
      ]);
      if (plansRes.ok) setPlans(await plansRes.json());
      if (factoriesRes.ok) setFactories(await factoriesRes.json());
    } finally {
      setLoading(false);
    }
  }, [filterFactory, filterMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate() {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const res = await fetch("/api/kdsx/monthly-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || "Lỗi tạo kế hoạch");
        return;
      }
      const plan = await res.json();
      message.success("Đã tạo kế hoạch");
      setModalOpen(false);
      router.push(`/kdsx/plans/${plan.factoryId}/${plan.yearMonth}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(plan: Plan) {
    const res = await fetch(`/api/kdsx/monthly-plans/${plan.id}`, { method: "DELETE" });
    if (res.ok) {
      message.success("Đã xóa kế hoạch");
      fetchData();
    } else {
      const err = await res.json();
      message.error(err.error || "Lỗi xóa");
    }
  }

  async function handleRevert() {
    if (!revertTarget) return;
    if (revertReason.trim().length < 10) {
      message.warning("Lý do hoàn trả phải có ít nhất 10 ký tự");
      return;
    }
    setReverting(true);
    try {
      const res = await fetch(`/api/kdsx/monthly-plans/${revertTarget.id}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: revertReason.trim() }),
      });
      if (res.ok) {
        message.success("Đã hoàn trả về Nháp — kế hoạch có thể chỉnh sửa lại");
        setRevertTarget(null);
        setRevertReason("");
        fetchData();
      } else {
        const err = await res.json();
        message.error(err.error || "Lỗi hoàn trả");
      }
    } finally {
      setReverting(false);
    }
  }

  async function handleUnapprove() {
    if (!unapproveTarget) return;
    if (unapproveReason.trim().length < 5) {
      message.warning("Lý do hủy duyệt phải có ít nhất 5 ký tự");
      return;
    }
    setUnapproving(true);
    try {
      const res = await fetch(`/api/kdsx/monthly-plans/${unapproveTarget.id}/unapprove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: unapproveReason.trim() }),
      });
      if (res.ok) {
        message.success("Đã hủy duyệt — kế hoạch có thể chỉnh sửa lại");
        setUnapproveTarget(null);
        setUnapproveReason("");
        fetchData();
      } else {
        const err = await res.json();
        message.error(err.error || "Lỗi hủy duyệt");
      }
    } finally {
      setUnapproving(false);
    }
  }

  function fmtYearMonth(v: string) {
    const [yr, mo] = v.split("-");
    return `T${mo}/${yr}`;
  }

  const columns = [
    {
      title: "Tháng",
      dataIndex: "yearMonth",
      key: "yearMonth",
      render: (v: string) => {
        const [yr, mo] = v.split("-");
        return <strong>T{mo}/{yr}</strong>;
      },
    },
    { title: "Nhà máy", key: "factory", render: (_: unknown, r: Plan) => r.factory.name },
    {
      title: "Trạng thái",
      key: "status",
      render: (_: unknown, r: Plan) => (
        <Tag color={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Tag>
      ),
    },
    {
      title: "Số dòng sợi",
      key: "lineItems",
      render: (_: unknown, r: Plan) => r._count.lineItems,
    },
    { title: "Ghi chú", dataIndex: "note", key: "note", render: (v: string | null) => v || "-" },
    {
      title: "Thao tác",
      key: "action",
      width: 180,
      render: (_: unknown, row: Plan) => (
        <Space size={4}>
          <Tooltip title={row.status === "DRAFT" ? "Chỉnh sửa" : "Xem kế hoạch"}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => router.push(`/kdsx/plans/${row.factoryId}/${row.yearMonth}`)}
            >
              {row.status === "DRAFT" ? "Mở" : "Xem"}
            </Button>
          </Tooltip>

          {/* Hoàn trả: chỉ Admin, chỉ SUBMITTED */}
          {isAdmin && row.status === "SUBMITTED" && (
            <Tooltip title="Hoàn trả về Nháp">
              <Button
                size="small"
                icon={<RollbackOutlined />}
                onClick={() => { setRevertTarget(row); setRevertReason(""); }}
              >
                Hoàn trả
              </Button>
            </Tooltip>
          )}

          {/* Hủy duyệt: chỉ Admin, chỉ APPROVED */}
          {isAdmin && row.status === "APPROVED" && (
            <Tooltip title="Hủy duyệt — đưa về Nháp">
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={() => { setUnapproveTarget(row); setUnapproveReason(""); }}
              >
                Hủy duyệt
              </Button>
            </Tooltip>
          )}

          {/* Xóa: Admin cho mọi trạng thái (trừ APPROVED), Manager chỉ DRAFT */}
          {row.status !== "APPROVED" && (isAdmin || row.status === "DRAFT") && (
            <Popconfirm
              title={`Xóa kế hoạch ${fmtYearMonth(row.yearMonth)} của ${row.factory.name}?`}
              description={`Toàn bộ ${row._count.lineItems} dòng sợi và chi phí cố định sẽ bị xóa vĩnh viễn.`}
              onConfirm={() => handleDelete(row)}
              okText="Xác nhận xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
        <Title level={3} style={{ margin: 0 }}>Kế hoạch tháng</Title>
        <Space>
          <Select
            placeholder="Nhà máy"
            allowClear
            options={factories.map((f) => ({ label: f.name, value: f.id }))}
            onChange={(v) => setFilterFactory(v ?? null)}
            style={{ width: 120 }}
          />
          <Select
            placeholder="Tháng"
            allowClear
            options={monthOptions}
            onChange={(v) => setFilterMonth(v ?? null)}
            style={{ width: 120 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>
            Tạo kế hoạch
          </Button>
        </Space>
      </div>

      <Table
        dataSource={plans}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
        size="middle"
      />

      {/* Modal tạo kế hoạch */}
      <Modal
        title="Tạo kế hoạch tháng mới"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="Tạo"
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="factoryId" label="Nhà máy" rules={[{ required: true, message: "Chọn nhà máy" }]}>
            <Select options={factories.map((f) => ({ label: f.name, value: f.id }))} placeholder="Chọn nhà máy" />
          </Form.Item>
          <Form.Item name="yearMonth" label="Tháng kế hoạch" rules={[{ required: true, message: "Chọn tháng" }]}>
            <Select options={monthOptions} placeholder="Chọn tháng" />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal hủy duyệt */}
      <Modal
        title={<span style={{ color: "#ff4d4f" }}>⚠ Hủy duyệt kế hoạch</span>}
        open={!!unapproveTarget}
        onCancel={() => setUnapproveTarget(null)}
        footer={[
          <Button key="cancel" onClick={() => setUnapproveTarget(null)}>Hủy</Button>,
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
        {unapproveTarget && (
          <div>
            <p>
              Kế hoạch <strong>{fmtYearMonth(unapproveTarget.yearMonth)}</strong> —{" "}
              <strong>{unapproveTarget.factory.name}</strong> sẽ được đưa về trạng thái Nháp (DRAFT).
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
          </div>
        )}
      </Modal>

      {/* Modal hoàn trả về Nháp */}
      <Modal
        title="Hoàn trả kế hoạch về Nháp"
        open={!!revertTarget}
        onOk={handleRevert}
        onCancel={() => setRevertTarget(null)}
        confirmLoading={reverting}
        okText="Xác nhận hoàn trả"
        cancelText="Hủy"
        okButtonProps={{ disabled: revertReason.trim().length < 10 }}
      >
        {revertTarget && (
          <div>
            <p>
              Kế hoạch <strong>{fmtYearMonth(revertTarget.yearMonth)}</strong> —{" "}
              <strong>{revertTarget.factory.name}</strong> sẽ được mở khóa để chỉnh sửa.
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
          </div>
        )}
      </Modal>
    </div>
  );
}
