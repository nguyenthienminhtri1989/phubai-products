// src/app/factories/page.tsx
"use client"; // Đây là Client Components

import React, { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, message, Space, Card } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";

// Định nghĩa kiểu dữ liệu nhà máy (khớp với Prisma)
interface Factory {
  id: number;
  name: string;
  note?: string;
}

export default function FactoryPage() {
  // Khai báo State
  const [factories, setFactories] = useState<Factory[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFactory, setEditingFactory] = useState<Factory | null>(null);

  const [form] = Form.useForm(); // Hook quản lý form của Ant Design

  // --- 1. Hàm gọi API để hiện dữ liệu (Fetch data) ---
  const fetchFactories = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/factories"); // Gọi API GET ta đã viết
      const data = await res.json();
      setFactories(data);
    } catch (error) {
      message.error("Lỗi tải dữ liệu: " + error);
    } finally {
      setLoading(false);
    }
  };

  // Chạy hàm này 1 lần khi trang vừa load xong
  useEffect(() => {
    fetchFactories();
  }, []);

  // --- 2. Xử lý Thêm và Sửa ---
  const handleSave = async (values: any) => {
    try {
      let res;
      if (editingFactory) {
        // Gọi API PUT để sửa
        res = await fetch(`/api/factories/${editingFactory.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        message.success("Cập nhật thành công");
      } else {
        // Gọi API để thêm mới
        res = await fetch("/api/factories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
      }

      // --- THÊM ĐOẠN KIỂM TRA NÀY ---
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Lỗi từ server");
      }
      // -----------------------------

      message.success(
        editingFactory ? "Cập nhật thành công" : "Thêm mới thành công"
      );
      setIsModalOpen(false); // Đóng Modal
      form.resetFields(); // Xóa trắng Form
      setEditingFactory(null);
      fetchFactories(); // Load lại bảng
    } catch (error) {
      message.error("Có lỗi xảy ra: " + error);
    }
  };

  // --- 3. Xử lý Xóa ---
  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: "Bạn có chắc chắn muốn xóa không?",
      content: "Hành động này không thể hoàn tác",
      onOk: async () => {
        try {
          await fetch(`/api/factories/${id}`, {
            method: "DELETE",
          });
          message.success("Xóa thành công");
          fetchFactories(); // Load lại bảng
        } catch (error) {
          message.error("Lỗi khi xóa: " + error);
        }
      },
    });
  };

  // --- 4. Cấu hình cột cho bảng dữ liệu ---
  const columns = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 80,
    },
    {
      title: "Tên Nhà Máy",
      dataIndex: "name",
      key: "name",
      render: (text: string) => <b>{text}</b>,
    },
    {
      title: "Ghi Chú",
      dataIndex: "note",
      key: "note",
    },
    {
      title: "Hành Động",
      key: "action",
      width: 150,
      render: (_: any, record: Factory) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => {
              setEditingFactory(record); // gán bản ghi cần xóa vào State
              form.setFieldsValue(record); // Điền dữ liệu cũ vào form
              setIsModalOpen(true); // Mở modal để sửa
            }}
          />
          <Button
            icon={<DeleteOutlined />}
            danger
            size="small"
            onClick={() => handleDelete(record.id)}
          />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 20 }}>
      <Card
        title="Quản lý danh mục Nhà Máy"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingFactory(null); // Đánh dấu là thêm mới
              form.resetFields(); // Xóa trắng form để điền dữ liệu mới
              setIsModalOpen(true); // Mở ô modal nhập liệu
            }}
          >
            Thêm Nhà Máy
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={factories}
          loading={loading}
          bordered
        ></Table>
      </Card>

      {/* Modal Form Thêm/Sửa */}
      <Modal
        title={editingFactory ? "Sửa Nhà Máy" : "Thêm Nhà Máy Mới"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null} // Ẩn nút mặc định để dùng nút của Form
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item
            name="name"
            label="Tên Nhà Máy"
            rules={[{ required: true, message: "Vui lòng nhập tên!" }]}
          >
            <Input placeholder="Ví dụ: Nhà máy 1" />
          </Form.Item>

          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={3} />
          </Form.Item>

          <div style={{ textAlign: "right" }}>
            <Space>
              <Button onClick={() => setIsModalOpen(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit">
                {editingFactory ? "Cập Nhật" : "Lưu Lại"}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
