"use client";

import React, { useState, useEffect } from "react";
import {
  Typography,
  Form,
  Select,
  Table,
  Button,
  Row,
  Col,
  Card,
  Statistic,
  InputNumber,
  Divider,
  message,
  Spin,
  Segmented,
  Tag,
  theme,
} from "antd";
import { SearchOutlined, FileExcelOutlined, InfoCircleOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";
import { getItemColor } from "@/utils/itemColors";

const { Title, Text } = Typography;
const { useToken } = theme;

interface Factory { id: number; name: string }
interface ProcessOption { id: number; name: string; factoryId: number }
interface ItemOption { id: number; name: string }

interface CapacityResult {
  item: { id: number; name: string };
  process: { id: number; name: string };
  version: { id: number; versionName: string };
  stdOutputPerShift: number;
  machineModel: string;
  machineCount: number;
  daysInMonth: number;
  year: number;
  month: number;
  capacityKg: number;
  capacityTon: number;
  benchmarkType: string;
  dailyOutputPerMachine: number;
  empiricalOutputPerDay: number | null;
}

type BenchmarkType = "THEORY" | "EMPIRICAL";

export default function CapacityPage() {
  const { token } = useToken();

  const [factories, setFactories] = useState<Factory[]>([]);
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CapacityResult[]>([]);

  // --- State bộ tính toán nhanh ---
  const [calcItem, setCalcItem] = useState<number | null>(null);
  const [calcMachines, setCalcMachines] = useState<number>(1);
  const [calcNeeded, setCalcNeeded] = useState<number | null>(null);

  const [filterFactory, setFilterFactory] = useState<number | null>(null);
  const [filterProcess, setFilterProcess] = useState<number | null>(null);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [benchmarkType, setBenchmarkType] = useState<BenchmarkType>("THEORY");

  useEffect(() => {
    fetch("/api/factories").then((r) => r.ok && r.json()).then((d) => d && setFactories(d));
    fetch("/api/processes").then((r) => r.ok && r.json()).then((d) => d && setProcesses(d));
    fetch("/api/items").then((r) => r.ok && r.json()).then((d) => d && setItems(d));
  }, []);

  const filteredProcesses = filterFactory
    ? processes.filter((p) => p.factoryId === filterFactory)
    : processes;

  async function handleSearch() {
    if (!filterFactory || !filterProcess) {
      message.warning("Vui lòng chọn Nhà máy và Công đoạn");
      return;
    }

    setLoading(true);
    setResults([]);

    const itemsToQuery = selectedItems.length > 0 ? selectedItems : items.map((i) => i.id);

    const promises = itemsToQuery.map(async (itemId) => {
      const params = new URLSearchParams({
        itemId: String(itemId),
        processId: String(filterProcess),
        factoryId: String(filterFactory),
        year: String(filterYear),
        month: String(filterMonth),
        benchmarkType,
      });
      const r = await fetch(`/api/productivity-benchmark/capacity?${params}`);
      if (r.ok) return r.json() as Promise<CapacityResult>;
      return null;
    });

    const raw = await Promise.all(promises);
    const valid = raw.filter(Boolean) as CapacityResult[];
    setResults(valid);
    setLoading(false);
  }

  function exportExcel() {
    const rows = results.map((r) => ({
      "Loại định mức": r.benchmarkType === "EMPIRICAL" ? "Thực nghiệm" : "Lý thuyết",
      "Mặt hàng": r.item.name,
      "Công đoạn": r.process.name,
      "Loại máy": r.machineModel,
      "ĐM (kg/ngày/máy)": r.dailyOutputPerMachine,
      "Số máy hiện có": r.machineCount,
      "Số ngày trong tháng": r.daysInMonth,
      "Năng lực tối đa (kg)": r.capacityKg,
      "Năng lực tối đa (tấn)": r.capacityTon,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Năng lực SX");
    XLSX.writeFile(wb, `nang-luc-sx-${benchmarkType.toLowerCase()}-${filterYear}-${filterMonth}.xlsx`);
  }

  const totalCapacityTon = results.reduce((s, r) => s + r.capacityTon, 0);

  // --- Tính toán realtime bộ tính toán nhanh ---
  const selectedResult =
    results.find((r) => r.item.id === calcItem) ?? results[0] ?? null;
  const dmPerDay = selectedResult?.dailyOutputPerMachine ?? 0;
  const dailyCapacity = dmPerDay * calcMachines;
  const daysNeeded =
    calcNeeded && dailyCapacity > 0
      ? Math.ceil(calcNeeded / dailyCapacity)
      : null;

  const statusLabel = !daysNeeded
    ? null
    : daysNeeded <= 10
      ? { text: "Rất thoải mái", color: "success" }
      : daysNeeded <= 20
        ? { text: "Khả thi trong tháng", color: "success" }
        : daysNeeded <= 26
          ? { text: "Cần theo dõi", color: "warning" }
          : { text: "Không kịp tháng này", color: "error" };

  const columns = [
    {
      title: "Mặt hàng",
      key: "item",
      render: (_: unknown, r: CapacityResult) => <Tag color={getItemColor(r.item.name)} style={{ fontWeight: 600 }}>{r.item.name}</Tag>,
      width: 200,
    },
    {
      title: benchmarkType === "EMPIRICAL" ? "ĐM thực nghiệm (kg/ngày/máy)" : "ĐM lý thuyết (kg/ca/máy)",
      key: "benchmarkValue",
      width: 220,
      render: (_: unknown, r: CapacityResult) =>
        benchmarkType === "EMPIRICAL"
          ? <span>{r.empiricalOutputPerDay?.toLocaleString("vi-VN")} <Tag color="green">TN</Tag></span>
          : <span>{r.stdOutputPerShift.toFixed(2)} <Tag color="blue">LT</Tag></span>,
    },
    { title: "Số máy", dataIndex: "machineCount", key: "machineCount", width: 90 },
    { title: "Ngày trong tháng", dataIndex: "daysInMonth", key: "days", width: 130 },
    {
      title: "Năng lực tối đa (tấn/tháng)",
      dataIndex: "capacityTon",
      key: "capacityTon",
      width: 200,
      render: (v: number) => <Text strong style={{ color: "#1677ff" }}>{v.toFixed(3)}</Text>,
    },
    {
      title: "Năng lực tối đa (kg/tháng)",
      dataIndex: "capacityKg",
      key: "capacityKg",
      width: 180,
      render: (v: number) => v.toFixed(0),
    },
  ];

  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = new Date().getFullYear() - 1 + i;
    return { value: y, label: String(y) };
  });

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: `Tháng ${i + 1}`,
  }));

  // Danh sách số máy để so sánh
  const machineOptions = [1, 2, 3, 5, 8, 10, 15, 20];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Năng lực Sản xuất</Title>

      <Card style={{ marginBottom: 16 }}>
        <Form layout="inline" style={{ gap: 8, flexWrap: "wrap" }}>
          <Form.Item label="Loại định mức" style={{ marginBottom: 0 }}>
            <Segmented
              options={[
                { label: "Lý thuyết", value: "THEORY" },
                { label: "Thực nghiệm", value: "EMPIRICAL" },
              ]}
              value={benchmarkType}
              onChange={(v) => setBenchmarkType(v as BenchmarkType)}
            />
          </Form.Item>
          <Divider type="vertical" style={{ height: 32, margin: "0 8px" }} />
          <Form.Item label="Nhà máy">
            <Select
              style={{ width: 140 }}
              options={factories.map((f) => ({ value: f.id, label: f.name }))}
              onChange={(v) => { setFilterFactory(v); setFilterProcess(null); }}
              value={filterFactory}
              placeholder="Chọn NM"
            />
          </Form.Item>
          <Form.Item label="Công đoạn">
            <Select
              style={{ width: 200 }}
              options={filteredProcesses.map((p) => ({ value: p.id, label: p.name }))}
              onChange={setFilterProcess}
              value={filterProcess}
              placeholder="Chọn công đoạn"
            />
          </Form.Item>
          <Form.Item label="Năm">
            <Select style={{ width: 100 }} options={yearOptions} value={filterYear} onChange={setFilterYear} />
          </Form.Item>
          <Form.Item label="Tháng">
            <Select style={{ width: 110 }} options={monthOptions} value={filterMonth} onChange={setFilterMonth} />
          </Form.Item>
          <Form.Item label="Mặt hàng">
            <Select
              mode="multiple"
              style={{ width: 300 }}
              options={items.map((i) => ({ value: i.id, label: i.name }))}
              value={selectedItems}
              onChange={setSelectedItems}
              placeholder="Để trống = tất cả mặt hàng"
              maxTagCount={2}
              showSearch
              filterOption={(input, option) =>
                String(option?.label ?? "").toLowerCase().startsWith(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}>
              Tính năng lực
            </Button>
          </Form.Item>
        </Form>

        {/* Note về loại định mức */}
        <div style={{
          marginTop: 12,
          padding: "6px 12px",
          background: benchmarkType === "EMPIRICAL" ? "#f6ffed" : "#e6f4ff",
          borderRadius: 6,
          fontSize: 12,
          color: benchmarkType === "EMPIRICAL" ? "#52c41a" : "#1677ff",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <InfoCircleOutlined />
          {benchmarkType === "EMPIRICAL"
            ? "Dựa trên số liệu thực tế vận hành — phù hợp để lập kế hoạch và đàm phán với khách hàng"
            : "Dựa trên thông số kỹ thuật lý thuyết — dùng để đánh giá máy có đúng thiết kế không"}
        </div>
      </Card>

      {loading && <div style={{ textAlign: "center", padding: 40 }}><Spin size="large" /></div>}

      {results.length > 0 && (
        <>
          {/* KPI cards tổng hợp */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card>
                <Statistic
                  title="Tổng năng lực"
                  value={totalCapacityTon.toFixed(2)}
                  suffix="tấn/tháng"
                  valueStyle={{ color: "#1677ff" }}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card>
                <Statistic
                  title="Số mặt hàng có định mức"
                  value={results.length}
                  suffix="mặt hàng"
                />
              </Card>
            </Col>
          </Row>

          {/* Nút xuất Excel */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <Button icon={<FileExcelOutlined />} onClick={exportExcel}>
              Xuất báo cáo năng lực
            </Button>
          </div>

          {/* Bảng kết quả chính */}
          <Table
            dataSource={results}
            columns={columns}
            rowKey={(r) => r.item.id}
            bordered
            size="middle"
            pagination={false}
          />

          {/* Card 1: Bộ tính toán nhanh */}
          <Card
            title="Bộ tính toán nhanh — Cần bao nhiêu ngày?"
            style={{ marginTop: 16 }}
          >
            <Row gutter={[16, 16]} align="middle">
              {/* Chọn mặt hàng */}
              <Col xs={24} sm={8}>
                <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 6 }}>
                  Mặt hàng cần tính
                </div>
                <Select
                  style={{ width: "100%" }}
                  value={calcItem ?? results[0]?.item.id}
                  onChange={setCalcItem}
                  options={results.map((r) => ({
                    value: r.item.id,
                    label: `${r.item.name} — ĐM: ${r.dailyOutputPerMachine.toLocaleString("vi-VN")} kg/ngày/máy`,
                  }))}
                />
              </Col>

              {/* Số máy bố trí */}
              <Col xs={24} sm={7}>
                <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 6 }}>
                  Số máy bố trí chạy mặt hàng này
                </div>
                <InputNumber
                  style={{ width: "100%" }}
                  min={1}
                  max={999}
                  value={calcMachines}
                  onChange={(v) => setCalcMachines(v ?? 1)}
                  addonAfter="máy"
                />
                {results[0]?.machineCount != null && (
                  <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 4 }}>
                    Tổng công đoạn có {results[0].machineCount} máy
                  </div>
                )}
              </Col>

              {/* Sản lượng cần SX */}
              <Col xs={24} sm={9}>
                <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 6 }}>
                  Sản lượng cần sản xuất
                </div>
                <InputNumber
                  style={{ width: "100%" }}
                  min={0}
                  step={1000}
                  value={calcNeeded}
                  onChange={setCalcNeeded}
                  addonAfter="kg"
                  placeholder="Nhập số kg..."
                />
              </Col>
            </Row>

            {/* Kết quả */}
            {daysNeeded !== null && (
              <div
                style={{
                  marginTop: 16,
                  background: token.colorFillSecondary,
                  borderRadius: token.borderRadiusLG,
                  padding: "14px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                    Số ngày cần thiết
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 32, fontWeight: 500, color: token.colorPrimary }}>
                      {daysNeeded}
                    </span>
                    <span style={{ fontSize: 14, color: token.colorTextSecondary }}>
                      ngày
                    </span>
                    {statusLabel && (
                      <Tag color={statusLabel.color}>{statusLabel.text}</Tag>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                    Năng lực/ngày với {calcMachines} máy
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 500, marginTop: 4 }}>
                    {dailyCapacity.toLocaleString("vi-VN")}
                    <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
                      {" "}kg/ngày
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Công thức hiển thị minh bạch */}
            {daysNeeded !== null && (
              <div
                style={{
                  marginTop: 8,
                  padding: "6px 12px",
                  background: token.colorInfoBg,
                  borderRadius: token.borderRadiusSM,
                  fontSize: 12,
                  color: token.colorInfoText,
                }}
              >
                Công thức: {(calcNeeded ?? 0).toLocaleString("vi-VN")} kg ÷ (
                {dmPerDay.toLocaleString("vi-VN")} kg/ngày/máy × {calcMachines} máy) ={" "}
                {((calcNeeded ?? 0) / dailyCapacity).toFixed(2)} → làm tròn lên{" "}
                <strong>{daysNeeded} ngày</strong>
              </div>
            )}
          </Card>

          {/* Card 2: Bảng so sánh phương án bố trí máy — chỉ hiện khi đã nhập calcNeeded */}
          {calcNeeded && selectedResult && (
            <Card
              title={`So sánh phương án bố trí máy — ${selectedResult.item.name}, cần ${calcNeeded.toLocaleString("vi-VN")} kg`}
              style={{ marginTop: 12 }}
              size="small"
            >
              <Table
                size="small"
                pagination={false}
                dataSource={machineOptions
                  .filter((m) => m <= (results[0]?.machineCount ?? 99))
                  .map((m) => ({
                    key: m,
                    machines: m,
                    dailyCap: dmPerDay * m,
                    days: Math.ceil(calcNeeded / (dmPerDay * m)),
                  }))}
                rowClassName={(r) =>
                  r.machines === calcMachines ? "ant-table-row-selected" : ""
                }
                columns={[
                  {
                    title: "Số máy bố trí",
                    dataIndex: "machines",
                    width: 160,
                    render: (v: number) => (
                      <span>
                        {v} máy
                        {v === calcMachines && (
                          <Tag color="blue" style={{ marginLeft: 8 }}>
                            Đang chọn
                          </Tag>
                        )}
                      </span>
                    ),
                  },
                  {
                    title: "Năng lực/ngày",
                    dataIndex: "dailyCap",
                    render: (v: number) => `${v.toLocaleString("vi-VN")} kg`,
                  },
                  {
                    title: "Số ngày cần",
                    dataIndex: "days",
                    render: (v: number) => <Text strong>{v} ngày</Text>,
                  },
                  {
                    title: "Đánh giá",
                    dataIndex: "days",
                    render: (v: number) => {
                      if (v <= 10) return <Tag color="success">Rất thoải mái</Tag>;
                      if (v <= 20) return <Tag color="success">Khả thi</Tag>;
                      if (v <= 26) return <Tag color="warning">Cần theo dõi</Tag>;
                      return <Tag color="error">Không kịp tháng</Tag>;
                    },
                  },
                  {
                    title: "",
                    width: 80,
                    render: (_: unknown, r: { machines: number }) => (
                      <Button
                        size="small"
                        type={r.machines === calcMachines ? "primary" : "default"}
                        onClick={() => setCalcMachines(r.machines)}
                      >
                        Chọn
                      </Button>
                    ),
                  },
                ]}
              />
              <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 8 }}>
                Click &quot;Chọn&quot; để điền số máy vào bộ tính toán bên trên
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
