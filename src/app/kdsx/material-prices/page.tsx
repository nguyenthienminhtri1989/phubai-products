"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Table,
  Button,
  Modal,
  Form,
  InputNumber,
  Select,
  Space,
  message,
  Tag,
  Row,
  Col,
  Card,
  DatePicker,
  Input,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DollarOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

const { Title, Text } = Typography;

interface MaterialType {
  id: number;
  code: string;
  name: string;
  category: "COTTON" | "PE" | "VISCOSE";
}

interface MaterialPrice {
  id: number;
  materialTypeId: number;
  materialType: MaterialType;
  yearMonth: string;
  priceUsd: number;
  note: string | null;
}

const CATEGORY_COLOR: Record<string, string> = {
  COTTON: "gold",
  PE: "blue",
  VISCOSE: "green",
};

export default function MaterialPricesPage() {
  const [prices, setPrices] = useState<MaterialPrice[]>([]);
  const [types, setTypes] = useState<MaterialType[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Filter
  const [filterYearMonth, setFilterYearMonth] = useState(dayjs().format("YYYY-MM"));

  const fetchPrices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kdsx/material-prices?yearMonth=${filterYearMonth}`);
      if (res.ok) setPrices(await res.json());
    } finally {
      setLoading(false);
    }
  }, [filterYearMonth]);

  const fetchTypes = useCallback(async () => {
    const res = await fetch("/api/kdsx/material-types?isActive=true");
    if (res.ok) setTypes(await res.json());
  }, []);

  useEffect(() => {
    fetchPrices();
    fetchTypes();
  }, [fetchPrices, fetchTypes]);

  // Stats
  const cottonWithPrice = prices.filter((p) => p.materialType.category === "COTTON").length;
  const peWithPrice = prices.filter((p) => p.materialType.category === "PE").length;
  const viscoseWithPrice = prices.filter((p) => p.materialType.category === "VISCOSE").length;

  function openAdd() {
    form.resetFields();
    form.setFieldsValue({ yearMonth: filterYearMonth });
    setModalOpen(true);
  }

  function openEdit(p: MaterialPrice) {
    form.setFieldsValue({
      materialTypeId: p.materialTypeId,
      yearMonth: p.yearMonth,
      priceUsd: p.priceUsd,
      note: p.note,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const res = await fetch("/api/kdsx/material-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || "Lỗi lưu dữ liệu");
        return;
      }

      message.success("Đã lưu giá NVL");
      setModalOpen(false);
      fetchPrices();
    } catch {
      // validation error
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      title: "Loại NVL",
      key: "name",
      render: (_: unknown, p: MaterialPrice) => (
        <Space>
          <Tag color={CATEGORY_COLOR[p.materialType.category]}>{p.materialType.category}</Tag>
          <Text strong>{p.materialType.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>({p.materialType.code})</Text>
        </Space>
      ),
    },
    {
      title: "Tháng",
      dataIndex: "yearMonth",
      key: "yearMonth",
      width: 100,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: (
        <Tooltip title="USD/kg">
          Giá (USD/kg) <InfoCircleOutlined />
        </Tooltip>
      ),
      dataIndex: "priceUsd",
      key: "priceUsd",
      width: 130,
      align: "right" as const,
      render: (v: number) => (
        <Text strong style={{ color: "#1677ff", fontSize: 15 }}>
          {v.toFixed(3)}
        </Text>
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
      width: 70,
      render: (_: unknown, p: MaterialPrice) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(p)} />
      ),
    },
  ];

  const cottonTypes = types.filter((t) => t.category === "COTTON");
  const peTypesList = types.filter((t) => t.category === "PE");
  const viscoseTypesList = types.filter((t) => t.category === "VISCOSE");

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <Space>
          <DollarOutlined style={{ fontSize: 22, color: "#1677ff" }} />
          <Title level={3} style={{ margin: 0 }}>
            Giá NVL theo tháng
          </Title>
        </Space>
        <Space>
          <DatePicker
            picker="month"
            value={dayjs(filterYearMonth)}
            format="MM/YYYY"
            onChange={(d) => d && setFilterYearMonth(d.format("YYYY-MM"))}
            allowClear={false}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            Nhập / Cập nhật giá
          </Button>
        </Space>
      </div>

      {/* Stats */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <div style={{ fontWeight: 600, color: "#595959", marginBottom: 4 }}>Tháng hiển thị</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1677ff" }}>{filterYearMonth}</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <div style={{ fontWeight: 600, color: "#d4a017", marginBottom: 4 }}>Bông đã nhập giá</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{cottonWithPrice} <Text type="secondary" style={{ fontSize: 13 }}>loại</Text></div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <div style={{ fontWeight: 600, color: "#1677ff", marginBottom: 4 }}>PE/Xơ đã nhập giá</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{peWithPrice} <Text type="secondary" style={{ fontSize: 13 }}>loại</Text></div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <div style={{ fontWeight: 600, color: "#389e0d", marginBottom: 4 }}>Viscose đã nhập giá</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{viscoseWithPrice} <Text type="secondary" style={{ fontSize: 13 }}>loại</Text></div>
          </Card>
        </Col>
      </Row>

      {/* Table */}
      <Table
        dataSource={prices}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
        size="middle"
        pagination={false}
      />

      {/* Modal */}
      <Modal
        title="Nhập / Cập nhật giá NVL"
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
          <Form.Item
            name="materialTypeId"
            label="Loại NVL"
            rules={[{ required: true, message: "Chọn loại NVL" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Chọn loại NVL"
              options={[
                {
                  label: "🌾 COTTON",
                  options: cottonTypes.map((t) => ({ label: `${t.name} (${t.code})`, value: t.id })),
                },
                {
                  label: "🔵 PE / Xơ",
                  options: peTypesList.map((t) => ({ label: `${t.name} (${t.code})`, value: t.id })),
                },
                {
                  label: "🟢 VISCOSE",
                  options: viscoseTypesList.map((t) => ({ label: `${t.name} (${t.code})`, value: t.id })),
                },
              ]}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="yearMonth"
                label="Tháng"
                rules={[{ required: true }]}
              >
                <Input placeholder="YYYY-MM (VD: 2026-04)" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="priceUsd"
                label="Giá (USD/kg)"
                rules={[{ required: true, message: "Nhập giá" }]}
              >
                <InputNumber
                  min={0}
                  step={0.001}
                  precision={3}
                  style={{ width: "100%" }}
                  placeholder="VD: 1.730"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Ghi chú nguồn giá, điều kiện..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
