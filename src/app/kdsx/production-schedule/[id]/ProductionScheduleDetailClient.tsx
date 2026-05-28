"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Button,
  Typography,
  message,
  Spin,
  Breadcrumb,
  Space,
  Card,
  Row,
  Col,
  Modal,
  Tabs,
  InputNumber,
  Table,
  Statistic,
  Alert,
  Tag,
} from "antd";
import {
  ArrowLeftOutlined,
  FilterOutlined,
  DollarOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import ScheduleSegmentModal from "@/components/kdsx/ScheduleSegmentModal";
import ActualProductionGrid, {
  ActualGrid,
} from "@/components/kdsx/ActualProductionGrid";
import ScheduleComparisonDashboard from "@/components/kdsx/ScheduleComparisonDashboard";

const { Title, Text } = Typography;

interface Machine {
  id: number;
  name: string;
  model?: string | null;
  processId: number;
}
interface Item {
  id: number;
  name: string;
}
interface Segment {
  id: number;
  scheduleId: number;
  machineId: number;
  itemId: number;
  fromDay: number;
  toDay: number;
  kgPerDay: number;
  isManualKg: boolean;
  benchmarkId?: number | null;
  note?: string | null;
  machine: {
    id: number;
    name: string;
    model?: string | null;
    processId: number;
  };
  item: { id: number; name: string };
}
interface Schedule {
  id: number;
  factoryId: number;
  processId?: number | null;
  factory: { id: number; name: string };
  yearMonth: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED";
  note?: string | null;
  holidays: number[];
  segments: Segment[];
  itemColors: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}
interface SummaryItem {
  itemId: number;
  itemName: string;
  totalKg: number;
  totalTons: number;
  segmentCount: number;
  machinesInvolved: number[];
}

// ── DT-LN kế hoạch types (từ calculator-v2) ──
interface PlanPnLSummary {
  totalQtyKg: number;
  totalRevenueVnd: number;
  totalVariableCostVnd: number;
  totalFixedCostVnd: number;
  financialIncomeVnd: number;
  totalProfitVnd: number;
}
interface PlanContractPnL {
  orderItemId: number | null;
  orderId: number | null;
  orderNo: string | null;
  itemId: number;
  itemName: string;
  allocatedQty: number;
  unitPriceUsd: number;
  revenueVnd: number;
  variableCostVnd: number;
  profitContributionVnd: number;
}
interface PlanFixedCostLine {
  costType: string;
  label: string;
  amountVnd: number;
}
interface PlanPnLResult {
  summary: PlanPnLSummary;
  byContract: PlanContractPnL[];
  fixedCosts: PlanFixedCostLine[];
  meta: { exchangeRate: number; mode: string };
}

// ── PlanPnLTab component ───────────────────────────────────────────────────
function fmtTy(vnd: number) {
  return (vnd / 1e9).toFixed(3) + " tỷ";
}
function fmtKg(kg: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(kg)) + " kg";
}

interface PlanPnLTabProps {
  scheduleId: number;
  hasProcessId: boolean;
  planPnlData: PlanPnLResult | null;
  loading: boolean;
  error: string | null;
}

