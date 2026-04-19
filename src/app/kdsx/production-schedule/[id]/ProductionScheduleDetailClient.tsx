"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Button, Tag, Typography, message, Spin, Breadcrumb, Space, Tooltip,
  Popconfirm, Card, Row, Col, Modal, Tabs,
} from "antd";
import {
  ArrowLeftOutlined, CheckCircleOutlined, SendOutlined, SyncOutlined,
  ExportOutlined, UndoOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import ScheduleSegmentModal from "@/components/kdsx/ScheduleSegmentModal";
import ActualProductionGrid from "@/components/kdsx/ActualProductionGrid";
import ScheduleComparisonDashboard from "@/components/kdsx/ScheduleComparisonDashboard";

const { Title, Text } = Typography;

interface Machine { id: number; name: string; model?: string | null; processId: number; }
interface Item { id: number; name: string; }
interface Segment {
  id: number; scheduleId: number; machineId: number; itemId: number;
  fromDay: number; toDay: number; kgPerDay: number;
  isManualKg: boolean; benchmarkId?: number | null; note?: string | null;
  machine: { id: number; name: string; model?: string | null; processId: number };
  item: { id: number; name: string };
}
interface Schedule {
  id: number; factoryId: number; factory: { id: number; name: string };
  yearMonth: string; status: "DRAFT" | "SUBMITTED" | "APPROVED";
  note?: string | null; holidays: number[]; segments: Segment[];
  itemColors: Record<string, string>;
  createdAt: string; updatedAt: string;
}
interface SummaryItem {
  itemId: number; itemName: string; totalKg: number; totalTons: number;
  segmentCount: number; machinesInvolved: number[];
}

const STATUS_COLORS: Record<string, string> = { DRAFT: "default", SUBMITTED: "processing", APPROVED: "success" };
const STATUS_LABELS: Record<string, string> = { DRAFT: "Nháp", SUBMITTED: "Đã trình", APPROVED: "Đã duyệt" };

const DEFAULT_COLORS = [
  "#4CAF50", "#2196F3", "#FF9800", "#9C27B0", "#F44336",
  "#00BCD4", "#FFEB3B", "#E91E63", "#3F51B5", "#8BC34A",
  "#FF5722", "#607D8B", "#009688", "#795548", "#CDDC39", "#673AB7",
];

function getItemColor(itemId: number, itemColors: Record<string, string>): string {
  if (itemColors[String(itemId)]) return itemColors[String(itemId)];
  const idx = itemId % DEFAULT_COLORS.length;
  return DEFAULT_COLORS[idx];
}

function daysInMonthFn(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export default function ProductionScheduleDetailClient({ scheduleId }: { scheduleId: number }) {
  const router = useRouter();

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [summary, setSummary] = useState<SummaryItem[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editSegment, setEditSegment] = useState<Segment | null>(null);
  const [defaultMachineId, setDefaultMachineId] = useState<number | undefined>(undefined);
  const [defaultDay, setDefaultDay] = useState<number | undefined>(undefined);
  const [highlightItemId, setHighlightItemId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("plan");
  const [selectedMachineId, setSelectedMachineId] = useState<number | null>(null);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`/api/kdsx/production-schedule/${scheduleId}`);
      if (!res.ok) { message.error("Không tìm thấy kế hoạch"); return; }
      const data = await res.json();
      setSchedule(data);
    } catch { message.error("Lỗi tải dữ liệu"); }
  }, [scheduleId]);

  const fetchSummary = useCallback(async () => {
    const res = await fetch(`/api/kdsx/production-schedule/${scheduleId}/summary`);
    if (res.ok) setSummary(await res.json());
  }, [scheduleId]);

  useEffect(() => {
    Promise.all([
      fetchSchedule(),
      fetchSummary(),
      fetch("/api/machines").then(r => r.json()).then(d => setMachines(Array.isArray(d) ? d : d.machines ?? [])).catch(() => { }),
      fetch("/api/items").then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : d.items ?? [])).catch(() => { }),
    ]).finally(() => setLoading(false));
  }, [fetchSchedule, fetchSummary]);

  const refresh = async () => { await Promise.all([fetchSchedule(), fetchSummary()]); };

  const handleToggleHoliday = async (day: number) => {
    if (!schedule || schedule.status !== "DRAFT") return;
    const current: number[] = Array.isArray(schedule.holidays) ? schedule.holidays as number[] : [];
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort((a, b) => a - b);
    const res = await fetch(`/api/kdsx/production-schedule/${scheduleId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holidays: next }),
    });
    if (res.ok) {
      setSchedule(prev => prev ? { ...prev, holidays: next } : prev);
      await fetchSummary();
    }
  };

  const handleChangeItemColor = async (itemId: number, color: string) => {
    if (!schedule) return;
    const newColors = { ...schedule.itemColors, [String(itemId)]: color };
    // Cập nhật local ngay để UX mượt
    setSchedule(prev => prev ? { ...prev, itemColors: newColors } : prev);
    // Lưu lên server (không block)
    await fetch(`/api/kdsx/production-schedule/${scheduleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemColors: newColors }),
    });
  };

  const handleStatusChange = async (newStatus: string) => {
    setActionLoading(true);
    const res = await fetch(`/api/kdsx/production-schedule/${scheduleId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (!res.ok) { message.error(data.error ?? "Lỗi đổi trạng thái"); }
    else { message.success("Đã cập nhật trạng thái"); await refresh(); }
    setActionLoading(false);
  };

  const handleSyncToPlan = async () => {
    setActionLoading(true);
    const res = await fetch(`/api/kdsx/production-schedule/${scheduleId}/sync-to-plan`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) message.error(data.error ?? "Lỗi đồng bộ");
    else message.success(data.message ?? "Đã đồng bộ sang kế hoạch DT");
    setActionLoading(false);
  };

  const handleSaveSegment = async (values: any) => {
    const url = editSegment
      ? `/api/kdsx/production-schedule/${scheduleId}/segments/${editSegment.id}`
      : `/api/kdsx/production-schedule/${scheduleId}/segments`;
    const method = editSegment ? "PUT" : "POST";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json();
    if (!res.ok) { message.error(data.error ?? "Lỗi lưu segment"); throw new Error(data.error); }
    if (editSegment) {
      message.success("Đã cập nhật segment");
      setModalOpen(false); setEditSegment(null);
      await refresh();
    } else {
      message.success(`Đã thêm segment cho máy #${values.machineId}`);
    }
  };

  const handleAllSaved = async () => {
    setModalOpen(false); setEditSegment(null);
    await refresh();
  };

  const handleDeleteSegment = async (segId: number) => {
    const res = await fetch(`/api/kdsx/production-schedule/${scheduleId}/segments/${segId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) message.error(data.error ?? "Lỗi xóa segment");
    else { message.success("Đã xóa segment"); await refresh(); }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  if (!schedule) return <div>Không tìm thấy kế hoạch.</div>;

  const { yearMonth, factory, status, holidays } = schedule;
  const itemColors = (schedule.itemColors ?? {}) as Record<string, string>;
  const holidayArr: number[] = Array.isArray(holidays) ? holidays as number[] : [];
  const totalDays = daysInMonthFn(yearMonth);
  const [schedYear, schedMonth] = yearMonth.split("-").map(Number);
  const dayNumbers = Array.from({ length: totalDays }, (_, i) => i + 1);

  // Helper màu dùng itemColors từ schedule
  function getColor(itemId: number): string { return getItemColor(itemId, itemColors); }
  function getBg(itemId: number): string { return getColor(itemId) + "33"; }
  function getBorder(itemId: number): string { return getColor(itemId) + "AA"; }

  // Nhóm segments theo máy
  const segsByMachine = new Map<number, Segment[]>();
  for (const seg of schedule.segments) {
    if (!segsByMachine.has(seg.machineId)) segsByMachine.set(seg.machineId, []);
    segsByMachine.get(seg.machineId)!.push(seg);
  }

  // Tổng kg toàn tháng theo ngày (trừ nghỉ)
  const totalKgByDay = dayNumbers.map(day => {
    if (holidayArr.includes(day)) return 0;
    let total = 0;
    for (const seg of schedule.segments) {
      if (day >= seg.fromDay && day <= seg.toDay) total += seg.kgPerDay;
    }
    return total;
  });

  // Lấy danh sách máy unique, theo thứ tự id
  const uniqueMachines = Array.from(
    new Map(schedule.segments.map(s => [s.machineId, s.machine])).values()
  ).sort((a, b) => a.id - b.id);

  // Thêm các máy thuộc factory mà chưa có segment
  const factoryMachines = machines.filter(m => {
    return !uniqueMachines.find(um => um.id === m.id);
  });
  const allMachines = [...uniqueMachines.map(m => ({ id: m.id, name: m.name, model: m.model ?? null, processId: m.processId })),
  ...factoryMachines.slice(0, Math.max(0, 21 - uniqueMachines.length))];

  const isDraft = status === "DRAFT";
  const isApproved = status === "APPROVED";

  const grandTotal = summary.reduce((s, i) => s + i.totalKg, 0);

  const thStyle: React.CSSProperties = {
    background: "#001529", color: "white", padding: "7px 5px",
    textAlign: "center", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
    position: "sticky", top: 0, zIndex: 2,
    borderBottom: "2px solid #1d3557",
    borderRight: "1px solid #1d3557",
  };
  const tdStyle: React.CSSProperties = {
    padding: "5px 5px", textAlign: "center", fontSize: 12, whiteSpace: "nowrap",
    borderRight: "1px solid #d0d0d0",
    borderBottom: "1px solid #e8e8e8",
  };

  // Grid Kế hoạch (tab 1)
  const planGrid = (
    <div>
      {/* Holiday hint */}
      <div style={{ marginBottom: 8, fontSize: 12, color: "#888" }}>
        {isDraft && "💡 Click vào tên ngày (header) để đánh dấu ngày nghỉ lễ. "}
        Ngày nghỉ: {holidayArr.length > 0 ? holidayArr.map(d => `${d}/${schedMonth}`).join(", ") : "Chưa có"}
      </div>

      <div style={{ overflowX: "auto", border: "2px solid #b0b0b0", borderRadius: 6, boxShadow: "0 1px 6px rgba(0,0,0,0.1)" }}>
        <table style={{ borderCollapse: "collapse", minWidth: 900, width: "max-content" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, minWidth: 80, position: "sticky", left: 0, zIndex: 3, textAlign: "left", paddingLeft: 8 }}>Máy</th>
              <th style={{ ...thStyle, minWidth: 100, position: "sticky", left: 80, zIndex: 3 }}>Mặt hàng</th>
              {dayNumbers.map(day => {
                const isHoliday = holidayArr.includes(day);
                return (
                  <th
                    key={day}
                    style={{
                      ...thStyle, minWidth: 38, cursor: isDraft ? "pointer" : "default",
                      background: isHoliday ? "#cf1322" : "#001529",
                      color: isHoliday ? "#fff" : "white",
                      userSelect: "none",
                    }}
                    onClick={() => isDraft && handleToggleHoliday(day)}
                    title={isDraft ? (isHoliday ? "Bỏ đánh dấu nghỉ" : "Đánh dấu ngày nghỉ") : ""}
                  >
                    {day}
                    <br />
                    <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>{schedMonth}/{String(schedYear).slice(2)}</span>
                  </th>
                );
              })}
              <th style={{ ...thStyle, minWidth: 70, background: "#1d3557" }}>TỔNG</th>
            </tr>
          </thead>
          <tbody>
            {allMachines.map((machine, mIdx) => {
              const machineSegs = segsByMachine.get(machine.id) ?? [];
              const highlighted = highlightItemId !== null &&
                machineSegs.some(s => s.itemId === highlightItemId);

              let machineTotalKg = 0;
              for (const seg of machineSegs) {
                let days = seg.toDay - seg.fromDay + 1;
                const hols = holidayArr.filter(h => h >= seg.fromDay && h <= seg.toDay).length;
                days = Math.max(0, days - hols);
                machineTotalKg += days * seg.kgPerDay;
              }

              const isRowSelected = selectedMachineId === machine.id;
              const rowBg = isRowSelected
                ? "#fffbe6"
                : mIdx % 2 === 0 ? "#fff" : "#fafafa";

              return (
                <tr
                  key={machine.id}
                  style={{
                    background: rowBg,
                    cursor: "pointer",
                    outline: isRowSelected ? "2px solid #faad14" : undefined,
                    outlineOffset: isRowSelected ? "-2px" : undefined,
                  }}
                  onClick={() => setSelectedMachineId(prev => prev === machine.id ? null : machine.id)}
                >
                  {/* Máy */}
                  <td style={{
                    ...tdStyle, textAlign: "left", paddingLeft: 8,
                    position: "sticky", left: 0, zIndex: 1,
                    background: rowBg,
                    minWidth: 80,
                    fontWeight: isRowSelected ? 800 : 600,
                    color: isRowSelected ? "#d48806" : undefined,
                  }}>
                    {machine.name}
                    {machine.model && <div style={{ fontSize: 10, color: "#888", fontWeight: 400 }}>{machine.model}</div>}
                  </td>

                  {/* Mặt hàng + color picker */}
                  <td style={{
                    ...tdStyle, position: "sticky", left: 80, zIndex: 1,
                    background: rowBg, minWidth: 100,
                  }}>
                    {machineSegs.length > 0
                      ? machineSegs.map(s => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                          {isDraft && (
                            <input
                              type="color"
                              value={getColor(s.itemId)}
                              onChange={(e) => handleChangeItemColor(s.itemId, e.target.value)}
                              style={{ width: 14, height: 14, border: "none", cursor: "pointer", padding: 0, borderRadius: 2 }}
                              title="Đổi màu mặt hàng"
                            />
                          )}
                          <span style={{ color: getColor(s.itemId), fontWeight: 600, fontSize: 11 }}>
                            {s.item.name} ({s.fromDay}–{s.toDay})
                          </span>
                        </div>
                      ))
                      : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
                    }
                  </td>

                  {/* Ô ngày */}
                  {dayNumbers.map(day => {
                    const isHoliday = holidayArr.includes(day);
                    const seg = machineSegs.find(s => day >= s.fromDay && day <= s.toDay);
                    const dimmed = highlightItemId !== null && seg && seg.itemId !== highlightItemId;

                    return (
                      <td
                        key={day}
                        style={{
                          ...tdStyle,
                          background: isHoliday
                            ? "#ffebe8"
                            : seg
                              ? getBg(seg.itemId)
                              : undefined,
                          opacity: dimmed ? 0.25 : 1,
                          cursor: isDraft ? "pointer" : "default",
                          borderLeft: seg && (day === seg.fromDay) ? `2px solid ${getBorder(seg.itemId)}` : "1px solid #d0d0d0",
                          borderRight: seg && (day === seg.toDay) ? `2px solid ${getBorder(seg.itemId)}` : "1px solid #d0d0d0",
                        }}
                        onClick={() => {
                          if (!isDraft) return;
                          if (seg) {
                            setEditSegment(seg);
                            setModalOpen(true);
                          } else {
                            setEditSegment(null);
                            setDefaultMachineId(machine.id);
                            setDefaultDay(day);
                            setModalOpen(true);
                          }
                        }}
                        title={seg ? `${seg.item.name}: ${seg.kgPerDay.toLocaleString()} kg/ngày${isDraft ? " (Click để sửa)" : ""}` : isDraft ? "Click để thêm segment" : ""}
                      >
                        {isHoliday
                          ? <span style={{ color: "#aaa", fontSize: 11 }}>—</span>
                          : seg
                            ? <span style={{ color: getColor(seg.itemId), fontSize: 11, fontWeight: 800 }}>
                              {seg.kgPerDay.toLocaleString()} kg
                            </span>
                            : <span style={{ color: "#bbb", fontSize: 13, lineHeight: 1 }}>·</span>
                        }
                      </td>
                    );
                  })}

                  {/* Tổng kg máy */}
                  <td style={{
                    ...tdStyle,
                    background: "#dbeeff", fontWeight: 800, fontSize: 13,
                    color: "#0050b3", borderLeft: "2px solid #b0b0b0",
                  }}>
                    {machineTotalKg > 0 ? `${machineTotalKg.toLocaleString()} kg` : <span style={{ color: "#bbb" }}>—</span>}
                  </td>
                </tr>
              );
            })}

            {/* Hàng cuối: tổng theo ngày */}
            <tr style={{ background: "#001529" }}>
              <td style={{ ...tdStyle, color: "white", fontWeight: 700, position: "sticky", left: 0, zIndex: 1, background: "#001529", textAlign: "left", paddingLeft: 8 }}>TỔNG</td>
              <td style={{ ...tdStyle, color: "white", position: "sticky", left: 80, zIndex: 1, background: "#001529" }}>kg/ngày</td>
              {totalKgByDay.map((kg, i) => {
                const day = i + 1;
                const isHoliday = holidayArr.includes(day);
                return (
                  <td key={day} style={{
                    ...tdStyle, fontWeight: 600, fontSize: 10,
                    background: isHoliday ? "#434343" : "#1d3557",
                    color: isHoliday ? "#888" : "#52c41a",
                  }}>
                    {isHoliday ? "—" : kg > 0 ? `${kg.toLocaleString()} kg` : "·"}
                  </td>
                );
              })}
              <td style={{ ...tdStyle, background: "#1d3557", color: "#52c41a", fontWeight: 800, fontSize: 13 }}>
                {grandTotal.toLocaleString()} kg
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      {/* Breadcrumb & Header */}
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb items={[
          { title: <a onClick={() => router.push("/kdsx/production-schedule")}>Kế hoạch SX</a> },
          { title: `${factory.name} / Tháng ${schedMonth}/${schedYear}` },
        ]} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/kdsx/production-schedule")} />
          <Title level={4} style={{ margin: 0 }}>
            KH SX — {factory.name} — Tháng {schedMonth}/{schedYear}
          </Title>
          <Tag color={STATUS_COLORS[status]} style={{ fontSize: 13 }}>{STATUS_LABELS[status]}</Tag>
        </div>

        <Space wrap>
          {status === "DRAFT" && (
            <Popconfirm title="Trình duyệt kế hoạch này?" onConfirm={() => handleStatusChange("SUBMITTED")} okText="Trình">
              <Button icon={<SendOutlined />} loading={actionLoading}>Trình duyệt</Button>
            </Popconfirm>
          )}
          {status === "SUBMITTED" && (
            <>
              <Popconfirm title="Phê duyệt kế hoạch này?" onConfirm={() => handleStatusChange("APPROVED")} okText="Phê duyệt" okType="primary">
                <Button type="primary" icon={<CheckCircleOutlined />} loading={actionLoading}>Phê duyệt</Button>
              </Popconfirm>
              <Popconfirm title="Hoàn về DRAFT?" onConfirm={() => handleStatusChange("DRAFT")} okText="Hoàn về">
                <Button icon={<UndoOutlined />} loading={actionLoading}>Hoàn về nháp</Button>
              </Popconfirm>
            </>
          )}
          {status === "APPROVED" && (
            <>
              <Popconfirm title="Đồng bộ sản lượng sang Kế hoạch DT?" description="Sẽ cập nhật/tạo PlanLineItem.qty" onConfirm={handleSyncToPlan} okText="Đồng bộ" okType="primary">
                <Button type="primary" icon={<SyncOutlined />} loading={actionLoading}>Đồng bộ sang KH DT</Button>
              </Popconfirm>
              <Popconfirm title="Unapprove để sửa?" onConfirm={() => handleStatusChange("SUBMITTED")} okText="Unapprove">
                <Button icon={<UndoOutlined />} loading={actionLoading}>Unapprove</Button>
              </Popconfirm>
            </>
          )}
          {isDraft && (
            <Button type="dashed" icon={<span>+</span>} onClick={() => { setEditSegment(null); setDefaultMachineId(undefined); setDefaultDay(undefined); setModalOpen(true); }}>
              Thêm segment
            </Button>
          )}
        </Space>
      </div>

      {/* Summary Cards */}
      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {summary.map(item => (
          <Card
            key={item.itemId}
            size="small"
            style={{
              cursor: "pointer", minWidth: 120,
              borderColor: highlightItemId === item.itemId ? getBorder(item.itemId) : "#d9d9d9",
              background: highlightItemId === item.itemId ? getBg(item.itemId) : undefined,
              borderWidth: highlightItemId === item.itemId ? 2 : 1,
            }}
            onClick={() => setHighlightItemId(prev => prev === item.itemId ? null : item.itemId)}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: getColor(item.itemId) }}>{item.itemName}</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{item.totalTons.toFixed(1)} tấn</div>
            <div style={{ fontSize: 11, color: "#888" }}>{item.machinesInvolved.length} máy</div>
          </Card>
        ))}
        {summary.length > 0 && (
          <Card size="small" style={{ minWidth: 120, background: "#001529", cursor: "default" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>TỔNG THÁNG</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#52c41a" }}>{(grandTotal / 1000).toFixed(1)} tấn</div>
            <div style={{ fontSize: 11, color: "#aaa" }}>{schedule.segments.length} segments</div>
          </Card>
        )}
      </div>

      {/* Tabs: Kế hoạch / Thực hiện / So sánh */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "plan",
            label: "📋 Kế hoạch",
            children: planGrid,
          },
          {
            key: "actual",
            label: "📊 Thực hiện",
            children: (
              <ActualProductionGrid
                scheduleId={scheduleId}
                segments={schedule.segments}
                holidays={holidayArr}
                totalDays={totalDays}
                itemColors={itemColors}
                yearMonth={yearMonth}
              />
            ),
          },
          {
            key: "compare",
            label: "📈 So sánh KH/TH",
            children: (
              <ScheduleComparisonDashboard
                scheduleId={scheduleId}
                summary={summary}
                yearMonth={yearMonth}
                itemColors={itemColors}
                segments={schedule.segments}
                holidays={holidayArr}
                totalDays={totalDays}
              />
            ),
          },
        ]}
      />

      {/* Segment Modal */}
      <ScheduleSegmentModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditSegment(null); }}
        onSave={handleSaveSegment}
        onAllSaved={handleAllSaved}
        scheduleId={scheduleId}
        factoryId={factory.id}
        yearMonth={yearMonth}
        daysInMonth={totalDays}
        machines={machines}
        items={items}
        editSegment={editSegment}
        defaultMachineId={defaultMachineId}
        defaultDay={defaultDay}
      />
    </div>
  );
}
