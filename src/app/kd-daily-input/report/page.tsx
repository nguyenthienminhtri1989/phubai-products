"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Table, Button, Select, DatePicker, Space, Typography, Tag,
  Statistic, Spin, message, Popconfirm, Modal, Form,
  InputNumber, Input, Row, Col, Card, Divider, Empty, Breadcrumb,
} from "antd";
import {
  ReloadOutlined, DeleteOutlined, EditOutlined, BarChartOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import "dayjs/locale/vi";
import { getItemColor } from "@/utils/itemColors";
import { useRouter } from "next/navigation";

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

// ============================================================
// Types
// ============================================================
interface Factory { id: number; name: string; }
interface Process { id: number; name: string; factoryId: number; }
interface ItemOption { id: number; name: string; }

interface KdRecord {
  id: number;
  machineId: number;
  itemId: number;
  recordDate: string;
  outputKg: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  machine: {
    id: number; name: string;
    process: { id: number; name: string; factoryId: number; };
  };
  item: { id: number; name: string; };
  createdBy?: { id: number; name: string; } | null;
}

// ============================================================
// Helpers
// ============================================================
function fmtDate(dateStr: string) {
  return dayjs(dateStr).format("DD/MM/YYYY");
}
function fmtKg(kg: number) {
  return kg.toLocaleString("vi-VN") + " kg";
}

// ============================================================
// Main Page
// ============================================================
export default function KdDailyInputReportPage() {
  const router = useRouter();

  const [factories, setFactories] = useState<Factory[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);

  // Filters
  const [factoryId, setFactoryId] = useState<number | undefined>();
  const [processId, setProcessId] = useState<number | undefined>();
  const [itemId, setItemId] = useState<number | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs(),
  ]);

  // Data
  const [records, setRecords] = useState<KdRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Edit modal
  const [editRecord, setEditRecord] = useState<KdRecord | null>(null);
  const [editForm] = Form.useForm();
  const [editLoading, setEditLoading] = useState(false);

  // ============================================================
  // Load master data
  // ============================================================
  useEffect(() => {
    fetch("/api/factories")
      .then(r => r.json())
      .then(d => setFactories(Array.isArray(d) ? d : []))
      .catch(() => message.error("Không tải được danh sách nhà máy"));

    fetch("/api/items?all=true")
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (!factoryId) { setProcesses([]); setProcessId(undefined); return; }
    fetch("/api/processes")
      .then(r => r.json())
      .then((d: Process[]) => setProcesses(Array.isArray(d) ? d.filter(p => p.factoryId === factoryId) : []))
      .catch(() => { });
  }, [factoryId]);

  // ============================================================
  // Fetch records with range + filters
  // ============================================================
  const handleLoad = useCallback(async () => {
    if (!factoryId) { message.warning("Vui lòng chọn nhà máy"); return; }

    setLoading(true);
    setHasLoaded(false);
    try {
      const results: KdRecord[] = [];
      // Fetch all dates in range day by day — API currently supports single date
      // Use a date-range approach: loop each day from start to end
      const [start, end] = dateRange;
      const days = end.diff(start, "day") + 1;

      if (days > 62) {
        message.warning("Phạm vi tối đa 62 ngày để tránh quá tải");
        setLoading(false);
        return;
      }

      const fetches: Promise<KdRecord[]>[] = [];
      for (let i = 0; i < days; i++) {
        const dateStr = start.add(i, "day").format("YYYY-MM-DD");
        const url = `/api/kd-daily-input?factoryId=${factoryId}${processId ? `&processId=${processId}` : ""}${itemId ? `&itemId=${itemId}` : ""}&date=${dateStr}`;
        fetches.push(
          fetch(url).then(r => r.ok ? r.json() : []).catch(() => [])
        );
      }

      const allResults = await Promise.all(fetches);
      allResults.forEach(dayData => {
        if (Array.isArray(dayData)) results.push(...dayData);
      });

      // Sort by date desc, then machine asc
      results.sort((a, b) => {
        const dCmp = b.recordDate.localeCompare(a.recordDate);
        if (dCmp !== 0) return dCmp;
        return a.machine.name.localeCompare(b.machine.name);
      });

      setRecords(results);
      setHasLoaded(true);
      message.success(`Tìm thấy ${results.length} bản ghi`);
    } catch {
      message.error("Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [factoryId, processId, itemId, dateRange]);

  // ============================================================
  // Delete record
  // ============================================================
  const handleDelete = useCallback(async (id: number) => {
    const res = await fetch(`/api/kd-daily-input/${id}`, { method: "DELETE" });
    if (res.ok) {
      message.success("Đã xóa bản ghi");
      setRecords(prev => prev.filter(r => r.id !== id));
    } else {
      const data = await res.json();
      message.error(data.error ?? "Lỗi xóa");
    }
  }, []);

  // ============================================================
  // Edit record
  // ============================================================
  const openEdit = useCallback((record: KdRecord) => {
    setEditRecord(record);
    editForm.setFieldsValue({
      outputKg: record.outputKg,
      note: record.note ?? "",
    });
  }, [editForm]);

  const handleEditSave = useCallback(async () => {
    if (!editRecord) return;
    const values = await editForm.validateFields();
    setEditLoading(true);
    try {
      const res = await fetch(`/api/kd-daily-input/${editRecord.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputKg: values.outputKg, note: values.note }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Lỗi cập nhật");
      }
      const updated = await res.json();
      setRecords(prev => prev.map(r => r.id === updated.id ? { ...r, outputKg: updated.outputKg, note: updated.note, updatedAt: updated.updatedAt } : r));
      message.success("Đã cập nhật bản ghi");
      setEditRecord(null);
    } catch (err: any) {
      message.error(err.message ?? "Lỗi cập nhật");
    } finally {
      setEditLoading(false);
    }
  }, [editRecord, editForm]);

  // ============================================================
  // Summary stats
  // ============================================================
  const totalKg = records.reduce((s, r) => s + r.outputKg, 0);

  // Group by item
  const byItem = new Map<number, { name: string; kg: number; count: number }>();
  for (const r of records) {
    const prev = byItem.get(r.itemId) ?? { name: r.item.name, kg: 0, count: 0 };
    byItem.set(r.itemId, { name: prev.name, kg: prev.kg + r.outputKg, count: prev.count + 1 });
  }

  // Group by date
  const byDate = new Map<string, number>();
  for (const r of records) {
    const d = r.recordDate.slice(0, 10);
    byDate.set(d, (byDate.get(d) ?? 0) + r.outputKg);
  }
  const dateEntries = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // ============================================================
  // Table columns
  // ============================================================
  const columns = [
    {
      title: "Ngày",
      dataIndex: "recordDate",
      width: 110,
      render: (v: string) => (
        <Text strong style={{ fontSize: 13 }}>{fmtDate(v)}</Text>
      ),
      sorter: (a: KdRecord, b: KdRecord) => a.recordDate.localeCompare(b.recordDate),
    },
    {
      title: "Nhà máy / Công đoạn",
      width: 160,
      render: (_: any, r: KdRecord) => (
        <div>
          <Text style={{ fontSize: 12 }} type="secondary">{r.machine.process?.name ?? "—"}</Text>
        </div>
      ),
    },
    {
      title: "Máy",
      dataIndex: ["machine", "name"],
      width: 110,
      render: (v: string) => <Text strong>{v}</Text>,
      sorter: (a: KdRecord, b: KdRecord) => a.machine.name.localeCompare(b.machine.name),
    },
    {
      title: "Mặt hàng",
      dataIndex: ["item", "name"],
      width: 160,
      render: (v: string) => (
        <Tag color={getItemColor(v)} style={{ fontWeight: 600, fontSize: 12 }}>{v}</Tag>
      ),
    },
    {
      title: "Sản lượng",
      dataIndex: "outputKg",
      width: 130,
      align: "right" as const,
      render: (v: number) => (
        <Text strong style={{ color: v === 0 ? "#bfbfbf" : "#1677ff", fontSize: 14 }}>
          {fmtKg(v)}
        </Text>
      ),
      sorter: (a: KdRecord, b: KdRecord) => a.outputKg - b.outputKg,
    },
    {
      title: "Ghi chú",
      dataIndex: "note",
      render: (v: string | null) => v ? <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: "Cập nhật lúc",
      dataIndex: "updatedAt",
      width: 140,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {dayjs(v).format("DD/MM HH:mm")}
        </Text>
      ),
    },
    {
      title: "Thao tác",
      width: 100,
      fixed: "right" as const,
      render: (_: any, r: KdRecord) => (
        <Space size={4}>
          <Button
            type="text" size="small" icon={<EditOutlined />}
            style={{ color: "#1677ff" }}
            onClick={() => openEdit(r)}
            title="Sửa bản ghi"
          />
          <Popconfirm
            title="Xóa bản ghi này?"
            description={`Máy ${r.machine.name} — ${r.item.name} — ${fmtDate(r.recordDate)}`}
            okText="Xóa" cancelText="Hủy" okType="danger"
            onConfirm={() => handleDelete(r.id)}
          >
            <Button
              type="text" size="small" icon={<DeleteOutlined />}
              style={{ color: "#ff4d4f" }}
              title="Xóa bản ghi"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ============================================================
  // Render
  // ============================================================
  return (
    <div style={{ padding: "0 8px" }}>
      {/* Breadcrumb */}
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <a onClick={() => router.push("/kd-daily-input")}>Nhập sản lượng KD</a> },
          { title: "📊 Báo cáo sản lượng nhập" },
        ]}
      />

      <Title level={4} style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <BarChartOutlined /> Báo cáo Sản lượng nhập hàng ngày (Phòng KD)
      </Title>

      {/* ---- Filter bar ---- */}
      <Card
        size="small"
        style={{ marginBottom: 16, background: "#fafafa", border: "1px solid #e8e8e8" }}
        bodyStyle={{ padding: "12px 16px" }}
      >
        <Space wrap size={10}>
          <Select
            placeholder="Chọn nhà máy"
            style={{ width: 160 }}
            value={factoryId}
            allowClear
            onChange={v => { setFactoryId(v); setProcessId(undefined); setRecords([]); setHasLoaded(false); }}
            options={factories.map(f => ({ label: f.name, value: f.id }))}
          />
          <Select
            placeholder="Công đoạn (tùy chọn)"
            style={{ width: 200 }}
            value={processId}
            allowClear
            disabled={!factoryId}
            onChange={v => { setProcessId(v); setRecords([]); setHasLoaded(false); }}
            options={processes.map(p => ({ label: p.name, value: p.id }))}
          />
          <Select
            placeholder="Mặt hàng (tùy chọn)"
            style={{ width: 200 }}
            value={itemId}
            allowClear
            showSearch
            filterOption={(input, opt) =>
              (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
            onChange={v => { setItemId(v); setRecords([]); setHasLoaded(false); }}
            options={items.map(i => ({ label: i.name, value: i.id }))}
          />
          <RangePicker
            value={dateRange}
            onChange={vals => {
              if (vals?.[0] && vals?.[1]) {
                setDateRange([vals[0], vals[1]]);
                setRecords([]);
                setHasLoaded(false);
              }
            }}
            format="DD/MM/YYYY"
            allowClear={false}
            style={{ width: 240 }}
            presets={[
              { label: "Hôm nay", value: [dayjs(), dayjs()] },
              { label: "Tuần này", value: [dayjs().startOf("week"), dayjs()] },
              { label: "Tháng này", value: [dayjs().startOf("month"), dayjs()] },
              { label: "Tháng trước", value: [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")] },
            ]}
          />
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={loading}
            disabled={!factoryId}
            onClick={handleLoad}
          >
            Tải báo cáo
          </Button>
        </Space>
      </Card>

      {/* ---- Summary Stats ---- */}
      {hasLoaded && records.length > 0 && (
        <>
          <Row gutter={12} style={{ marginBottom: 12 }}>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ textAlign: "center", background: "#e6f7ff", border: "1px solid #91d5ff" }}>
                <Statistic
                  title="Tổng sản lượng"
                  value={totalKg.toLocaleString("vi-VN")}
                  suffix="kg"
                  valueStyle={{ fontSize: 20, color: "#1677ff" }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ textAlign: "center", background: "#f6ffed", border: "1px solid #b7eb8f" }}>
                <Statistic
                  title="Số bản ghi"
                  value={records.length}
                  suffix="dòng"
                  valueStyle={{ fontSize: 20, color: "#52c41a" }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ textAlign: "center", background: "#fff7e6", border: "1px solid #ffd591" }}>
                <Statistic
                  title="Số ngày có dữ liệu"
                  value={byDate.size}
                  suffix="ngày"
                  valueStyle={{ fontSize: 20, color: "#fa8c16" }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ textAlign: "center", background: "#fff1f0", border: "1px solid #ffa39e" }}>
                <Statistic
                  title="TB / ngày"
                  value={byDate.size > 0 ? Math.round(totalKg / byDate.size).toLocaleString("vi-VN") : 0}
                  suffix="kg"
                  valueStyle={{ fontSize: 20, color: "#cf1322" }}
                />
              </Card>
            </Col>
          </Row>

          {/* Summary by item */}
          <Card
            size="small"
            title={<span><FileTextOutlined style={{ marginRight: 6 }} />Tổng hợp theo mặt hàng</span>}
            style={{ marginBottom: 12 }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {Array.from(byItem.entries())
                .sort((a, b) => b[1].kg - a[1].kg)
                .map(([iId, info]) => (
                  <Card
                    key={iId} size="small"
                    style={{ minWidth: 150, border: `1.5px solid ${getItemColor(info.name)}44`, background: getItemColor(info.name) + "15" }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: getItemColor(info.name) }}>{info.name}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#1677ff" }}>{(info.kg / 1000).toFixed(2)} tấn</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{info.count} bản ghi</div>
                  </Card>
                ))
              }
            </div>
          </Card>

          {/* Summary by date (mini chart using bars) */}
          {dateEntries.length > 1 && (
            <Card
              size="small"
              title="📅 Sản lượng theo ngày"
              style={{ marginBottom: 12 }}
              bodyStyle={{ overflowX: "auto" }}
            >
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, minWidth: dateEntries.length * 44, height: 80, padding: "4px 0" }}>
                {(() => {
                  const maxKg = Math.max(...dateEntries.map(([, kg]) => kg));
                  return dateEntries.map(([date, kg]) => {
                    const pct = maxKg > 0 ? (kg / maxKg) * 100 : 0;
                    return (
                      <div key={date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: "0 0 40px" }}>
                        <div style={{ fontSize: 9, color: "#555", fontWeight: 600 }}>{(kg / 1000).toFixed(1)}T</div>
                        <div style={{
                          width: 28, height: `${Math.max(pct * 0.6, 4)}px`,
                          background: pct >= 90 ? "#52c41a" : pct >= 60 ? "#1677ff" : "#fa8c16",
                          borderRadius: "3px 3px 0 0",
                          transition: "height 0.3s",
                        }} />
                        <div style={{ fontSize: 9, color: "#888", textAlign: "center", lineHeight: 1.2 }}>
                          {dayjs(date).format("DD/MM")}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </Card>
          )}
        </>
      )}

      {/* ---- Data Table ---- */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div>
      ) : hasLoaded && records.length === 0 ? (
        <Empty description="Không có dữ liệu trong khoảng thời gian này" />
      ) : hasLoaded ? (
        <Table
          dataSource={records}
          rowKey="id"
          columns={columns}
          size="small"
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `${total} bản ghi` }}
          scroll={{ x: 900 }}
          style={{ border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden" }}
          rowClassName={(_, idx) => idx % 2 === 1 ? "ant-table-row-alt" : ""}
          summary={() => records.length > 0 ? (
            <Table.Summary.Row style={{ background: "#001529" }}>
              <Table.Summary.Cell index={0} colSpan={4}>
                <Text strong style={{ color: "#fff" }}>TỔNG CỘNG</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <Text strong style={{ color: "#52c41a", fontSize: 14 }}>
                  {fmtKg(totalKg)}
                </Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} colSpan={3} />
            </Table.Summary.Row>
          ) : null}
        />
      ) : (
        !factoryId ? (
          <Card style={{ textAlign: "center", color: "#aaa", padding: 32 }}>
            Chọn nhà máy và khoảng thời gian, sau đó bấm <strong>"Tải báo cáo"</strong>
          </Card>
        ) : null
      )}

      {/* ---- Edit Modal ---- */}
      <Modal
        open={!!editRecord}
        title={editRecord ? `Sửa bản ghi — ${editRecord.machine.name} / ${editRecord.item.name} / ${fmtDate(editRecord.recordDate)}` : ""}
        onCancel={() => { setEditRecord(null); editForm.resetFields(); }}
        onOk={handleEditSave}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        confirmLoading={editLoading}
        width={440}
      >
        {editRecord && (
          <Form form={editForm} layout="vertical" style={{ marginTop: 12 }}>
            <Form.Item label="Ngày">
              <Text strong>{fmtDate(editRecord.recordDate)}</Text>
            </Form.Item>
            <Form.Item label="Máy">
              <Text>{editRecord.machine.name} — {editRecord.machine.process?.name}</Text>
            </Form.Item>
            <Form.Item label="Mặt hàng">
              <Tag color={getItemColor(editRecord.item.name)} style={{ fontWeight: 600 }}>
                {editRecord.item.name}
              </Tag>
            </Form.Item>
            <Divider style={{ margin: "8px 0" }} />
            <Form.Item
              name="outputKg"
              label="Sản lượng (kg)"
              rules={[
                { required: true, message: "Vui lòng nhập sản lượng" },
                { type: "number", min: 0, message: "Sản lượng phải >= 0" },
              ]}
            >
              <InputNumber
                min={0} step={10} style={{ width: "100%" }}
                addonAfter="kg"
                placeholder="Nhập sản lượng..."
              />
            </Form.Item>
            <Form.Item name="note" label="Ghi chú">
              <Input.TextArea rows={2} placeholder="Máy dừng, lý do..." />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
}
