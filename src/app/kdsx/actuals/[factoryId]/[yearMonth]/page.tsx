"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Tabs,
  Table,
  Button,
  message,
  Alert,
  Spin,
  Descriptions,
  Tooltip,
} from "antd";
import { SyncOutlined, PlusOutlined } from "@ant-design/icons";
import { use } from "react";
import FixedCostTable from "@/components/kdsx/FixedCostTable";

const { Title, Text } = Typography;

function fmtBillion(v: number | null | undefined) {
  if (v === null || v === undefined) return "0";
  return (v / 1e9).toFixed(3);
}

interface Item { id: number; name: string; code: string | null; }
interface ActualLineItem {
  id: number;
  itemId: number;
  item: Item;
  salesOrderItem: any | null;
  qty: number;
  unitPriceUsd: number;
  revenueVnd: number | null;
  cottonCostVnd: number | null;
  peCostVnd: number | null;
  sellingCostVnd: number | null;
  gcDoubleTwistVnd: number | null;
  wasteRecoveryVnd: number | null;
  grossProfitVnd: number | null;
  note: string | null;
}
interface FixedCostEntry {
  id: number;
  costType: string;
  amountVnd: number;
  note: string | null;
}
interface Actual {
  id: number;
  factoryId: number;
  factory: { id: number; name: string };
  yearMonth: string;
  note: string | null;
  lineItems: ActualLineItem[];
  fixedCosts: FixedCostEntry[];
}

