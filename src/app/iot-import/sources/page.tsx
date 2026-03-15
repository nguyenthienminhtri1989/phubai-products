"use client";

import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Drawer,
  Modal,
  Form,
  Input,
  Switch,
  Tag,
  Space,
  Typography,
  Popconfirm,
  message,
  Tabs,
  Divider,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";

const { Title, Text } = Typography;

interface IotSource {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { machineMaps: number; itemMaps: number; importLogs: number };
}

interface MachineMap {
  id: number;
  iotName: string;
  machineId: number;
  machine: { id: number; name: string };
}

interface ItemMap {
  id: number;
  iotName: string;
  itemId: number;
  item: { id: number; name: string };
}

export default function SourcesPage() {
  const router = useRouter();
  const [sources, setSources] = useState<IotSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [formDrawerOpen, setFormDrawerOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<IotSource | null>(null);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<IotSource | null>(null);
  const [machineMaps, setMachineMaps] = useState<MachineMap[]>([]);
  const [itemMaps, setItemMaps] = useState<ItemMap[]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/iot/sources");
      if (res.ok) setSources(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const loadMapping = async (sourceId: number) => {
    setMappingLoading(true);
    try {
      const res = await fetch(`/api/iot/mapping?sourceId=${sourceId}`);
      if (res.ok) {
        const data = await res.json();
        setMachineMaps(data.machineMaps || []);
        setItemMaps(data.itemMaps || []);
      }
    } finally {
      setMappingLoading(false);
    }
  };

  const handleOpenForm = (source?: IotSource) => {
    setEditingSource(source || null);
    form.setFieldsValue(
      source
        ? { name: source.name, description: source.description, isActive: source.isActive }
        : { name: "", description: "", isActive: true }
    );
    setFormDrawerOpen(true);
  };

  const handleSaveSource = async () => {
    try {
      const values = await form.validateFields();
      const url = editingSource
        ? `/api/iot/sources/${editingSource.id}`
        : "/api/iot/sources";
      const method = editingSource ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || "Lỗi lưu nguồn IoT");
        return;
      }

      message.success(editingSource ? "Đã cập nhật" : "Đã tạo mới");
      setFormDrawerOpen(false);
      loadSources();
    } catch {
      // validation failed
    }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/iot/sources/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      message.error(err.error || "Lỗi xóa");
      return;
    }
    message.success("Đã xóa nguồn IoT");
    loadSources();
  };

  const handleViewMapping = (source: IotSource) => {
    setSelectedSource(source);
    loadMapping(source.id);
    setMappingModalOpen(true);
  };

  const handleDeleteMap = async (type: "machine" | "item", id: number) => {
    const res = await fetch("/api/iot/mapping", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id }),
    });
    if (!res.ok) {
      message.error("Lỗi xóa mapping");
      return;
    }
    message.success("Đã xóa mapping");
    if (selectedSource) loadMapping(selectedSource.id);
  };

  const columns = [
    {
      title: "Tên nguồn",
      dataIndex: "name",
      key: "name",
      render: (v: string, r: IotSource) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v}</Text>
          {r.description && <Text type="secondary" style={{ fontSize: 12 }}>{r.description}</Text>}
        </Space>
      ),
    },
    {
      title: "Mapping máy",
      key: "machineMaps",
      width: 120,
      render: (r: IotSource) => <Tag>{r._count.machineMaps} máy</Tag>,
    },
    {
      title: "Mapping mặt hàng",
      key: "itemMaps",
      width: 140,
      render: (r: IotSource) => <Tag>{r._count.itemMaps} mặt hàng</Tag>,
    },
    {
      title: "Lần import",
      key: "importLogs",
      width: 100,
      render: (r: IotSource) => <Text>{r._count.importLogs}</Text>,
    },
    {
      title: "Trạng thái",
      dataIndex: "isActive",
      key: "isActive",
      width: 100,
      render: (v: boolean) => <Tag color={v ? "success" : "default"}>{v ? "Hoạt động" : "Tắt"}</Tag>,
    },
    {
      title: "Hành động",
      key: "actions",
      width: 160,
      render: (r: IotSource) => (
        <Space>
          <Button
            type="text"
            icon={<EyeOutlined />}
            size="small"
            onClick={() => handleViewMapping(r)}
          />
          <Button
            type="text"
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleOpenForm(r)}
          />
          <Popconfirm
            title="Xác nhận xóa?"
            description="Nếu đã có lần import, nguồn này không thể xóa."
            onConfirm={() => handleDelete(r.id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Button type="text" icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const machineMapColumns = [
    { title: "Tên IoT", dataIndex: "iotName", key: "iotName", render: (v: string) => <Text code>{v}</Text> },
    { title: "Máy ERP", key: "machine", render: (r: MachineMap) => r.machine.name },
    {
      title: "",
      key: "del",
      width: 60,
      render: (r: MachineMap) => (
        <Popconfirm title="Xóa mapping này?" onConfirm={() => handleDeleteMap("machine", r.id)} okText="Xóa" cancelText="Hủy">
          <Button type="text" icon={<DeleteOutlined />} size="small" danger />
        </Popconfirm>
      ),
    },
  ];

  const itemMapColumns = [
    { title: "Tên IoT", dataIndex: "iotName", key: "iotName", render: (v: string) => <Text code>{v}</Text> },
    { title: "Mặt hàng ERP", key: "item", render: (r: ItemMap) => r.item.name },
    {
      title: "",
      key: "del",
      width: 60,
      render: (r: ItemMap) => (
        <Popconfirm title="Xóa mapping này?" onConfirm={() => handleDeleteMap("item", r.id)} okText="Xóa" cancelText="Hủy">
          <Button type="text" icon={<DeleteOutlined />} size="small" danger />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/iot-import")} />
          <Title level={3} style={{ margin: 0 }}>Quản lý nguồn IoT</Title>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenForm()}>
          Thêm nguồn mới
        </Button>
      </Space>

      <Table
        dataSource={sources}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="small"
      />

      {/* Form Drawer */}
      <Drawer
        title={editingSource ? "Sửa nguồn IoT" : "Thêm nguồn IoT mới"}
        open={formDrawerOpen}
        onClose={() => setFormDrawerOpen(false)}
        width={480}
        extra={
          <Button type="primary" onClick={handleSaveSource}>
            Lưu
          </Button>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Tên nguồn" rules={[{ required: true, message: "Bắt buộc" }]}>
            <Input placeholder="VD: IoT Chải thô" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} placeholder="Mô tả về nguồn IoT này..." />
          </Form.Item>
          {editingSource && (
            <Form.Item name="isActive" label="Trạng thái" valuePropName="checked">
              <Switch checkedChildren="Hoạt động" unCheckedChildren="Tắt" />
            </Form.Item>
          )}
        </Form>
      </Drawer>

      {/* Mapping Modal */}
      <Modal
        title={`Mapping: ${selectedSource?.name}`}
        open={mappingModalOpen}
        onCancel={() => setMappingModalOpen(false)}
        footer={null}
        width={700}
      >
        <Tabs
          items={[
            {
              key: "machines",
              label: `Máy (${machineMaps.length})`,
              children: (
                <Table
                  dataSource={machineMaps}
                  columns={machineMapColumns}
                  rowKey="id"
                  loading={mappingLoading}
                  pagination={false}
                  size="small"
                />
              ),
            },
            {
              key: "items",
              label: `Mặt hàng (${itemMaps.length})`,
              children: (
                <Table
                  dataSource={itemMaps}
                  columns={itemMapColumns}
                  rowKey="id"
                  loading={mappingLoading}
                  pagination={false}
                  size="small"
                />
              ),
            },
          ]}
        />
        <Divider />
        <Text type="secondary" style={{ fontSize: 12 }}>
          Xóa mapping để thiết lập lại nếu nhầm. Mapping mới sẽ được tạo khi import file lần sau.
        </Text>
      </Modal>
    </div>
  );
}
