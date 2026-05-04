"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Popconfirm,
  message,
  Tag,
  Switch,
  Row,
  Col,
  Card,
  Statistic,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;

interface MaterialType {
  id: number;
  code: string;
  name: string;
  category: "COTTON" | "PE";
  isActive: boolean;
  note: string | null;
  createdAt: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  COTTON: "gold",
  PE: "blue",
};

export default function MaterialTypesPage() {
  const [types, setTypes] = useState<MaterialType[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialType | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kdsx/material-types");
      if (res.ok) setTypes(await res.json());
      else message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  const cottonCount = types.filter((t) => t.category === "COTTON").length;
  const peCount = types.filter((t) => t.category === "PE").length;
  const activeCount = types.filter((t) => t.isActive).length;

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ category: "COTTON", isActive: true });
    setModalOpen(true);
  }

  function openEdit(t: MaterialType) {
    setEditing(t);
    form.setFieldsValue({
      name: t.name,
      note: t.note,
      isActive: t.isActive,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const url = editing
        ? `/api/kdsx/material-types/${editing.id}`
        : "/api/kdsx/material-types";
      const method = editing ? "PUT" : "POST";

      const payload = editing
        ? { name: values.name, note: values.note, isActive: values.isActive }
        : { code: values.code, name: values.name, category: values.category, note: values.note };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || "Lỗi lưu dữ liệu");
        return;
      }

      message.success(editing ? "Đã cập nhật loại NVL" : "Đã thêm loại NVL mới");
      setModalOpen(false);
      fetchTypes();
    } catch {
      // validation error
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/kdsx/material-types/${id}`, { method: "DELETE" });
    if (res.ok) {
      message.success("Đã xóa");
      fetchTypes();
    } else {
      const err = await res.json();
      message.error(err.error || "Không thể xóa");
    }
  }

  async function handleToggleActive(t: MaterialType) {
    const res = await fetch(`/api/kdsx/material-types/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    if (res.ok) {
      fetchTypes();
    } else {
      const err = await res.json();
      message.error(err.error || "Lỗi");
    }
  }

  const columns = [
    {
      title: "Mã",
      dataIndex: "code",
      key: "code",
      width: 130,
      render: (v: string) => <Text code strong>{v}</Text>,
    },
    {
      title: "Tên loại NVL",
      dataIndex: "name",
      key: "name",
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: "Loại",
      dataIndex: "category",
      key: "category",
      width: 100,
      render: (v: string) => (
        <Tag color={CATEGORY_COLOR[v]}>{v}</Tag>
      ),
    },
    {
      title: "Kích hoạt",
      key: "isActive",
      width: 100,
      render: (_: unknown, t: MaterialType) => (
        <Switch
          checked={t.isActive}
          size="small"
          onChange={() => handleToggleActive(t)}
        />
      ),
    },
    {
      title: "Ghi chú",
      dataIndex: "note",
      key: "note",
      render: (v: string | null) => v ? <Text type="secondary">{v}</Text> : "—",
    },
    {
      title: "Thao tác",
      key: "action",
      width: 90,
      render: (_: unknown, t: MaterialType) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(t)} />
          <Popconfirm
            title="Xóa loại NVL này?"
            description="Chỉ xóa được nếu chưa có bản ghi giá"
            onConfirm={() => handleDelete(t.id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Space>
          <ExperimentOutlined style={{ fontSize: 22, color: "#1677ff" }} />
          <Title level={3} style={{ margin: 0 }}>
            Danh mục Nguyên vật liệu
          </Title>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Thêm loại NVL
        </Button>
      </div>

      {/* Stats */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="Loại bông (COTTON)" value={cottonCount} valueStyle={{ color: "#d4a017" }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="Loại PE / Xơ (PE)" value={peCount} valueStyle={{ color: "#1677ff" }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="Đang kích hoạt" value={activeCount} suffix={`/ ${types.length}`} />
          </Card>
        </Col>
      </Row>

      {/* Table */}
      <Table
        dataSource={types}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
        size="middle"
        pagination={{ pageSize: 20, showSizeChanger: true }}
        rowClassName={(r: MaterialType) => r.isActive ? "" : "ant-table-row-dimmed"}
      />

      {/* Modal */}
      <Modal
        title={editing ? `Sửa: ${editing.name}` : "Thêm loại NVL mới"}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editing && (
            <>
              <Form.Item
                name="code"
                label="Mã code"
                rules={[
                  { required: true, message: "Nhập mã code" },
                  { pattern: /^[A-Z0-9_]+$/i, message: "Chỉ dùng chữ cái, số và _" },
                ]}
              >
                <Input
                  placeholder="VD: AUS, US_PVC, PE_BENMA"
                  style={{ textTransform: "uppercase" }}
                />
              </Form.Item>
              <Form.Item
                name="category"
                label="Loại"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { label: "🌾 COTTON — Bông các loại", value: "COTTON" },
                    { label: "🔵 PE — Polyester, Xơ tổng hợp", value: "PE" },
                    { label: "🔵 Viscose, Xơ tổng hợp", value: "VISCOSE" },
                  ]}
                />
              </Form.Item>
            </>
          )}

          <Form.Item
            name="name"
            label="Tên loại NVL"
            rules={[{ required: true, message: "Nhập tên loại NVL" }]}
          >
            <Input placeholder="VD: Bông Úc (Australia), PE Benma Indo" />
          </Form.Item>

          {editing && (
            <Form.Item name="isActive" label="Trạng thái" valuePropName="checked">
              <Switch checkedChildren="Kích hoạt" unCheckedChildren="Tắt" />
            </Form.Item>
          )}

          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea
              rows={2}
              placeholder="Ghi chú thêm (tùy chọn)"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
