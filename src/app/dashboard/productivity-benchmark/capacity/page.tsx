"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  Space,
  Divider,
  message,
  Spin,
  Segmented,
  Tag,
} from "antd";
import { SearchOutlined, FileExcelOutlined, InfoCircleOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";

const { Title, Text } = Typography;

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
  const [factories, setFactories] = useState<Factory[]>([]);
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CapacityResult[]>([]);
  const [needed, setNeeded] = useState<number | null>(null);

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

  const daysNeeded = needed && results.length > 0
    ? Math.ceil(needed / (results[0]?.dailyOutputPerMachine * results[0]?.machineCount))
    : null;

  const columns = [
    {
      title: "Mặt hàng",
      key: "item",
      render: (_: unknown, r: CapacityResult) => r.item.name,
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
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Tổng năng lực"
                  value={totalCapacityTon.toFixed(2)}
                  suffix="tấn/tháng"
                  valueStyle={{ color: "#1677ff" }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Số mặt hàng có định mức"
                  value={results.length}
                  suffix="mặt hàng"
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Text>Cần sản xuất:</Text>
                  <InputNumber
                    style={{ width: 150 }}
                    placeholder="Nhập số kg"
                    onChange={(v) => setNeeded(v != null ? Number(v) : null)}
                    step={1000}
                    addonAfter="kg"
                  />
                  {daysNeeded !== null && (
                    <Text strong style={{ color: "#52c41a" }}>
                      → Cần khoảng <Text strong style={{ color: "#f5222d", fontSize: 18 }}>{daysNeeded}</Text> ngày
                    </Text>
                  )}
                </div>
              </Card>
            </Col>
          </Row>

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <Button icon={<FileExcelOutlined />} onClick={exportExcel}>
              Xuất báo cáo năng lực
            </Button>
          </div>

          <Table
            dataSource={results}
            columns={columns}
            rowKey={(r) => r.item.id}
            bordered
            size="middle"
            pagination={false}
          />
        </>
      )}
    </div>
  );
}
