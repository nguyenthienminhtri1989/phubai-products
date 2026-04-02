"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Popconfirm,
  message,
  Tag,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";

const { Title } = Typography;

interface Customer {
  id: number;
  name: string;
  code: string | null;
  note: string | null;
  _count: { salesOrders: number };
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kdsx/customers");
      if (res.ok) setCustomers(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    form.setFieldsValue({ name: c.name, code: c.code, note: c.note });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const url = editing ? `/api/kdsx/customers/${editing.id}` : "/api/kdsx/customers";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || "Lỗi lưu dữ liệu");
        return;
      }
      message.success(editing ? "Đã cập nhật" : "Đã tạo mới");
      setModalOpen(false);
      fetchCustomers();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/kdsx/customers/${id}`, { method: "DELETE" });
    if (res.ok) {
      message.success("Đã xóa");
      fetchCustomers();
    } else {
      const err = await res.json();
      message.error(err.error || "Không thể xóa");
    }
  }

  const columns = [
    { title: "Tên khách hàng", dataIndex: "name", key: "name" },
    {
      title: "Mã KH",
      dataIndex: "code",
      key: "code",
      render: (code: string | null) => code ? <Tag>{code}</Tag> : "-",
    },
    { title: "Ghi chú", dataIndex: "note", key: "note", render: (v: string | null) => v || "-" },
    {
      title: "Số HĐ",
      key: "orders",
      render: (_: unknown, row: Customer) => row._count.salesOrders,
    },
    {
      title: "Thao tác",
      key: "action",
      width: 120,
      render: (_: unknown, row: Customer) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
          <Popconfirm
            title="Xóa khách hàng này?"
            onConfirm={() => handleDelete(row.id)}
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
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Danh sách Khách hàng</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Thêm khách hàng
        </Button>
      </div>

      <Table
        dataSource={customers}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
        size="middle"
      />

      <Modal
        title={editing ? "Sửa khách hàng" : "Thêm khách hàng"}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Tên khách hàng" rules={[{ required: true, message: "Nhập tên KH" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="Mã KH (tùy chọn)">
            <Input />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
