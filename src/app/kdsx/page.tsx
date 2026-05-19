"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Select,
  Card,
  Table,
  Statistic,
  Row,
  Col,
  Tag,
  Spin,
  Button,
  Space,
  Tooltip,
  Alert,
} from "antd";
import { ReloadOutlined, ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const { Title, Text } = Typography;

interface SnapshotData {
  totalQtyKg: number | null;
  totalRevenueVnd: number | null;
  totalCostVnd: number | null;
  totalProfitVnd: number | null;
  refreshedAt: string | null;
}

interface FactoryRow {
  factory: { id: number; name: string };
  kh: SnapshotData | null;
  th: SnapshotData | null;
}

function fmt(val: number | null | undefined, unit = "tỷ") {
  if (val === null || val === undefined) return "-";
  const tyCVnd = val / 1_000_000_000;
  return `${tyCVnd.toFixed(2)} ${unit}`;
}

function fmtQty(val: number | null | undefined) {
  if (val === null || val === undefined) return "-";
  return `${(val / 1000).toFixed(1)} tấn`;
}

function PctTag({ kh, th }: { kh: number | null; th: number | null }) {
  if (!kh || !th) return <Tag>-</Tag>;
  const pct = (th / kh) * 100;
  const color = pct >= 100 ? "green" : pct >= 80 ? "orange" : "red";
  return (
    <Tag color={color}>
      {pct.toFixed(1)}% KH{" "}
      {pct >= 100 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
    </Tag>
  );
}

export default function KdsxDashboardPage() {
  const [yearMonth, setYearMonth] = useState(() => dayjs().format("YYYY-MM"));
  const [data, setData] = useState<FactoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kdsx/summary?yearMonth=${yearMonth}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Tạo danh sách tháng 12 tháng gần nhất
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const m = dayjs().subtract(i, "month");
    return { label: m.format("MM/YYYY"), value: m.format("YYYY-MM") };
  });

  // Tính tổng toàn công ty
  const totals = data.reduce(
    (acc, row) => ({
      khRevenue: acc.khRevenue + (row.kh?.totalRevenueVnd ?? 0),
      khCost: acc.khCost + (row.kh?.totalCostVnd ?? 0),
      khProfit: acc.khProfit + (row.kh?.totalProfitVnd ?? 0),
      khQty: acc.khQty + (row.kh?.totalQtyKg ?? 0),
      thRevenue: acc.thRevenue + (row.th?.totalRevenueVnd ?? 0),
      thCost: acc.thCost + (row.th?.totalCostVnd ?? 0),
      thProfit: acc.thProfit + (row.th?.totalProfitVnd ?? 0),
      thQty: acc.thQty + (row.th?.totalQtyKg ?? 0),
    }),
    { khRevenue: 0, khCost: 0, khProfit: 0, khQty: 0, thRevenue: 0, thCost: 0, thProfit: 0, thQty: 0 }
  );

  const columns = [
    {
      title: "Nhà máy",
      dataIndex: ["factory", "name"],
      key: "factory",
      width: 100,
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: "KH — Sản lượng",
      key: "khQty",
      render: (_: unknown, row: FactoryRow) => fmtQty(row.kh?.totalQtyKg),
    },
    {
      title: "KH — Doanh thu",
      key: "khRevenue",
      render: (_: unknown, row: FactoryRow) => fmt(row.kh?.totalRevenueVnd),
    },
    {
      title: "KH — Chi phí",
      key: "khCost",
      render: (_: unknown, row: FactoryRow) => fmt(row.kh?.totalCostVnd),
    },
    {
      title: "KH — Lợi nhuận",
      key: "khProfit",
      render: (_: unknown, row: FactoryRow) => {
        const val = row.kh?.totalProfitVnd;
        if (val === null || val === undefined) return "-";
        return (
          <Text type={val >= 0 ? "success" : "danger"} strong>
            {fmt(val)}
          </Text>
        );
      },
    },
    {
      title: "TH — Sản lượng",
      key: "thQty",
      render: (_: unknown, row: FactoryRow) => fmtQty(row.th?.totalQtyKg),
    },
    {
      title: "TH — Doanh thu",
      key: "thRevenue",
      render: (_: unknown, row: FactoryRow) => fmt(row.th?.totalRevenueVnd),
    },
    {
      title: "TH — Chi phí",
      key: "thCost",
      render: (_: unknown, row: FactoryRow) => fmt(row.th?.totalCostVnd),
    },
    {
      title: "TH — Lợi nhuận",
      key: "thProfit",
      render: (_: unknown, row: FactoryRow) => {
        const val = row.th?.totalProfitVnd;
        if (val === null || val === undefined) return "-";
        return (
          <Text type={val >= 0 ? "success" : "danger"} strong>
            {fmt(val)}
          </Text>
        );
      },
    },
    {
      title: "% TH/KH",
      key: "pct",
      render: (_: unknown, row: FactoryRow) => (
        <PctTag kh={row.kh?.totalRevenueVnd ?? null} th={row.th?.totalRevenueVnd ?? null} />
      ),
    },
  ];

  return (
    <div>
      <Alert
        type="info"
        showIcon
        closable
        message="Đã có Dashboard Doanh thu – Lợi nhuận mới"
        description={
          <span>
            Trang này sẽ được ẩn trong thời gian tới.{" "}
            <a href="/kdsx/revenue">Bấm vào đây để xem Dashboard mới →</a>
          </span>
        }
        style={{ marginBottom: 16 }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Dashboard KH Kinh doanh - SX (Cũ)
        </Title>
        <Space>
          <Select
            value={yearMonth}
            onChange={setYearMonth}
            options={monthOptions}
            style={{ width: 130 }}
          />
          <Tooltip title="Làm mới">
            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} />
          </Tooltip>
        </Space>
      </div>

      {/* Tổng hợp toàn công ty */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="KH — Doanh thu toàn Cty"
              value={totals.khRevenue / 1e9}
              precision={2}
              suffix="tỷ đ"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="TH — Doanh thu toàn Cty"
              value={totals.thRevenue / 1e9}
              precision={2}
              suffix="tỷ đ"
              valueStyle={{ color: "#3f8600" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="KH — Lợi nhuận toàn Cty"
              value={totals.khProfit / 1e9}
              precision={2}
              suffix="tỷ đ"
              valueStyle={{ color: totals.khProfit >= 0 ? "#3f8600" : "#cf1322" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="TH — Lợi nhuận toàn Cty"
              value={totals.thProfit / 1e9}
              precision={2}
              suffix="tỷ đ"
              valueStyle={{ color: totals.thProfit >= 0 ? "#3f8600" : "#cf1322" }}
            />
          </Card>
        </Col>
      </Row>

      <Spin spinning={loading}>
        <Table
          dataSource={data}
          columns={columns}
          rowKey={(row) => row.factory.id}
          pagination={false}
          bordered
          size="middle"
        />
      </Spin>

      {data.length === 0 && !loading && (
        <div style={{ textAlign: "center", marginTop: 32, color: "#888" }}>
          Chưa có dữ liệu cho tháng {yearMonth}
        </div>
      )}
    </div>
  );
}