function PlanPnLTab({ hasProcessId, planPnlData, loading, error }: PlanPnLTabProps) {
  if (!hasProcessId) {
    return (
      <Alert
        type="warning"
        message="Lịch sản xuất chưa liên kết công đoạn (processId)"
        description="Cần cập nhật lịch sản xuất để liên kết với công đoạn trước khi tính DT-LN kế hoạch."
        showIcon
        style={{ marginTop: 16 }}
      />
    );
  }
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <Spin size="large" tip="Đang tính DT-LN kế hoạch..." />
      </div>
    );
  }
  if (error) {
    return (
      <Alert
        type="error"
        message="Lỗi tính DT-LN kế hoạch"
        description={error}
        showIcon
        style={{ marginTop: 16 }}
      />
    );
  }
  if (!planPnlData) {
    return (
      <Alert
        type="info"
        message="Chuyển sang tab này để tải dữ liệu DT-LN kế hoạch"
        showIcon
        style={{ marginTop: 16 }}
      />
    );
  }

  const { summary, byContract, fixedCosts, meta } = planPnlData;

  const contractColumns = [
    { title: "Số HĐ", dataIndex: "orderNo", key: "orderNo", render: (v: string | null) => v ?? <Tag color="orange">Surplus</Tag>, width: 110 },
    { title: "Mặt hàng", dataIndex: "itemName", key: "itemName", width: 120 },
    {
      title: "SL KH (kg)",
      dataIndex: "allocatedQty",
      key: "allocatedQty",
      align: "right" as const,
      render: (v: number) => fmtKg(v),
      width: 110,
    },
    {
      title: "DT (tỷ VNĐ)",
      dataIndex: "revenueVnd",
      key: "revenueVnd",
      align: "right" as const,
      render: (v: number) => <span style={{ color: "#1677ff", fontWeight: 600 }}>{fmtTy(v)}</span>,
      width: 110,
    },
    {
      title: "CP biến đổi (tỷ)",
      dataIndex: "variableCostVnd",
      key: "variableCostVnd",
      align: "right" as const,
      render: (v: number) => fmtTy(v),
      width: 130,
    },
    {
      title: "Đóng góp LN (tỷ)",
      dataIndex: "profitContributionVnd",
      key: "profitContributionVnd",
      align: "right" as const,
      render: (v: number) => (
        <span style={{ color: v >= 0 ? "#52c41a" : "#ff4d4f", fontWeight: 700 }}>
          {v >= 0 ? "+" : ""}{fmtTy(v)}
        </span>
      ),
      width: 140,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary cards */}
      <Row gutter={16}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="SL kế hoạch"
              value={fmtKg(summary.totalQtyKg)}
              valueStyle={{ fontSize: 16 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Doanh thu KH"
              value={fmtTy(summary.totalRevenueVnd)}
              valueStyle={{ color: "#1677ff", fontSize: 16 }}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="CP biến đổi KH"
              value={fmtTy(summary.totalVariableCostVnd)}
              valueStyle={{ fontSize: 16 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="LN ước tính KH"
              value={fmtTy(summary.totalProfitVnd)}
              valueStyle={{
                color: summary.totalProfitVnd >= 0 ? "#52c41a" : "#ff4d4f",
                fontSize: 16,
                fontWeight: 700,
              }}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Contract detail table */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
          📋 Chi tiết theo hợp đồng (Tỷ giá: {meta.exchangeRate.toLocaleString()} VNĐ/USD)
        </div>
        <Table
          dataSource={byContract.map((r, i) => ({ ...r, key: r.orderItemId ?? `surplus-${i}` }))}
          columns={contractColumns}
          pagination={false}
          size="small"
          scroll={{ x: 700 }}
          summary={() => (
            <Table.Summary.Row style={{ fontWeight: 700, background: "#f0f5ff" }}>
              <Table.Summary.Cell index={0} colSpan={2}>TỔNG</Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right">{fmtKg(summary.totalQtyKg)}</Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right"><span style={{ color: "#1677ff" }}>{fmtTy(summary.totalRevenueVnd)}</span></Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">{fmtTy(summary.totalVariableCostVnd)}</Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">
                <span style={{ color: summary.totalProfitVnd >= 0 ? "#52c41a" : "#ff4d4f" }}>
                  {fmtTy(summary.totalProfitVnd)}
                </span>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </div>

      {/* Fixed costs */}
      {fixedCosts.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>📌 Chi phí cố định tháng</div>
          <Table
            dataSource={fixedCosts.map((r, i) => ({ ...r, key: i }))}
            columns={[
              { title: "Loại", dataIndex: "label", key: "label" },
              {
                title: "Số tiền (tỷ VNĐ)",
                dataIndex: "amountVnd",
                key: "amountVnd",
                align: "right" as const,
                render: (v: number) => fmtTy(v),
              },
            ]}
            pagination={false}
            size="small"
            style={{ maxWidth: 400 }}
          />
        </div>
      )}
    </div>
  );
}

const DEFAULT_COLORS = [
  "#4CAF50",
  "#2196F3",
  "#FF9800",
  "#9C27B0",
  "#F44336",
  "#00BCD4",
  "#FFEB3B",
  "#E91E63",
  "#3F51B5",
  "#8BC34A",
  "#FF5722",
  "#607D8B",
  "#009688",
  "#795548",
  "#CDDC39",
  "#673AB7",
];

function getItemColor(
  itemId: number,
  itemColors: Record<string, string>,
): string {
  if (itemColors[String(itemId)]) return itemColors[String(itemId)];
  const idx = itemId % DEFAULT_COLORS.length;
  return DEFAULT_COLORS[idx];
}

function daysInMonthFn(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

interface Process {
  id: number;
  name: string;
  factoryId: number;
}

export default function ProductionScheduleDetailClient({
  scheduleId,
}: {
  scheduleId: number;
}) {
  const router = useRouter();

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [summary, setSummary] = useState<SummaryItem[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editSegment, setEditSegment] = useState<Segment | null>(null);
  const [defaultMachineId, setDefaultMachineId] = useState<number | undefined>(
    undefined,
  );
  const [defaultDay, setDefaultDay] = useState<number | undefined>(undefined);
  const [highlightItemId, setHighlightItemId] = useState<number | null>(null);
  const [_actionLoading] = useState(false); // kept for type compat — unused
  const [activeTab, setActiveTab] = useState("plan");
  const [selectedMachineId, setSelectedMachineId] = useState<number | null>(
    null,
  );

  // Actual grid state (lifted from ActualProductionGrid)
  const [actualGrid, setActualGrid] = useState<ActualGrid>({});
  const [actualGridLoaded, setActualGridLoaded] = useState(false);
  const [actualItems, setActualItems] = useState<
    { id: number; name: string }[]
  >([]);
  const [actualMachines, setActualMachines] = useState<
    { id: number; name: string; model?: string | null; processId: number }[]
  >([]);
  const [actualBenchmarkMap, setActualBenchmarkMap] = useState<
    Record<string, number>
  >({});
  const [actualFilterFrom, setActualFilterFrom] = useState<number>(1);
  const [actualFilterTo, setActualFilterTo] = useState<number>(31);

  // Process filter — ActualProductionGrid độc lập với segments
  const [factoryProcesses, setFactoryProcesses] = useState<Process[]>([]);
  const [selectedProcessIds, setSelectedProcessIds] = useState<number[]>([]);

  // ── Drag-resize state ──────────────────────────────────────────────────────
  const DAY_WIDTH = 38; // px — khớp với minWidth ô ngày trong bảng
  const dragStateRef = useRef<{
    segId: number;
    edge: "left" | "right";
    startClientX: number;
    originalFromDay: number;
    originalToDay: number;
  } | null>(null);
  const lastDragRangeRef = useRef<Record<number, { fromDay: number; toDay: number }>>({});
  const [dragPreview, setDragPreview] = useState<
    Record<number, { fromDay: number; toDay: number }>
  >({});

  // ── DT-LN kế hoạch ────────────────────────────────────────────────────────
  const [planPnlData, setPlanPnlData] = useState<PlanPnLResult | null>(null);
  const [planPnlLoading, setPlanPnlLoading] = useState(false);
  const [planPnlError, setPlanPnlError] = useState<string | null>(null);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`/api/kdsx/production-schedule/${scheduleId}`);
      if (!res.ok) {
        message.error("Không tìm thấy kế hoạch");
        return;
      }
      const data = await res.json();
      setSchedule(data);
    } catch {
      message.error("Lỗi tải dữ liệu");
    }
  }, [scheduleId]);

  const fetchSummary = useCallback(async () => {
    const res = await fetch(
      `/api/kdsx/production-schedule/${scheduleId}/summary`,
    );
    if (res.ok) setSummary(await res.json());
  }, [scheduleId]);

  const fetchActualGrid = useCallback(
    async (processIds: number[] = []) => {
      try {
        const queryParam =
          processIds.length > 0 ? `?processIds=${processIds.join(",")}` : "";
        const res = await fetch(
          `/api/kdsx/production-schedule/${scheduleId}/actual${queryParam}`,
        );
        if (res.ok) {
          const data = await res.json();
          setActualGrid(data.grid ?? {});
          setActualItems(data.items ?? []);
          setActualMachines(data.machines ?? []);
          setActualBenchmarkMap(data.benchmarkMap ?? {});
        }
      } catch {
        /* ignore */
      }
      setActualGridLoaded(true);
    },
    [scheduleId],
  );

  // Initial data load — 2 phase:
  // Phase 1 (parallel): schedule, summary, machines, items, processes
  // Phase 2: sau khi có schedule → xác định defaultProcessIds → fetch actual grid
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      try {
        // Phase 1: tất cả dữ liệu cơ sở song song
        const [scheduleRes, summaryRes, machinesRes, itemsRes, processesRes] =
          await Promise.all([
            fetch(`/api/kdsx/production-schedule/${scheduleId}`),
            fetch(`/api/kdsx/production-schedule/${scheduleId}/summary`),
            fetch("/api/machines"),
            fetch("/api/items"),
            fetch("/api/processes"),
          ]);

        if (cancelled) return;

        if (!scheduleRes.ok) {
          message.error("Không tìm thấy kế hoạch");
          return;
        }

        const scheduleData = await scheduleRes.json();
        const summaryData = summaryRes.ok ? await summaryRes.json() : null;
        const machinesRaw = machinesRes.ok ? await machinesRes.json() : null;
        const itemsRaw = itemsRes.ok ? await itemsRes.json() : null;
        const processesRaw = processesRes.ok ? await processesRes.json() : null;

        if (cancelled) return;

        setSchedule(scheduleData);
        setActualFilterTo(daysInMonthFn(scheduleData.yearMonth));
        if (summaryData) setSummary(summaryData);
        setMachines(
          Array.isArray(machinesRaw)
            ? machinesRaw
            : (machinesRaw?.machines ?? []),
        );
        setItems(Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw?.items ?? []));

        // Lọc processes theo factory của schedule này
        const allProcesses: Process[] = Array.isArray(processesRaw)
          ? processesRaw
          : [];
        const factoryProcs = allProcesses.filter(
          (p) => p.factoryId === scheduleData.factoryId,
        );
        setFactoryProcesses(factoryProcs);

        // Mặc định chỉ chọn công đoạn có tên chứa "Đánh ống" (không phân biệt hoa/thường).
        // Người dùng có thể bấm chọn thêm công đoạn khác sau đó.
        const defaultProcessIds: number[] = factoryProcs
          .filter((p) => p.name.toLowerCase().includes("đánh ống"))
          .map((p) => p.id);
        setSelectedProcessIds(defaultProcessIds);

        // Phase 2: fetch actual grid với processIds đã xác định
        const queryParam =
          defaultProcessIds.length > 0
            ? `?processIds=${defaultProcessIds.join(",")}`
            : "";
        const actualRes = await fetch(
          `/api/kdsx/production-schedule/${scheduleId}/actual${queryParam}`,
        );
        if (cancelled) return;

        if (actualRes.ok) {
          const actualData = await actualRes.json();
          setActualGrid(actualData.grid ?? {});
          setActualItems(actualData.items ?? []);
          setActualMachines(actualData.machines ?? []);
          setActualBenchmarkMap(actualData.benchmarkMap ?? {});
        }
        setActualGridLoaded(true);
      } catch {
        message.error("Lỗi tải dữ liệu");
        setActualGridLoaded(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [scheduleId]);

  const refresh = async () => {
    await Promise.all([
      fetchSchedule(),
      fetchSummary(),
      fetchActualGrid(selectedProcessIds),
    ]);
  };

  const handleToggleHoliday = async (day: number) => {
    if (!schedule) return;
    const current: number[] = Array.isArray(schedule.holidays)
      ? (schedule.holidays as number[])
      : [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    const res = await fetch(`/api/kdsx/production-schedule/${scheduleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holidays: next }),
    });
    if (res.ok) {
      setSchedule((prev) => (prev ? { ...prev, holidays: next } : prev));
      await fetchSummary();
    }
  };

  const handleChangeItemColor = async (itemId: number, color: string) => {
    if (!schedule) return;
    const newColors = { ...schedule.itemColors, [String(itemId)]: color };
    // Cập nhật local ngay để UX mượt
    setSchedule((prev) => (prev ? { ...prev, itemColors: newColors } : prev));
    // Lưu lên server (không block)
    await fetch(`/api/kdsx/production-schedule/${scheduleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemColors: newColors }),
    });
  };

  const handleSaveSegment = async (values: any) => {
    const url = editSegment
      ? `/api/kdsx/production-schedule/${scheduleId}/segments/${editSegment.id}`
      : `/api/kdsx/production-schedule/${scheduleId}/segments`;
    const method = editSegment ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json();
    if (!res.ok) {
      message.error(data.error ?? "Lỗi lưu segment");
      throw new Error(data.error);
    }
    if (editSegment) {
      message.success("Đã cập nhật segment");
      setModalOpen(false);
      setEditSegment(null);
      await refresh();
    } else {
      message.success(`Đã thêm segment cho máy #${values.machineId}`);
    }
  };

  const handleAllSaved = async () => {
    setModalOpen(false);
    setEditSegment(null);
    await refresh();
  };

  const handleDeleteSegment = async (segId: number) => {
    const res = await fetch(
      `/api/kdsx/production-schedule/${scheduleId}/segments/${segId}`,
      { method: "DELETE" },
    );
    const data = await res.json();
    if (!res.ok) message.error(data.error ?? "Lỗi xóa segment");
    else {
      message.success("Đã xóa segment");
      await refresh();
    }
  };

  // ── Drag-resize helpers ────────────────────────────────────────────────────
  function computeDragRange(clientX: number) {
    const ds = dragStateRef.current;
    if (!ds) return null;
    const deltaDays = Math.round((clientX - ds.startClientX) / DAY_WIDTH);
    if (ds.edge === "left") {
      const newFrom = Math.max(1, Math.min(ds.originalFromDay + deltaDays, ds.originalToDay));
      return { fromDay: newFrom, toDay: ds.originalToDay };
    } else {
      const newTo = Math.min(
        schedule?.yearMonth ? daysInMonthFn(schedule.yearMonth) : 31,
        Math.max(ds.originalToDay + deltaDays, ds.originalFromDay),
      );
      return { fromDay: ds.originalFromDay, toDay: newTo };
    }
  }

  function getEffectiveSeg(machineId: number, day: number): Segment | undefined {
    const segs = (schedule?.segments ?? []).filter((s) => s.machineId === machineId);
    for (const s of segs) {
      const preview = dragPreview[s.id];
      const from = preview ? preview.fromDay : s.fromDay;
      const to = preview ? preview.toDay : s.toDay;
      if (day >= from && day <= to) return s;
    }
    return undefined;
  }

  function hasOverlapPreview(machineId: number, segId: number, fromDay: number, toDay: number): boolean {
    return (schedule?.segments ?? []).some(
      (s) => s.machineId === machineId && s.id !== segId &&
        fromDay <= s.toDay && toDay >= s.fromDay,
    );
  }

  function handleHandlePointerDown(
    e: React.PointerEvent,
    segId: number,
    edge: "left" | "right",
  ) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const seg = schedule!.segments.find((s) => s.id === segId)!;
    dragStateRef.current = {
      segId,
      edge,
      startClientX: e.clientX,
      originalFromDay: seg.fromDay,
      originalToDay: seg.toDay,
    };
  }

  function handleHandlePointerMove(e: React.PointerEvent, segId: number) {
    if (!dragStateRef.current || dragStateRef.current.segId !== segId) return;
    const newRange = computeDragRange(e.clientX);
    if (!newRange) return;
    const prev = lastDragRangeRef.current[segId];
    if (!prev || prev.fromDay !== newRange.fromDay || prev.toDay !== newRange.toDay) {
      lastDragRangeRef.current[segId] = newRange;
      setDragPreview((p) => ({ ...p, [segId]: newRange }));
    }
  }

  async function handleHandlePointerUp(e: React.PointerEvent, segId: number) {
    const ds = dragStateRef.current;
    if (!ds || ds.segId !== segId) return;
    const finalRange = computeDragRange(e.clientX);
    dragStateRef.current = null;
    delete lastDragRangeRef.current[segId];

    if (!finalRange || (finalRange.fromDay === ds.originalFromDay && finalRange.toDay === ds.originalToDay)) {
      setDragPreview((p) => { const n = { ...p }; delete n[segId]; return n; });
      return;
    }

    const seg = schedule!.segments.find((s) => s.id === segId)!;
    if (hasOverlapPreview(seg.machineId, segId, finalRange.fromDay, finalRange.toDay)) {
      message.warning("Khoảng ngày bị chồng với segment khác trên cùng máy");
      setDragPreview((p) => { const n = { ...p }; delete n[segId]; return n; });
      return;
    }

    const res = await fetch(
      `/api/kdsx/production-schedule/${scheduleId}/segments/${segId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDay: finalRange.fromDay, toDay: finalRange.toDay }),
      },
    );
    setDragPreview((p) => { const n = { ...p }; delete n[segId]; return n; });
    if (!res.ok) {
      const data = await res.json();
      message.error(data.error ?? "Lỗi cập nhật khoảng ngày");
    } else {
      message.success("Đã cập nhật khoảng ngày");
      await refresh();
    }
  }

  function handleDragCancel(segId: number) {
    dragStateRef.current = null;
    delete lastDragRangeRef.current[segId];
    setDragPreview((p) => { const n = { ...p }; delete n[segId]; return n; });
  }

  // ── Plan PnL fetch ─────────────────────────────────────────────────────────
  const fetchPlanPnl = useCallback(async () => {
    if (planPnlData || planPnlLoading) return; // Already loaded/loading
    setPlanPnlLoading(true);
    setPlanPnlError(null);
    try {
      const res = await fetch(`/api/kdsx/production-schedule/${scheduleId}/plan-pnl`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi tải DT-LN kế hoạch");
      setPlanPnlData(data);
    } catch (err: unknown) {
      setPlanPnlError(err instanceof Error ? err.message : "Lỗi tải dữ liệu");
    } finally {
      setPlanPnlLoading(false);
    }
  }, [scheduleId, planPnlData, planPnlLoading]);

  if (loading)
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  if (!schedule) return <div>Không tìm thấy kế hoạch.</div>;

  const { yearMonth, factory, holidays } = schedule;
  const itemColors = (schedule.itemColors ?? {}) as Record<string, string>;
  const holidayArr: number[] = Array.isArray(holidays)
    ? (holidays as number[])
    : [];
  const totalDays = daysInMonthFn(yearMonth);
  const [schedYear, schedMonth] = yearMonth.split("-").map(Number);
  const dayNumbers = Array.from({ length: totalDays }, (_, i) => i + 1);

  // Helper màu dùng itemColors từ schedule
  function getColor(itemId: number): string {
    return getItemColor(itemId, itemColors);
  }
  function getBg(itemId: number): string {
    return getColor(itemId) + "33";
  }
  function getBorder(itemId: number): string {
    return getColor(itemId) + "AA";
  }

  // Nhóm segments theo máy
  const segsByMachine = new Map<number, Segment[]>();
  for (const seg of schedule.segments) {
    if (!segsByMachine.has(seg.machineId)) segsByMachine.set(seg.machineId, []);
    segsByMachine.get(seg.machineId)!.push(seg);
  }

  // Tổng kg toàn tháng theo ngày (trừ nghỉ)
  const totalKgByDay = dayNumbers.map((day) => {
    if (holidayArr.includes(day)) return 0;
    let total = 0;
    for (const seg of schedule.segments) {
      if (day >= seg.fromDay && day <= seg.toDay) total += seg.kgPerDay;
    }
    return total;
  });

  // Lấy danh sách máy unique, theo thứ tự id
  const uniqueMachines = Array.from(
    new Map(schedule.segments.map((s) => [s.machineId, s.machine])).values(),
  ).sort((a, b) => a.id - b.id);

  // Chỉ hiển thị máy đã có segment trong KH
  const allMachines = uniqueMachines.map((m) => ({
    id: m.id,
    name: m.name,
    model: m.model ?? null,
    processId: m.processId,
  }));

  const grandTotal = summary.reduce((s, i) => s + i.totalKg, 0);

  // ---- Actual Summary by Item (filtered by date range) ----
  // Clamp filter to valid range
  const filterFrom = Math.max(1, Math.min(actualFilterFrom, totalDays));
  const filterTo = Math.max(filterFrom, Math.min(actualFilterTo, totalDays));

  // Collect all itemIds từ segments + actualItems (từ actual grid API)
  // → khi không có segments, vẫn lấy được itemIds từ dữ liệu thực tế
  const allItemIds = Array.from(
    new Set([
      ...schedule.segments.map((s) => s.itemId),
      ...actualItems.map((i) => i.id),
    ]),
  );
  const itemMap = new Map<number, string>([
    ...schedule.segments.map(
      (s) => [s.itemId, s.item.name] as [number, string],
    ),
    ...actualItems.map((i) => [i.id, i.name] as [number, string]),
  ]);

  // For each item, sum actual kg from grid within [filterFrom, filterTo]
  // Xác định ngày nào đã có data thực tế (toàn bộ grid)
  const daysWithActualDataGlobal = new Set<number>();
  for (const mid of Object.keys(actualGrid).map(Number)) {
    for (const dayStr of Object.keys(actualGrid[mid] ?? {})) {
      const day = parseInt(dayStr);
      const dayData = actualGrid[mid][day];
      if (dayData && Object.values(dayData).some((kg) => kg > 0)) {
        daysWithActualDataGlobal.add(day);
      }
    }
  }

  const actualSummaryByItem = allItemIds
    .map((itemId) => {
      // Lấy machineIds từ cả segments (KH) lẫn actualGrid (TH)
      // → khi không có segments, vẫn tìm được máy nào thực sự có sản lượng item này
      const machineIdsFromGrid = Object.keys(actualGrid)
        .map(Number)
        .filter((machineId) =>
          Object.values(actualGrid[machineId] ?? {}).some(
            (dayData) => (dayData[itemId] ?? 0) > 0,
          ),
        );
      const machineIds = Array.from(
        new Set([
          ...schedule.segments
            .filter((s) => s.itemId === itemId)
            .map((s) => s.machineId),
          ...machineIdsFromGrid,
        ]),
      );
      let totalActualKg = 0; // CHỈ sản lượng thực tế
      let totalProjectedKg = 0; // Thực tế + giả định (benchmark fill)

      for (const machineId of machineIds) {
        const machineGrid = actualGrid[machineId] ?? {};
        const bmKey = `${machineId}-${itemId}`;
        const bmKg = actualBenchmarkMap[bmKey] ?? 0;

        let lastDay = 0;
        for (const dayStr of Object.keys(machineGrid)) {
          const day = parseInt(dayStr);
          if ((machineGrid[day]?.[itemId] ?? 0) > 0 && day > lastDay)
            lastDay = day;
        }

        // Tìm maxLastDay của tất cả item trên máy này để xác định dòng cuối
        let maxLastDayOfMachine = 0;
        for (const iid of allItemIds) {
          for (const dayStr of Object.keys(machineGrid)) {
            const d = parseInt(dayStr);
            if ((machineGrid[d]?.[iid] ?? 0) > 0 && d > maxLastDayOfMachine)
              maxLastDayOfMachine = d;
          }
        }
        const isLastItemOfMachine =
          lastDay > 0 && lastDay === maxLastDayOfMachine;

        for (let day = filterFrom; day <= filterTo; day++) {
          if (holidayArr.includes(day)) continue;
          const actual = machineGrid[day]?.[itemId] ?? 0;
          if (actual > 0) {
            totalActualKg += actual;
            totalProjectedKg += actual;
          } else if (
            bmKg > 0 &&
            !daysWithActualDataGlobal.has(day) &&
            lastDay > 0 &&
            day > lastDay &&
            isLastItemOfMachine
          ) {
            totalProjectedKg += bmKg; // chỉ cộng vào giả định
          }
        }
      }
      return {
        itemId,
        itemName: itemMap.get(itemId) ?? `Item ${itemId}`,
        totalActualKg,
        totalProjectedKg,
        totalActualTons: totalActualKg / 1000,
        totalProjectedTons: totalProjectedKg / 1000,
      };
    })
    .filter(
      (a) => a.totalActualKg > 0 || a.totalProjectedKg > 0 || actualGridLoaded,
    );

  const grandActualTotal = actualSummaryByItem.reduce(
    (s, a) => s + a.totalActualKg,
    0,
  );
  const grandProjectedTotal = actualSummaryByItem.reduce(
    (s, a) => s + a.totalProjectedKg,
    0,
  );
  const isFullMonth = filterFrom === 1 && filterTo === totalDays;

  const thStyle: React.CSSProperties = {
    background: "#001529",
    color: "white",
    padding: "7px 5px",
    textAlign: "center",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 2,
    borderBottom: "2px solid #1d3557",
    borderRight: "1px solid #1d3557",
  };
  const tdStyle: React.CSSProperties = {
    padding: "5px 5px",
    textAlign: "center",
    fontSize: 12,
    whiteSpace: "nowrap",
    borderRight: "1px solid #9e9e9e",
    borderBottom: "1px solid #bdbdbd",
  };

  // Grid Kế hoạch (tab 1)
  const planGrid = (
    <div>
      {/* Holiday hint */}
      <div style={{ marginBottom: 8, fontSize: 12, color: "#888" }}>
        💡 Click vào tên ngày (header) để đánh dấu ngày nghỉ lễ. Ngày nghỉ:{" "}
        {holidayArr.length > 0
          ? holidayArr.map((d) => `${d}/${schedMonth}`).join(", ")
          : "Chưa có"}
      </div>

      <div
        style={{
          overflowX: "auto",
          border: "2px solid #b0b0b0",
          borderRadius: 6,
          boxShadow: "0 1px 6px rgba(0,0,0,0.1)",
        }}
      >
        <table
          style={{
            borderCollapse: "collapse",
            minWidth: 900,
            width: "max-content",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  ...thStyle,
                  minWidth: 80,
                  position: "sticky",
                  left: 0,
                  zIndex: 3,
                  textAlign: "left",
                  paddingLeft: 8,
                }}
              >
                Máy
              </th>
              <th
                style={{
                  ...thStyle,
                  minWidth: 100,
                  position: "sticky",
                  left: 80,
                  zIndex: 3,
                }}
              >
                Mặt hàng
              </th>
              {dayNumbers.map((day) => {
                const isHoliday = holidayArr.includes(day);
                return (
                  <th
                    key={day}
                    style={{
                      ...thStyle,
                      minWidth: 38,
                      cursor: "pointer",
                      background: isHoliday ? "#cf1322" : "#001529",
                      color: isHoliday ? "#fff" : "white",
                      userSelect: "none",
                    }}
                    onClick={() => handleToggleHoliday(day)}
                    title={
                      isHoliday ? "Bỏ đánh dấu nghỉ" : "Đánh dấu ngày nghỉ"
                    }
                  >
                    {day}
                    <br />
                    <span
                      style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}
                    >
                      {schedMonth}/{String(schedYear).slice(2)}
                    </span>
                  </th>
                );
              })}
              <th style={{ ...thStyle, minWidth: 70, background: "#1d3557" }}>
                TỔNG
              </th>
            </tr>
          </thead>
          <tbody>
            {allMachines.map((machine, mIdx) => {
              const machineSegs = segsByMachine.get(machine.id) ?? [];
              const highlighted =
                highlightItemId !== null &&
                machineSegs.some((s) => s.itemId === highlightItemId);

              let machineTotalKg = 0;
              for (const seg of machineSegs) {
                let days = seg.toDay - seg.fromDay + 1;
                const hols = holidayArr.filter(
                  (h) => h >= seg.fromDay && h <= seg.toDay,
                ).length;
                days = Math.max(0, days - hols);
                machineTotalKg += days * seg.kgPerDay;
              }

              const isRowSelected = selectedMachineId === machine.id;
              const rowBg = isRowSelected
                ? "#fffbe6"
                : mIdx % 2 === 0
                  ? "#fff"
                  : "#fafafa";

              return (
                <tr
                  key={machine.id}
                  style={{
                    background: rowBg,
                    cursor: "pointer",
                    outline: isRowSelected ? "2px solid #faad14" : undefined,
                    outlineOffset: isRowSelected ? "-2px" : undefined,
                  }}
                  onClick={() =>
                    setSelectedMachineId((prev) =>
                      prev === machine.id ? null : machine.id,
                    )
                  }
                >
                  {/* Máy */}
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "left",
                      paddingLeft: 8,
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      background: rowBg,
                      minWidth: 80,
                      fontWeight: isRowSelected ? 800 : 600,
                      color: isRowSelected ? "#d48806" : undefined,
                    }}
                  >
                    {machine.name}
                    {machine.model && (
                      <div
                        style={{ fontSize: 10, color: "#888", fontWeight: 400 }}
                      >
                        {machine.model}
                      </div>
                    )}
                  </td>

                  {/* Mặt hàng + color picker */}
                  <td
                    style={{
                      ...tdStyle,
                      position: "sticky",
                      left: 80,
                      zIndex: 1,
                      background: rowBg,
                      minWidth: 100,
                    }}
                  >
                    {machineSegs.length > 0 ? (
                      machineSegs.map((s) => (
                        <div
                          key={s.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            marginBottom: 1,
                          }}
                        >
                          <input
                            type="color"
                            value={getColor(s.itemId)}
                            onChange={(e) =>
                              handleChangeItemColor(s.itemId, e.target.value)
                            }
                            style={{
                              width: 14,
                              height: 14,
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                              borderRadius: 2,
                            }}
                            title="Đổi màu mặt hàng"
                          />
                          <span
                            style={{
                              color: getColor(s.itemId),
                              fontWeight: 600,
                              fontSize: 11,
                            }}
                          >
                            {s.item.name} ({s.fromDay}–{s.toDay})
                          </span>
                        </div>
                      ))
                    ) : (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        —
                      </Text>
                    )}
                  </td>

                  {/* Ô ngày */}
                  {dayNumbers.map((day) => {
                    const isHoliday = holidayArr.includes(day);
                    const seg = getEffectiveSeg(machine.id, day);
                    const dimmed =
                      highlightItemId !== null &&
                      seg &&
                      seg.itemId !== highlightItemId;

                    // Effective boundaries (may differ during drag preview)
                    const effFrom = seg ? (dragPreview[seg.id]?.fromDay ?? seg.fromDay) : seg;
                    const effTo = seg ? (dragPreview[seg.id]?.toDay ?? seg.toDay) : seg;
                    const isFromDay = seg && day === effFrom;
                    const isToDay = seg && day === effTo;

                    return (
                      <td
                        key={day}
                        style={{
                          ...tdStyle,
                          position: "relative",
                          background: isHoliday
                            ? "#ffebe8"
                            : seg
                              ? getBg(seg.itemId)
                              : undefined,
                          opacity: dimmed ? 0.25 : 1,
                          cursor: "pointer",
                          borderLeft: isFromDay
                            ? `2px solid ${getBorder(seg!.itemId)}`
                            : "1px solid #d0d0d0",
                          borderRight: isToDay
                            ? `2px solid ${getBorder(seg!.itemId)}`
                            : "1px solid #d0d0d0",
                        }}
                        onClick={() => {
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
                        title={
                          seg
                            ? `${seg.item.name}: ${seg.kgPerDay.toLocaleString()} kg/ngày (Click để sửa | Kéo cạnh để co giãn)`
                            : "Click để thêm segment"
                        }
                      >
                        {/* Drag handle — cạnh trái (fromDay) */}
                        {seg && isFromDay && (
                          <div
                            style={{
                              position: "absolute",
                              top: 0, left: 0, bottom: 0, width: 8,
                              cursor: "ew-resize",
                              zIndex: 5,
                              borderRadius: "2px 0 0 2px",
                            }}
                            onPointerDown={(e) => handleHandlePointerDown(e, seg.id, "left")}
                            onPointerMove={(e) => handleHandlePointerMove(e, seg.id)}
                            onPointerUp={(e) => handleHandlePointerUp(e, seg.id)}
                            onPointerCancel={() => handleDragCancel(seg.id)}
                          />
                        )}
                        {/* Drag handle — cạnh phải (toDay) */}
                        {seg && isToDay && (
                          <div
                            style={{
                              position: "absolute",
                              top: 0, right: 0, bottom: 0, width: 8,
                              cursor: "ew-resize",
                              zIndex: 5,
                              borderRadius: "0 2px 2px 0",
                            }}
                            onPointerDown={(e) => handleHandlePointerDown(e, seg.id, "right")}
                            onPointerMove={(e) => handleHandlePointerMove(e, seg.id)}
                            onPointerUp={(e) => handleHandlePointerUp(e, seg.id)}
                            onPointerCancel={() => handleDragCancel(seg.id)}
                          />
                        )}
                        {isHoliday ? (
                          <span style={{ color: "#aaa", fontSize: 11 }}>—</span>
                        ) : seg ? (
                          <span
                            style={{
                              color: getColor(seg.itemId),
                              fontSize: 11,
                              fontWeight: 800,
                            }}
                          >
                            {seg.kgPerDay.toLocaleString()}
                          </span>
                        ) : (
                          <span
                            style={{
                              color: "#bbb",
                              fontSize: 13,
                              lineHeight: 1,
                            }}
                          >
                            ·
                          </span>
                        )}
                      </td>
                    );
                  })}

                  {/* Tổng kg máy */}
                  <td
                    style={{
                      ...tdStyle,
                      background: "#dbeeff",
                      fontWeight: 800,
                      fontSize: 13,
                      color: "#0050b3",
                      borderLeft: "2px solid #b0b0b0",
                    }}
                  >
                    {machineTotalKg > 0 ? (
                      `${machineTotalKg.toLocaleString()} kg`
                    ) : (
                      <span style={{ color: "#bbb" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Hàng cuối: tổng theo ngày */}
            <tr style={{ background: "#001529" }}>
              <td
                style={{
                  ...tdStyle,
                  color: "white",
                  fontWeight: 700,
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                  background: "#001529",
                  textAlign: "left",
                  paddingLeft: 8,
                }}
              >
                TỔNG
              </td>
              <td
                style={{
                  ...tdStyle,
                  color: "white",
                  position: "sticky",
                  left: 80,
                  zIndex: 1,
                  background: "#001529",
                }}
              >
                kg/ngày
              </td>
              {totalKgByDay.map((kg, i) => {
                const day = i + 1;
                const isHoliday = holidayArr.includes(day);
                return (
                  <td
                    key={day}
                    style={{
                      ...tdStyle,
                      fontWeight: 600,
                      fontSize: 10,
                      background: isHoliday ? "#434343" : "#1d3557",
                      color: isHoliday ? "#888" : "#52c41a",
                    }}
                  >
                    {isHoliday
                      ? "—"
                      : kg > 0
                        ? `${kg.toLocaleString()} kg`
                        : "·"}
                  </td>
                );
              })}
              <td
                style={{
                  ...tdStyle,
                  background: "#1d3557",
                  color: "#52c41a",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                {grandTotal.toLocaleString()} kg
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  // RENDER PLAN/ACTUAL GRID
  return (
    <div>
      {/* Breadcrumb & Header */}
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb
          items={[
            {
              title: (
                <a onClick={() => router.push("/kdsx/production-schedule")}>
                  Kế hoạch SX
                </a>
              ),
            },
            { title: `${factory.name} / Tháng ${schedMonth}/${schedYear}` },
          ]}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => router.push("/kdsx/production-schedule")}
          />
          <Title level={4} style={{ margin: 0 }}>
            KẾ HOẠCH SẢN XUẤT — {factory.name} — Tháng {schedMonth}/{schedYear}
          </Title>
        </div>

        <Space wrap>
          <Button
            type="dashed"
            icon={<span>+</span>}
            onClick={() => {
              setEditSegment(null);
              setDefaultMachineId(undefined);
              setDefaultDay(undefined);
              setModalOpen(true);
            }}
          >
            Thêm segment
          </Button>
        </Space>
      </div>

      {/* ===== Summary Comparison Table: KH vs TH ===== */}
      {(() => {
        // Build unified column list: all items from summary (plan), union with actual items
        const planMap = new Map(summary.map((s) => [s.itemId, s]));
        // All item IDs: plan items first, then any actual-only items
        const allColIds: number[] = [
          ...summary.map((s) => s.itemId),
          ...actualSummaryByItem
            .filter((a) => !planMap.has(a.itemId))
            .map((a) => a.itemId),
        ];
        const actualMap = new Map(
          actualSummaryByItem.map((a) => [a.itemId, a]),
        );

        // Grand totals
        const grandPlanKg = grandTotal;
        const grandActualKg = grandActualTotal;
        const grandRatio =
          grandPlanKg > 0 ? (grandActualKg / grandPlanKg) * 100 : null;

        const CARD_W = 140; // px fixed width per item column
        const LABEL_W = 80; // px for row-label column

        const rowLabelStyle: React.CSSProperties = {
          width: LABEL_W,
          minWidth: LABEL_W,
          maxWidth: LABEL_W,
          fontWeight: 700,
          fontSize: 11,
          color: "#555",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          padding: "0 8px 0 0",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        };
        const colStyle = (
          itemId: number,
          isTotalCol = false,
        ): React.CSSProperties => ({
          width: CARD_W,
          minWidth: CARD_W,
          maxWidth: CARD_W,
          flexShrink: 0,
          borderRadius: isTotalCol ? 8 : 6,
          background: isTotalCol ? "transparent" : getBg(itemId),
          border: isTotalCol ? "none" : `1.5px solid ${getBorder(itemId)}`,
          padding: "6px 10px",
          boxSizing: "border-box",
        });
        const totalColStyle: React.CSSProperties = {
          width: CARD_W,
          minWidth: CARD_W,
          maxWidth: CARD_W,
          flexShrink: 0,
          borderRadius: 8,
          padding: "6px 10px",
          boxSizing: "border-box",
        };

        // Ratio badge color
        function ratioBadge(ratio: number | null) {
          if (ratio === null) return { color: "#aaa", label: "—" };
          const pct = ratio.toFixed(1) + "%";
          if (ratio >= 100) return { color: "#389e0d", label: pct };
          if (ratio >= 90) return { color: "#d46b08", label: pct };
          return { color: "#cf1322", label: pct };
        }

        return (
          <div style={{ marginBottom: 16 }}>
            {/* Section header + date filter */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#1d3557",
                  letterSpacing: 0.5,
                }}
              >
                📊 So sánh Sản lượng KH / TH
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 12,
                }}
              >
                <FilterOutlined style={{ color: "#389e0d" }} />
                <span style={{ color: "#555" }}>TH từ ngày</span>
                <InputNumber
                  min={1}
                  max={totalDays}
                  value={actualFilterFrom}
                  size="small"
                  style={{ width: 54 }}
                  onChange={(v) => setActualFilterFrom(v ?? 1)}
                />
                <span style={{ color: "#555" }}>→</span>
                <InputNumber
                  min={1}
                  max={totalDays}
                  value={actualFilterTo}
                  size="small"
                  style={{ width: 54 }}
                  onChange={(v) => setActualFilterTo(v ?? totalDays)}
                />
                <Button
                  size="small"
                  type="link"
                  style={{ padding: "0 2px", fontSize: 11, color: "#389e0d" }}
                  onClick={() => {
                    setActualFilterFrom(1);
                    setActualFilterTo(totalDays);
                  }}
                >
                  Cả tháng
                </Button>
                {!isFullMonth && (
                  <span
                    style={{ fontSize: 11, color: "#fa8c16", fontWeight: 600 }}
                  >
                    (Ngày {filterFrom}–{filterTo}/{schedMonth})
                  </span>
                )}
              </div>
            </div>

            {/* Comparison table */}
            <div
              style={{
                overflowX: "auto",
                background: "#fff",
                border: "1.5px solid #d9d9d9",
                borderRadius: 10,
                boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
                padding: "10px 12px",
              }}
            >
              {/* ---- Row: Item name headers ---- */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 6,
                  alignItems: "stretch",
                }}
              >
                <div style={{ ...rowLabelStyle, color: "transparent" }}>——</div>
                {allColIds.map((itemId) => {
                  const name =
                    planMap.get(itemId)?.itemName ??
                    actualMap.get(itemId)?.itemName ??
                    `#${itemId}`;
                  const isHighlighted = highlightItemId === itemId;
                  return (
                    <div
                      key={itemId}
                      style={{
                        width: CARD_W,
                        minWidth: CARD_W,
                        maxWidth: CARD_W,
                        flexShrink: 0,
                        textAlign: "center",
                        fontWeight: 800,
                        fontSize: 13,
                        color: getColor(itemId),
                        cursor: "pointer",
                        padding: "4px 6px",
                        borderRadius: 6,
                        background: isHighlighted ? getBg(itemId) : undefined,
                        border: isHighlighted
                          ? `2px solid ${getBorder(itemId)}`
                          : "2px solid transparent",
                        transition: "all 0.15s",
                        userSelect: "none",
                      }}
                      onClick={() =>
                        setHighlightItemId((prev) =>
                          prev === itemId ? null : itemId,
                        )
                      }
                      title="Click để highlight dòng sợi"
                    >
                      {name}
                    </div>
                  );
                })}
                {/* Total header */}
                <div
                  style={{
                    width: CARD_W,
                    minWidth: CARD_W,
                    maxWidth: CARD_W,
                    flexShrink: 0,
                    textAlign: "center",
                    fontWeight: 800,
                    fontSize: 13,
                    color: "#fff",
                    background: "#001529",
                    borderRadius: 6,
                    padding: "4px 6px",
                  }}
                >
                  TỔNG
                </div>
              </div>

              {/* Divider */}
              <div
                style={{ height: 1, background: "#e8e8e8", marginBottom: 6 }}
              />

              {/* ---- Row: KH (Plan) ---- */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 6,
                  alignItems: "stretch",
                }}
              >
                <div
                  style={{
                    ...rowLabelStyle,
                    background: "#f0f5ff",
                    border: "1px solid #adc6ff",
                    borderRadius: 6,
                    color: "#1d39c4",
                    padding: "4px 8px",
                    justifyContent: "center",
                    textAlign: "center",
                  }}
                >
                  📋 KẾ HOẠCH
                </div>
                {allColIds.map((itemId) => {
                  const plan = planMap.get(itemId);
                  return (
                    <div
                      key={itemId}
                      style={{ ...colStyle(itemId), textAlign: "center" }}
                    >
                      {plan ? (
                        <>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 800,
                              color: "#003a8c",
                            }}
                          >
                            {plan.totalTons.toFixed(1)} tấn
                          </div>
                          <div style={{ fontSize: 10, color: "#555" }}>
                            {plan.totalKg.toLocaleString()} kg
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "#ccc", fontSize: 12 }}>—</span>
                      )}
                    </div>
                  );
                })}
                {/* Plan total */}
                <div
                  style={{
                    ...totalColStyle,
                    background: "#001529",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{ fontSize: 15, fontWeight: 800, color: "#52c41a" }}
                  >
                    {(grandPlanKg / 1000).toFixed(1)} tấn
                  </div>
                  <div style={{ fontSize: 10, color: "#aaa" }}>
                    {grandPlanKg.toLocaleString()} kg
                  </div>
                </div>
              </div>

              {/* ---- Row: TH (Actual) ---- */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 6,
                  alignItems: "stretch",
                }}
              >
                <div
                  style={{
                    ...rowLabelStyle,
                    background: "#f6ffed",
                    border: "1px solid #b7eb8f",
                    borderRadius: 6,
                    color: "#237804",
                    padding: "4px 8px",
                    justifyContent: "center",
                    textAlign: "center",
                  }}
                >
                  {!actualGridLoaded ? <Spin size="small" /> : "📊 THỰC HIỆN"}
                </div>
                {allColIds.map((itemId) => {
                  const act = actualMap.get(itemId);
                  return (
                    <div
                      key={itemId}
                      style={{ ...colStyle(itemId), textAlign: "center" }}
                    >
                      {!actualGridLoaded ? (
                        <Spin size="small" />
                      ) : act && act.totalActualKg > 0 ? (
                        <>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 800,
                              color: "#237804",
                            }}
                          >
                            {act.totalActualTons.toFixed(2)} tấn
                          </div>
                          <div style={{ fontSize: 10, color: "#555" }}>
                            {act.totalActualKg.toLocaleString()} kg
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "#ccc", fontSize: 12 }}>—</span>
                      )}
                    </div>
                  );
                })}
                {/* Actual total */}
                <div
                  style={{
                    ...totalColStyle,
                    background: "#135200",
                    textAlign: "center",
                  }}
                >
                  {actualGridLoaded ? (
                    <>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: "#95de64",
                        }}
                      >
                        {(grandActualKg / 1000).toFixed(2)} tấn
                      </div>
                      <div style={{ fontSize: 10, color: "#b7eb8f" }}>
                        {grandActualKg.toLocaleString()} kg
                      </div>
                    </>
                  ) : (
                    <Spin size="small" />
                  )}
                </div>
              </div>

              {/* ---- Row: GIẢ ĐỊNH (Actual + Benchmark fill) ---- */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 6,
                  alignItems: "stretch",
                }}
              >
                <div
                  style={{
                    ...rowLabelStyle,
                    background: "#f0f0f0",
                    border: "1px solid #d9d9d9",
                    borderRadius: 6,
                    color: "#595959",
                    padding: "4px 8px",
                    justifyContent: "center",
                    textAlign: "center",
                    fontStyle: "italic",
                  }}
                >
                  🔮 GIẢ ĐỊNH
                </div>
                {allColIds.map((itemId) => {
                  const act = actualMap.get(itemId);
                  return (
                    <div
                      key={itemId}
                      style={{
                        ...colStyle(itemId),
                        textAlign: "center",
                        opacity: 0.8,
                      }}
                    >
                      {!actualGridLoaded ? (
                        <Spin size="small" />
                      ) : act && act.totalProjectedKg > 0 ? (
                        <>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 800,
                              color: "#595959",
                              fontStyle: "italic",
                            }}
                          >
                            {act.totalProjectedTons.toFixed(2)} tấn
                          </div>
                          <div style={{ fontSize: 10, color: "#888" }}>
                            {act.totalProjectedKg.toLocaleString()} kg
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "#ccc", fontSize: 12 }}>—</span>
                      )}
                    </div>
                  );
                })}
                <div
                  style={{
                    ...totalColStyle,
                    background: "#434343",
                    textAlign: "center",
                  }}
                >
                  {actualGridLoaded ? (
                    <>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: "#d9d9d9",
                          fontStyle: "italic",
                        }}
                      >
                        {(grandProjectedTotal / 1000).toFixed(2)} tấn
                      </div>
                      <div style={{ fontSize: 10, color: "#aaa" }}>
                        {grandProjectedTotal.toLocaleString()} kg
                      </div>
                    </>
                  ) : (
                    <Spin size="small" />
                  )}
                </div>
              </div>

              {/* ---- Row: % GĐ/KH ---- */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 6,
                  alignItems: "stretch",
                }}
              >
                <div
                  style={{
                    ...rowLabelStyle,
                    background: "#f5f5f5",
                    border: "1px solid #e8e8e8",
                    borderRadius: 6,
                    color: "#888",
                    padding: "4px 8px",
                    justifyContent: "center",
                    textAlign: "center",
                    fontStyle: "italic",
                    fontSize: 10,
                  }}
                >
                  % GĐ/KH
                </div>
                {allColIds.map((itemId) => {
                  const plan = planMap.get(itemId);
                  const act = actualMap.get(itemId);
                  const planKg = plan?.totalKg ?? 0;
                  const projKg = act?.totalProjectedKg ?? 0;
                  const ratio = planKg > 0 ? (projKg / planKg) * 100 : null;
                  const badge = ratioBadge(ratio);
                  return (
                    <div
                      key={itemId}
                      style={{
                        ...colStyle(itemId),
                        textAlign: "center",
                        opacity: 0.8,
                        background:
                          ratio === null
                            ? "#fafafa"
                            : ratio >= 100
                              ? "#f6ffed"
                              : ratio >= 90
                                ? "#fffbe6"
                                : "#fff1f0",
                        border: `1px dashed ${ratio === null ? "#e8e8e8" : ratio >= 100 ? "#b7eb8f" : ratio >= 90 ? "#ffe58f" : "#ffa39e"}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: badge.color,
                          fontStyle: "italic",
                        }}
                      >
                        {badge.label}
                      </div>
                    </div>
                  );
                })}
                <div
                  style={{
                    ...totalColStyle,
                    background: "#2a2a2a",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      fontStyle: "italic",
                      color: ratioBadge(
                        grandPlanKg > 0
                          ? (grandProjectedTotal / grandPlanKg) * 100
                          : null,
                      ).color,
                    }}
                  >
                    {
                      ratioBadge(
                        grandPlanKg > 0
                          ? (grandProjectedTotal / grandPlanKg) * 100
                          : null,
                      ).label
                    }
                  </div>
                </div>
              </div>

              {/* ---- Row: Tỉ lệ TH/KH ---- */}
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <div
                  style={{
                    ...rowLabelStyle,
                    background: "#fffbe6",
                    border: "1px solid #ffe58f",
                    borderRadius: 6,
                    color: "#874d00",
                    padding: "4px 8px",
                    justifyContent: "center",
                    textAlign: "center",
                  }}
                >
                  % TH/KH
                </div>
                {allColIds.map((itemId) => {
                  const plan = planMap.get(itemId);
                  const act = actualMap.get(itemId);
                  const planKg = plan?.totalKg ?? 0;
                  const actKg = act?.totalActualKg ?? 0;
                  const ratio = planKg > 0 ? (actKg / planKg) * 100 : null;
                  const badge = ratioBadge(ratio);
                  return (
                    <div
                      key={itemId}
                      style={{
                        ...colStyle(itemId),
                        textAlign: "center",
                        background:
                          ratio === null
                            ? "#fafafa"
                            : ratio >= 100
                              ? "#f6ffed"
                              : ratio >= 90
                                ? "#fffbe6"
                                : "#fff1f0",
                        border: `1.5px solid ${ratio === null ? "#e8e8e8" : ratio >= 100 ? "#b7eb8f" : ratio >= 90 ? "#ffe58f" : "#ffa39e"}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: badge.color,
                        }}
                      >
                        {badge.label}
                      </div>
                    </div>
                  );
                })}
                {/* Grand ratio */}
                <div
                  style={{
                    ...totalColStyle,
                    background:
                      grandRatio === null
                        ? "#2a2a2a"
                        : grandRatio >= 100
                          ? "#092b00"
                          : grandRatio >= 90
                            ? "#613400"
                            : "#5c0011",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: ratioBadge(grandRatio).color,
                    }}
                  >
                    {ratioBadge(grandRatio).label}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tabs: Kế hoạch / Thực hiện / So sánh / DT-LN */}
      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key);
          if (key === "plan-pnl") fetchPlanPnl();
        }}
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
              <div>
                {/* Process selector — độc lập với planGrid */}
                <div
                  style={{
                    marginBottom: 12,
                    padding: "8px 12px",
                    background: "#f6ffed",
                    border: "1px solid #b7eb8f",
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#237804",
                      whiteSpace: "nowrap",
                    }}
                  >
                    🏭 Công đoạn hiển thị:
                  </Text>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {factoryProcesses.map((proc) => {
                      const isSelected = selectedProcessIds.includes(proc.id);
                      return (
                        <button
                          key={proc.id}
                          onClick={() => {
                            const newIds = isSelected
                              ? selectedProcessIds.filter(
                                  (id) => id !== proc.id,
                                )
                              : [...selectedProcessIds, proc.id];
                            setSelectedProcessIds(newIds);
                            setActualGridLoaded(false);
                            fetchActualGrid(newIds);
                          }}
                          style={{
                            padding: "2px 10px",
                            borderRadius: 12,
                            border: isSelected
                              ? "1.5px solid #52c41a"
                              : "1.5px solid #d9d9d9",
                            background: isSelected ? "#f6ffed" : "#fafafa",
                            color: isSelected ? "#237804" : "#595959",
                            fontWeight: isSelected ? 700 : 400,
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          {proc.name}
                        </button>
                      );
                    })}
                  </div>
                  <Text
                    type="secondary"
                    style={{ fontSize: 11, marginLeft: 4 }}
                  >
                    Sản lượng TH hiển thị độc lập — không cần kế hoạch trước
                  </Text>
                </div>

                <ActualProductionGrid
                  scheduleId={scheduleId}
                  segments={schedule.segments}
                  holidays={holidayArr}
                  totalDays={totalDays}
                  itemColors={itemColors}
                  yearMonth={yearMonth}
                  externalGrid={actualGridLoaded ? actualGrid : undefined}
                  externalItems={actualItems}
                  externalMachines={actualMachines}
                  externalBenchmarkMap={actualBenchmarkMap}
                />
              </div>
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
                benchmarkMap={actualBenchmarkMap}
                factoryId={schedule.factoryId}
                processId={schedule.processId ?? undefined}
              />
            ),
          },
          {
            key: "plan-pnl",
            label: "💰 DT-LN kế hoạch",
            children: <PlanPnLTab
              scheduleId={scheduleId}
              hasProcessId={!!schedule.processId}
              planPnlData={planPnlData}
              loading={planPnlLoading}
              error={planPnlError}
            />,
          },
        ]}
      />

      {/* Segment Modal */}
      <ScheduleSegmentModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditSegment(null);
        }}
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
