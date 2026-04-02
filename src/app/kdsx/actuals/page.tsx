"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Table,
  Button,
  Select,
  Space,
  Tooltip,
} from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";

const { Title } = Typography;

interface Factory { id: number; name: string; }
interface Actual {
  id: number;
  factoryId: number;
  factory: Factory;
  yearMonth: string;
  note: string | null;
  _count: { lineItems: number };
}

export default function ActualsPage() {
  const router = useRouter();
  const [actuals, setActuals] = useState<Actual[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterFactory, setFilterFactory] = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<string | null>(null);

  const monthOptions = Array.from({ length: 24 }, (_, i) => {
    const m = dayjs().subtract(i, "month");
    return { label: m.format("MM/YYYY"), value: m.format("YYYY-MM") };
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterFactory) params.set("factoryId", String(filterFactory));
      if (filterMonth) params.set("yearMonth", filterMonth);
      const [actualsRes, factoriesRes] = await Promise.all([
        fetch(`/api/kdsx/monthly-actuals?${params}`),
        fetch("/api/factories"),
      ]);
      if (actualsRes.ok) setActuals(await actualsRes.json());
      if (factoriesRes.ok) setFactories(await factoriesRes.json());
    } finally {
      setLoading(false);
    }
  }, [filterFactory, filterMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns = [
    {
      title: "Tháng",
      dataIndex: "yearMonth",
      key: "yearMonth",
      render: (v: string) => {
        const [yr, mo] = v.split("-");
        return <strong>T{mo}/{yr}</strong>;
      },
    },
    { title: "Nhà máy", key: "factory", render: (_: unknown, r: Actual) => r.factory.name },
    {
      title: "Số dòng sợi",
      key: "lineItems",
      render: (_: unknown, r: Actual) => r._count.lineItems,
    },
    { title: "Ghi chú", dataIndex: "note", key: "note", render: (v: string | null) => v || "-" },
    {
      title: "Thao tác",
      key: "action",
      width: 100,
      render: (_: unknown, row: Actual) => (
        <Tooltip title="Mở thực hiện">
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => router.push(`/kdsx/actuals/${row.factoryId}/${row.yearMonth}`)}
          >
            Mở
          </Button>
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
        <Title level={3} style={{ margin: 0 }}>Thực hiện tháng</Title>
        <Space>
          <Select
            placeholder="Nhà máy"
            allowClear
            options={factories.map((f) => ({ label: f.name, value: f.id }))}
            onChange={(v) => setFilterFactory(v ?? null)}
            style={{ width: 120 }}
          />
          <Select
            placeholder="Tháng"
            allowClear
            options={monthOptions}
            onChange={(v) => setFilterMonth(v ?? null)}
            style={{ width: 120 }}
          />
        </Space>
      </div>

      <Table
        dataSource={actuals}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
        size="middle"
      />
    </div>
  );
}
