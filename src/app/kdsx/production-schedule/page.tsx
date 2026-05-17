"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Tag,
  Space,
  Typography,
  message,
  Popconfirm,
  Tooltip,
  Card,
  Statistic,
  Row,
  Col,
} from "antd";
import {
  PlusOutlined,
  EyeOutlined,
  DeleteOutlined,
  CalendarOutlined,
  StarOutlined,
  StarFilled,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

const { Title, Text } = Typography;

interface Factory {
  id: number;
  name: string;
}

interface Schedule {
  id: number;
  factoryId: number;
  factory: { id: number; name: string };
  yearMonth: string;
  name: string;
  isPrimary: boolean;
  status: "DRAFT" | "SUBMITTED" | "APPROVED";
  note?: string | null;
  totalKg: number;
  totalTons: number;
  segmentCount: number;
  createdAt: string;
  updatedAt: string;
}


export default function ProductionSchedulePage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [form] = Form.useForm();
  const [filterFactory, setFilterFactory] = useState<number | undefined>(undefined);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterFactory ? `?factoryId=${filterFactory}` : "";
      const res = await fetch(`/api/kdsx/production-schedule${params}`);
      const data = await res.json();
      setSchedules(data);
    } catch {
      message.error("Lỗi khi tải danh sách kế hoạch");
    } finally {
      setLoading(false);
    }
  }, [filterFactory]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  useEffect(() => {
    fetch("/api/factories")
      .then((r) => r.json())
      .then((data) => setFactories(Array.isArray(data) ? data : data.factories ?? []))
      .catch(() => { });
  }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const yearMonth = (values.yearMonth as dayjs.Dayjs).format("YYYY-MM");
      setCreateLoading(true);
      const res = await fetch("/api/kdsx/production-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factoryId: values.factoryId,
          yearMonth,
          name: values.name,
          note: values.note,
        }),
      });
      const data = await res.json();
      console.log("API response:", res.status, data); // DEBUG
      if (!res.ok) {
        message.error(data.error ?? "Lỗi tạo kế hoạch");
        return;
      }
      message.success("Tạo kế hoạch SX thành công!");
      setCreateModalOpen(false);
      form.resetFields();
      fetchSchedules();
      // Chuyển sang trang chi tiết
      router.push(`/kdsx/production-schedule/${data.id}`);
    } catch (err) {
      console.error("handleCreate error:", err);
      message.error("Lỗi không xác định khi tạo kế hoạch");// validation error
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSetPrimary = async (id: number) => {
    const res = await fetch(`/api/kdsx/production-schedule/${id}/set-primary`, {
      method: "POST",
    });
    if (res.ok) {
      message.success("Đã đặt làm kế hoạch chính");
      fetchSchedules();
    } else {
      message.error("Lỗi cập nhật");
    }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/kdsx/production-schedule/${id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      message.error(data.error ?? "Lỗi xóa kế hoạch");
      return;
    }
    message.success("Đã xóa kế hoạch");
    fetchSchedules();
  };

  // Stats
  const totalSchedules = schedules.length;
  const approvedCount = schedules.filter((s) => s.status === "APPROVED").length;
  const totalTons = schedules.reduce((sum, s) => sum + (s.totalTons ?? 0), 0);

  const columns: ColumnsType<Schedule> = [
    {
      title: "Nhà máy",
      dataIndex: ["factory", "name"],
      key: "factory",
      render: (name: string) => (
        <Text strong style={{ color: "#1677ff" }}>
          {name}
        </Text>
      ),
    },
    {
      title: "Tên kế hoạch",
      dataIndex: "name",
      key: "name",
      render: (name: string) =>
        name ? <Text>{name}</Text> : <Text type="secondary">(không tên)</Text>,
    },
    {
      title: "Chính",
      dataIndex: "isPrimary",
      key: "isPrimary",
      align: "center",
      width: 110,
      render: (isPrimary: boolean, record: Schedule) =>
        isPrimary ? (
          <Tooltip title="Schedule chính — đang dùng cho Dashboard TH-Sản lượng">
            <Tag color="gold" icon={<StarFilled />}>
              Chính
            </Tag>
          </Tooltip>
        ) : (
          <Tooltip title="Đặt làm schedule chính">
            <Button
              size="small"
              icon={<StarOutlined />}
              onClick={() => handleSetPrimary(record.id)}
            >
              Đặt chính
            </Button>
          </Tooltip>
        ),
    },
    {
      title: "Tháng",
      dataIndex: "yearMonth",
      key: "yearMonth",
      render: (ym: string) => {
        const [y, m] = ym.split("-");
        return (
          <Text strong>
            Tháng {parseInt(m)}/{y}
          </Text>
        );
      },
      sorter: (a, b) => a.yearMonth.localeCompare(b.yearMonth),
      defaultSortOrder: "descend",
    },
    {
      title: "Số segments",
      dataIndex: "segmentCount",
      key: "segmentCount",
      align: "center",
      render: (n: number) => (
        <Tag color="blue">{n} segment{n !== 1 ? "s" : ""}</Tag>
      ),
    },
    {
      title: "Tổng SL (tấn)",
      dataIndex: "totalTons",
      key: "totalTons",
      align: "right",
      render: (t: number) => (
        <Text strong style={{ color: "#52c41a", fontSize: 15 }}>
          {t.toFixed(1)} tấn
        </Text>
      ),
      sorter: (a, b) => a.totalTons - b.totalTons,
    },
    {
      title: "Ngày tạo",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (d: string) => dayjs(d).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "Hành động",
      key: "actions",
      align: "center",
      render: (_, record) => (
        <Space>
          <Tooltip title="Xem chi tiết">
            <Button
              type="primary"
              icon={<EyeOutlined />}
              size="small"
              onClick={() => router.push(`/kdsx/production-schedule/${record.id}`)}
            />
          </Tooltip>
          <Popconfirm
            title="Xóa kế hoạch này?"
            description="Tất cả segments sẽ bị xóa theo. Không thể hoàn tác."
            onConfirm={() => handleDelete(record.id)}
            okText="Xóa"
            cancelText="Hủy"
            okType="danger"
          >
            <Tooltip title="Xóa kế hoạch">
              <Button danger icon={<DeleteOutlined />} size="small" />
            </Tooltip>
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
          alignItems: "flex-start",
          marginBottom: 24,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0, color: "#1677ff" }}>
            <CalendarOutlined style={{ marginRight: 8 }} />
            Kế hoạch Sản xuất tháng
          </Title>
          <Text type="secondary">
            Lập kế hoạch phân bổ máy × mặt hàng × ngày — nền tảng tính doanh thu kế hoạch
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={() => setCreateModalOpen(true)}
        >
          + Tạo kế hoạch SX tháng
        </Button>
      </div>

      {/* Stats cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card bordered={false} style={{ background: "#f0f5ff" }}>
            <Statistic
              title="Tổng kế hoạch"
              value={totalSchedules}
              suffix="kế hoạch"
              valueStyle={{ color: "#1677ff" }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false} style={{ background: "#f6ffed" }}>
            <Statistic
              title="Đã phê duyệt"
              value={approvedCount}
              suffix="kế hoạch"
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false} style={{ background: "#fff7e6" }}>
            <Statistic
              title="Tổng sản lượng KH"
              value={totalTons.toFixed(1)}
              suffix="tấn"
              valueStyle={{ color: "#fa8c16" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filter */}
      <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <Text>Lọc theo nhà máy:</Text>
        <Select
          allowClear
          placeholder="Tất cả nhà máy"
          style={{ width: 200 }}
          value={filterFactory}
          onChange={(v) => setFilterFactory(v)}
          options={factories.map((f) => ({ value: f.id, label: f.name }))}
        />
      </div>

      {/* Table */}
      <Table
        columns={columns}
        dataSource={schedules}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 15, showSizeChanger: true }}
        bordered
        size="middle"
      />

      {/* Create modal */}
      <Modal
        title={
          <>
            <CalendarOutlined style={{ marginRight: 8, color: "#1677ff" }} />
            Tạo Kế hoạch SX tháng mới
          </>
        }
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          form.resetFields();
        }}
        onOk={handleCreate}
        confirmLoading={createLoading}
        okText="Tạo kế hoạch"
        cancelText="Hủy"
        width={440}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Nhà máy"
            name="factoryId"
            rules={[{ required: true, message: "Chọn nhà máy" }]}
          >
            <Select
              placeholder="Chọn nhà máy..."
              options={factories.map((f) => ({ value: f.id, label: f.name }))}
            />
          </Form.Item>

          <Form.Item
            label="Tên kế hoạch"
            name="name"
            rules={[{ required: true, message: "Nhập tên kế hoạch" }]}
            tooltip="VD: KH sợi ống T5/2026, KH sợi con T4/2026"
          >
            <Input
              placeholder="VD: KH máy sợi ống, KH máy sợi con..."
              maxLength={100}
            />
          </Form.Item>

          <Form.Item
            label="Tháng kế hoạch"
            name="yearMonth"
            rules={[{ required: true, message: "Chọn tháng" }]}
          >
            <DatePicker
              picker="month"
              style={{ width: "100%" }}
              format="MM/YYYY"
              placeholder="Chọn tháng..."
            />
          </Form.Item>

          <Form.Item label="Ghi chú" name="note">
            <Select
              mode="tags"
              style={{ width: "100%" }}
              placeholder="Ghi chú (tùy chọn)..."
              open={false}
              tokenSeparators={[]}
              maxTagCount={1}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