export default function ActualDetailPage({
  params,
}: {
  params: Promise<{ factoryId: string; yearMonth: string }>;
}) {
  const { factoryId, yearMonth } = use(params);

  const [actual, setActual] = useState<Actual | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchActual = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kdsx/monthly-actuals?factoryId=${factoryId}&yearMonth=${yearMonth}`);
      if (!res.ok) return;
      const actuals: Actual[] = await res.json();
      if (actuals.length === 0) {
        setActual(null);
        return;
      }
      const detailRes = await fetch(`/api/kdsx/monthly-actuals/${actuals[0].id}`);
      if (detailRes.ok) setActual(await detailRes.json());
    } finally {
      setLoading(false);
    }
  }, [factoryId, yearMonth]);

  useEffect(() => { fetchActual(); }, [fetchActual]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/kdsx/monthly-actuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factoryId: Number(factoryId), yearMonth }),
      });
      if (res.ok) {
        message.success("Đã tạo bản ghi thực hiện");
        fetchActual();
      } else {
        const err = await res.json();
        message.error(err.error || "Lỗi tạo");
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleSync() {
    if (!actual) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/kdsx/monthly-actuals/${actual.id}/sync`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        message.success(`Đã đồng bộ ${data.syncedItems} mặt hàng từ Nhật ký sản xuất`);
        fetchActual();
      } else {
        const err = await res.json();
        message.error(err.error || "Lỗi đồng bộ");
      }
    } finally {
      setSyncing(false);
    }
  }

  const totalRevenue = actual?.lineItems.reduce((s, li) => s + (li.revenueVnd ?? 0), 0) ?? 0;
  const totalFixedCost = actual?.fixedCosts
    .filter((fc) => fc.costType !== "DOANH_THU_HDTC")
    .reduce((s, fc) => s + fc.amountVnd, 0) ?? 0;
  const financialIncome = actual?.fixedCosts.find((fc) => fc.costType === "DOANH_THU_HDTC")?.amountVnd ?? 0;
  const totalGrossProfit = actual?.lineItems.reduce((s, li) => s + (li.grossProfitVnd ?? 0), 0) ?? 0;
  const netProfit = totalGrossProfit - totalFixedCost + financialIncome;

  const [yr, mo] = yearMonth.split("-");
  const factoryName = actual?.factory.name ?? `NM ${factoryId}`;

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;

  if (!actual) {
    return (
      <div>
        <Title level={3}>Thực hiện T{mo}/{yr} — NM {factoryId}</Title>
        <Alert
          type="info"
          message="Chưa có bản ghi thực hiện cho tháng này"
          description="Tạo bản ghi thực hiện để nhập chi phí cố định và đồng bộ sản lượng từ Nhật ký SX"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} loading={creating}>
          Tạo bản ghi thực hiện
        </Button>
      </div>
    );
  }

  const lineColumns = [
    { title: "STT", key: "stt", width: 50, render: (_: unknown, __: unknown, idx: number) => idx + 1 },
    { title: "Loại sợi", key: "item", render: (_: unknown, r: ActualLineItem) => r.item.name },
    {
      title: "HĐ",
      key: "order",
      render: (_: unknown, r: ActualLineItem) => r.salesOrderItem?.order?.orderNo || "-",
    },
    { title: "SL TH (kg)", key: "qty", render: (_: unknown, r: ActualLineItem) => r.qty.toLocaleString() },
    { title: "Giá (USD/kg)", dataIndex: "unitPriceUsd", key: "price" },
    { title: "DT (tỷ)", key: "rev", render: (_: unknown, r: ActualLineItem) => fmtBillion(r.revenueVnd) },
    { title: "CP Bông (tỷ)", key: "cotton", render: (_: unknown, r: ActualLineItem) => fmtBillion(r.cottonCostVnd) },
    { title: "CP PE (tỷ)", key: "pe", render: (_: unknown, r: ActualLineItem) => fmtBillion(r.peCostVnd) },
    {
      title: "LN gộp (tỷ)",
      key: "profit",
      render: (_: unknown, r: ActualLineItem) => (
        <Text type={(r.grossProfitVnd ?? 0) >= 0 ? "success" : "danger"}>
          {fmtBillion(r.grossProfitVnd)}
        </Text>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Thực hiện T{mo}/{yr} — {factoryName}
        </Title>
        <Button
          type="primary"
          icon={<SyncOutlined />}
          onClick={handleSync}
          loading={syncing}
        >
          Đồng bộ từ Nhật ký SX
        </Button>
      </div>

      <Tabs
        defaultActiveKey="lines"
        items={[
          {
            key: "lines",
            label: `Dòng sợi (${actual.lineItems.length})`,
            children: (
              <div>
                <Alert
                  type="info"
                  message="Sản lượng được lấy tự động từ Nhật ký SX. Nhấn 'Đồng bộ' để cập nhật."
                  style={{ marginBottom: 12 }}
                />
                <Table
                  dataSource={actual.lineItems}
                  columns={lineColumns}
                  rowKey="id"
                  pagination={false}
                  bordered
                  size="small"
                  scroll={{ x: 1000 }}
                />
              </div>
            ),
          },
          {
            key: "fixed",
            label: "Chi phí cố định",
            children: (
              <FixedCostTable
                monthlyActualId={actual.id}
                yearMonth={actual.yearMonth}
                factoryId={actual.factoryId}
                onSaved={fetchActual}
              />
            ),
          },
          {
            key: "summary",
            label: "Tổng kết",
            children: (
              <Descriptions bordered column={2} size="middle">
                <Descriptions.Item label="Tổng sản lượng TH" span={2}>
                  <Text strong>{actual.lineItems.reduce((s, li) => s + li.qty, 0).toLocaleString("vi-VN")} kg</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Tổng doanh thu TH">
                  <Text strong style={{ color: "#3f8600" }}>{fmtBillion(totalRevenue)} tỷ</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Lợi nhuận gộp TH">
                  <Text strong style={{ color: totalGrossProfit >= 0 ? "#3f8600" : "#cf1322" }}>
                    {fmtBillion(totalGrossProfit)} tỷ
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="CP nguyên vật liệu">
                  <Text style={{ color: "#cf1322" }}>
                    {fmtBillion(actual.lineItems.reduce((s, li) => s + (li.cottonCostVnd ?? 0) + (li.peCostVnd ?? 0), 0))} tỷ
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="CP bán hàng & gia công">
                  <Text style={{ color: "#cf1322" }}>
                    {fmtBillion(actual.lineItems.reduce((s, li) => s + (li.sellingCostVnd ?? 0) + (li.gcDoubleTwistVnd ?? 0), 0))} tỷ
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Tổng CP cố định (trừ HĐTC)">
                  <Text style={{ color: "#cf1322" }}>{fmtBillion(totalFixedCost)} tỷ</Text>
                </Descriptions.Item>
                {financialIncome > 0 && (
                  <Descriptions.Item label="Doanh thu HĐTC">
                    <Text style={{ color: "#3f8600" }}>+{fmtBillion(financialIncome)} tỷ</Text>
                  </Descriptions.Item>
                )}
                <Descriptions.Item
                  label={<Text strong style={{ fontSize: 15 }}>LỢI NHUẬN RÒNG TH</Text>}
                  span={2}
                >
                  {actual.fixedCosts.length === 0 ? (
                    <Tooltip title="Chưa nhập đủ chi phí cố định">
                      <Text type="secondary">--</Text>
                    </Tooltip>
                  ) : (
                    <Text strong style={{ fontSize: 18, color: netProfit >= 0 ? "#3f8600" : "#cf1322" }}>
                      {fmtBillion(netProfit)} tỷ
                    </Text>
                  )}
                </Descriptions.Item>
              </Descriptions>
            ),
          },
        ]}
      />

    </div>
  );
}
