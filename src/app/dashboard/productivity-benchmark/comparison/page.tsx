"use client";

import React, { useState, useEffect } from "react";
import {
  Typography,
  Form,
  Select,
  Table,
  Button,
  Card,
  Tag,
  message,
  Spin,
  Row,
  Col,
  Statistic,
  Progress,
  Segmented,
} from "antd";
import { SearchOutlined, InfoCircleOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

interface Factory { id: number; name: string }
interface ProcessOption { id: number; name: string; factoryId: number }
interface ItemOption { id: number; name: string }

interface ComparisonRow {
  machineId: number;
  machineName: string;
  avgActualPerShift: number;
  avgActualPerDay: number;
  benchmarkValue: number;
  benchmarkType: string;
  efficiencyPct: number;
  shiftCount: number;
}

interface ComparisonResult {
  benchmark: {
    stdOutputPerShift: number;
    item: { id: number; name: string };
    process: { id: number; name: string };
    benchmarkType: string;
    benchmarkValue: number;
  };
  dateFrom: string;
  dateTo: string;
  comparisons: ComparisonRow[];
}

type BenchmarkTypeOption = "THEORY" | "EMPIRICAL";

function getEfficiencyColor(pct: number): string {
  if (pct >= 95) return "#52c41a";
  if (pct >= 85) return "#faad14";
  return "#f5222d";
}

function getEfficiencyLabel(pct: number): { text: string; color: string } {
  if (pct >= 95) return { text: "Đạt", color: "green" };
  if (pct >= 85) return { text: "Cần theo dõi", color: "orange" };
  return { text: "Cần cải thiện", color: "red" };
}

export default function ComparisonPage() {
  const [factories, setFactories] = useState<Factory[]>([]);
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);

  const [filterFactory, setFilterFactory] = useState<number | null>(null);
  const [filterProcess, setFilterProcess] = useState<number | null>(null);
  const [filterItem, setFilterItem] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [benchmarkType, setBenchmarkType] = useState<BenchmarkTypeOption>("THEORY");

  useEffect(() => {
    fetch("/api/factories").then((r) => r.ok && r.json()).then((d) => d && setFactories(d));
    fetch("/api/processes").then((r) => r.ok && r.json()).then((d) => d && setProcesses(d));
    fetch("/api/items").then((r) => r.ok && r.json()).then((d) => d && setItems(d));
  }, []);

  const filteredProcesses = filterFactory
    ? processes.filter((p) => p.factoryId === filterFactory)
    : processes;

  async function handleSearch() {
    if (!filterFactory || !filterProcess || !filterItem) {
      message.warning("Vui lòng chọn đủ Nhà máy, Công đoạn và Mặt hàng");
      return;
    }

    setLoading(true);
    setResult(null);

    const params = new URLSearchParams({
      itemId: String(filterItem),
      processId: String(filterProcess),
      factoryId: String(filterFactory),
      dateFrom,
      dateTo,
      benchmarkType,
    });

    const r = await fetch(`/api/productivity-benchmark/comparison?${params}`);
    setLoading(false);

    if (r.ok) {
      setResult(await r.json());
    } else {
      const e = await r.json();
      message.error(e.error || "Không tìm thấy dữ liệu");
    }
  }

  const avgEfficiency =
    result && result.comparisons.length > 0
      ? result.comparisons.reduce((s, r) => s + r.efficiencyPct, 0) / result.comparisons.length
      : 0;

  const isEmpirical = benchmarkType === "EMPIRICAL";

  const columns = [
    { title: "Tên máy", dataIndex: "machineName", key: "machineName", width: 180 },
    {
      title: "Định mức dùng",
      key: "benchmarkValue",
      width: 180,
      render: (_: unknown, row: ComparisonRow) => (
        <span>
          {row.benchmarkValue.toLocaleString("vi-VN")} kg/ngày{" "}
          <Tag
            color={row.benchmarkType === "EMPIRICAL" ? "green" : "blue"}
            style={{ marginLeft: 4 }}
          >
            {row.benchmarkType === "EMPIRICAL" ? "TN" : "LT"}
          </Tag>
        </span>
      ),
    },
    {
      title: isEmpirical ? "TB thực tế (kg/ngày)" : "TB thực tế (kg/ca)",
      key: "avgActual",
      width: 180,
      render: (_: unknown, row: ComparisonRow) => {
        const val = isEmpirical ? row.avgActualPerDay : row.avgActualPerShift;
        return val > 0
          ? val.toFixed(2)
          : <Text type="secondary">Chưa có dữ liệu</Text>;
      },
    },
    {
      title: "Số ca",
      dataIndex: "shiftCount",
      key: "shiftCount",
      width: 80,
    },
    {
      title: "Hiệu suất thực (%)",
      dataIndex: "efficiencyPct",
      key: "efficiencyPct",
      width: 200,
      render: (v: number) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Progress
            percent={Math.min(v, 120)}
            size="small"
            style={{ width: 100 }}
            strokeColor={getEfficiencyColor(v)}
            showInfo={false}
          />
          <Text strong style={{ color: getEfficiencyColor(v), minWidth: 50 }}>
            {v.toFixed(1)}%
          </Text>
        </div>
      ),
    },
    {
      title: "Đánh giá",
      key: "evaluation",
      width: 140,
      render: (_: unknown, row: ComparisonRow) => {
        const { text, color } = getEfficiencyLabel(row.efficiencyPct);
        return row.shiftCount > 0 ? <Tag color={color}>{text}</Tag> : <Tag>Không có dữ liệu</Tag>;
      },
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>So sánh Thực tế vs Định mức</Title>

      <Card style={{ marginBottom: 16 }}>
        <Form layout="inline" style={{ gap: 8, flexWrap: "wrap" }}>
          <Form.Item label="Loại định mức" style={{ marginBottom: 0 }}>
            <Segmented
              options={[
                { label: "Lý thuyết", value: "THEORY" },
                { label: "Thực nghiệm", value: "EMPIRICAL" },
              ]}
              value={benchmarkType}
              onChange={(v) => setBenchmarkType(v as BenchmarkTypeOption)}
            />
          </Form.Item>
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
          <Form.Item label="Mặt hàng">
            <Select
              showSearch
              optionFilterProp="label"
              style={{ width: 280 }}
              options={items.map((i) => ({ value: i.id, label: i.name }))}
              onChange={setFilterItem}
              value={filterItem}
              placeholder="Chọn mặt hàng"
            />
          </Form.Item>
          <Form.Item label="Từ ngày">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ padding: "4px 11px", border: "1px solid #d9d9d9", borderRadius: 6 }}
            />
          </Form.Item>
          <Form.Item label="Đến ngày">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ padding: "4px 11px", border: "1px solid #d9d9d9", borderRadius: 6 }}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}>
              So sánh
            </Button>
          </Form.Item>
        </Form>

        {/* Note về loại định mức */}
        <div style={{
          marginTop: 12,
          padding: "6px 12px",
          background: isEmpirical ? "#f6ffed" : "#e6f4ff",
          borderRadius: 6,
          fontSize: 12,
          color: isEmpirical ? "#52c41a" : "#1677ff",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <InfoCircleOutlined />
          {isEmpirical
            ? "So sánh với định mức thực nghiệm (kg/ngày) — phù hợp để đánh giá năng suất vận hành thực tế"
            : "So sánh với định mức lý thuyết (kg/ca) — dùng để kiểm tra máy có chạy đúng thiết kế không"}
        </div>
      </Card>

      {loading && <div style={{ textAlign: "center", padding: 40 }}><Spin size="large" /></div>}

      {result && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card>
                <Statistic
                  title={isEmpirical ? "Định mức thực nghiệm" : "Định mức lý thuyết"}
                  value={result.benchmark.benchmarkValue.toLocaleString("vi-VN")}
                  suffix="kg/ngày"
                  valueStyle={{ color: isEmpirical ? "#52c41a" : "#1677ff" }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Hiệu suất TB toàn bộ"
                  value={avgEfficiency.toFixed(1)}
                  suffix="%"
                  valueStyle={{ color: getEfficiencyColor(avgEfficiency) }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Số máy đạt chuẩn (≥95%)"
                  value={result.comparisons.filter((r) => r.efficiencyPct >= 95).length}
                  suffix={`/ ${result.comparisons.length}`}
                  valueStyle={{ color: "#52c41a" }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Máy cần cải thiện (<85%)"
                  value={result.comparisons.filter((r) => r.efficiencyPct < 85 && r.shiftCount > 0).length}
                  suffix="máy"
                  valueStyle={{ color: "#f5222d" }}
                />
              </Card>
            </Col>
          </Row>

          <Table
            dataSource={result.comparisons}
            columns={columns}
            rowKey="machineId"
            bordered
            size="middle"
            pagination={false}
          />
        </>
      )}
    </div>
  );
}
