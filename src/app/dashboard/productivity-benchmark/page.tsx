"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Tabs,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Space,
  Popconfirm,
  message,
  Tag,
  Badge,
  Drawer,
  Radio,
  Card,
  Divider,
  Tooltip,
  Row,
  Col,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { calcTheoreticalOutput } from "@/utils/benchmark";

const { Title, Text } = Typography;

interface Factory { id: number; name: string }
interface ItemOption { id: number; name: string }
interface ProcessOption { id: number; name: string; factoryId: number }
interface BenchmarkVersion {
  id: number;
  versionName: string;
  factoryId: number;
  factory: { id: number; name: string };
  effectiveFrom: string;
  effectiveTo: string | null;
  approvedBy: string | null;
  note: string | null;
  isActive: boolean;
  _count: { benchmarks: number };
}
interface Benchmark {
  id: number;
  versionId: number;
  itemId: number;
  processId: number;
  machineModel: string;
  speedUnit: string;
  nm: number;
  ne: number;
  twist: number | null;
  speedValue: number;
  spindleOrHeadCount: number | null;
  theoreticalOutput: number;
  efficiency: number;
  stdOutputPerShift: number;
  note: string | null;
  item: { id: number; name: string };
  process: { id: number; name: string };
  version: { id: number; versionName: string; isActive: boolean };
}

function getVersionBadge(v: BenchmarkVersion) {
  if (v.isActive) return <Badge status="success" text="Đang hiệu lực" />;
  if (v.effectiveTo) return <Badge status="default" text="Đã thay thế" />;
  return <Badge status="warning" text="Nháp" />;
}

