"use client";

import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Drawer,
  Form,
  Input,
  Switch,
  Select,
  Tag,
  Space,
  Typography,
  Popconfirm,
  message,
  Tabs,
  Divider,
  Row,
  Col,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SettingOutlined,
  ArrowLeftOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";

const { Title, Text } = Typography;

type IotFileFormat = "STANDARD" | "DANH_ONG";

const FILE_FORMAT_OPTIONS: { value: IotFileFormat; label: string; desc: string }[] = [
  {
    value: "STANDARD",
    label: "Chuẩn (Máy sợi con...)",
    desc: "File XLS/XLSX thông thường: có cột Ngày, Ca, Máy, Mặt hàng, Sản lượng",
  },
  {
    value: "DANH_ONG",
    label: "Máy đánh ống",
    desc: "File HTML-as-XLS: ngày+ca trong tiêu đề, cột A = Lô, cột B = Số máy, cột M = sản lượng",
  },
];

const FILE_FORMAT_COLOR: Record<IotFileFormat, string> = {
  STANDARD: "blue",
  DANH_ONG: "purple",
};

interface IotSource {
  id: number;
  name: string;
  description: string | null;
  fileFormat: IotFileFormat;
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

interface ErpMachine {
  id: number;
  name: string;
}

interface ErpItem {
  id: number;
  name: string;
}

export default function SourcesPage() {
  const router = useRouter();

  // Source list
  const [sources, setSources] = useState<IotSource[]>([]);
  const [loading, setLoading] = useState(false);

  // Source form drawer
  const [formDrawerOpen, setFormDrawerOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<IotSource | null>(null);
  const [form] = Form.useForm();

  // Mapping drawer
  const [mappingDrawerOpen, setMappingDrawerOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<IotSource | null>(null);
  const [machineMaps, setMachineMaps] = useState<MachineMap[]>([]);
  const [itemMaps, setItemMaps] = useState<ItemMap[]>([]);
  const [shiftMap, setShiftMap] = useState<Record<string, number>>({});
  const [skipItems, setSkipItems] = useState<string[]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);

  // ERP lookups
  const [erpMachines, setErpMachines] = useState<ErpMachine[]>([]);
  const [erpItems, setErpItems] = useState<ErpItem[]>([]);

  // Add-new machine map form
  const [newMachineIotName, setNewMachineIotName] = useState("");
  const [newMachineErpId, setNewMachineErpId] = useState<number | null>(null);
  const [addingMachine, setAddingMachine] = useState(false);

  // Add-new item map form
  const [newItemIotName, setNewItemIotName] = useState("");
  const [newItemErpId, setNewItemErpId] = useState<number | null>(null);
  const [addingItem, setAddingItem] = useState(false);

  // Add-new shift map form
  const [newShiftIotName, setNewShiftIotName] = useState("");
  const [newShiftNumber, setNewShiftNumber] = useState<number | null>(null);
  const [savingShift, setSavingShift] = useState(false);

  // Skip items form
  const [newSkipItemName, setNewSkipItemName] = useState("");
  const [savingSkip, setSavingSkip] = useState(false);

  useEffect(() => {
    loadSources();
    loadErpData();
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

  const loadErpData = async () => {
    const [machinesRes, itemsRes] = await Promise.all([
      fetch("/api/machines"),
      fetch("/api/items"),
    ]);
    if (machinesRes.ok) {
      const data = await machinesRes.json();
      setErpMachines(Array.isArray(data) ? data : []);
    }
    if (itemsRes.ok) {
      const data = await itemsRes.json();
      setErpItems(Array.isArray(data) ? data : []);
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
        setShiftMap((data.source?.shiftMap as Record<string, number>) || {});
        setSkipItems((data.source?.skipItems as string[]) || []);
      }
    } finally {
      setMappingLoading(false);
    }
  };

  // ──────────────────────────────────────────────
  // Source CRUD
  // ──────────────────────────────────────────────
  const handleOpenForm = (source?: IotSource) => {
    setEditingSource(source || null);
    form.setFieldsValue(
      source
        ? {
            name: source.name,
            description: source.description,
            fileFormat: source.fileFormat,
            isActive: source.isActive,
          }
        : { name: "", description: "", fileFormat: "STANDARD", isActive: true }
    );
    setFormDrawerOpen(true);
  };

  const handleSaveSource = async () => {
    try {
      const values = await form.validateFields();
      const url = editingSource ? `/api/iot/sources/${editingSource.id}` : "/api/iot/sources";
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

  // ──────────────────────────────────────────────
  // Open mapping drawer
  // ──────────────────────────────────────────────
  const handleOpenMapping = (source: IotSource) => {
    setSelectedSource(source);
    setNewMachineIotName("");
    setNewMachineErpId(null);
    setNewItemIotName("");
    setNewItemErpId(null);
    setNewShiftIotName("");
    setNewShiftNumber(null);
    setNewSkipItemName("");
    loadMapping(source.id);
    setMappingDrawerOpen(true);
  };

  // ──────────────────────────────────────────────
  // Delete single mapping
  // ──────────────────────────────────────────────
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
    if (selectedSource) {
      loadMapping(selectedSource.id);
      loadSources();
    }
  };

  // ──────────────────────────────────────────────
  // Add machine map
  // ──────────────────────────────────────────────
  const handleAddMachineMap = async () => {
    if (!newMachineIotName.trim()) {
      message.warning("Nhập tên máy từ IoT");
      return;
    }
    if (!newMachineErpId) {
      message.warning("Chọn máy ERP tương ứng");
      return;
    }
    if (!selectedSource) return;
    setAddingMachine(true);
    try {
      const res = await fetch("/api/iot/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: selectedSource.id,
          machineMaps: [{ iotName: newMachineIotName.trim(), machineId: newMachineErpId }],
          itemMaps: [],
          shiftMap,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || "Lỗi thêm mapping máy");
        return;
      }
      message.success("Đã thêm mapping máy");
      setNewMachineIotName("");
      setNewMachineErpId(null);
      loadMapping(selectedSource.id);
      loadSources();
    } finally {
      setAddingMachine(false);
    }
  };

  // ──────────────────────────────────────────────
  // Add item map
  // ──────────────────────────────────────────────
  const handleAddItemMap = async () => {
    if (!newItemIotName.trim()) {
      message.warning("Nhập tên mặt hàng từ IoT");
      return;
    }
    if (!newItemErpId) {
      message.warning("Chọn mặt hàng ERP tương ứng");
      return;
    }
    if (!selectedSource) return;
    setAddingItem(true);
    try {
      const res = await fetch("/api/iot/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: selectedSource.id,
          machineMaps: [],
          itemMaps: [{ iotName: newItemIotName.trim(), itemId: newItemErpId }],
          shiftMap,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || "Lỗi thêm mapping mặt hàng");
        return;
      }
      message.success("Đã thêm mapping mặt hàng");
      setNewItemIotName("");
      setNewItemErpId(null);
      loadMapping(selectedSource.id);
      loadSources();
    } finally {
      setAddingItem(false);
    }
  };

  // ──────────────────────────────────────────────
  // Shift map
  // ──────────────────────────────────────────────
  const handleAddShift = async () => {
    if (!newShiftIotName.trim()) {
      message.warning("Nhập tên ca từ IoT");
      return;
    }
    if (!newShiftNumber) {
      message.warning("Chọn ca ERP tương ứng");
      return;
    }
    if (!selectedSource) return;
    setSavingShift(true);
    const updatedShiftMap = { ...shiftMap, [newShiftIotName.trim()]: newShiftNumber };
    try {
      const res = await fetch("/api/iot/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: selectedSource.id,
          machineMaps: [],
          itemMaps: [],
          shiftMap: updatedShiftMap,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || "Lỗi lưu mapping ca");
        return;
      }
      message.success("Đã thêm mapping ca");
      setShiftMap(updatedShiftMap);
      setNewShiftIotName("");
      setNewShiftNumber(null);
    } finally {
      setSavingShift(false);
    }
  };

  const handleDeleteShift = async (iotName: string) => {
    if (!selectedSource) return;
    const updatedShiftMap = { ...shiftMap };
    delete updatedShiftMap[iotName];
    setSavingShift(true);
    try {
      const res = await fetch("/api/iot/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: selectedSource.id,
          machineMaps: [],
          itemMaps: [],
          shiftMap: updatedShiftMap,
        }),
      });
      if (!res.ok) {
        message.error("Lỗi xóa mapping ca");
        return;
      }
      message.success("Đã xóa mapping ca");
      setShiftMap(updatedShiftMap);
    } finally {
      setSavingShift(false);
    }
  };

  // ──────────────────────────────────────────────
  // Skip items
  // ──────────────────────────────────────────────
  const handleAddSkipItem = async () => {
    const name = newSkipItemName.trim();
    if (!name) { message.warning("Nhập tên mặt hàng cần bỏ qua"); return; }
    if (skipItems.includes(name)) { message.warning("Tên này đã có trong danh sách"); return; }
    if (!selectedSource) return;
    setSavingSkip(true);
    const updated = [...skipItems, name];
    try {
      const res = await fetch("/api/iot/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: selectedSource.id,
          machineMaps: [], itemMaps: [], shiftMap,
          skipItems: updated,
        }),
      });
      if (!res.ok) { message.error("Lỗi lưu danh sách bỏ qua"); return; }
      message.success(`Đã thêm "${name}" vào danh sách bỏ qua`);
      setSkipItems(updated);
      setNewSkipItemName("");
    } finally {
      setSavingSkip(false);
    }
  };

  const handleDeleteSkipItem = async (name: string) => {
    if (!selectedSource) return;
    setSavingSkip(true);
    const updated = skipItems.filter((s) => s !== name);
    try {
      const res = await fetch("/api/iot/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: selectedSource.id,
          machineMaps: [], itemMaps: [], shiftMap,
          skipItems: updated,
        }),
      });
      if (!res.ok) { message.error("Lỗi xóa"); return; }
      message.success("Đã xóa khỏi danh sách bỏ qua");
      setSkipItems(updated);
    } finally {
      setSavingSkip(false);
    }
  };

  // ──────────────────────────────────────────────
  // Source table columns
  // ──────────────────────────────────────────────
  const columns = [
    {
      title: "Tên nguồn",
      dataIndex: "name",
      key: "name",
      render: (v: string, r: IotSource) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v}</Text>
          {r.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {r.description}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "Định dạng file",
      dataIndex: "fileFormat",
      key: "fileFormat",
      width: 160,
      render: (v: IotFileFormat) => {
        const opt = FILE_FORMAT_OPTIONS.find((o) => o.value === v);
        return <Tag color={FILE_FORMAT_COLOR[v]}>{opt?.label ?? v}</Tag>;
      },
    },
    {
      title: "Mapping máy",
      key: "machineMaps",
      width: 120,
      render: (_: unknown, r: IotSource) => <Tag>{r._count.machineMaps} máy</Tag>,
    },
    {
      title: "Mapping mặt hàng",
      key: "itemMaps",
      width: 140,
      render: (_: unknown, r: IotSource) => <Tag>{r._count.itemMaps} mặt hàng</Tag>,
    },
    {
      title: "Lần import",
      key: "importLogs",
      width: 100,
      render: (_: unknown, r: IotSource) => <Text>{r._count.importLogs}</Text>,
    },
    {
      title: "Trạng thái",
      dataIndex: "isActive",
      key: "isActive",
      width: 100,
      render: (v: boolean) => (
        <Tag color={v ? "success" : "default"}>{v ? "Hoạt động" : "Tắt"}</Tag>
      ),
    },
    {
      title: "Hành động",
      key: "actions",
      width: 160,
      render: (_: unknown, r: IotSource) => (
        <Space>
          <Button
            type="text"
            icon={<SettingOutlined />}
            size="small"
            title="Thiết lập mapping"
            onClick={() => handleOpenMapping(r)}
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

  // ──────────────────────────────────────────────
  // Machine map table columns
  // ──────────────────────────────────────────────
  const machineMapColumns = [
    {
      title: "Tên máy trong IoT",
      dataIndex: "iotName",
      key: "iotName",
      render: (v: string) => <Text code>{v}</Text>,
    },
    {
      title: "Máy ERP tương ứng",
      key: "machine",
      render: (_: unknown, r: MachineMap) => r.machine.name,
    },
    {
      title: "",
      key: "del",
      width: 50,
      render: (_: unknown, r: MachineMap) => (
        <Popconfirm
          title="Xóa mapping này?"
          onConfirm={() => handleDeleteMap("machine", r.id)}
          okText="Xóa"
          cancelText="Hủy"
        >
          <Button type="text" icon={<DeleteOutlined />} size="small" danger />
        </Popconfirm>
      ),
    },
  ];

  // ──────────────────────────────────────────────
  // Item map table columns
  // ──────────────────────────────────────────────
  const itemMapColumns = [
    {
      title: "Tên mặt hàng trong IoT",
      dataIndex: "iotName",
      key: "iotName",
      render: (v: string) => <Text code>{v}</Text>,
    },
    {
      title: "Mặt hàng ERP tương ứng",
      key: "item",
      render: (_: unknown, r: ItemMap) => r.item.name,
    },
    {
      title: "",
      key: "del",
      width: 50,
      render: (_: unknown, r: ItemMap) => (
        <Popconfirm
          title="Xóa mapping này?"
          onConfirm={() => handleDeleteMap("item", r.id)}
          okText="Xóa"
          cancelText="Hủy"
        >
          <Button type="text" icon={<DeleteOutlined />} size="small" danger />
        </Popconfirm>
      ),
    },
  ];

  // Shift map as table rows
  const shiftRows = Object.entries(shiftMap).map(([iotName, shiftNum]) => ({
    key: iotName,
    iotName,
    shiftNum,
  }));

  const shiftColumns = [
    {
      title: "Tên ca trong IoT",
      dataIndex: "iotName",
      key: "iotName",
      render: (v: string) => <Text code>{v}</Text>,
    },
    {
      title: "Ca ERP",
      dataIndex: "shiftNum",
      key: "shiftNum",
      width: 100,
      render: (v: number) => <Tag color="blue">Ca {v}</Tag>,
    },
    {
      title: "",
      key: "del",
      width: 50,
      render: (_: unknown, r: { iotName: string }) => (
        <Popconfirm
          title="Xóa mapping ca này?"
          onConfirm={() => handleDeleteShift(r.iotName)}
          okText="Xóa"
          cancelText="Hủy"
        >
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
          <Title level={3} style={{ margin: 0 }}>
            Quản lý nguồn IoT
          </Title>
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

      {/* ── Source Form Drawer ── */}
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
          <Form.Item
            name="name"
            label="Tên nguồn"
            rules={[{ required: true, message: "Bắt buộc" }]}
          >
            <Input placeholder="VD: IoT Máy đánh ống NM1" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} placeholder="Mô tả về nguồn IoT này..." />
          </Form.Item>
          <Form.Item
            name="fileFormat"
            label="Định dạng file xuất"
            rules={[{ required: true, message: "Bắt buộc" }]}
            extra="Chọn đúng định dạng file mà phần mềm IoT của dòng máy này xuất ra"
          >
            <Select
              options={FILE_FORMAT_OPTIONS.map((o) => ({
                value: o.value,
                label: (
                  <Space direction="vertical" size={0}>
                    <Text strong style={{ fontSize: 13 }}>{o.label}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{o.desc}</Text>
                  </Space>
                ),
              }))}
            />
          </Form.Item>
          {editingSource && (
            <Form.Item name="isActive" label="Trạng thái" valuePropName="checked">
              <Switch checkedChildren="Hoạt động" unCheckedChildren="Tắt" />
            </Form.Item>
          )}
        </Form>
      </Drawer>

      {/* ── Mapping Drawer ── */}
      <Drawer
        title={
          <Space>
            <SettingOutlined />
            <span>Thiết lập mapping: {selectedSource?.name}</span>
          </Space>
        }
        open={mappingDrawerOpen}
        onClose={() => setMappingDrawerOpen(false)}
        width={680}
        styles={{ body: { paddingTop: 12 } }}
      >
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
          Mapping được thiết lập sẵn tại đây. Khi import file, hệ thống sẽ tự động khớp tên — bước
          kiểm tra mapping sẽ bị bỏ qua nếu toàn bộ tên đã được ánh xạ.
        </Text>

        <Tabs
          items={[
            // ── Tab 1: Machine Mapping ──
            {
              key: "machines",
              label: `Máy (${machineMaps.length})`,
              children: (
                <>
                  {/* Add row */}
                  <Row gutter={8} align="middle" style={{ marginBottom: 12 }}>
                    <Col flex="1">
                      <Input
                        placeholder="Tên máy trong file IoT (chính xác)"
                        value={newMachineIotName}
                        onChange={(e) => setNewMachineIotName(e.target.value)}
                        onPressEnter={handleAddMachineMap}
                      />
                    </Col>
                    <Col flex="1">
                      <Select
                        placeholder="Chọn máy ERP"
                        style={{ width: "100%" }}
                        value={newMachineErpId}
                        onChange={setNewMachineErpId}
                        showSearch
                        optionFilterProp="label"
                        options={erpMachines.map((m) => ({ value: m.id, label: m.name }))}
                      />
                    </Col>
                    <Col>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        loading={addingMachine}
                        onClick={handleAddMachineMap}
                      >
                        Thêm
                      </Button>
                    </Col>
                  </Row>

                  <Table
                    dataSource={machineMaps}
                    columns={machineMapColumns}
                    rowKey="id"
                    loading={mappingLoading}
                    pagination={false}
                    size="small"
                    locale={{ emptyText: "Chưa có mapping máy nào" }}
                  />
                </>
              ),
            },

            // ── Tab 2: Item Mapping ──
            {
              key: "items",
              label: `Mặt hàng (${itemMaps.length})`,
              children: (
                <>
                  {/* Add row */}
                  <Row gutter={8} align="middle" style={{ marginBottom: 12 }}>
                    <Col flex="1">
                      <Input
                        placeholder="Tên mặt hàng trong file IoT (chính xác)"
                        value={newItemIotName}
                        onChange={(e) => setNewItemIotName(e.target.value)}
                        onPressEnter={handleAddItemMap}
                      />
                    </Col>
                    <Col flex="1">
                      <Select
                        placeholder="Chọn mặt hàng ERP"
                        style={{ width: "100%" }}
                        value={newItemErpId}
                        onChange={setNewItemErpId}
                        showSearch
                        optionFilterProp="label"
                        options={erpItems.map((i) => ({ value: i.id, label: i.name }))}
                      />
                    </Col>
                    <Col>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        loading={addingItem}
                        onClick={handleAddItemMap}
                      >
                        Thêm
                      </Button>
                    </Col>
                  </Row>

                  <Table
                    dataSource={itemMaps}
                    columns={itemMapColumns}
                    rowKey="id"
                    loading={mappingLoading}
                    pagination={false}
                    size="small"
                    locale={{ emptyText: "Chưa có mapping mặt hàng nào" }}
                  />

                  {/* ── Phần bỏ qua ── */}
                  <Divider orientation="left" style={{ fontSize: 13, marginTop: 20 }}>
                    <Space>
                      <span>🚫</span>
                      <span>Mặt hàng bỏ qua ({skipItems.length})</span>
                    </Space>
                  </Divider>
                  <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                    Những mặt hàng dưới đây sẽ <b>không được import</b>, hiển thị màu xám trong bước Preview thay vì báo lỗi đỏ. Dùng cho các mặt hàng đặc thù như dao, phụ liệu không cần theo dõi sản lượng.
                  </Text>
                  <Row gutter={8} align="middle" style={{ marginBottom: 8 }}>
                    <Col flex="1">
                      <Input
                        placeholder='Tên mặt hàng trong file IoT cần bỏ qua (VD: Dao soi)'
                        value={newSkipItemName}
                        onChange={(e) => setNewSkipItemName(e.target.value)}
                        onPressEnter={handleAddSkipItem}
                      />
                    </Col>
                    <Col>
                      <Button
                        icon={<PlusOutlined />}
                        loading={savingSkip}
                        onClick={handleAddSkipItem}
                      >
                        Thêm
                      </Button>
                    </Col>
                  </Row>
                  <Space wrap size={[8, 8]}>
                    {skipItems.length === 0 && (
                      <Text type="secondary" style={{ fontSize: 12 }}>Chưa có mặt hàng nào trong danh sách bỏ qua</Text>
                    )}
                    {skipItems.map((name) => (
                      <Tag
                        key={name}
                        closable
                        color="default"
                        onClose={() => handleDeleteSkipItem(name)}
                        style={{ fontSize: 13, padding: "2px 8px" }}
                      >
                        {name}
                      </Tag>
                    ))}
                  </Space>
                </>
              ),
            },

            // ── Tab 3: Shift Mapping ──
            {
              key: "shifts",
              label: `Ca làm việc (${shiftRows.length})`,
              children: (
                <>
                  <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                    Ca 1 / Ca 2 / Ca 3 đã được nhận diện tự động. Chỉ cần thêm ở đây nếu file IoT
                    dùng tên ca khác (VD: &quot;Sáng&quot;, &quot;Chiều&quot;, &quot;Đêm&quot;).
                  </Text>

                  {/* Add row */}
                  <Row gutter={8} align="middle" style={{ marginBottom: 12 }}>
                    <Col flex="1">
                      <Input
                        placeholder="Tên ca trong file IoT (VD: Sáng)"
                        value={newShiftIotName}
                        onChange={(e) => setNewShiftIotName(e.target.value)}
                        onPressEnter={handleAddShift}
                      />
                    </Col>
                    <Col style={{ width: 140 }}>
                      <Select
                        placeholder="Ca ERP"
                        style={{ width: "100%" }}
                        value={newShiftNumber}
                        onChange={setNewShiftNumber}
                        options={[
                          { value: 1, label: "Ca 1" },
                          { value: 2, label: "Ca 2" },
                          { value: 3, label: "Ca 3" },
                        ]}
                      />
                    </Col>
                    <Col>
                      <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        loading={savingShift}
                        onClick={handleAddShift}
                      >
                        Thêm
                      </Button>
                    </Col>
                  </Row>

                  <Table
                    dataSource={shiftRows}
                    columns={shiftColumns}
                    rowKey="key"
                    loading={savingShift}
                    pagination={false}
                    size="small"
                    locale={{ emptyText: "Chưa có mapping ca tùy chỉnh" }}
                  />
                </>
              ),
            },
          ]}
        />

        <Divider />
        <Text type="secondary" style={{ fontSize: 12 }}>
          Lưu ý: Nếu tên máy / mặt hàng trong file IoT trùng khớp chính xác với tên trong ERP, hệ
          thống tự động nhận diện mà không cần khai báo mapping.
        </Text>
      </Drawer>
    </div>
  );
}
