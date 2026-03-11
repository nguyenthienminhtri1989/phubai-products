"use client";

import React, { useEffect, useState } from "react";
import {
  Table, Button, Modal, Form, Input, Switch, Tag, Space, message, Popconfirm, Badge, ColorPicker,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface StopCategory {
  id: number;
  name: string;
  color: string;
  isActive: boolean;
  isDefault: boolean;
  _count?: { stopLogs: number };
}

export default function StopCategoriesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [categories, setCategories] = useState<StopCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StopCategory | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && (session?.user as any)?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [status, session, router]);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/production/stop-categories");
      const data = await res.json();
      setCategories(data);
    } catch {
      message.error("Lỗi tải danh mục");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    form.resetFields();
    form.setFieldsValue({ color: "#1677ff", isActive: true });
    setModalOpen(true);
  };

  const openEdit = (cat: StopCategory) => {
    setEditTarget(cat);
    form.setFieldsValue({ name: cat.name, color: cat.color, isActive: cat.isActive });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const colorVal = typeof values.color === "string" ? values.color : values.color?.toHexString?.() ?? "#1677ff";
      if (editTarget) {
        await fetch(`/api/production/stop-categories/${editTarget.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: values.name, color: colorVal, isActive: values.isActive }),
        }).then(async r => {
          if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
        });
        message.success("Đã cập nhật danh mục");
      } else {
        await fetch("/api/production/stop-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: values.name, color: colorVal }),
        }).then(async r => {
          if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
        });
        message.success("Đã thêm danh mục mới");
      }
      setModalOpen(false);
      fetchCategories();
    } catch (e: any) {
      message.error(e.message || "Lỗi lưu");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (cat: StopCategory, checked: boolean) => {
    try {
      const res = await fetch(`/api/production/stop-categories/${cat.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: checked }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      message.success(checked ? "Đã kích hoạt" : "Đã tắt");
      fetchCategories();
    } catch (e: any) {
      message.error(e.message || "Lỗi cập nhật");
    }
  };

  const handleDelete = async (cat: StopCategory) => {
    try {
      const res = await fetch(`/api/production/stop-categories/${cat.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      message.success("Đã xóa danh mục");
      fetchCategories();
    } catch (e: any) {
      message.error(e.message || "Lỗi xóa");
    }
  };

  const columns = [
    {
      title: "Màu",
      dataIndex: "color",
      width: 60,
      render: (color: string) => (
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: color, border: "1px solid #d9d9d9" }} />
      ),
    },
    {
      title: "Tên nguyên nhân",
      dataIndex: "name",
      render: (name: string, record: StopCategory) => (
        <Space>
          <Tag color={record.color}>{name}</Tag>
          {record.isDefault && <Badge status="processing" text={<span style={{ fontSize: 11, color: "#888" }}>Mặc định</span>} />}
        </Space>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "isActive",
      width: 120,
      render: (isActive: boolean, record: StopCategory) => (
        <Switch
          checked={isActive}
          onChange={checked => handleToggleActive(record, checked)}
          disabled={record.isDefault && isActive}
          checkedChildren="Hoạt động"
          unCheckedChildren="Tắt"
        />
      ),
    },
    {
      title: "Thao tác",
      width: 120,
      render: (_: any, record: StopCategory) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>Sửa</Button>
          {!record.isDefault && (
            <Popconfirm title="Xóa danh mục này?" onConfirm={() => handleDelete(record)} okText="Xóa" cancelText="Hủy">
              <Button size="small" icon={<DeleteOutlined />} danger>Xóa</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Danh mục nguyên nhân dừng máy</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm mới</Button>
      </div>

      <Table
        columns={columns}
        dataSource={categories}
        rowKey="id"
        loading={loading}
        pagination={false}
        rowClassName={record => !record.isActive ? "opacity-50" : ""}
      />

      <Modal
        title={editTarget ? "Chỉnh sửa danh mục" : "Thêm danh mục mới"}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Tên nguyên nhân" rules={[{ required: true, message: "Vui lòng nhập tên" }]}>
            <Input placeholder="Vd: Hỏng máy, Thiếu nguyên liệu..." />
          </Form.Item>
          <Form.Item name="color" label="Màu sắc" rules={[{ required: true }]}>
            <ColorPicker showText format="hex" />
          </Form.Item>
          {editTarget && (
            <Form.Item name="isActive" label="Trạng thái" valuePropName="checked">
              <Switch checkedChildren="Hoạt động" unCheckedChildren="Tắt" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