export default function ProductivityBenchmarkPage() {
  const [activeTab, setActiveTab] = useState("versions");

  // --- Data ---
  const [factories, setFactories] = useState<Factory[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [versions, setVersions] = useState<BenchmarkVersion[]>([]);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);

  // --- Version tab ---
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<BenchmarkVersion | null>(null);
  const [versionForm] = Form.useForm();
  const [savingVersion, setSavingVersion] = useState(false);

  // Clone modal
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<number | null>(null);
  const [cloneForm] = Form.useForm();

  // --- Benchmark tab ---
  const [benchmarkDrawerOpen, setBenchmarkDrawerOpen] = useState(false);
  const [editingBenchmark, setEditingBenchmark] = useState<Benchmark | null>(null);
  const [benchmarkForm] = Form.useForm();
  const [savingBenchmark, setSavingBenchmark] = useState(false);

  // Filter
  const [filterVersionId, setFilterVersionId] = useState<number | null>(null);
  const [filterProcessId, setFilterProcessId] = useState<number | null>(null);

  // Preview
  const [preview, setPreview] = useState<{ theoretical: number; std: number } | null>(null);
  const [speedUnit, setSpeedUnit] = useState<"rpm" | "mpm">("rpm");

  const loadFactories = useCallback(async () => {
    const r = await fetch("/api/factories");
    if (r.ok) setFactories(await r.json());
  }, []);

  const loadItems = useCallback(async () => {
    const r = await fetch("/api/items");
    if (r.ok) setItems(await r.json());
  }, []);

  const loadProcesses = useCallback(async () => {
    const r = await fetch("/api/processes");
    if (r.ok) setProcesses(await r.json());
  }, []);

  const loadVersions = useCallback(async () => {
    const r = await fetch("/api/productivity-benchmark/versions");
    if (r.ok) setVersions(await r.json());
  }, []);

  const loadBenchmarks = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterVersionId) params.set("versionId", String(filterVersionId));
    if (filterProcessId) params.set("processId", String(filterProcessId));
    const r = await fetch(`/api/productivity-benchmark/benchmarks?${params}`);
    if (r.ok) setBenchmarks(await r.json());
  }, [filterVersionId, filterProcessId]);

  useEffect(() => {
    loadFactories();
    loadItems();
    loadProcesses();
    loadVersions();
  }, [loadFactories, loadItems, loadProcesses, loadVersions]);

  useEffect(() => {
    if (activeTab === "benchmarks") loadBenchmarks();
  }, [activeTab, loadBenchmarks]);

  // --- Preview tính realtime ---
  function updatePreview() {
    try {
      const vals = benchmarkForm.getFieldsValue();
      if (!vals.speedValue || !vals.nm || !vals.efficiency) { setPreview(null); return; }
      const unit = vals.speedUnit || speedUnit;
      const theoretical = calcTheoreticalOutput({
        speedValue: parseFloat(vals.speedValue),
        speedUnit: unit,
        nm: parseFloat(vals.nm),
        twist: vals.twist ? parseFloat(vals.twist) : undefined,
        spindleOrHeadCount: vals.spindleOrHeadCount ? parseInt(vals.spindleOrHeadCount) : undefined,
      });
      const eff = parseFloat(vals.efficiency);
      setPreview({ theoretical, std: theoretical * eff });
    } catch {
      setPreview(null);
    }
  }

  // --- Version CRUD ---
  function openCreateVersion() {
    setEditingVersion(null);
    versionForm.resetFields();
    setVersionModalOpen(true);
  }

  function openEditVersion(v: BenchmarkVersion) {
    setEditingVersion(v);
    versionForm.setFieldsValue({
      versionName: v.versionName,
      factoryId: v.factoryId,
      effectiveFrom: v.effectiveFrom ? v.effectiveFrom.split("T")[0] : "",
      approvedBy: v.approvedBy,
      note: v.note,
    });
    setVersionModalOpen(true);
  }

  async function handleSaveVersion() {
    try {
      const values = await versionForm.validateFields();
      setSavingVersion(true);
      const url = editingVersion
        ? `/api/productivity-benchmark/versions/${editingVersion.id}`
        : "/api/productivity-benchmark/versions";
      const method = editingVersion ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) { const e = await res.json(); message.error(e.error || "Lỗi"); return; }
      message.success(editingVersion ? "Đã cập nhật" : "Đã tạo phiên bản");
      setVersionModalOpen(false);
      loadVersions();
    } finally {
      setSavingVersion(false);
    }
  }

  async function handleActivate(id: number) {
    const res = await fetch(`/api/productivity-benchmark/versions/${id}/activate`, { method: "POST" });
    if (res.ok) { message.success("Đã kích hoạt phiên bản"); loadVersions(); }
    else { const e = await res.json(); message.error(e.error || "Lỗi"); }
  }

  async function handleDeleteVersion(id: number) {
    const res = await fetch(`/api/productivity-benchmark/versions/${id}`, { method: "DELETE" });
    if (res.ok) { message.success("Đã xóa"); loadVersions(); }
    else { const e = await res.json(); message.error(e.error || "Không thể xóa"); }
  }

  function openClone(id: number) {
    setCloneSourceId(id);
    cloneForm.resetFields();
    setCloneModalOpen(true);
  }

  async function handleClone() {
    if (!cloneSourceId) return;
    try {
      const values = await cloneForm.validateFields();
      const res = await fetch(`/api/productivity-benchmark/versions/${cloneSourceId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) { const e = await res.json(); message.error(e.error || "Lỗi nhân bản"); return; }
      message.success("Đã nhân bản phiên bản");
      setCloneModalOpen(false);
      loadVersions();
    } catch { /* validation error */ }
  }

  // Xem benchmark của version → chuyển tab + filter
  function viewBenchmarks(versionId: number) {
    setFilterVersionId(versionId);
    setActiveTab("benchmarks");
  }

  // --- Benchmark CRUD ---
  function openCreateBenchmark() {
    setEditingBenchmark(null);
    benchmarkForm.resetFields();
    benchmarkForm.setFieldsValue({ speedUnit: "rpm", efficiency: 0.95 });
    setSpeedUnit("rpm");
    setPreview(null);
    setBenchmarkDrawerOpen(true);
  }

  function openEditBenchmark(b: Benchmark) {
    if (b.version.isActive) { message.warning("Phiên bản đang active — không thể sửa. Hãy nhân bản trước."); return; }
    setEditingBenchmark(b);
    benchmarkForm.setFieldsValue({
      versionId: b.versionId,
      itemId: b.itemId,
      processId: b.processId,
      machineModel: b.machineModel,
      speedUnit: b.speedUnit,
      nm: b.nm,
      ne: b.ne,
      twist: b.twist,
      speedValue: b.speedValue,
      spindleOrHeadCount: b.spindleOrHeadCount,
      efficiency: b.efficiency,
      note: b.note,
    });
    setSpeedUnit(b.speedUnit as "rpm" | "mpm");
    setPreview({ theoretical: b.theoreticalOutput, std: b.stdOutputPerShift });
    setBenchmarkDrawerOpen(true);
  }

  async function handleSaveBenchmark() {
    try {
      const values = await benchmarkForm.validateFields();
      setSavingBenchmark(true);
      const url = editingBenchmark
        ? `/api/productivity-benchmark/benchmarks/${editingBenchmark.id}`
        : "/api/productivity-benchmark/benchmarks";
      const method = editingBenchmark ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) { const e = await res.json(); message.error(e.error || "Lỗi lưu"); return; }
      message.success(editingBenchmark ? "Đã cập nhật" : "Đã thêm định mức");
      setBenchmarkDrawerOpen(false);
      loadBenchmarks();
    } finally {
      setSavingBenchmark(false);
    }
  }

  async function handleDeleteBenchmark(id: number) {
    const res = await fetch(`/api/productivity-benchmark/benchmarks/${id}`, { method: "DELETE" });
    if (res.ok) { message.success("Đã xóa"); loadBenchmarks(); }
    else { const e = await res.json(); message.error(e.error || "Không thể xóa"); }
  }

  // --- Columns ---
  const versionColumns = [
    { title: "Tên phiên bản", dataIndex: "versionName", key: "versionName", width: 220 },
    {
      title: "Nhà máy",
      key: "factory",
      width: 100,
      render: (_: unknown, row: BenchmarkVersion) => row.factory.name,
    },
    {
      title: "Hiệu lực từ",
      dataIndex: "effectiveFrom",
      key: "effectiveFrom",
      width: 120,
      render: (v: string) => v ? v.split("T")[0] : "-",
    },
    {
      title: "Hiệu lực đến",
      dataIndex: "effectiveTo",
      key: "effectiveTo",
      width: 120,
      render: (v: string | null) => v ? v.split("T")[0] : <Text type="secondary">Còn hiệu lực</Text>,
    },
    {
      title: "Người duyệt",
      dataIndex: "approvedBy",
      key: "approvedBy",
      width: 130,
      render: (v: string | null) => v || "-",
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 140,
      render: (_: unknown, row: BenchmarkVersion) => getVersionBadge(row),
    },
    {
      title: "Số dòng ĐM",
      key: "count",
      width: 100,
      render: (_: unknown, row: BenchmarkVersion) => row._count.benchmarks,
    },
    {
      title: "Thao tác",
      key: "action",
      width: 220,
      render: (_: unknown, row: BenchmarkVersion) => (
        <Space size="small">
          <Tooltip title="Xem định mức">
            <Button size="small" icon={<EyeOutlined />} onClick={() => viewBenchmarks(row.id)}>Xem ĐM</Button>
          </Tooltip>
          {!row.isActive && (
            <Popconfirm title="Kích hoạt phiên bản này?" onConfirm={() => handleActivate(row.id)} okText="Kích hoạt" cancelText="Hủy">
              <Button size="small" type="primary" icon={<CheckCircleOutlined />}>Activate</Button>
            </Popconfirm>
          )}
          <Tooltip title="Nhân bản">
            <Button size="small" icon={<CopyOutlined />} onClick={() => openClone(row.id)} />
          </Tooltip>
          {!row.isActive && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditVersion(row)} />
          )}
          {!row.isActive && (
            <Popconfirm title="Xóa phiên bản?" onConfirm={() => handleDeleteVersion(row.id)} okText="Xóa" cancelText="Hủy">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const benchmarkColumns = [
    {
      title: "Mặt hàng",
      key: "item",
      width: 200,
      render: (_: unknown, row: Benchmark) => row.item.name,
    },
    {
      title: "Công đoạn",
      key: "process",
      width: 140,
      render: (_: unknown, row: Benchmark) => row.process.name,
    },
    {
      title: "Loại máy",
      dataIndex: "machineModel",
      key: "machineModel",
      width: 160,
    },
    { title: "Nm", dataIndex: "nm", key: "nm", width: 70, render: (v: number) => v.toFixed(2) },
    { title: "Ne", dataIndex: "ne", key: "ne", width: 70, render: (v: number) => v.toFixed(2) },
    {
      title: "Độ săn",
      dataIndex: "twist",
      key: "twist",
      width: 90,
      render: (v: number | null) => v ? v : "-",
    },
    {
      title: "Tốc độ",
      key: "speed",
      width: 110,
      render: (_: unknown, row: Benchmark) => `${row.speedValue} ${row.speedUnit === "rpm" ? "v/p" : "m/p"}`,
    },
    {
      title: "NS lý thuyết",
      dataIndex: "theoreticalOutput",
      key: "theoreticalOutput",
      width: 120,
      render: (v: number) => `${v.toFixed(2)} kg/ca`,
    },
    {
      title: "Hiệu suất",
      dataIndex: "efficiency",
      key: "efficiency",
      width: 90,
      render: (v: number) => `${(v * 100).toFixed(0)}%`,
    },
    {
      title: "Định mức (kg/ca)",
      dataIndex: "stdOutputPerShift",
      key: "stdOutputPerShift",
      width: 140,
      render: (v: number) => <Text strong style={{ color: "#1677ff" }}>{v.toFixed(2)}</Text>,
    },
    {
      title: "Ghi chú",
      dataIndex: "note",
      key: "note",
      width: 150,
      render: (v: string | null) => v || "-",
    },
    {
      title: "Phiên bản",
      key: "version",
      width: 120,
      render: (_: unknown, row: Benchmark) => (
        <Tag color={row.version.isActive ? "green" : "default"}>{row.version.versionName}</Tag>
      ),
    },
    {
      title: "Sửa",
      key: "action",
      width: 100,
      render: (_: unknown, row: Benchmark) => (
        <Space>
          {!row.version.isActive ? (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditBenchmark(row)} />
              <Popconfirm title="Xóa dòng định mức?" onConfirm={() => handleDeleteBenchmark(row.id)} okText="Xóa" cancelText="Hủy">
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          ) : (
            <Tooltip title="Phiên bản đang active — chỉ xem">
              <Button size="small" icon={<EyeOutlined />} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const filteredBenchmarks = benchmarks.filter((b) => {
    if (filterVersionId && b.versionId !== filterVersionId) return false;
    if (filterProcessId && b.processId !== filterProcessId) return false;
    return true;
  });

  const activeVersionId = versions.find((v) => v.isActive)?.id;

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Định mức Năng suất</Title>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "versions",
            label: "Quản lý phiên bản",
            children: (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreateVersion}>
                    Tạo phiên bản mới
                  </Button>
                </div>
                <Table
                  dataSource={versions}
                  columns={versionColumns}
                  rowKey="id"
                  bordered
                  size="middle"
                  scroll={{ x: 1100 }}
                />
              </div>
            ),
          },
          {
            key: "benchmarks",
            label: "Định mức chi tiết",
            children: (
              <div>
                {/* Filter bar */}
                <Row gutter={12} style={{ marginBottom: 16 }}>
                  <Col>
                    <Select
                      placeholder="Chọn phiên bản"
                      style={{ width: 280 }}
                      allowClear
                      value={filterVersionId}
                      onChange={(v) => setFilterVersionId(v ?? null)}
                      options={versions.map((v) => ({
                        value: v.id,
                        label: `${v.versionName} — ${v.factory.name} ${v.isActive ? "✓" : ""}`,
                      }))}
                    />
                  </Col>
                  <Col>
                    <Select
                      placeholder="Lọc theo công đoạn"
                      style={{ width: 220 }}
                      allowClear
                      value={filterProcessId}
                      onChange={(v) => setFilterProcessId(v ?? null)}
                      options={processes.map((p) => ({ value: p.id, label: p.name }))}
                    />
                  </Col>
                  <Col flex="auto" style={{ textAlign: "right" }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={openCreateBenchmark}
                      disabled={versions.length === 0}
                    >
                      Thêm dòng định mức
                    </Button>
                  </Col>
                </Row>

                <Table
                  dataSource={filteredBenchmarks}
                  columns={benchmarkColumns}
                  rowKey="id"
                  bordered
                  size="middle"
                  scroll={{ x: 1400 }}
                  pagination={{ pageSize: 20 }}
                />
              </div>
            ),
          },
        ]}
      />

      {/* Modal tạo/sửa phiên bản */}
      <Modal
        title={editingVersion ? "Sửa phiên bản" : "Tạo phiên bản định mức mới"}
        open={versionModalOpen}
        onOk={handleSaveVersion}
        onCancel={() => setVersionModalOpen(false)}
        confirmLoading={savingVersion}
        okText="Lưu"
        cancelText="Hủy"
        width={520}
      >
        <Form form={versionForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="versionName" label="Tên phiên bản" rules={[{ required: true }]}>
            <Input placeholder="v1.0 - 2026" />
          </Form.Item>
          {!editingVersion && (
            <Form.Item name="factoryId" label="Nhà máy" rules={[{ required: true }]}>
              <Select options={factories.map((f) => ({ value: f.id, label: f.name }))} />
            </Form.Item>
          )}
          <Form.Item name="effectiveFrom" label="Hiệu lực từ ngày" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="approvedBy" label="Người duyệt">
            <Input />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú / Lý do cập nhật">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal nhân bản */}
      <Modal
        title="Nhân bản phiên bản"
        open={cloneModalOpen}
        onOk={handleClone}
        onCancel={() => setCloneModalOpen(false)}
        okText="Nhân bản"
        cancelText="Hủy"
      >
        <Form form={cloneForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="versionName" label="Tên phiên bản mới" rules={[{ required: true }]}>
            <Input placeholder="v1.1 - Sau cải tiến tháng 4" />
          </Form.Item>
          <Form.Item name="effectiveFrom" label="Hiệu lực từ ngày" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Drawer thêm/sửa định mức */}
      <Drawer
        title={editingBenchmark ? "Sửa dòng định mức" : "Thêm dòng định mức"}
        open={benchmarkDrawerOpen}
        onClose={() => setBenchmarkDrawerOpen(false)}
        width={520}
        footer={
          <Space style={{ float: "right" }}>
            <Button onClick={() => setBenchmarkDrawerOpen(false)}>Hủy</Button>
            <Button type="primary" onClick={handleSaveBenchmark} loading={savingBenchmark}>
              Lưu
            </Button>
          </Space>
        }
      >
        <Form
          form={benchmarkForm}
          layout="vertical"
          onValuesChange={() => updatePreview()}
        >
          <Divider plain>Liên kết</Divider>

          <Form.Item name="versionId" label="Phiên bản" rules={[{ required: true }]}>
            <Select
              options={versions
                .filter((v) => !v.isActive)
                .map((v) => ({ value: v.id, label: v.versionName }))}
              placeholder="Chọn phiên bản (không chọn version đang active)"
            />
          </Form.Item>

          <Form.Item name="itemId" label="Mặt hàng" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={items.map((i) => ({ value: i.id, label: i.name }))}
              placeholder="Tìm mặt hàng..."
            />
          </Form.Item>

          <Form.Item name="processId" label="Công đoạn" rules={[{ required: true }]}>
            <Select
              options={processes.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Chọn công đoạn"
            />
          </Form.Item>

          <Form.Item name="machineModel" label="Loại máy" rules={[{ required: true }]}>
            <Input placeholder="G32, Murata Qpro-EX, Rieter RSB-D50..." />
          </Form.Item>

          <Form.Item name="speedUnit" label="Đơn vị tốc độ" rules={[{ required: true }]}>
            <Radio.Group
              onChange={(e) => {
                setSpeedUnit(e.target.value);
                if (e.target.value === "mpm") {
                  benchmarkForm.setFieldValue("twist", undefined);
                }
                setPreview(null);
              }}
            >
              <Radio value="rpm">Vòng/phút (rpm) — máy sợi con, máy thô</Radio>
              <Radio value="mpm">Mét/phút (mpm) — máy ghép, máy ống</Radio>
            </Radio.Group>
          </Form.Item>

          <Divider plain>Thông số kỹ thuật</Divider>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="nm" label="Chỉ số Nm" rules={[{ required: true }]}>
                <InputNumber
                  style={{ width: "100%" }}
                  step={0.01}
                  onChange={(v) => {
                    if (v != null) benchmarkForm.setFieldValue("ne", +((v as number) / 1.6934).toFixed(3));
                    updatePreview();
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ne" label="Chỉ số Ne" rules={[{ required: true }]}>
                <InputNumber
                  style={{ width: "100%" }}
                  step={0.01}
                  onChange={(v) => {
                    if (v != null) benchmarkForm.setFieldValue("nm", +((v as number) * 1.6934).toFixed(3));
                    updatePreview();
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          {speedUnit === "rpm" && (
            <Form.Item name="twist" label="Độ săn (x/m)" rules={[{ required: true, message: "Bắt buộc với máy rpm" }]}>
              <InputNumber style={{ width: "100%" }} step={1} />
            </Form.Item>
          )}

          <Form.Item
            name="speedValue"
            label={`Tốc độ (${speedUnit === "rpm" ? "vòng/phút" : "mét/phút"})`}
            rules={[{ required: true }]}
          >
            <InputNumber style={{ width: "100%" }} step={100} />
          </Form.Item>

          <Form.Item
            name="spindleOrHeadCount"
            label={speedUnit === "rpm" ? "Số cọc" : "Số đầu ra / trống"}
          >
            <InputNumber style={{ width: "100%" }} step={1} />
          </Form.Item>

          <Form.Item name="efficiency" label="Hiệu suất (0–1, ví dụ 0.95 = 95%)" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} step={0.01} min={0} max={1} />
          </Form.Item>

          {/* Preview */}
          {preview && (
            <Card
              size="small"
              style={{ background: "#f0f7ff", border: "1px solid #91caff", marginBottom: 16 }}
            >
              <div>NS lý thuyết: <Text strong>{preview.theoretical.toFixed(2)} kg/ca</Text></div>
              <div>Hiệu suất: × {(((benchmarkForm.getFieldValue("efficiency") as number) || 0) * 100).toFixed(0)}%</div>
              <Divider style={{ margin: "8px 0" }} />
              <div style={{ fontSize: 16 }}>
                ► Định mức: <Text strong style={{ color: "#1677ff", fontSize: 18 }}>{preview.std.toFixed(2)} kg/ca/máy</Text>
              </div>
            </Card>
          )}

          <Form.Item name="note" label="Ghi chú kỹ thuật">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
