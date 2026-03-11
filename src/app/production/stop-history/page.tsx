"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Card, Row, Col, Select, DatePicker, Button, Table, Tag, Space, message,
  Statistic, Popconfirm, Modal, Form, Radio, Input, Tooltip,
} from "antd";
import {
  SearchOutlined, FileExcelOutlined, EditOutlined, DeleteOutlined,
  ClockCircleOutlined, ReloadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { useSession } from "next-auth/react";

const { RangePicker } = DatePicker;
const { TextArea } = Input;

interface StopLog {
  id: number;
  machineId: number;
  machine: { id: number; name: string; process: { id: number; name: string; factory: { name: string } } };
  category: { id: number; name: string; color: string };
  severity: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  description: string | null;
  shift: number | null;
  reportedBy: { id: number; fullName: string };
}

interface StopCategory { id: number; name: string; color: string; }
interface Factory { id: number; name: string; }
interface Process { id: number; name: string; factoryId: number; }

const SEVERITY_LABELS: Record<string, { label: string; color: string }> = {
  low:      { label: "Nhẹ",         color: "green" },
  medium:   { label: "Trung bình",  color: "orange" },
  high:     { label: "Nặng",        color: "red" },
  critical: { label: "Nghiêm trọng", color: "#820014" },
};

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "Đang dừng...";
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function StopHistoryPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const userId = parseInt((session?.user as any)?.id || "0");
  const userProcessIds: number[] = (session?.user as any)?.processIds || [];

  const [logs, setLogs] = useState<StopLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [totalDowntime, setTotalDowntime] = useState(0);
  const [activelyStopped, setActivelyStopped] = useState(0);

  const [factories, setFactories] = useState<Factory[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [categories, setCategories] = useState<StopCategory[]>([]);

  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(7, "day"), dayjs(),
  ]);
  const [selectedFactoryId, setSelectedFactoryId] = useState<number | null>(null);
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Edit modal
  const [editModal, setEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<StopLog | null>(null);
  const [editForm] = Form.useForm();
  const [editSaving, setEditSaving] = useState(false);
  const [allCats, setAllCats] = useState<StopCategory[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/factories").then(r => r.json()),
      fetch("/api/processes").then(r => r.json()),
      fetch("/api/production/stop-categories").then(r => r.json()),
    ]).then(([f, p, c]) => {
      setFactories(f);
      setProcesses(p);
      setCategories(c.filter((cat: StopCategory & { isActive: boolean }) => cat.isActive));
      setAllCats(c);
    });
  }, []);

  // Auto-set from session for non-admin
  useEffect(() => {
    if (!session || processes.length === 0) return;
    if (userRole !== "ADMIN" && userProcessIds.length > 0) {
      const proc = processes.find(p => p.id === userProcessIds[0]);
      if (proc) {
        setSelectedFactoryId(proc.factoryId);
        setSelectedProcessId(proc.id);
      }
    }
  }, [session, processes]);

  const handleSearch = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pagination.pageSize),
        dateFrom: dateRange[0].format("YYYY-MM-DD"),
        dateTo: dateRange[1].format("YYYY-MM-DD"),
      });
      if (selectedFactoryId) params.set("factoryId", String(selectedFactoryId));
      if (selectedProcessId) params.set("processId", String(selectedProcessId));
      if (selectedCategories.length === 1) params.set("categoryId", String(selectedCategories[0]));
      if (statusFilter === "active") params.set("activeOnly", "true");

      const res = await fetch(`/api/production/machine-stops?${params}`);
      const data = await res.json();

      let filteredLogs = data.logs || [];
      if (selectedCategories.length > 1) {
        filteredLogs = filteredLogs.filter((l: StopLog) => selectedCategories.includes(l.category.id));
      }
      if (statusFilter === "resolved") {
        filteredLogs = filteredLogs.filter((l: StopLog) => l.endTime !== null);
      }

      setLogs(filteredLogs);
      setPagination(prev => ({ ...prev, current: page, total: data.total }));
      setTotalDowntime(filteredLogs.reduce((s: number, l: StopLog) => s + (l.durationMinutes ?? 0), 0));
      setActivelyStopped(filteredLogs.filter((l: StopLog) => !l.endTime).length);
    } catch {
      message.error("Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedFactoryId, selectedProcessId, selectedCategories, statusFilter, pagination.pageSize]);

  useEffect(() => {
    handleSearch(1);
  }, []);

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/production/machine-stops/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      message.success("Đã xóa bản ghi");
      handleSearch(pagination.current);
    } catch (e: any) {
      message.error(e.message || "Lỗi xóa");
    }
  };

  const openEdit = (log: StopLog) => {
    setEditTarget(log);
    editForm.setFieldsValue({
      categoryId: log.category.id,
      severity: log.severity,
      startTime: dayjs(log.startTime),
      endTime: log.endTime ? dayjs(log.endTime) : null,
      description: log.description,
    });
    setEditModal(true);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    const values = await editForm.validateFields();
    setEditSaving(true);
    try {
      const body: any = {
        categoryId: values.categoryId,
        severity: values.severity,
        description: values.description,
        startTime: values.startTime?.toISOString(),
        endTime: values.endTime ? values.endTime.toISOString() : null,
      };
      const res = await fetch(`/api/production/machine-stops/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      message.success("Đã cập nhật bản ghi");
      setEditModal(false);
      handleSearch(pagination.current);
    } catch (e: any) {
      message.error(e.message || "Lỗi lưu");
    } finally {
      setEditSaving(false);
    }
  };

  const handleExport = () => {
    const rows = logs.map(l => ({
      "Máy": l.machine.name,
      "Công đoạn": l.machine.process.name,
      "Nhà máy": l.machine.process.factory.name,
      "Nguyên nhân": l.category.name,
      "Mức độ": SEVERITY_LABELS[l.severity]?.label || l.severity,
      "Thời gian dừng": dayjs(l.startTime).format("HH:mm DD/MM/YYYY"),
      "Thời gian chạy lại": l.endTime ? dayjs(l.endTime).format("HH:mm DD/MM/YYYY") : "Đang dừng",
      "Thời lượng": formatDuration(l.durationMinutes),
      "Người báo": l.reportedBy.fullName,
      "Mô tả": l.description || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lịch sử dừng máy");
    XLSX.writeFile(wb, `lich-su-dung-may-${dayjs().format("YYYY-MM-DD")}.xlsx`);
  };

  const filteredProcesses = processes.filter(p => !selectedFactoryId || p.factoryId === selectedFactoryId);

  const columns = [
    {
      title: "Máy",
      render: (_: any, r: StopLog) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.machine.name}</div>
          <div style={{ fontSize: 12, color: "#888" }}>{r.machine.process.name}</div>
        </div>
      ),
    },
    {
      title: "Nguyên nhân",
      render: (_: any, r: StopLog) => <Tag color={r.category.color}>{r.category.name}</Tag>,
    },
    {
      title: "Mức độ",
      render: (_: any, r: StopLog) => (
        <Tag color={SEVERITY_LABELS[r.severity]?.color}>{SEVERITY_LABELS[r.severity]?.label}</Tag>
      ),
    },
    {
      title: "Thời gian dừng",
      render: (_: any, r: StopLog) => dayjs(r.startTime).format("HH:mm DD/MM"),
    },
    {
      title: "Chạy lại",
      render: (_: any, r: StopLog) =>
        r.endTime ? dayjs(r.endTime).format("HH:mm DD/MM") : <Tag color="red">Đang dừng</Tag>,
    },
    {
      title: "Thời lượng",
      render: (_: any, r: StopLog) => (
        <span style={{ color: r.endTime ? undefined : "#ff4d4f" }}>
          {formatDuration(r.durationMinutes)}
        </span>
      ),
    },
    {
      title: "Người báo",
      render: (_: any, r: StopLog) => r.reportedBy.fullName,
    },
    {
      title: "Mô tả",
      render: (_: any, r: StopLog) =>
        r.description ? (
          <Tooltip title={r.description}>
            <span style={{ color: "#888", cursor: "help" }}>
              {r.description.length > 30 ? r.description.slice(0, 30) + "..." : r.description}
            </span>
          </Tooltip>
        ) : null,
    },
    {
      title: "Thao tác",
      width: 100,
      render: (_: any, r: StopLog) => {
        const canDelete = userRole === "ADMIN" || r.reportedBy.id === userId;
        return (
          <Space size="small">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
            {canDelete && (
              <Popconfirm title="Xóa bản ghi này?" onConfirm={() => handleDelete(r.id)} okText="Xóa" cancelText="Hủy">
                <Button size="small" icon={<DeleteOutlined />} danger />
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Lịch sử dừng máy</h2>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={handleExport} disabled={logs.length === 0}>Xuất Excel</Button>
          <Button icon={<ReloadOutlined />} onClick={() => handleSearch(1)}>Làm mới</Button>
        </Space>
      </div>

      {/* Summary */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="Tổng số lần dừng" value={pagination.total} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic
              title="Tổng thời gian dừng"
              value={`${Math.floor(totalDowntime / 60)}h ${totalDowntime % 60}m`}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="Đang dừng" value={activelyStopped} valueStyle={{ color: "#ff4d4f" }} />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <RangePicker
              value={dateRange}
              onChange={v => v && setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs])}
              format="DD/MM/YYYY"
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="Nhà máy"
              value={selectedFactoryId}
              onChange={v => { setSelectedFactoryId(v); setSelectedProcessId(null); }}
              options={factories.map(f => ({ value: f.id, label: f.name }))}
              allowClear
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="Công đoạn"
              value={selectedProcessId}
              onChange={setSelectedProcessId}
              options={filteredProcesses.map(p => ({ value: p.id, label: p.name }))}
              allowClear
              disabled={userRole !== "ADMIN"}
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              mode="multiple"
              placeholder="Nguyên nhân"
              value={selectedCategories}
              onChange={setSelectedCategories}
              options={categories.map(c => ({ value: c.id, label: c.name }))}
              allowClear
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} sm={12} md={3}>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: "100%" }}
              options={[
                { value: "all", label: "Tất cả" },
                { value: "active", label: "Đang dừng" },
                { value: "resolved", label: "Đã khắc phục" },
              ]}
            />
          </Col>
          <Col xs={24} sm={12} md={3}>
            <Button type="primary" icon={<SearchOutlined />} onClick={() => handleSearch(1)} block>
              Tìm kiếm
            </Button>
          </Col>
        </Row>
      </Card>

      <Table
        columns={columns}
        dataSource={logs}
        rowKey="id"
        loading={loading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          onChange: page => handleSearch(page),
          showSizeChanger: false,
          showTotal: t => `Tổng ${t} bản ghi`,
        }}
        scroll={{ x: 900 }}
        size="small"
      />

      {/* Edit Modal */}
      <Modal
        title="Chỉnh sửa bản ghi dừng máy"
        open={editModal}
        onOk={handleEditSave}
        onCancel={() => setEditModal(false)}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={editSaving}
        width={480}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="categoryId" label="Nguyên nhân" rules={[{ required: true }]}>
            <Select options={allCats.map(c => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="severity" label="Mức độ" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="low">Nhẹ</Radio.Button>
              <Radio.Button value="medium">Trung bình</Radio.Button>
              <Radio.Button value="high">Nặng</Radio.Button>
              <Radio.Button value="critical">Nghiêm trọng</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="startTime" label="Thời gian dừng" rules={[{ required: true }]}>
            <DatePicker showTime format="HH:mm DD/MM/YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="endTime" label="Thời gian chạy lại (để trống nếu vẫn đang dừng)">
            <DatePicker showTime format="HH:mm DD/MM/YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <TextArea rows={3} placeholder="Mô tả chi tiết..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
