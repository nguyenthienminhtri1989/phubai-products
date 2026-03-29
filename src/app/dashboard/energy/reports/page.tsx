"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button, Card, Col, DatePicker, Empty, Row, Segmented, Select,
  Space, Spin, Table, Tag, message,
} from "antd";
import {
  ArrowDownOutlined, ArrowUpOutlined, DollarOutlined,
  DownloadOutlined, FireOutlined, MinusOutlined,
  ReloadOutlined, RiseOutlined, ThunderboltFilled, ThunderboltOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart,
  Legend, Line, Pie, PieChart, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────
interface Factory      { id: number; name: string; }
interface Substation   { id: number; name: string; factoryId: number; }
interface MeterGroup   { id: number; groupCode: string; groupName: string; }

interface ReportSummary {
  totalConsumption: number;
  totalCost: number;
  totalPeak: number;
  totalNormal: number;
  totalOffPeak: number;
  avgPerDay: number;
  daysWithData: number;
  prevPeriodConsumption: number;
  trendPercent: number | null;
}

interface ByDateRow {
  date: string;
  consTotal: number;
  consPeak: number;
  consNormal: number;
  consOffPeak: number;
  costTotal: number;
  movingAvg?: number;
}

interface ByMeterRow {
  meterId: number;
  meterCode: string;
  meterName: string;
  meterType: number;
  groupName: string;
  factoryName: string;
  substationName: string;
  consTotal: number;
  costTotal: number;
}

interface ByGroupRow {
  groupId: number | null;
  groupCode: string;
  groupName: string;
  consTotal: number;
  costTotal: number;
}

interface ReportData {
  summary: ReportSummary;
  byDate: ByDateRow[];
  byMeter: ByMeterRow[];
  byGroup: ByGroupRow[];
}

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtKwh = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const fmtVnd  = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

const fmtLabel = (dateStr: string) => {
  if (dateStr.length === 7) {
    const [y, m] = dateStr.split("-");
    return `T${m}/${y.slice(2)}`;
  }
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
};

const C = {
  total:   "#1677ff",
  peak:    "#ff4d4f",
  normal:  "#fa8c16",
  offPeak: "#52c41a",
  ma:      "#722ed1",
  cost:    "#eb2f96",
};

const GROUP_COLORS = ["#1677ff", "#ff4d4f", "#fa8c16", "#52c41a", "#722ed1", "#13c2c2", "#eb2f96"];

// ── Custom Tooltip for trend chart ─────────────────────────────────────────
const TrendTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 8, padding: "10px 14px", fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,.12)" }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: "#333" }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <b>{fmtKwh(p.value ?? 0)} kWh</b>
        </div>
      ))}
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────
export default function EnergyReportsPage() {
  const [loading,    setLoading]    = useState(false);
  const [data,       setData]       = useState<ReportData | null>(null);
  const [tableView,  setTableView]  = useState<"date" | "meter">("date");
  const [groupBy,    setGroupBy]    = useState<"day" | "month">("day");

  // Filters
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"), dayjs(),
  ]);
  const [factories,    setFactories]    = useState<Factory[]>([]);
  const [substations,  setSubstations]  = useState<Substation[]>([]);
  const [meterGroups,  setMeterGroups]  = useState<MeterGroup[]>([]);
  const [selFactory,   setSelFactory]   = useState<number | null>(null);
  const [selStation,   setSelStation]   = useState<number | null>(null);
  const [selGroup,     setSelGroup]     = useState<number | null>(null);

  // Load filter options once
  useEffect(() => {
    Promise.all([
      fetch("/api/factories").then(r => r.json()).catch(() => []),
      fetch("/api/energy/substations").then(r => r.json()).catch(() => []),
      fetch("/api/energy/meter-groups").then(r => r.json()).catch(() => []),
    ]).then(([facs, subs, grps]) => {
      setFactories(facs  || []);
      setSubstations(subs || []);
      setMeterGroups(grps || []);
    });
  }, []);

  // Fetch report
  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({
        startDate: dateRange[0].format("YYYY-MM-DD"),
        endDate:   dateRange[1].format("YYYY-MM-DD"),
        groupBy,
      });
      if (selFactory) p.set("factoryId",    String(selFactory));
      if (selStation) p.set("substationId", String(selStation));
      if (selGroup)   p.set("meterGroupId", String(selGroup));

      const res = await fetch(`/api/energy/reports?${p}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      message.error("Không thể tải dữ liệu báo cáo");
    } finally {
      setLoading(false);
    }
  }, [dateRange, groupBy, selFactory, selStation, selGroup]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // Compute 7-day moving average client-side
  const chartData = useMemo((): ByDateRow[] => {
    if (!data) return [];
    return data.byDate.map((d, i, arr) => {
      const slice = arr.slice(Math.max(0, i - 6), i + 1);
      const avg = slice.reduce((s, x) => s + x.consTotal, 0) / slice.length;
      return { ...d, movingAvg: parseFloat(avg.toFixed(1)) };
    });
  }, [data]);

  // Pie data: only Trung thế time-of-use
  const pieData = useMemo(() => {
    if (!data?.summary) return [];
    const { totalPeak, totalNormal, totalOffPeak } = data.summary;
    return [
      { name: "Cao điểm",    value: parseFloat(totalPeak.toFixed(1)),    fill: C.peak    },
      { name: "Bình thường", value: parseFloat(totalNormal.toFixed(1)),  fill: C.normal  },
      { name: "Thấp điểm",   value: parseFloat(totalOffPeak.toFixed(1)), fill: C.offPeak },
    ].filter(d => d.value > 0);
  }, [data]);

  // Preset handlers
  const applyPreset = (preset: string) => {
    const now = dayjs();
    const map: Record<string, { range: [Dayjs, Dayjs]; gb: "day" | "month" }> = {
      "7d":    { range: [now.subtract(6, "day"),  now], gb: "day"   },
      "30d":   { range: [now.subtract(29, "day"), now], gb: "day"   },
      "month": { range: [now.startOf("month"),    now], gb: "day"   },
      "year":  { range: [now.startOf("year"),     now], gb: "month" },
    };
    if (map[preset]) {
      setDateRange(map[preset].range);
      setGroupBy(map[preset].gb);
    }
  };

  // Excel export
  const handleExport = async () => {
    if (!data) return;
    const XLSX = await import("xlsx");
    const sheetDate = XLSX.utils.json_to_sheet(
      data.byDate.map(d => ({
        "Ngày/Tháng":          d.date,
        "Tổng tiêu thụ (kWh)": +d.consTotal.toFixed(1),
        "Cao điểm (kWh)":      d.consPeak   ? +d.consPeak.toFixed(1)   : "",
        "Bình thường (kWh)":   d.consNormal ? +d.consNormal.toFixed(1) : "",
        "Thấp điểm (kWh)":     d.consOffPeak ? +d.consOffPeak.toFixed(1) : "",
        "Chi phí (VNĐ)":       +d.costTotal.toFixed(0),
      }))
    );
    const sheetMeter = XLSX.utils.json_to_sheet(
      data.byMeter.map(m => ({
        "Mã đồng hồ":          m.meterCode,
        "Tên đồng hồ":         m.meterName,
        "Nhóm":                m.groupName,
        "Nhà máy":             m.factoryName,
        "Tổng tiêu thụ (kWh)": +m.consTotal.toFixed(1),
        "Chi phí (VNĐ)":       +m.costTotal.toFixed(0),
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheetDate,  "Theo ngày");
    XLSX.utils.book_append_sheet(wb, sheetMeter, "Theo đồng hồ");
    XLSX.writeFile(
      wb,
      `dien_nang_${dateRange[0].format("YYYYMMDD")}_${dateRange[1].format("YYYYMMDD")}.xlsx`
    );
  };

  const s = data?.summary;
  const trend = s?.trendPercent;
  const isUp   = trend != null && trend > 0;
  const isDown = trend != null && trend < 0;

  const trendNode = trend == null ? null : (
    <span style={{ fontSize: 12, color: isUp ? "#ff4d4f" : isDown ? "#52c41a" : "#888" }}>
      {isUp ? <ArrowUpOutlined /> : isDown ? <ArrowDownOutlined /> : <MinusOutlined />}
      {" "}{Math.abs(trend).toFixed(1)}% so kỳ trước
    </span>
  );

  const filteredSubs = substations.filter(s => !selFactory || s.factoryId === selFactory);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 20, background: "#f0f2f5", minHeight: "100vh" }}>

      {/* ── FILTER BAR ─────────────────────────────────────────────────── */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 8]} align="middle" wrap>
          <Col flex="none">
            <Space size={4}>
              {[
                { key: "7d",    label: "7 ngày"    },
                { key: "30d",   label: "30 ngày"   },
                { key: "month", label: "Tháng này" },
                { key: "year",  label: "Năm nay"   },
              ].map(p => (
                <Button key={p.key} size="small" onClick={() => applyPreset(p.key)}>
                  {p.label}
                </Button>
              ))}
            </Space>
          </Col>

          <Col flex="none">
            <DatePicker.RangePicker
              value={dateRange}
              onChange={v => v && setDateRange(v as [Dayjs, Dayjs])}
              format="DD/MM/YYYY"
              allowClear={false}
            />
          </Col>

          <Col flex="none">
            <Select
              placeholder="Tất cả nhà máy"
              style={{ width: 150 }}
              allowClear
              options={factories.map(f => ({ label: f.name, value: f.id }))}
              onChange={v => { setSelFactory(v ?? null); setSelStation(null); }}
              value={selFactory}
            />
          </Col>

          <Col flex="none">
            <Select
              placeholder="Tất cả trạm"
              style={{ width: 150 }}
              allowClear
              disabled={!selFactory}
              options={filteredSubs.map(s => ({ label: s.name, value: s.id }))}
              onChange={v => setSelStation(v ?? null)}
              value={selStation}
            />
          </Col>

          <Col flex="none">
            <Select
              placeholder="Tất cả nhóm ĐH"
              style={{ width: 160 }}
              allowClear
              options={meterGroups.map(g => ({ label: g.groupName, value: g.id }))}
              onChange={v => setSelGroup(v ?? null)}
              value={selGroup}
            />
          </Col>

          <Col flex="none">
            <Segmented
              options={[
                { label: "Theo ngày",  value: "day"   },
                { label: "Theo tháng", value: "month" },
              ]}
              value={groupBy}
              onChange={v => setGroupBy(v as "day" | "month")}
            />
          </Col>

          <Col flex="auto" style={{ textAlign: "right" }}>
            <Space>
              <Button icon={<ReloadOutlined />}    onClick={fetchReport} loading={loading}>Làm mới</Button>
              <Button icon={<DownloadOutlined />}  onClick={handleExport} disabled={!data} type="primary" ghost>
                Xuất Excel
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Spin spinning={loading}>

        {/* ── KPI CARDS ───────────────────────────────────────────────── */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>

          {/* Total consumption */}
          <Col xs={24} sm={12} lg={6}>
            <Card style={{ borderColor: "#91caff", background: "#e6f4ff" }}
                  styles={{ body: { padding: "16px 20px" } }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <ThunderboltFilled style={{ fontSize: 30, color: C.total }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>Tổng tiêu thụ</div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
                    {fmtKwh(s?.totalConsumption ?? 0)}
                    <span style={{ fontSize: 12, fontWeight: 400, color: "#888", marginLeft: 4 }}>kWh</span>
                  </div>
                  <div style={{ marginTop: 2 }}>{trendNode}</div>
                </div>
              </div>
            </Card>
          </Col>

          {/* Total cost */}
          <Col xs={24} sm={12} lg={6}>
            <Card style={{ borderColor: "#ffadd2", background: "#fff0f6" }}
                  styles={{ body: { padding: "16px 20px" } }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <DollarOutlined style={{ fontSize: 30, color: C.cost }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>Chi phí điện</div>
                  <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>
                    {fmtVnd(s?.totalCost ?? 0)}
                    <span style={{ fontSize: 11, fontWeight: 400, color: "#888", marginLeft: 4 }}>VNĐ</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                    ≈ {fmtVnd((s?.totalCost ?? 0) / 1_000_000)} triệu đồng
                  </div>
                </div>
              </div>
            </Card>
          </Col>

          {/* Avg per day */}
          <Col xs={24} sm={12} lg={6}>
            <Card style={{ borderColor: "#ffd591", background: "#fff7e6" }}
                  styles={{ body: { padding: "16px 20px" } }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <RiseOutlined style={{ fontSize: 30, color: C.normal }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>Trung bình / ngày</div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
                    {fmtKwh(s?.avgPerDay ?? 0)}
                    <span style={{ fontSize: 12, fontWeight: 400, color: "#888", marginLeft: 4 }}>kWh</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                    {s?.daysWithData ?? 0} ngày có dữ liệu
                  </div>
                </div>
              </div>
            </Card>
          </Col>

          {/* Peak */}
          <Col xs={24} sm={12} lg={6}>
            <Card style={{ borderColor: "#ffa39e", background: "#fff1f0" }}
                  styles={{ body: { padding: "16px 20px" } }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <FireOutlined style={{ fontSize: 30, color: C.peak }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>Điện cao điểm</div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
                    {fmtKwh(s?.totalPeak ?? 0)}
                    <span style={{ fontSize: 12, fontWeight: 400, color: "#888", marginLeft: 4 }}>kWh</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                    {s && s.totalConsumption > 0
                      ? `${((s.totalPeak / s.totalConsumption) * 100).toFixed(1)}% tổng tiêu thụ`
                      : "—"}
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        {/* ── TREND CHART ─────────────────────────────────────────────── */}
        <Card
          style={{ marginBottom: 16 }}
          title={
            <span>
              <ThunderboltOutlined style={{ color: C.total, marginRight: 6 }} />
              Biểu đồ tiêu thụ điện
            </span>
          }
          extra={
            groupBy === "day" && (
              <Tag color="purple" style={{ margin: 0 }}>
                Đường tím: Trung bình 7 ngày
              </Tag>
            )
          }
        >
          {chartData.length === 0 ? (
            <Empty description="Không có dữ liệu trong khoảng thời gian đã chọn" style={{ padding: 40 }} />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart
                data={chartData.map(d => ({ ...d, label: fmtLabel(d.date) }))}
                margin={{ top: 10, right: 24, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  interval={chartData.length > 31 ? Math.floor(chartData.length / 15) : 0}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => fmtKwh(v)}
                  width={75}
                />
                <RTooltip content={<TrendTooltip />} />
                <Legend
                  formatter={(v: string) => ({
                    consTotal:  "Tiêu thụ (kWh)",
                    movingAvg:  "Trung bình 7 ngày",
                  })[v] ?? v}
                />
                <Bar
                  dataKey="consTotal"
                  fill={C.total}
                  fillOpacity={0.75}
                  name="consTotal"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={40}
                />
                {groupBy === "day" && (
                  <Line
                    type="monotone"
                    dataKey="movingAvg"
                    stroke={C.ma}
                    strokeWidth={2.5}
                    dot={false}
                    name="movingAvg"
                    strokeDasharray="5 4"
                    activeDot={{ r: 5 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* ── SECONDARY CHARTS ────────────────────────────────────────── */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>

          {/* By Group - Horizontal Bar */}
          <Col xs={24} lg={14}>
            <Card title="Tiêu thụ theo nhóm đồng hồ" style={{ height: "100%" }}>
              {!data?.byGroup?.length ? (
                <Empty description="Không có dữ liệu" />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(200, data.byGroup.length * 44)}>
                  <BarChart
                    data={data.byGroup.map(g => ({ ...g, label: g.groupName }))}
                    layout="vertical"
                    margin={{ top: 5, right: 80, left: 4, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f5f5f5" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10 }}
                      tickFormatter={v => fmtKwh(v)}
                    />
                    <YAxis
                      dataKey="label"
                      type="category"
                      tick={{ fontSize: 12 }}
                      width={110}
                    />
                    <RTooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={((v: number) => fmtKwh(v) + " kWh") as any}
                    />
                    <Bar dataKey="consTotal" radius={[0, 4, 4, 0]} maxBarSize={28}>
                      {data.byGroup.map((_, i) => (
                        <Cell key={i} fill={GROUP_COLORS[i % GROUP_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </Col>

          {/* Time-of-use Pie */}
          <Col xs={24} lg={10}>
            <Card title="Cơ cấu giờ dùng điện (Đồng hồ Trung thế)" style={{ height: "100%" }}>
              {pieData.length === 0 ? (
                <Empty
                  description="Không có dữ liệu đồng hồ Trung thế trong kỳ"
                  style={{ padding: 24 }}
                />
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="47%"
                      innerRadius={55}
                      outerRadius={88}
                      paddingAngle={3}
                      dataKey="value"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      label={((p: any) => `${p.name}: ${((p.percent ?? 0) * 100).toFixed(1)}%`) as any}
                      labelLine
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <RTooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={((v: number) => fmtKwh(v) + " kWh") as any}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </Col>
        </Row>

        {/* ── DETAIL TABLE ────────────────────────────────────────────── */}
        <Card
          title="Chi tiết số liệu"
          extra={
            <Segmented
              options={[
                { label: "Theo ngày",    value: "date"  },
                { label: "Theo đồng hồ", value: "meter" },
              ]}
              value={tableView}
              onChange={v => setTableView(v as "date" | "meter")}
            />
          }
        >
          {tableView === "date" ? (
            <Table<ByDateRow & { key: number }>
              dataSource={(data?.byDate ?? []).map((d, i) => ({ ...d, key: i }))}
              size="small"
              scroll={{ x: 720 }}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} bản ghi` }}
              columns={[
                {
                  title: groupBy === "month" ? "Tháng" : "Ngày",
                  dataIndex: "date",
                  width: 110,
                  render: d => groupBy === "month"
                    ? dayjs(d + "-01").format("MM/YYYY")
                    : dayjs(d).format("DD/MM/YYYY"),
                  sorter: (a, b) => a.date.localeCompare(b.date),
                  defaultSortOrder: "ascend",
                },
                {
                  title: "Tổng tiêu thụ",
                  dataIndex: "consTotal",
                  align: "right",
                  render: v => <b style={{ color: C.total }}>{fmtKwh(v)} kWh</b>,
                  sorter: (a, b) => a.consTotal - b.consTotal,
                },
                {
                  title: <span style={{ color: C.peak }}>Cao điểm</span>,
                  dataIndex: "consPeak",
                  align: "right",
                  render: v => v
                    ? <span style={{ color: C.peak }}>{fmtKwh(v)} kWh</span>
                    : <span style={{ color: "#ccc" }}>—</span>,
                  sorter: (a, b) => a.consPeak - b.consPeak,
                },
                {
                  title: <span style={{ color: C.normal }}>Bình thường</span>,
                  dataIndex: "consNormal",
                  align: "right",
                  render: v => v
                    ? <span style={{ color: C.normal }}>{fmtKwh(v)} kWh</span>
                    : <span style={{ color: "#ccc" }}>—</span>,
                },
                {
                  title: <span style={{ color: C.offPeak }}>Thấp điểm</span>,
                  dataIndex: "consOffPeak",
                  align: "right",
                  render: v => v
                    ? <span style={{ color: C.offPeak }}>{fmtKwh(v)} kWh</span>
                    : <span style={{ color: "#ccc" }}>—</span>,
                },
                {
                  title: "Chi phí",
                  dataIndex: "costTotal",
                  align: "right",
                  render: v => <span style={{ color: C.cost }}>{fmtVnd(v)} đ</span>,
                  sorter: (a, b) => a.costTotal - b.costTotal,
                },
              ]}
              summary={rows => {
                const tc = rows.reduce((s, r) => s + (r.consTotal ?? 0), 0);
                const tp = rows.reduce((s, r) => s + (r.consPeak ?? 0), 0);
                const tn = rows.reduce((s, r) => s + (r.consNormal ?? 0), 0);
                const to = rows.reduce((s, r) => s + (r.consOffPeak ?? 0), 0);
                const tco = rows.reduce((s, r) => s + (r.costTotal ?? 0), 0);
                return (
                  <Table.Summary.Row style={{ background: "#fafafa", fontWeight: 600 }}>
                    <Table.Summary.Cell index={0}>Tổng (trang này)</Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">{fmtKwh(tc)} kWh</Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right">{tp ? fmtKwh(tp) + " kWh" : "—"}</Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">{tn ? fmtKwh(tn) + " kWh" : "—"}</Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">{to ? fmtKwh(to) + " kWh" : "—"}</Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">{fmtVnd(tco)} đ</Table.Summary.Cell>
                  </Table.Summary.Row>
                );
              }}
            />
          ) : (
            <Table<ByMeterRow & { key: number }>
              dataSource={(data?.byMeter ?? []).map((m, i) => ({ ...m, key: i }))}
              size="small"
              scroll={{ x: 680 }}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} đồng hồ` }}
              columns={[
                {
                  title: "Mã ĐH",
                  dataIndex: "meterCode",
                  width: 90,
                  render: (v, r) => (
                    <Tag color={r.meterType === 2 ? "orange" : "blue"}>{v}</Tag>
                  ),
                },
                {
                  title: "Tên đồng hồ",
                  dataIndex: "meterName",
                  ellipsis: true,
                },
                {
                  title: "Nhóm",
                  dataIndex: "groupName",
                  render: v => <Tag>{v}</Tag>,
                },
                {
                  title: "Trạm / Nhà máy",
                  dataIndex: "substationName",
                  render: (v, r) => `${v} / ${r.factoryName}`,
                  ellipsis: true,
                },
                {
                  title: "Tiêu thụ",
                  dataIndex: "consTotal",
                  align: "right",
                  render: v => <b style={{ color: C.total }}>{fmtKwh(v)} kWh</b>,
                  sorter: (a, b) => a.consTotal - b.consTotal,
                  defaultSortOrder: "descend",
                },
                {
                  title: "Chi phí",
                  dataIndex: "costTotal",
                  align: "right",
                  render: v => <span style={{ color: C.cost }}>{fmtVnd(v)} đ</span>,
                  sorter: (a, b) => a.costTotal - b.costTotal,
                },
              ]}
              summary={rows => {
                const tc  = rows.reduce((s, r) => s + (r.consTotal ?? 0), 0);
                const tco = rows.reduce((s, r) => s + (r.costTotal ?? 0), 0);
                return (
                  <Table.Summary.Row style={{ background: "#fafafa", fontWeight: 600 }}>
                    <Table.Summary.Cell index={0} colSpan={4}>Tổng (trang này)</Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">{fmtKwh(tc)} kWh</Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">{fmtVnd(tco)} đ</Table.Summary.Cell>
                  </Table.Summary.Row>
                );
              }}
            />
          )}
        </Card>

      </Spin>
    </div>
  );
}
