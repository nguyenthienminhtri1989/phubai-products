"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography,
  Select,
  Button,
  Card,
  Table,
  Tag,
  Space,
  Spin,
  Empty,
  message,
  Modal,
  InputNumber,
  Collapse,
  Radio,
  Tooltip,
  Alert,
  Segmented,
  Checkbox,
} from "antd";
import {
  SaveOutlined,
  CopyOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { ColumnsType } from "antd/es/table";
import DatePicker from "antd/es/date-picker";

const { Title, Text } = Typography;

// ===== TYPES =====
interface Factory {
  id: number;
  name: string;
}

interface Process {
  id: number;
  name: string;
  factoryId: number;
}

interface QuotaState {
  quotaQty: number | null;
  isRemainder: boolean;
  sortOrder: number;
}

interface OpeningBalanceState {
  producedBeforeKg: number | null;
}

interface ContractRow {
  salesOrderItemId: number;
  itemId: number;
  itemName: string;
  orderId: number;
  orderNo: string;
  customerName: string | null;
  plannedQty: number;
  deliveredQty: number;
  note: string | null;
  cumProducedPrevMonths: number;
  remainingTotal: number;
  producedThisMonth: number;
  openingBalance: {
    id: number;
    openingYearMonth: string;
    producedBeforeKg: number;
    note: string | null;
  } | null;
  quota: {
    id?: number;
    quotaQty: number | null;
    isRemainder: boolean;
    sortOrder: number;
  } | null;
}

interface ItemGroup {
  itemId: number;
  itemName: string;
  totalProductionKg: number;
  contracts: ContractRow[];
}

// ===== HELPERS =====
const fmtN = (v: number | null | undefined) => {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("vi-VN").format(Math.round(v));
};

function getPrevYearMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

// ===== ITEM GROUP CARD =====
interface ItemGroupCardProps {
  group: ItemGroup;
  localQuotas: Record<number, QuotaState>;
  localOpeningBalances: Record<number, OpeningBalanceState>;
  onQuotaChange: (salesOrderItemId: number, patch: Partial<QuotaState>) => void;
  onOpeningBalanceChange: (
    salesOrderItemId: number,
    patch: Partial<OpeningBalanceState>
  ) => void;
  monthLabel: string;
}

function ItemGroupCard({
  group,
  localQuotas,
  localOpeningBalances,
  onQuotaChange,
  onOpeningBalanceChange,
  monthLabel,
}: ItemGroupCardProps) {
  const { contracts, totalProductionKg } = group;

  const getProducedBefore = (r: ContractRow) => {
    const local = localOpeningBalances[r.salesOrderItemId];
    if (local) return local.producedBeforeKg ?? 0;
    return r.cumProducedPrevMonths;
  };

  const getRemaining = (r: ContractRow) =>
    Math.max(0, r.plannedQty - r.deliveredQty - getProducedBefore(r));

  // Tổng FIXED quota
  const totalFixedQuota = contracts.reduce((s, c) => {
    const q = localQuotas[c.salesOrderItemId];
    if (!q || q.isRemainder) return s;
    return s + (q.quotaQty ?? 0);
  }, 0);

  // Remainder contract (nếu có)
  const remainderContract = contracts.find(
    (c) => localQuotas[c.salesOrderItemId]?.isRemainder
  );
  // Phần dư = SL thực tế của item - quota đã cố định
  const remainderQty = remainderContract
    ? Math.max(0, totalProductionKg - totalFixedQuota)
    : null;

  // Tổng quota đã phân bổ
  const totalQuota = totalFixedQuota + (remainderQty ?? 0);

  // Chênh lệch so với SL thực tế
  const diff = totalProductionKg - totalQuota;

  const handleTypeChange = (soid: number, newType: "FIXED" | "REMAINDER") => {
    if (newType === "REMAINDER") {
      const existingRemainderSoid = contracts.find(
        (c) =>
          c.salesOrderItemId !== soid &&
          localQuotas[c.salesOrderItemId]?.isRemainder
      );

      if (existingRemainderSoid) {
        const computedRemainder = Math.max(
          0,
          totalProductionKg - totalFixedQuota
        );
        Modal.confirm({
          title: "Thay đổi HĐ cuối",
          content: `HĐ ${existingRemainderSoid.orderNo} đang là "Cuối". Chuyển sang "Cố định" với quota = ${fmtN(computedRemainder)} kg?`,
          okText: "Đồng ý",
          cancelText: "Huỷ",
          onOk: () => {
            onQuotaChange(existingRemainderSoid.salesOrderItemId, {
              isRemainder: false,
              quotaQty: computedRemainder,
            });
            onQuotaChange(soid, { isRemainder: true, quotaQty: null });
          },
        });
      } else {
        onQuotaChange(soid, { isRemainder: true, quotaQty: null });
      }
    } else {
      // REMAINDER → FIXED: pre-fill với phần dư hiện tại
      const currentRemainderQty = Math.max(
        0,
        totalProductionKg - totalFixedQuota
      );
      onQuotaChange(soid, {
        isRemainder: false,
        quotaQty: currentRemainderQty,
      });
    }
  };

  const columns: ColumnsType<ContractRow> = [
    {
      title: "Số HĐ",
      key: "orderNo",
      width: 130,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong type={getRemaining(r) <= 0 ? "secondary" : undefined}>
            {r.orderNo}
          </Text>
          {getRemaining(r) <= 0 && (
            <Tag color="default" style={{ fontSize: 11, marginInlineEnd: 0 }}>
              Đã hoàn thành
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Khách hàng",
      key: "customer",
      width: 130,
      ellipsis: true,
      render: (_, r) =>
        r.customerName ? (
          r.customerName
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Ghi chú dòng HĐ",
      key: "note",
      width: 130,
      ellipsis: true,
      render: (_, r) =>
        r.note ? r.note : <Text type="secondary">—</Text>,
    },
    {
      title: "Tổng HĐ (kg)",
      key: "plannedQty",
      width: 110,
      align: "right",
      render: (_, r) => fmtN(r.plannedQty),
    },
    {
      title: "Lũy kế đã SX",
      key: "cumProduced",
      width: 110,
      align: "right",
      render: (_, r) => (
        <Tooltip title="Tổng sản lượng đã phân bổ cho HĐ này ở các tháng trước">
          {fmtN(r.cumProducedPrevMonths)}
        </Tooltip>
      ),
    },
    {
      title: `Đã tính trước ${monthLabel}`,
      key: "openingBalance",
      width: 150,
      align: "right",
      render: (_, r) => {
        const local = localOpeningBalances[r.salesOrderItemId];
        const value =
          local?.producedBeforeKg ??
          r.openingBalance?.producedBeforeKg ??
          undefined;
        return (
          <Tooltip title="Sản lượng đã SX/giao/tính trước kỳ mở sổ này. Nhập số từ Excel để tách quá khứ khỏi allocation cũ.">
            <InputNumber
              value={value}
              placeholder={fmtN(r.cumProducedPrevMonths)}
              min={0}
              max={Math.max(0, r.plannedQty - r.deliveredQty)}
              step={1000}
              onChange={(v) =>
                onOpeningBalanceChange(r.salesOrderItemId, {
                  producedBeforeKg: v ?? null,
                })
              }
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              parser={(v) => Number(v?.replace(/,/g, "") || 0) as any}
              style={{ width: "100%" }}
              size="small"
            />
          </Tooltip>
        );
      },
    },
    {
      title: "Còn lại",
      key: "remaining",
      width: 100,
      align: "right",
      render: (_, r) => {
        const val = getRemaining(r);
        return (
          <Text type={val <= 0 ? "success" : undefined} strong={val <= 0}>
            {val <= 0 ? "✓ Xong" : fmtN(val)}
          </Text>
        );
      },
    },
    {
      title: `Quota ${monthLabel}`,
      key: "quota",
      width: 150,
      align: "right",
      render: (_, r) => {
        const q = localQuotas[r.salesOrderItemId];
        if (!q) {
          return (
            <InputNumber
              value={undefined}
              placeholder="Chưa nhập"
              min={0}
              step={1000}
              onChange={(v) =>
                onQuotaChange(r.salesOrderItemId, {
                  quotaQty: v,
                  isRemainder: false,
                  sortOrder: 0,
                })
              }
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              parser={(v) => Number(v?.replace(/,/g, "") || 0) as any}
              style={{ width: "100%" }}
              size="small"
            />
          );
        }
        if (q.isRemainder) {
          const computedVal =
            remainderContract?.salesOrderItemId === r.salesOrderItemId
              ? remainderQty
              : null;
          return (
            <Text italic type="success">
              = {fmtN(computedVal ?? 0)}
            </Text>
          );
        }
        return (
          <InputNumber
            value={q.quotaQty ?? undefined}
            min={0}
            max={getRemaining(r) > 0 ? getRemaining(r) : undefined}
            step={1000}
            onChange={(v) =>
              onQuotaChange(r.salesOrderItemId, { quotaQty: v ?? null })
            }
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            parser={(v) => Number(v?.replace(/,/g, "") || 0) as any}
            style={{ width: "100%" }}
            size="small"
          />
        );
      },
    },
    {
      title: "Loại",
      key: "type",
      width: 130,
      align: "center",
      render: (_, r) => {
        const q = localQuotas[r.salesOrderItemId];
        const val = q?.isRemainder ? "REMAINDER" : "FIXED";
        return (
          <Radio.Group
            value={val}
            onChange={(e) =>
              handleTypeChange(r.salesOrderItemId, e.target.value)
            }
            size="small"
            buttonStyle="solid"
          >
            <Radio.Button value="FIXED">Cố định</Radio.Button>
            <Radio.Button value="REMAINDER">Cuối</Radio.Button>
          </Radio.Group>
        );
      },
    },
    {
      title: `Đã SX ${monthLabel}`,
      key: "produced",
      width: 110,
      align: "right",
      render: (_, r) => fmtN(r.producedThisMonth),
    },
    {
      title: "%",
      key: "pct",
      width: 70,
      align: "center",
      render: (_, r) => {
        const q = localQuotas[r.salesOrderItemId];
        const quota =
          q?.isRemainder
            ? remainderContract?.salesOrderItemId === r.salesOrderItemId
              ? (remainderQty ?? 0)
              : 0
            : (q?.quotaQty ?? 0);
        if (quota <= 0) return <Text type="secondary">—</Text>;
        const pct = Math.round((r.producedThisMonth / quota) * 100);
        return (
          <Tag color={pct >= 100 ? "green" : pct >= 50 ? "blue" : "default"}>
            {pct}%
          </Tag>
        );
      },
    },
  ];

  const summary = () => {
    const totalPlanned = contracts.reduce((s, c) => s + c.plannedQty, 0);
    const totalCum = contracts.reduce((s, c) => s + getProducedBefore(c), 0);
    const totalRemaining = contracts.reduce((s, c) => s + getRemaining(c), 0);
    const totalProducedThisMonth = contracts.reduce(
      (s, c) => s + c.producedThisMonth,
      0
    );
    return (
      <Table.Summary.Row style={{ fontWeight: 600, background: "#fafafa" }}>
        <Table.Summary.Cell index={0} colSpan={3}>
          <Text strong>Tổng</Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={3} align="right">
          {fmtN(totalPlanned)}
        </Table.Summary.Cell>
        <Table.Summary.Cell index={4} align="right">
          {fmtN(totalCum)}
        </Table.Summary.Cell>
        <Table.Summary.Cell index={5} align="right">
          {fmtN(totalCum)}
        </Table.Summary.Cell>
        <Table.Summary.Cell index={6} align="right">
          {fmtN(totalRemaining)}
        </Table.Summary.Cell>
        <Table.Summary.Cell index={7} align="right">
          {fmtN(totalQuota)}
        </Table.Summary.Cell>
        <Table.Summary.Cell index={8} />
        <Table.Summary.Cell index={9} align="right">
          {fmtN(totalProducedThisMonth)}
        </Table.Summary.Cell>
        <Table.Summary.Cell index={10} />
      </Table.Summary.Row>
    );
  };

  const headerExtra = (
    <Space size={8} wrap>
      <Text type="secondary" style={{ fontSize: 12 }}>
        SL tháng: <strong>{fmtN(totalProductionKg)} kg</strong>
      </Text>
      <Text type="secondary" style={{ fontSize: 12 }}>
        | Đã phân bổ: <strong>{fmtN(totalQuota)} kg</strong>
      </Text>
      {totalProductionKg > 0 &&
        (Math.abs(diff) < 1 ? (
          <Tag color="green">Khớp ✓</Tag>
        ) : (
          <Tag color="orange">
            Chênh: {diff > 0 ? "+" : ""}
            {fmtN(diff)} kg
          </Tag>
        ))}
    </Space>
  );

  return (
    <Card
      size="small"
      title={
        <Space>
          <Tag color="blue">{group.itemName}</Tag>
          {headerExtra}
        </Space>
      }
      style={{ marginBottom: 12 }}
      styles={{ body: { padding: "8px 0" } }}
    >
      <Table<ContractRow>
        dataSource={contracts}
        columns={columns}
        rowKey="salesOrderItemId"
        pagination={false}
        size="small"
        scroll={{ x: 960 }}
        summary={summary}
      />
    </Card>
  );
}

// ===== MAIN PAGE =====
export default function MonthlyQuotasPage() {
  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryId, setFactoryId] = useState<number | null>(null);
  const [allProcesses, setAllProcesses] = useState<Process[]>([]);
  const [processId, setProcessId] = useState<number | null>(null);
  const [yearMonth, setYearMonth] = useState<string>(
    dayjs().format("YYYY-MM")
  );
  const [mode, setMode] = useState<"ACTUAL" | "ACTUAL_PROJECTED">("ACTUAL");

  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [localQuotas, setLocalQuotas] = useState<Record<number, QuotaState>>({});
  const [localOpeningBalances, setLocalOpeningBalances] = useState<
    Record<number, OpeningBalanceState>
  >({});

  // Hiển thị cả HĐ đã hoàn thành (remainingTotal <= 0) để nhập quota cho HĐ
  // đa tháng đã "đóng" do rót đầy theo cam kết tổng
  const [showCompleted, setShowCompleted] = useState(false);

  // ── Processes filtered by factoryId ────────────────────────────────────────
  const processes = useMemo(
    () => allProcesses.filter((p) => p.factoryId === factoryId),
    [allProcesses, factoryId]
  );

  // ── Load factories + processes ──────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/factories")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setFactories(data);
          if (data.length > 0) setFactoryId(data[0].id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/processes")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAllProcesses(data);
      })
      .catch(() => {});
  }, []);

  // Auto-select first process when factory changes
  useEffect(() => {
    const forFactory = allProcesses.filter((p) => p.factoryId === factoryId);
    if (forFactory.length > 0) setProcessId(forFactory[0].id);
    else setProcessId(null);
  }, [factoryId, allProcesses]);

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!factoryId || !processId || !yearMonth) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        factoryId: String(factoryId),
        processId: String(processId),
        yearMonth,
        mode,
      });
      const res = await fetch(`/api/kdsx/monthly-quotas?${params}`);
      if (!res.ok)
        throw new Error((await res.json()).error ?? "Lỗi tải dữ liệu");
      const data = await res.json();
      const fetchedGroups: ItemGroup[] = data.groups ?? [];
      setGroups(fetchedGroups);

      // Khởi tạo localQuotas từ DB
      const initial: Record<number, QuotaState> = {};
      const initialOpening: Record<number, OpeningBalanceState> = {};
      for (const g of fetchedGroups) {
        for (const c of g.contracts) {
          if (c.quota) {
            initial[c.salesOrderItemId] = {
              quotaQty: c.quota.quotaQty,
              isRemainder: c.quota.isRemainder,
              sortOrder: c.quota.sortOrder,
            };
          }
          if (c.openingBalance) {
            initialOpening[c.salesOrderItemId] = {
              producedBeforeKg: c.openingBalance.producedBeforeKg,
            };
          }
        }
      }
      setLocalQuotas(initial);
      setLocalOpeningBalances(initialOpening);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [factoryId, processId, yearMonth, mode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Group into display buckets ──────────────────────────────────────────────
  const { itemGroups, singleContractItems, doneContracts } = useMemo(() => {
    const multi: ItemGroup[] = [];
    const single: ContractRow[] = [];
    const done: ContractRow[] = [];

    for (const g of groups) {
      // Khi bật showCompleted → coi cả HĐ đã hoàn thành là "visible" để nhập quota
      const visibleContracts = g.contracts.filter(
        (c) => showCompleted || c.remainingTotal > 0
      );
      // Chỉ đẩy HĐ hoàn thành vào mục "đã hoàn thành" (read-only) khi KHÔNG hiện inline
      if (!showCompleted) {
        done.push(...g.contracts.filter((c) => c.remainingTotal <= 0));
      }

      if (visibleContracts.length === 0) continue;
      if (visibleContracts.length >= 2) {
        multi.push({ ...g, contracts: visibleContracts });
      } else {
        single.push(...visibleContracts);
      }
    }

    multi.sort((a, b) => a.itemName.localeCompare(b.itemName, "vi"));
    return { itemGroups: multi, singleContractItems: single, doneContracts: done };
  }, [groups, showCompleted]);

  // ── Quota change handler ───────────────────────────────────────────────────
  const handleQuotaChange = useCallback(
    (salesOrderItemId: number, patch: Partial<QuotaState>) => {
      setLocalQuotas((prev) => {
        const existing = prev[salesOrderItemId] ?? {
          quotaQty: null,
          isRemainder: false,
          sortOrder: 0,
        };
        return {
          ...prev,
          [salesOrderItemId]: { ...existing, ...patch },
        };
      });
    },
    []
  );

  const handleOpeningBalanceChange = useCallback(
    (salesOrderItemId: number, patch: Partial<OpeningBalanceState>) => {
      setLocalOpeningBalances((prev) => {
        const existing = prev[salesOrderItemId] ?? {
          producedBeforeKg: null,
        };
        return {
          ...prev,
          [salesOrderItemId]: { ...existing, ...patch },
        };
      });
    },
    []
  );

  // ── Validate ───────────────────────────────────────────────────────────────
  function validate(): boolean {
    for (const group of itemGroups) {
      const groupQuotas = group.contracts
        .map((c) => localQuotas[c.salesOrderItemId])
        .filter(Boolean);
      const remainderCount = groupQuotas.filter((q) => q.isRemainder).length;
      if (groupQuotas.length > 0 && remainderCount === 0) {
        message.warning(
          `Mặt hàng "${group.itemName}": chưa chọn HĐ "Cuối" (REMAINDER)`
        );
        return false;
      }
      if (remainderCount > 1) {
        message.error(
          `Mặt hàng "${group.itemName}": chỉ được 1 HĐ "Cuối"`
        );
        return false;
      }
    }
    return true;
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!factoryId || !processId) {
      message.warning("Chọn nhà máy và công đoạn trước");
      return;
    }
    if (!validate()) return;

    const multiSoIds = new Set(
      itemGroups.flatMap((g) => g.contracts.map((c) => c.salesOrderItemId))
    );
    const quotasToSave = Object.entries(localQuotas)
      .filter(([idStr]) => multiSoIds.has(Number(idStr)))
      .map(([idStr, q], idx) => ({
        salesOrderItemId: Number(idStr),
        quotaQty: q.isRemainder ? null : (q.quotaQty ?? null),
        isRemainder: q.isRemainder,
        sortOrder: q.sortOrder || idx,
      }));

    const openingBalancesToSave = Object.entries(localOpeningBalances)
      .filter(([idStr, b]) => {
        const id = Number(idStr);
        return multiSoIds.has(id) && b.producedBeforeKg !== null;
      })
      .map(([idStr, b]) => ({
        salesOrderItemId: Number(idStr),
        producedBeforeKg: b.producedBeforeKg ?? 0,
      }));

    if (quotasToSave.length === 0 && openingBalancesToSave.length === 0) {
      message.info("Chưa có quota hoặc số dư đầu kỳ nào để lưu");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/kdsx/monthly-quotas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factoryId,
          processId,
          yearMonth,
          quotas: quotasToSave,
          openingBalances: openingBalancesToSave,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      message.success(
        `Đã lưu ${quotasToSave.length} quota và ${openingBalancesToSave.length} số dư đầu kỳ cho tháng ${yearMonth}`
      );
      fetchData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "Lỗi lưu dữ liệu");
    } finally {
      setSaving(false);
    }
  };

  // ── Copy from previous ─────────────────────────────────────────────────────
  const handleCopyFromPrevious = () => {
    if (!factoryId || !processId) {
      message.warning("Chọn nhà máy và công đoạn trước");
      return;
    }
    const prevMonth = getPrevYearMonth(yearMonth);
    Modal.confirm({
      title: `Copy quota từ tháng ${prevMonth}?`,
      content:
        "Quota sẽ được điều chỉnh theo sản lượng còn lại. HĐ đã hoàn thành sẽ bị bỏ qua.",
      okText: "Copy",
      cancelText: "Huỷ",
      onOk: async () => {
        try {
          const res = await fetch(
            "/api/kdsx/monthly-quotas/copy-from-previous",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                factoryId,
                processId,
                yearMonth,
                sourceYearMonth: prevMonth,
              }),
            }
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          message.success(
            `Đã copy ${data.copied} quota, bỏ qua ${data.skippedDone} HĐ hoàn thành`
          );
          fetchData();
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : "Lỗi copy quota");
        }
      },
    });
  };

  const monthLabel = `T${yearMonth.split("-")[1]}`;

  const doneColumns: ColumnsType<ContractRow> = [
    { title: "Số HĐ", key: "orderNo", render: (_, r) => r.orderNo, width: 100 },
    {
      title: "Khách hàng",
      key: "customer",
      render: (_, r) => r.customerName ?? "—",
      width: 130,
    },
    { title: "Mặt hàng", key: "item", render: (_, r) => r.itemName, width: 130 },
    {
      title: "Tổng HĐ",
      key: "planned",
      align: "right",
      render: (_, r) => fmtN(r.plannedQty),
      width: 110,
    },
    {
      title: "Đã SX (lũy kế)",
      key: "cum",
      align: "right",
      render: (_, r) => fmtN(r.cumProducedPrevMonths),
      width: 120,
    },
    {
      title: "",
      key: "status",
      render: () => <Tag color="green">✓ Hoàn thành</Tag>,
      width: 120,
    },
  ];

  return (
    <div style={{ maxWidth: 1400 }}>
      {/* Header */}
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
        <Title level={3} style={{ margin: 0 }}>
          Phân bổ sản lượng tháng
        </Title>
        <Space wrap>
          <Select
            placeholder="Chọn nhà máy"
            value={factoryId}
            onChange={(v) => setFactoryId(v)}
            options={factories.map((f) => ({ label: f.name, value: f.id }))}
            style={{ width: 160 }}
          />
          <Select
            placeholder="Chọn công đoạn"
            value={processId}
            onChange={(v) => setProcessId(v)}
            options={processes.map((p) => ({ label: p.name, value: p.id }))}
            style={{ width: 160 }}
            disabled={processes.length === 0}
          />
          <DatePicker
            picker="month"
            value={yearMonth ? dayjs(yearMonth) : null}
            onChange={(d) => d && setYearMonth(d.format("YYYY-MM"))}
            format="MM/YYYY"
            style={{ width: 120 }}
          />
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as "ACTUAL" | "ACTUAL_PROJECTED")}
            options={[
              { label: "Thực tế", value: "ACTUAL" },
              { label: "Dự báo", value: "ACTUAL_PROJECTED" },
            ]}
          />
          <Button
            icon={<CopyOutlined />}
            onClick={handleCopyFromPrevious}
            disabled={!factoryId || !processId}
          >
            Copy từ tháng trước
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
            disabled={!factoryId || !processId}
          >
            Lưu phân bổ
          </Button>
        </Space>
      </div>

      {/* Hướng dẫn */}
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message={
          <Text style={{ fontSize: 12 }}>
            <strong>Cách dùng:</strong> Mỗi mặt hàng có nhiều HĐ — nhập
            quota (kg) cho từng HĐ "Cố định", chọn HĐ cuối là "Cuối" (nhận
            phần dư). Mỗi mặt hàng chỉ được 1 HĐ "Cuối". Mặt hàng chỉ có 1
            HĐ không cần phân bổ. Chọn "Dự báo" để xem SL ước tính cả tháng.
          </Text>
        }
        style={{ marginBottom: 16 }}
        closable
      />

      {/* Toggle hiện HĐ đã hoàn thành */}
      <div style={{ marginBottom: 12 }}>
        <Checkbox
          checked={showCompleted}
          onChange={(e) => setShowCompleted(e.target.checked)}
        >
          Hiển thị cả HĐ đã hoàn thành
        </Checkbox>
        <Tooltip title="Hiện cả những HĐ đã 'đóng' do rót đầy theo cam kết tổng, để có thể nhập lại quota tháng cho HĐ đa tháng.">
          <InfoCircleOutlined style={{ color: "#999", marginLeft: 4 }} />
        </Tooltip>
      </div>

      {/* Loading */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 64 }}>
          <Spin size="large" />
        </div>
      ) : !factoryId || !processId ? (
        <Empty
          description="Chọn nhà máy và công đoạn để xem dữ liệu"
          style={{ padding: 48 }}
        />
      ) : (
        <>
          {itemGroups.length === 0 && singleContractItems.length === 0 ? (
            <Empty
              description="Không có HĐ active nào trong tháng này"
              style={{ padding: 48 }}
            />
          ) : (
            <>
              {itemGroups.map((group) => (
                <ItemGroupCard
                  key={group.itemId}
                  group={group}
                  localQuotas={localQuotas}
                  localOpeningBalances={localOpeningBalances}
                  onQuotaChange={handleQuotaChange}
                  onOpeningBalanceChange={handleOpeningBalanceChange}
                  monthLabel={monthLabel}
                />
              ))}

              {singleContractItems.length > 0 && (
                <Card
                  size="small"
                  title={
                    <Text type="secondary">
                      Mặt hàng chỉ có 1 HĐ — không cần phân bổ (
                      {singleContractItems.length})
                    </Text>
                  }
                  style={{ marginBottom: 12, opacity: 0.75 }}
                  styles={{ body: { padding: "8px 12px" } }}
                >
                  <Space wrap>
                    {singleContractItems.map((r) => (
                      <Tag key={r.salesOrderItemId} color="default">
                        {r.itemName} — {r.orderNo}
                        {r.customerName ? ` (${r.customerName})` : ""}
                        {" · "}Còn {fmtN(r.remainingTotal)} kg
                      </Tag>
                    ))}
                  </Space>
                </Card>
              )}

              {doneContracts.length > 0 && (
                <Collapse
                  ghost
                  style={{ marginTop: 8 }}
                  items={[
                    {
                      key: "done",
                      label: (
                        <Text type="secondary">
                          HĐ đã hoàn thành trong tháng này (
                          {doneContracts.length})
                        </Text>
                      ),
                      children: (
                        <Table<ContractRow>
                          dataSource={doneContracts}
                          columns={doneColumns}
                          rowKey="salesOrderItemId"
                          pagination={false}
                          size="small"
                          scroll={{ x: 700 }}
                        />
                      ),
                    },
                  ]}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
