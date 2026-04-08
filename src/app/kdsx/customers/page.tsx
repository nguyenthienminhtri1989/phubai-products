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
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";

const { Title } = Typography;

type CustomerType = "DOMESTIC" | "FOREIGN";

interface Customer {
  id: number;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxCode: string | null;
  customerType: CustomerType;
  note: string | null;
  _count: { salesOrders: number };
}

const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = {
  DOMESTIC: "Trong nước",
  FOREIGN: "Nước ngoài",
};

const CUSTOMER_TYPE_COLOR: Record<CustomerType, string> = {
  DOMESTIC: "blue",
  FOREIGN: "green",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState<CustomerType | "ALL">("ALL");

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
    form.setFieldsValue({
      name: c.name,
      code: c.code,
      address: c.address,
      phone: c.phone,
      email: c.email,
      taxCode: c.taxCode,
      customerType: c.customerType,
      note: c.note,
    });
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
    {
      title: "Tên khách hàng",
      dataIndex: "name",
      key: "name",
      width: 200,
    },
    {
      title: "Mã KH",
      dataIndex: "code",
      key: "code",
      width: 100,
      render: (code: string | null) => code ? <Tag>{code}</Tag> : "-",
    },
    {
      title: "Phân loại",
      dataIndex: "customerType",
      key: "customerType",
      width: 130,
      render: (type: CustomerType) => (
        <Tag color={CUSTOMER_TYPE_COLOR[type]}>{CUSTOMER_TYPE_LABEL[type]}</Tag>
      ),
    },
    {
      title: "Địa chỉ",
      dataIndex: "address",
      key: "address",
      render: (v: string | null) => v || "-",
    },
    {
      title: "Số điện thoại",
      dataIndex: "phone",
      key: "phone",
      width: 130,
      render: (v: string | null) => v || "-",
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      width: 180,
      render: (v: string | null) => v || "-",
    },
    {
      title: "Mã số thuế",
      dataIndex: "taxCode",
      key: "taxCode",
      width: 130,
      render: (v: string | null) => v || "-",
    },
    {
      title: "Số HĐ",
      key: "orders",
      width: 70,
      align: "center" as const,
      render: (_: unknown, row: Customer) => row._count.salesOrders,
    },
    {
      title: "Thao tác",
      key: "action",
      width: 100,
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

  const filteredCustomers = customers.filter((c) => {
    const matchName = 
      c.name.toLowerCase().includes(searchText.toLowerCase()) || 
      (c.code && c.code.toLowerCase().includes(searchText.toLowerCase()));
    const matchType = filterType === "ALL" || c.customerType === filterType;
    return matchName && matchType;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Danh sách Khách hàng</Title>
        <Space>
          <Input.Search
            placeholder="Tìm theo tên hoặc mã KH..."
            allowClear
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
          />
          <Select
            value={filterType}
            onChange={(val) => setFilterType(val)}
            style={{ width: 150 }}
            options={[
              { label: "Tất cả", value: "ALL" },
              { label: "Trong nước", value: "DOMESTIC" },
              { label: "Nước ngoài", value: "FOREIGN" },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Thêm khách hàng
          </Button>
        </Space>
      </div>

      <Table
        dataSource={filteredCustomers}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
        size="middle"
        scroll={{ x: 1100 }}
      />

      <Modal
        title={editing ? "Sửa khách hàng" : "Thêm khách hàng"}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="customerType"
            label="Phân loại khách hàng"
            initialValue="DOMESTIC"
            rules={[{ required: true, message: "Chọn loại khách hàng" }]}
          >
            <Select>
              <Select.Option value="DOMESTIC">🇻🇳 Trong nước</Select.Option>
              <Select.Option value="FOREIGN">🌐 Nước ngoài</Select.Option>
            </Select>
          </Form.Item>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Form.Item
              name="name"
              label="Tên khách hàng"
              rules={[{ required: true, message: "Nhập tên KH" }]}
            >
              <Input placeholder="VD: Công ty CP Dệt Phú Bài" />
            </Form.Item>
            <Form.Item name="code" label="Mã KH">
              <Input placeholder="VD: KH001" />
            </Form.Item>
          </div>

          <Form.Item name="address" label="Địa chỉ">
            <Input placeholder="Số nhà, đường, phường/xã, tỉnh/thành phố" />
          </Form.Item>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Form.Item name="phone" label="Số điện thoại">
              <Input placeholder="VD: 0234 3855 555" />
            </Form.Item>
            <Form.Item name="taxCode" label="Mã số thuế">
              <Input placeholder="VD: 3300109876" />
            </Form.Item>
          </div>

          <Form.Item name="email" label="Email">
            <Input placeholder="VD: contact@company.vn" />
          </Form.Item>

          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Ghi chú thêm (nếu có)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
