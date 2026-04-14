"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Table,
  Button,
  InputNumber,
  Input,
  Tag,
  Tooltip,
  message,
  Typography,
  Divider,
} from "antd";
import { SaveOutlined, LinkOutlined } from "@ant-design/icons";
import { ALL_FIXED_COST_TYPES, FIXED_COST_LABELS } from "@/lib/kdsx/calculator";

const { Text } = Typography;

const INCOME_TYPE = "DOANH_THU_HDTC";
const ELECTRIC_TYPE = "TIEN_DIEN";

interface FixedCostRow {
  id: number | null;
  costType: string;
  amountVnd: number;
  note: string | null;
}

interface FixedCostTableProps {
  monthlyPlanId?: number;
  monthlyActualId?: number;
  yearMonth: string;   // "2026-01"
  factoryId: number;
  readonly?: boolean;
  onSaved?: () => void;
}

export default function FixedCostTable({
  monthlyPlanId,
  monthlyActualId,
  yearMonth,
  factoryId,
  readonly = false,
  onSaved,
}: FixedCostTableProps) {
  const [rows, setRows] = useState<FixedCostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (monthlyPlanId) params.set("monthlyPlanId", String(monthlyPlanId));
      else if (monthlyActualId) params.set("monthlyActualId", String(monthlyActualId));
      else return;

      const r = await fetch(`/api/kdsx/fixed-costs?${params}`);
      if (!r.ok) return;
      const data: FixedCostRow[] = await r.json();

      // Đảm bảo đủ 14 rows theo thứ tự ALL_FIXED_COST_TYPES
      const map = new Map(data.map((d) => [d.costType, d]));
      const ordered = ALL_FIXED_COST_TYPES.map((ct) =>
        map.get(ct) ?? { id: null, costType: ct, amountVnd: 0, note: null }
      );
      setRows(ordered);
    } finally {
      setLoading(false);
    }
  }, [monthlyPlanId, monthlyActualId]);

  useEffect(() => { loadData(); }, [loadData]);

  function updateAmount(costType: string, value: number | null) {
    setRows((prev) =>
      prev.map((r) => r.costType === costType ? { ...r, amountVnd: value ?? 0 } : r)
    );
  }

  function updateNote(costType: string, value: string) {
    setRows((prev) =>
      prev.map((r) => r.costType === costType ? { ...r, note: value || null } : r)
    );
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        entries: rows.map((r) => ({
          costType: r.costType,
          amountVnd: r.amountVnd,
          note: r.note,
        })),
      };
      if (monthlyPlanId) body.monthlyPlanId = monthlyPlanId;
      else body.monthlyActualId = monthlyActualId;

      const res = await fetch("/api/kdsx/fixed-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || "Lỗi lưu chi phí cố định");
        return;
      }
      message.success("Đã lưu chi phí cố định");
      await loadData();
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  // Tính tổng chi phí cố định (không tính DOANH_THU_HDTC)
  const { totalFixedCost, financialIncome } = useMemo(() => {
    const totalFixedCost = rows
      .filter((r) => r.costType !== INCOME_TYPE)
      .reduce((s, r) => s + r.amountVnd, 0);
    const financialIncome = rows.find((r) => r.costType === INCOME_TYPE)?.amountVnd ?? 0;
    return { totalFixedCost, financialIncome };
  }, [rows]);

  const [yr, mo] = yearMonth.split("-");
  const energyLink = `/dashboard/energy/daily-input?factoryId=${factoryId}&year=${yr}&month=${mo}`;

  const columns = [
    {
      title: "Khoản chi phí",
      dataIndex: "costType",
      key: "costType",
      width: 260,
      render: (costType: string) => {
        const label = FIXED_COST_LABELS[costType as keyof typeof FIXED_COST_LABELS] || costType;
        if (costType === INCOME_TYPE) {
          return (
            <span>
              {label}{" "}
              <Tooltip title="Khoản này là thu nhập tài chính (lãi tiền gửi...) — được cộng vào lợi nhuận, không phải chi phí">
                <Tag color="blue">Khoản thu</Tag>
              </Tooltip>
            </span>
          );
        }
        if (costType === ELECTRIC_TYPE) {
          return (
            <span>
              {label}{" "}
              <Tooltip title="Xem chi tiết tháng này tại module Điện năng">
                <a href={energyLink} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                  <LinkOutlined /> Xem module ĐN
                </a>
              </Tooltip>
            </span>
          );
        }
        return label;
      },
    },
    {
      title: "Số tiền (VNĐ)",
      key: "amountVnd",
      width: 220,
      render: (_: unknown, row: FixedCostRow) =>
        readonly ? (
          <Text>{row.amountVnd.toLocaleString("vi-VN")}</Text>
        ) : (
          <InputNumber
            value={row.amountVnd}
            onChange={(v) => updateAmount(row.costType, v)}
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            parser={(v) => parseFloat(v!.replace(/,/g, "")) as any}
            min={0}
            step={100000000}
            style={{ width: "100%" }}
            placeholder="VD: 1,900,000,000"
          />
        ),
    },
    {
      title: "Quy đổi (tỷ đ)",
      key: "billion",
      width: 120,
      render: (_: unknown, row: FixedCostRow) => (
        <Text type={row.costType === INCOME_TYPE ? "success" : undefined}>
          {(row.amountVnd / 1e9).toFixed(3)}
        </Text>
      ),
    },
    {
      title: "Ghi chú",
      key: "note",
      render: (_: unknown, row: FixedCostRow) =>
        readonly ? (
          <Text type="secondary">{row.note || "-"}</Text>
        ) : (
          <Input
            value={row.note ?? ""}
            onChange={(e) => updateNote(row.costType, e.target.value)}
            placeholder="Ghi chú (tùy chọn)"
            size="small"
          />
        ),
    },
  ];

  return (
    <div>
      {!readonly && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveAll}
            loading={saving}
          >
            Lưu tất cả
          </Button>
        </div>
      )}

      <Table
        dataSource={rows}
        columns={columns}
        rowKey="costType"
        pagination={false}
        loading={loading}
        bordered
        size="small"
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}>
              <Text strong>Tổng CP cố định (trừ HĐTC)</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1} />
            <Table.Summary.Cell index={2}>
              <Text strong style={{ color: "#cf1322" }}>
                {(totalFixedCost / 1e9).toFixed(3)} tỷ
              </Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={3} />
          </Table.Summary.Row>
        )}
      />

      {financialIncome > 0 && (
        <div style={{ marginTop: 8, textAlign: "right" }}>
          <Text type="secondary">Doanh thu HĐTC: </Text>
          <Text type="success" strong>+{(financialIncome / 1e9).toFixed(3)} tỷ</Text>
          <Text type="secondary"> (cộng vào lợi nhuận)</Text>
        </div>
      )}
    </div>
  );
}
