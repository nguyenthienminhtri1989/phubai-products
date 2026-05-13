"use client";

import React, { useEffect, useState } from "react";
import {
  Table, Card, Button, Input, Select, Tag, Space, Modal, Form, message,
  Popconfirm, Row, Col, Radio, Checkbox, Typography, Alert, Tooltip
} from "antd";
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  TagsOutlined, CloseCircleOutlined, SearchOutlined, EyeOutlined
} from "@ant-design/icons";
import { useSession } from "next-auth/react";
import { getRoleDefaultPerm, type UserRole } from "@/lib/permissions";

const { Text } = Typography;

interface LotData {
  id: number;
  lotNumber: string;
  lotType: "RAW_COTTON" | "RAW_FIBER" | "YARN";
  status: "OPEN" | "CLOSED" | "SHIPPED";
  factory: { id: number; name: string };
  salesOrderItem?: { id: number; order: { id: number; orderNo: string } } | null;
  rawMaterials: { id: number; rawLot: { id: number; lotNumber: string; lotType: string } }[];
  note?: string | null;
  openedAt: string;
  closedAt?: string | null;
}

const LOT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  RAW_COTTON: { label: "BÔNG", color: "green" },
  RAW_FIBER: { label: "XƠ", color: "purple" },
  YARN: { label: "SỢI", color: "blue" },
};

const LOT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  OPEN: { label: "Đang mở", color: "green" },
  CLOSED: { label: "Đã đóng", color: "default" },
  SHIPPED: { label: "Đã giao", color: "gold" },
};

