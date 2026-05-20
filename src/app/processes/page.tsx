"use client";

import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  message,
  Space,
  Card,
  Select,
  Tag,
  Switch,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FilterOutlined,
} from "@ant-design/icons";
import { useSession } from "next-auth/react";

// Định nghĩa kiểu dữ liệu
interface Factory {
  id: number;
  name: string;
}

interface Process {
  id: number;
  name: string;
  factoryId: number;
  isRevenueProcess?: boolean;
  factory?: Factory; // Dữ liệu quan hệ
}

export default function ProcessPage() {
  const { data: session } = useSession();
  const canEdit = (session?.user as any)?.role === "ADMIN";

  // --- STATE ---
  const [processes, setProcesses] = useState<Process[]>([]); // Dữ liệu gốc
  const [filteredProcesses, setFilteredProcesses] = useState<Process[]>([]); // Dữ liệu hiển thị (sau khi lọc)
  const [factories, setFactories] = useState<Factory[]>([]); // Danh sách nhà máy cho Dropdown

  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<Process | null>(null);
  const [filterFactoryId, setFilterFactoryId] = useState<number | null>(null); // State lưu nhà máy đang lọc

  const [form] = Form.useForm();
  // --- 1. FETCH DATA (Gọi cả 2 API) ---
  const fetchData = async () => {
    setLoading(true);
    try {
      // Gọi song song 2 API cho nhanh
      const [resFactories, resProcesses] = await Promise.all([
        fetch("/api/factories"),
        fetch("/api/processes"),
      ]);

      const factoriesData = await resFactories.json();
      const processesData = await resProcesses.json();

      setFactories(factoriesData);
      setProcesses(processesData);
      setFilteredProcesses(processesData); // Mặc định hiển thị hết
    } catch (error) {
      message.error("Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- 2. LOGIC LỌC (Khi chọn Dropdown Nhà máy ở trên cùng) ---
  useEffect(() => {
    if (filterFactoryId === null) {
      setFilteredProcesses(processes); // Nếu chọn "Tất cả" -> Hiện hết
    } else {
      // Lọc các công đoạn thuộc nhà máy đã chọn
      const result = processes.filter((p) => p.factoryId === filterFactoryId);
      setFilteredProcesses(result);
    }
  }, [filterFactoryId, processes]);

  // --- 3. XỬ LÝ LƯU (THÊM/SỬA) ---
  const handleSave = async (values: any) => {
    try {
      let res;
      const payload = { ...values }; // { name: '...', factoryId: ... }

      if (editingProcess) {
        // Update
        res = await fetch(`/api/processes/${editingProcess.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        // Create
        res = await fetch("/api/processes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      message.success(
        editingProcess ? "Cập nhật thành công" : "Thêm mới thành công"
      );
      setIsModalOpen(false);
      form.resetFields();
      setEditingProcess(null);
      fetchData(); // Load lại dữ liệu mới nhất
    } catch (error: any) {
      message.error(error.message || "Có lỗi xảy ra");
    }
  };

  // --- 4. XỬ LÝ XÓA ---
  const handleDelete = (id: number) => {
    Modal.confirm({
      title: "Cảnh báo xóa",
      content: "Bạn có chắc chắn muốn xóa công đoạn này?",
      onOk: async () => {
        try {
          const res = await fetch(`/api/processes/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Không thể xóa");
          message.success("Đã xóa");
          fetchData();
        } catch (error) {
          message.error("Lỗi: Không thể xóa (Có thể đang chứa máy móc)");
        }
      },
    });
  };

  // --- 5. CẤU HÌNH CỘT BẢNG ---
  const columns = [
    { title: "ID", dataIndex: "id", width: 60 },
    {
      title: "Tên Công Đoạn",
      dataIndex: "name",
      render: (text: string) => <b>{text}</b>,
    },
    {
      title: "Thuộc Nhà Máy",
      dataIndex: "factory",
      render: (factory: Factory) => (
        // Hiển thị tên nhà máy dưới dạng thẻ màu cho đẹp
        <Tag color="blue">{factory?.name || "N/A"}</Tag>
      ),
    },
    {
      title: (
        <Tooltip title="Công đoạn cuối có sản lượng dùng để tính doanh thu (thường là công đoạn ống). Dashboard chỉ tính SL của công đoạn này.">
          <span>CĐ doanh thu</span>
        </Tooltip>
      ),
      dataIndex: "isRevenueProcess",
      width: 130,
      align: "center" as const,
      render: (v: boolean) =>
        v ? <Tag color="gold">Doanh thu</Tag> : <span style={{ color: "#bfbfbf" }}>—</span>,
    },
    ...(canEdit ? [{
      title: "Hành động",
      key: "action",
      width: 120,
      render: (_: any, record: Process) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => {
              setEditingProcess(record);
              form.setFieldsValue({
                name: record.name,
                factoryId: record.factoryId,
                isRevenueProcess: !!record.isRevenueProcess,
              });
              setIsModalOpen(true);
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
    }] : []),
  ];

  return (
    <div style={{ padding: 20 }}>
      <Card
        title="Quản lý Công Đoạn Sản Xuất"
        extra={canEdit ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingProcess(null);
              form.resetFields();
              if (filterFactoryId) {
                form.setFieldValue("factoryId", filterFactoryId);
              }
              setIsModalOpen(true);
            }}
          >
            Thêm Công Đoạn
          </Button>
        ) : null}
      >
        {/* --- THANH CÔNG CỤ LỌC --- */}
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <FilterOutlined />
          <span style={{ fontWeight: 500 }}>Lọc theo nhà máy:</span>
          <Select
            style={{ width: 200 }}
            placeholder="Chọn nhà máy..."
            allowClear
            onChange={(value) => setFilterFactoryId(value)}
            options={factories.map((f) => ({ label: f.name, value: f.id }))}
          />
        </div>

        {/* --- BẢNG DỮ LIỆU --- */}
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredProcesses} // Dùng dữ liệu đã lọc
          loading={loading}
          bordered
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* --- MODAL FORM --- */}
      <Modal
        title={editingProcess ? "Sửa Công Đoạn" : "Thêm Công Đoạn"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item
            name="factoryId"
            label="Thuộc Nhà Máy"
            rules={[{ required: true, message: "Vui lòng chọn nhà máy!" }]}
          >
            <Select
              placeholder="Chọn nhà máy"
              options={factories.map((f) => ({ label: f.name, value: f.id }))}
            />
          </Form.Item>

          <Form.Item
            name="name"
            label="Tên Công Đoạn"
            rules={[{ required: true, message: "Nhập tên công đoạn!" }]}
          >
            <Input placeholder="Ví dụ: Bông chải, Ghép thô..." />
          </Form.Item>

          <Form.Item
            name="isRevenueProcess"
            label={
              <Tooltip title="Bật cho công đoạn cuối có SL dùng tính doanh thu (thường là công đoạn ống). Mỗi nhà máy chỉ nên bật 1 công đoạn.">
                <span>Công đoạn tính doanh thu</span>
              </Tooltip>
            }
            valuePropName="checked"
            initialValue={false}
          >
            <Switch checkedChildren="Có" unCheckedChildren="Không" />
          </Form.Item>

          <div style={{ textAlign: "right", marginTop: 20 }}>
            <Space>
              <Button onClick={() => setIsModalOpen(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit">
                {editingProcess ? "Cập Nhật" : "Lưu Lại"}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
