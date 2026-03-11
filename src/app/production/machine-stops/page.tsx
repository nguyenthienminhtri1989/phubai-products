"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Row, Col, Card, Select, Button, Tag, Modal, Radio, Input,
  DatePicker, message, Badge, Spin, Space, Tooltip,
} from "antd";
import {
  ReloadOutlined, ExclamationCircleOutlined, CheckCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { useSession } from "next-auth/react";
import dayjs from "dayjs";

const { TextArea } = Input;

interface Factory { id: number; name: string; }
interface Process { id: number; name: string; factoryId: number; }
interface Machine { id: number; name: string; processId: number; isActive: boolean; }
interface StopCategory { id: number; name: string; color: string; }
interface ActiveStop {
  id: number;
  machineId: number;
  startTime: string;
  category: StopCategory;
  severity: string;
  description?: string;
}

const SEVERITY_LABELS: Record<string, { label: string; color: string }> = {
  low:      { label: "Nhẹ",         color: "green" },
  medium:   { label: "Trung bình",  color: "orange" },
  high:     { label: "Nặng",        color: "red" },
  critical: { label: "Nghiêm trọng", color: "#820014" },
};

function formatDuration(startTime: string): string {
  const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 60000);
  if (diff < 60) return `${diff} phút`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${m}m`;
}

export default function MachineStopsPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const userProcessIds: number[] = (session?.user as any)?.processIds || [];

  const [factories, setFactories] = useState<Factory[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [categories, setCategories] = useState<StopCategory[]>([]);
  const [activeStops, setActiveStops] = useState<ActiveStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const [selectedFactoryId, setSelectedFactoryId] = useState<number | null>(null);
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);

  // Report stop modal
  const [stopModal, setStopModal] = useState(false);
  const [targetMachine, setTargetMachine] = useState<Machine | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedSeverity, setSelectedSeverity] = useState("medium");
  const [stopDescription, setStopDescription] = useState("");
  const [useManualStopTime, setUseManualStopTime] = useState(false);
  const [manualStopTime, setManualStopTime] = useState<dayjs.Dayjs>(dayjs());
  const [submitting, setSubmitting] = useState(false);

  // Restart modal
  const [restartModal, setRestartModal] = useState(false);
  const [targetStop, setTargetStop] = useState<ActiveStop | null>(null);
  const [useManualRestartTime, setUseManualRestartTime] = useState(false);
  const [manualRestartTime, setManualRestartTime] = useState<dayjs.Dayjs>(dayjs());
  const [restarting, setRestarting] = useState(false);

  // Load factories + processes + categories
  useEffect(() => {
    Promise.all([
      fetch("/api/factories").then(r => r.json()),
      fetch("/api/processes").then(r => r.json()),
      fetch("/api/production/stop-categories?activeOnly=true").then(r => r.json()),
    ]).then(([f, p, c]) => {
      // Dedup theo tên phòng trường hợp seed chạy nhiều lần tạo duplicate trong DB
      const seen = new Set<string>();
      setFactories((f as Factory[]).filter(x => {
        if (seen.has(x.name)) return false;
        seen.add(x.name);
        return true;
      }));
      setProcesses(p);
      setCategories(c);
    });
  }, []);

  // Auto-set factory/process from session
  useEffect(() => {
    if (!session || processes.length === 0) return;
    if (userRole !== "ADMIN" && userProcessIds.length > 0) {
      const firstProcessId = userProcessIds[0];
      const proc = processes.find(p => p.id === firstProcessId);
      if (proc) {
        setSelectedFactoryId(proc.factoryId);
        setSelectedProcessId(proc.id);
      }
    } else if (userRole === "ADMIN" && factories.length > 0 && !selectedFactoryId) {
      setSelectedFactoryId(factories[0].id);
    }
  }, [session, processes, factories]);

  // Load machines when process changes
  const loadMachines = useCallback(async () => {
    if (!selectedProcessId) { setMachines([]); return; }
    const res = await fetch(`/api/machines?processId=${selectedProcessId}`);
    const data = await res.json();
    setMachines((data || []).filter((m: Machine) => m.isActive));
  }, [selectedProcessId]);

  // Load active stops
  const loadActiveStops = useCallback(async () => {
    if (!selectedProcessId) { setActiveStops([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/production/machine-stops?processId=${selectedProcessId}&activeOnly=true&pageSize=200`);
      const data = await res.json();
      setActiveStops(data.logs || []);
    } catch {
      message.error("Lỗi tải trạng thái máy");
    } finally {
      setLoading(false);
    }
  }, [selectedProcessId]);

  useEffect(() => {
    loadMachines();
    loadActiveStops();
  }, [loadMachines, loadActiveStops, lastRefresh]);

  // Auto refresh every 60s
  useEffect(() => {
    const timer = setInterval(() => setLastRefresh(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const filteredProcesses = processes.filter(p => !selectedFactoryId || p.factoryId === selectedFactoryId);

  const getActiveStop = (machineId: number) => activeStops.find(s => s.machineId === machineId) || null;
  const stoppedCount = machines.filter(m => getActiveStop(m.id)).length;

  // Sorted: stopped first
  const sortedMachines = [...machines].sort((a, b) => {
    const aStop = getActiveStop(a.id);
    const bStop = getActiveStop(b.id);
    if (aStop && !bStop) return -1;
    if (!aStop && bStop) return 1;
    return 0;
  });

  const openStopModal = (machine: Machine) => {
    setTargetMachine(machine);
    setSelectedCategoryId(null);
    setSelectedSeverity("medium");
    setStopDescription("");
    setUseManualStopTime(false);
    setManualStopTime(dayjs());
    setStopModal(true);
  };

  const handleReportStop = async () => {
    if (!targetMachine || !selectedCategoryId) {
      message.warning("Vui lòng chọn nguyên nhân dừng máy");
      return;
    }
    const stopTime = useManualStopTime ? manualStopTime.toISOString() : new Date().toISOString();
    setSubmitting(true);
    try {
      const res = await fetch("/api/production/machine-stops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId: targetMachine.id,
          categoryId: selectedCategoryId,
          startTime: stopTime,
          severity: selectedSeverity,
          description: stopDescription || undefined,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      message.success(`Đã ghi nhận dừng máy ${targetMachine.name}`);
      setStopModal(false);
      setLastRefresh(Date.now());
    } catch (e: any) {
      message.error(e.message || "Lỗi ghi nhận");
    } finally {
      setSubmitting(false);
    }
  };

  const openRestartModal = (stop: ActiveStop) => {
    setTargetStop(stop);
    setUseManualRestartTime(false);
    setManualRestartTime(dayjs());
    setRestartModal(true);
  };

  const handleRestart = async () => {
    if (!targetStop) return;
    const endTime = useManualRestartTime ? manualRestartTime.toISOString() : new Date().toISOString();
    setRestarting(true);
    try {
      const res = await fetch(`/api/production/machine-stops/${targetStop.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endTime }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const machineName = machines.find(m => m.id === targetStop.machineId)?.name || "Máy";
      message.success(`Máy ${machineName} đã chạy lại!`);
      setRestartModal(false);
      setLastRefresh(Date.now());
    } catch (e: any) {
      message.error(e.message || "Lỗi cập nhật");
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Ghi nhận dừng máy</h2>
          {stoppedCount > 0 && (
            <Badge count={stoppedCount} style={{ backgroundColor: "#ff4d4f" }}>
              <Tag color="error" style={{ marginTop: 4 }}>{stoppedCount} máy đang dừng</Tag>
            </Badge>
          )}
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => setLastRefresh(Date.now())}>Làm mới</Button>
      </div>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <span>Nhà máy:</span>
          <Select
            style={{ width: 180 }}
            placeholder="Chọn nhà máy"
            value={selectedFactoryId}
            onChange={v => { setSelectedFactoryId(v); setSelectedProcessId(null); }}
            options={factories.map(f => ({ value: f.id, label: f.name }))}
            allowClear
          />
          <span>Công đoạn:</span>
          <Select
            style={{ width: 200 }}
            placeholder="Chọn công đoạn"
            value={selectedProcessId}
            onChange={setSelectedProcessId}
            options={filteredProcesses.map(p => ({ value: p.id, label: p.name }))}
            allowClear
            disabled={userRole !== "ADMIN"}
          />
        </Space>
      </Card>

      {/* Machine Grid */}
      {!selectedProcessId ? (
        <div style={{ textAlign: "center", padding: 48, color: "#999" }}>Vui lòng chọn công đoạn để xem máy</div>
      ) : loading ? (
        <div style={{ textAlign: "center", padding: 48 }}><Spin size="large" /></div>
      ) : machines.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "#999" }}>Không có máy nào trong công đoạn này</div>
      ) : (
        <Row gutter={[12, 12]}>
          {sortedMachines.map(machine => {
            const activeStop = getActiveStop(machine.id);
            const isStopped = !!activeStop;

            return (
              <Col key={machine.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  size="small"
                  style={{
                    borderColor: isStopped ? "#ff4d4f" : "#52c41a",
                    borderWidth: 2,
                    background: isStopped ? "#fff1f0" : "#f6ffed",
                  }}
                  styles={{ body: { padding: 16 } }}
                >
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{machine.name}</div>

                  {isStopped ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <ExclamationCircleOutlined style={{ color: "#ff4d4f" }} />
                        <span style={{ color: "#ff4d4f", fontWeight: 600 }}>Đang dừng</span>
                      </div>
                      <Tag color={activeStop.category.color} style={{ marginBottom: 4 }}>{activeStop.category.name}</Tag>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#888", fontSize: 12, marginBottom: 8 }}>
                        <ClockCircleOutlined />
                        <span>Đã dừng {formatDuration(activeStop.startTime)}</span>
                      </div>
                      <Tag color={SEVERITY_LABELS[activeStop.severity]?.color} style={{ marginBottom: 8 }}>
                        {SEVERITY_LABELS[activeStop.severity]?.label}
                      </Tag>
                      <br />
                      <Button
                        type="primary"
                        block
                        icon={<CheckCircleOutlined />}
                        style={{ background: "#52c41a", borderColor: "#52c41a" }}
                        onClick={() => openRestartModal(activeStop)}
                      >
                        Máy đã chạy
                      </Button>
                    </>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                        <CheckCircleOutlined style={{ color: "#52c41a" }} />
                        <span style={{ color: "#52c41a", fontWeight: 600 }}>Đang chạy</span>
                      </div>
                      <Button
                        danger
                        block
                        icon={<ExclamationCircleOutlined />}
                        onClick={() => openStopModal(machine)}
                      >
                        Báo dừng
                      </Button>
                    </>
                  )}
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Report Stop Modal */}
      <Modal
        title={`Báo dừng máy: ${targetMachine?.name}`}
        open={stopModal}
        onCancel={() => setStopModal(false)}
        onOk={handleReportStop}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={submitting}
        width={500}
      >
        <div style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>Nguyên nhân dừng:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {categories.map(cat => (
              <Button
                key={cat.id}
                type={selectedCategoryId === cat.id ? "primary" : "default"}
                style={{
                  borderColor: cat.color,
                  color: selectedCategoryId === cat.id ? "#fff" : cat.color,
                  background: selectedCategoryId === cat.id ? cat.color : "#fff",
                }}
                onClick={() => setSelectedCategoryId(cat.id)}
              >
                {cat.name}
              </Button>
            ))}
          </div>

          <div style={{ marginBottom: 12, fontWeight: 600 }}>Mức độ:</div>
          <Radio.Group
            value={selectedSeverity}
            onChange={e => setSelectedSeverity(e.target.value)}
            style={{ marginBottom: 16 }}
          >
            <Radio.Button value="low">Nhẹ</Radio.Button>
            <Radio.Button value="medium">Trung bình</Radio.Button>
            <Radio.Button value="high">Nặng</Radio.Button>
            <Radio.Button value="critical">Nghiêm trọng</Radio.Button>
          </Radio.Group>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Thời gian dừng:</div>
            {!useManualStopTime ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Tag icon={<ClockCircleOutlined />} color="blue">Dừng lúc: {dayjs().format("HH:mm DD/MM/YYYY")}</Tag>
                <Button type="link" size="small" onClick={() => setUseManualStopTime(true)}>Chỉnh thời gian</Button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DatePicker
                  showTime
                  value={manualStopTime}
                  onChange={v => v && setManualStopTime(v)}
                  format="HH:mm DD/MM/YYYY"
                  disabledDate={d => d.isAfter(dayjs())}
                />
                <Button type="link" size="small" onClick={() => setUseManualStopTime(false)}>Dùng thời gian hiện tại</Button>
              </div>
            )}
          </div>

          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Mô tả thêm (tùy chọn):</div>
            <TextArea
              rows={3}
              placeholder="Mô tả chi tiết (nếu có)..."
              value={stopDescription}
              onChange={e => setStopDescription(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* Restart Modal */}
      <Modal
        title="Xác nhận máy đã chạy lại"
        open={restartModal}
        onCancel={() => setRestartModal(false)}
        onOk={handleRestart}
        okText="Xác nhận chạy lại"
        cancelText="Hủy"
        confirmLoading={restarting}
        width={420}
      >
        {targetStop && (
          <div style={{ marginTop: 8 }}>
            <div style={{ marginBottom: 8 }}>
              <strong>Máy:</strong> {machines.find(m => m.id === targetStop.machineId)?.name}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Nguyên nhân:</strong> <Tag color={targetStop.category.color}>{targetStop.category.name}</Tag>
            </div>
            <div style={{ marginBottom: 16, color: "#888" }}>
              Đã dừng {formatDuration(targetStop.startTime)}
            </div>

            <div style={{ fontWeight: 600, marginBottom: 4 }}>Thời gian chạy lại:</div>
            {!useManualRestartTime ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Tag icon={<ClockCircleOutlined />} color="green">Chạy lại lúc: {dayjs().format("HH:mm DD/MM/YYYY")}</Tag>
                <Button type="link" size="small" onClick={() => setUseManualRestartTime(true)}>Chỉnh thời gian</Button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DatePicker
                  showTime
                  value={manualRestartTime}
                  onChange={v => v && setManualRestartTime(v)}
                  format="HH:mm DD/MM/YYYY"
                  disabledDate={d => d.isAfter(dayjs())}
                />
                <Button type="link" size="small" onClick={() => setUseManualRestartTime(false)}>Dùng thời gian hiện tại</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