export default function LotsPage() {
  const { data: session } = useSession();
  const [lots, setLots] = useState<LotData[]>([]);
  const [loading, setLoading] = useState(false);

  // Catalog data
  const [factories, setFactories] = useState<any[]>([]);
  const [salesOrderItems, setSalesOrderItems] = useState<any[]>([]);
  const [rawCottonLots, setRawCottonLots] = useState<any[]>([]);
  const [rawFiberLots, setRawFiberLots] = useState<any[]>([]);

  // Filters
  const [filterType, setFilterType] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterFactory, setFilterFactory] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<LotData | null>(null);
  const [form] = Form.useForm();
  const [formLotType, setFormLotType] = useState<string>("YARN");
  const [formRawCottonIds, setFormRawCottonIds] = useState<number[]>([]);
  const [formRawFiberIds, setFormRawFiberIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  // Permissions
  const userRole = (session?.user as any)?.userRole as string | undefined;
  const pagePermissions: { pageKey: string; canView: boolean; canEdit: boolean }[] =
    (session?.user as any)?.pagePermissions || [];
  const isAdmin = userRole === "ADMIN";
  const PAGE_KEY = "catalog.lots";
  const PAGE_GROUP = "DANH MỤC";
  const pagePerm = pagePermissions.find((p) => p.pageKey === PAGE_KEY);
  const roleDefault = getRoleDefaultPerm((userRole || "VIEWER") as UserRole, PAGE_GROUP);
  const canViewPage = isAdmin || (pagePerm ? pagePerm.canView : roleDefault.canView);
  const canEditPage = isAdmin || (pagePerm ? pagePerm.canEdit : roleDefault.canEdit);

  // ─── Load Data ──────────────────────────────────────────────────────────────
  const buildQuery = () => {
    const params = new URLSearchParams();
    if (filterType !== "ALL") params.set("lotType", filterType);
    if (filterStatus !== "ALL") params.set("status", filterStatus);
    if (filterFactory) params.set("factoryId", String(filterFactory));
    if (searchText.trim()) params.set("search", searchText.trim());
    return params.toString();
  };

  const fetchLots = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/lots?${buildQuery()}`);
      const data = await res.json();
      setLots(Array.isArray(data) ? data : []);
    } catch { message.error("Lỗi tải danh sách lô"); }
    finally { setLoading(false); }
  };

  const fetchCatalogs = async () => {
    try {
      const fRes = await fetch("/api/factories");
      if (fRes.ok) setFactories(await fRes.json());
    } catch { /* ignore */ }
  };

  const fetchRawLots = async () => {
    try {
      const [cRes, fRes] = await Promise.all([
        fetch("/api/lots?lotType=RAW_COTTON&status=OPEN"),
        fetch("/api/lots?lotType=RAW_FIBER&status=OPEN"),
      ]);
      if (cRes.ok) setRawCottonLots(await cRes.json());
      if (fRes.ok) setRawFiberLots(await fRes.json());
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchCatalogs(); }, []);
  useEffect(() => { fetchLots(); }, [filterType, filterStatus, filterFactory]);

  // ─── Open Modal ─────────────────────────────────────────────────────────────
  const openCreateModal = async () => {
    setEditingLot(null);
    setFormLotType("YARN");
    setFormRawCottonIds([]);
    setFormRawFiberIds([]);
    form.resetFields();
    form.setFieldValue("status", "OPEN");
    await fetchRawLots();
    setIsModalOpen(true);
  };

  const openEditModal = async (lot: LotData) => {
    setEditingLot(lot);
    setFormLotType(lot.lotType);
    const existingRawLotIds = lot.rawMaterials.map(l => l.rawLot.id);
    const cottonIds = lot.rawMaterials
      .filter(l => l.rawLot.lotType === "RAW_COTTON")
      .map(l => l.rawLot.id);
    const fiberIds = lot.rawMaterials
      .filter(l => l.rawLot.lotType === "RAW_FIBER")
      .map(l => l.rawLot.id);
    setFormRawCottonIds(cottonIds);
    setFormRawFiberIds(fiberIds);

    form.setFieldsValue({
      lotNumber: lot.lotNumber,
      lotType: lot.lotType,
      factoryId: lot.factory.id,
      salesOrderItemId: lot.salesOrderItem?.id,
      status: lot.status,
      note: lot.note,
    });
    await fetchRawLots();
    setIsModalOpen(true);
  };

  // ─── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      const rawLotIds = [...formRawCottonIds, ...formRawFiberIds];
      const payload = {
        ...values,
        rawLotIds: formLotType === "YARN" ? rawLotIds : undefined,
      };

      const url = editingLot ? `/api/lots/${editingLot.id}` : "/api/lots";
      const method = editingLot ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Lỗi lưu");
      }
      message.success("Đã lưu thành công!");
      setIsModalOpen(false);
      fetchLots();
    } catch (e: any) {
      message.error(e.message || "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  };

  // ─── Close Lot ──────────────────────────────────────────────────────────────
  const handleCloseLot = async (lot: LotData) => {
    try {
      const res = await fetch(`/api/lots/${lot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CLOSED" }),
      });
      if (!res.ok) throw new Error("Lỗi đóng lô");
      message.success("Đã đóng lô!");
      fetchLots();
    } catch { message.error("Không thể đóng lô"); }
  };

  // ─── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/lots/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi xóa");
      message.success("Đã xóa lô");
      fetchLots();
    } catch (e: any) { message.error(e.message || "Lỗi xóa lô"); }
  };

  // ─── Columns ─────────────────────────────────────────────────────────────────
  const columns = [
    {
      title: "Số lô", dataIndex: "lotNumber", key: "lotNumber", width: 150,
      render: (v: string) => <Text strong style={{ fontFamily: "monospace" }}>{v}</Text>,
    },
    {
      title: "Loại", dataIndex: "lotType", width: 80,
      render: (v: string) => {
        const t = LOT_TYPE_LABELS[v];
        return <Tag color={t?.color}>{t?.label || v}</Tag>;
      },
    },
    {
      title: "Nhà máy", key: "factory", width: 100,
      render: (_: any, r: LotData) => r.factory?.name,
    },
    {
      title: "Hợp đồng", key: "salesOrder", width: 120,
      render: (_: any, r: LotData) =>
        r.salesOrderItem ? <Tag>{r.salesOrderItem.order.orderNo}</Tag> : <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      title: "NL sử dụng", key: "rawMaterials", width: 180,
      render: (_: any, r: LotData) =>
        r.rawMaterials.length > 0 ? (
          <Space size={4} wrap>
            {r.rawMaterials.map(l => (
              <Tag key={l.rawLot.id} color={LOT_TYPE_LABELS[l.rawLot.lotType]?.color} style={{ fontSize: 11 }}>
                {l.rawLot.lotNumber}
              </Tag>
            ))}
          </Space>
        ) : <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      title: "Trạng thái", dataIndex: "status", width: 110,
      render: (v: string) => {
        const s = LOT_STATUS_LABELS[v];
        return <Tag color={s?.color}>{s?.label || v}</Tag>;
      },
    },
    {
      title: "Ngày tạo", dataIndex: "openedAt", width: 100,
      render: (v: string) => new Date(v).toLocaleDateString("vi-VN"),
    },
    {
      title: "Hành động", key: "actions", width: 140, align: "right" as const,
      render: (_: any, r: LotData) => canEditPage ? (
        <Space>
          <Tooltip title="Xem chi tiết">
            <Button size="small" icon={<EyeOutlined />} onClick={() => openEditModal(r)} />
          </Tooltip>
          {r.status === "OPEN" && (
            <Tooltip title="Đóng lô">
              <Popconfirm title="Đóng lô này?" description="Lô sẽ chuyển sang trạng thái ĐÓNG." onConfirm={() => handleCloseLot(r)}>
                <Button size="small" icon={<CloseCircleOutlined />} danger />
              </Popconfirm>
            </Tooltip>
          )}
          {isAdmin && (
            <Tooltip title="Xóa lô">
              <Popconfirm title="Xóa lô này?" description="Chỉ xóa được nếu chưa có sản lượng." onConfirm={() => handleDelete(r.id)}>
                <Button size="small" icon={<DeleteOutlined />} danger />
              </Popconfirm>
            </Tooltip>
          )}
        </Space>
      ) : null,
    },
  ];

  if (!canViewPage) return <div className="p-10">Bạn không có quyền truy cập trang này.</div>;

  return (
    <div style={{ padding: 20 }}>
      <Card
        title={<span><TagsOutlined /> Quản lý Lô hàng</span>}
        extra={canEditPage ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            Tạo lô mới
          </Button>
        ) : null}
      >
        {/* FILTER BAR */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} md={8}>
            <Radio.Group
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: "Tất cả", value: "ALL" },
                { label: "Bông", value: "RAW_COTTON" },
                { label: "Xơ", value: "RAW_FIBER" },
                { label: "Sợi", value: "YARN" },
              ]}
            />
          </Col>
          <Col xs={24} md={6}>
            <Radio.Group
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: "Tất cả", value: "ALL" },
                { label: "Đang mở", value: "OPEN" },
                { label: "Đã đóng", value: "CLOSED" },
                { label: "Đã giao", value: "SHIPPED" },
              ]}
            />
          </Col>
          <Col xs={24} md={4}>
            <Select
              style={{ width: "100%" }}
              placeholder="Nhà máy"
              allowClear
              options={factories.map((f) => ({ label: f.name, value: f.id }))}
              onChange={(v) => setFilterFactory(v ?? null)}
            />
          </Col>
          <Col xs={24} md={4}>
            <Input.Search
              placeholder="Tìm số lô..."
              prefix={<SearchOutlined />}
              onSearch={fetchLots}
              onChange={(e) => setSearchText(e.target.value)}
              enterButton
            />
          </Col>
          <Col xs={24} md={2}>
            <Button icon={<ReloadOutlined />} onClick={fetchLots}>Làm mới</Button>
          </Col>
        </Row>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={lots}
          loading={loading}
          pagination={{ pageSize: 25, showSizeChanger: true }}
          scroll={{ x: 1100 }}
          size="middle"
        />
      </Card>

      {/* MODAL: CREATE / EDIT */}
      <Modal
        title={editingLot ? `Sửa lô: ${editingLot.lotNumber}` : "Tạo lô hàng mới"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={680}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{ status: "OPEN", lotType: "YARN" }}
        >
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item name="lotNumber" label="Số lô (*)" rules={[{ required: true, message: "Nhập số lô" }]}>
                <Input placeholder="VD: S2026-05-001" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="status" label="Trạng thái">
                <Select
                  options={[
                    { label: "Đang mở (OPEN)", value: "OPEN" },
                    { label: "Đã đóng (CLOSED)", value: "CLOSED" },
                    { label: "Đã giao (SHIPPED)", value: "SHIPPED" },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="lotType" label="Loại lô (*)" rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              onChange={(e) => { setFormLotType(e.target.value); }}
              options={[
                { label: "🌿 Bông (RAW_COTTON)", value: "RAW_COTTON" },
                { label: "🔬 Xơ (RAW_FIBER)", value: "RAW_FIBER" },
                { label: "🧵 Sợi (YARN)", value: "YARN" },
              ]}
            />
          </Form.Item>

          <Form.Item name="factoryId" label="Nhà máy (*)" rules={[{ required: true, message: "Chọn nhà máy" }]}>
            <Select
              options={factories.map((f) => ({ label: f.name, value: f.id }))}
              placeholder="Chọn nhà máy..."
            />
          </Form.Item>

          {formLotType === "YARN" && (
            <>
              <Form.Item name="salesOrderItemId" label="Hợp đồng (optional)">
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  placeholder="Gắn với hợp đồng..."
                  options={salesOrderItems.map((s) => ({ label: s.label, value: s.id }))}
                />
              </Form.Item>

              {/* RAW MATERIAL LINKS */}
              <div style={{ background: "#f5f5f5", padding: 16, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 10 }}>🔗 Lô nguyên liệu sử dụng</div>

                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 13, marginBottom: 4, color: "#666" }}>Lô bông (RAW_COTTON):</div>
                  {rawCottonLots.length > 0 ? (
                    <Checkbox.Group
                      value={formRawCottonIds}
                      onChange={(vals) => setFormRawCottonIds(vals as number[])}
                      options={rawCottonLots.map((l) => ({ label: l.lotNumber, value: l.id }))}
                    />
                  ) : <Text type="secondary" style={{ fontSize: 12 }}>Không có lô bông đang mở</Text>}
                </div>

                <div>
                  <div style={{ fontSize: 13, marginBottom: 4, color: "#666" }}>Lô xơ (RAW_FIBER):</div>
                  {rawFiberLots.length > 0 ? (
                    <Checkbox.Group
                      value={formRawFiberIds}
                      onChange={(vals) => {
                        if (vals.length > 1) {
                          message.warning("Thông thường chỉ dùng 1 lô xơ. Bạn đã chọn nhiều hơn 1.");
                        }
                        setFormRawFiberIds(vals as number[]);
                      }}
                      options={rawFiberLots.map((l) => ({ label: l.lotNumber, value: l.id }))}
                    />
                  ) : <Text type="secondary" style={{ fontSize: 12 }}>Không có lô xơ đang mở</Text>}
                  {formRawFiberIds.length > 1 && (
                    <Alert
                      type="warning"
                      showIcon
                      message="Thường chỉ dùng 1 lô xơ cho mỗi lô sợi."
                      style={{ marginTop: 8, padding: "4px 10px" }}
                    />
                  )}
                </div>
              </div>
            </>
          )}

          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Ghi chú về lô hàng này..." />
          </Form.Item>

          <Button type="primary" htmlType="submit" block loading={saving}>
            {editingLot ? "Cập nhật lô" : "Tạo lô mới"}
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
