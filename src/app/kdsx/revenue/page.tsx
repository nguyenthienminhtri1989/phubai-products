"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Select,
  DatePicker,
  Spin,
  Typography,
  Progress,
  Tabs,
  Button,
  InputNumber,
  Space,
  message,
  Tag,
  Divider,
  Collapse,
  Alert,
  Form,
} from "antd";
import { ReloadOutlined, CopyOutlined, SaveOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { ColumnsType } from "antd/es/table";

const { Title, Text } = Typography;

// ===== PASTEL ROW COLORS =====
const ROW_COLORS = [
  "#E3F2FD", // xanh dương nhạt
  "#FCE4EC", // hồng nhạt
  "#FFF9C4", // vàng nhạt
  "#F3E5F5", // tím nhạt
  "#FFF3E0", // cam nhạt
  "#E8F5E9", // xanh lá nhạt
  "#E0F7FA", // cyan nhạt
  "#FBE9E7", // đỏ cam nhạt
  "#F1F8E9", // lime nhạt
  "#EDE7F6", // indigo nhạt
];
// Tổng column: đậm hơn 1 chút
const ROW_COLORS_DARK = [
  "#BBDEFB",
  "#F8BBD0",
  "#FFF176",
  "#E1BEE7",
  "#FFE0B2",
  "#C8E6C9",
  "#B2EBF2",
  "#FFCCBC",
  "#DCEDC8",
  "#D1C4E9",
];

// ===== FORMAT HELPERS =====

function fmtKg(kg: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(kg)) + " kg";
}
function fmtTy(vnd: number) {
  return (vnd / 1e9).toFixed(3) + " tỷ";
}
function fmtUsd(usd: number) {
  return usd.toFixed(2) + " $";
}

// ===== TYPES =====

interface PnLSummary {
  totalQtyKg: number;
  totalRevenueVnd: number;
  totalCottonCostVnd: number;
  totalPeCostVnd: number;
  totalSellingCostVnd: number;
  totalGcDoubleTwistVnd: number;
  totalWasteRecoveryVnd: number;
  totalVariableCostVnd: number;
  totalFixedCostVnd: number;
  financialIncomeVnd: number;
  totalProfitVnd: number;
}

interface PnLResult {
  summary: PnLSummary;
  byContract: ContractPnL[];
  fixedCosts: FixedCostLine[];
  meta: { exchangeRate: number; wasteAdjustmentFactor: number; mode: string };
}

interface ContractPnL {
  orderItemId: number | null;
  orderId: number | null;
  orderNo: string | null;
  itemId: number;
  itemName: string;
  allocatedQty: number;
  unitPriceUsd: number;
  revenueVnd: number;
}

interface FixedCostLine {
  costType: string;
  label: string;
  amountVnd: number;
}

interface ContractProgress {
  salesOrderItemId: number;
  orderId: number;
  orderNo: string;
  customerName: string | null;
  itemId: number;
  itemName: string;
  totalQty: number;
  deliveredQty: number;
  allocatedThisMonth: number;
  allocatedPreviousMonths: number;
  remainingQty: number;
  progressPct: number;
  unitPriceUsd: number;
  deadline: string | null;
  priorityOverride: number | null;
  deferToMonth: string | null;
  status: "ACTIVE" | "COMPLETED" | "DEFERRED";
}

interface MatrixData {
  items: { itemId: number; itemName: string }[];
  days: number[];
  data: Record<number, Record<number, number>>;
  totals: Record<number, number>;
  meta: { daysInMonth: number };
}

// ===== SUMMARY CARDS =====

function SummaryCards({
  label,
  summary,
  color,
}: {
  label: string;
  summary: PnLSummary;
  color: string;
}) {
  return (
    <Card
      size="small"
      title={
        <Text strong style={{ color }}>
          {label}
        </Text>
      }
      style={{ marginBottom: 12 }}
    >
      <Row gutter={12}>
        <Col span={6}>
          <Statistic
            title="Sản lượng"
            value={fmtKg(summary.totalQtyKg)}
            valueStyle={{ fontSize: 16 }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Doanh thu"
            value={fmtTy(summary.totalRevenueVnd)}
            valueStyle={{ fontSize: 16, color: "#1677ff" }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Chi phí"
            value={fmtTy(
              summary.totalVariableCostVnd + summary.totalFixedCostVnd,
            )}
            valueStyle={{ fontSize: 16, color: "#cf1322" }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Lợi nhuận"
            value={fmtTy(summary.totalProfitVnd)}
            valueStyle={{
              fontSize: 16,
              color: summary.totalProfitVnd >= 0 ? "#52c41a" : "#cf1322",
            }}
          />
        </Col>
      </Row>
    </Card>
  );
}

// ===== MAIN PAGE =====

export default function RevenueDashboard() {
  const [factoryId, setFactoryId] = useState<number | null>(null);
  const [yearMonth, setYearMonth] = useState(dayjs().format("YYYY-MM"));
  const [loading, setLoading] = useState(false);
  const [dashData, setDashData] = useState<{
    today: PnLResult;
    mtd: PnLResult;
    projected: PnLResult;
  } | null>(null);
  const [contracts, setContracts] = useState<ContractProgress[]>([]);
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  const [factories, setFactories] = useState<{ id: number; name: string }[]>(
    [],
  );

  // Fixed costs state
  const [fixedCosts, setFixedCosts] = useState<FixedCostLine[]>([]);
  const [fixedCostEdits, setFixedCostEdits] = useState<Record<string, number>>(
    {},
  );
  const [savingFC, setSavingFC] = useState(false);
  const [copyingFC, setCopyingFC] = useState(false);

  // Thông số tháng state
  const [paramsExist, setParamsExist] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [warehouseFee, setWarehouseFee] = useState<number>(0.02);
  const [wasteAdjustmentFactor, setWasteAdjustmentFactor] =
    useState<number>(0.95);
  const [savingParams, setSavingParams] = useState(false);

  // Load factories
  useEffect(() => {
    fetch("/api/factories")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.factories ?? []);
        setFactories(list);
        if (list.length > 0) setFactoryId(list[0].id);
      })
      .catch(() => message.error("Không tải được danh sách nhà máy"));
  }, []);

  const loadData = useCallback(() => {
    if (!factoryId || !yearMonth) return;
    setLoading(true);
    Promise.all([
      fetch(
        `/api/v2/dashboard/revenue?factoryId=${factoryId}&yearMonth=${yearMonth}`,
      ).then((r) => r.json()),
      fetch(
        `/api/v2/contracts/progress?factoryId=${factoryId}&yearMonth=${yearMonth}`,
      ).then((r) => r.json()),
      fetch(
        `/api/v2/production-matrix?factoryId=${factoryId}&yearMonth=${yearMonth}`,
      ).then((r) => r.json()),
      fetch(
        `/api/v2/fixed-costs?factoryId=${factoryId}&yearMonth=${yearMonth}`,
      ).then((r) => r.json()),
      fetch(
        `/api/kdsx/input-params?factoryId=${factoryId}&yearMonth=${yearMonth}`,
      ).then((r) => r.json()),
    ])
      .then(([dash, contractData, matrixData, fcData, paramData]) => {
        if (dash.error) {
          message.warning("Dashboard: " + dash.error);
        } else {
          setDashData(dash);
        }
        setContracts(contractData.contracts ?? []);
        setMatrix(matrixData);
        const costs: FixedCostLine[] = fcData.costs ?? [];
        setFixedCosts(costs);
        const edits: Record<string, number> = {};
        costs.forEach((c: FixedCostLine) => {
          edits[c.costType] = c.amountVnd;
        });
        setFixedCostEdits(edits);

        if (paramData && paramData.exchangeRate) {
          setParamsExist(true);
          setExchangeRate(paramData.exchangeRate);
          setWarehouseFee(paramData.warehouseFee ?? 0.02);
          setWasteAdjustmentFactor(paramData.wasteAdjustmentFactor ?? 0.95);
        } else {
          setParamsExist(false);
          setExchangeRate(null);
          setWarehouseFee(0.02);
          setWasteAdjustmentFactor(0.95);
        }
      })
      .catch(() => message.error("Lỗi tải dữ liệu"))
      .finally(() => setLoading(false));
  }, [factoryId, yearMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function saveFixedCosts() {
    if (!factoryId || !yearMonth) return;
    setSavingFC(true);
    try {
      const costs = fixedCosts.map((c) => ({
        costType: c.costType,
        amountVnd: fixedCostEdits[c.costType] ?? 0,
      }));
      const res = await fetch("/api/v2/fixed-costs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factoryId, yearMonth, costs }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      message.success("Đã lưu chi phí cố định");
      loadData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Lỗi lưu");
    } finally {
      setSavingFC(false);
    }
  }

  async function copyFromPrevious() {
    if (!factoryId || !yearMonth) return;
    setCopyingFC(true);
    try {
      const res = await fetch("/api/v2/fixed-costs/copy-from-previous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factoryId, yearMonth }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      message.success("Đã copy từ tháng trước");
      loadData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Lỗi copy");
    } finally {
      setCopyingFC(false);
    }
  }

  async function saveInputParams() {
    if (!factoryId || !yearMonth) return;
    if (!exchangeRate || exchangeRate <= 0) {
      message.warning("Vui lòng nhập tỷ giá USD/VND");
      return;
    }
    setSavingParams(true);
    try {
      const res = await fetch("/api/kdsx/input-params", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factoryId,
          yearMonth,
          exchangeRate,
          warehouseFee,
          wasteAdjustmentFactor,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      message.success("Đã lưu thông số tháng");
      loadData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Lỗi lưu thông số");
    } finally {
      setSavingParams(false);
    }
  }

  // ===== CONTRACT ROW GROUP INFO (group by itemId, preserve API order) =====
  const contractRowInfo: { rowSpan: number; isLastInGroup: boolean }[] =
    (() => {
      const info: { rowSpan: number; isLastInGroup: boolean }[] = [];
      for (let i = 0; i < contracts.length; i++) {
        if (i > 0 && contracts[i].itemId === contracts[i - 1].itemId) {
          info.push({ rowSpan: 0, isLastInGroup: false });
        } else {
          let j = i;
          while (
            j + 1 < contracts.length &&
            contracts[j + 1].itemId === contracts[i].itemId
          )
            j++;
          info.push({ rowSpan: j - i + 1, isLastInGroup: false });
        }
      }
      for (let i = 0; i < contracts.length; i++) {
        const next = contracts[i + 1];
        if (!next || next.itemId !== contracts[i].itemId) {
          if (info[i]) info[i].isLastInGroup = true;
        }
      }
      return info;
    })();

  // ===== CONTRACT TABLE COLUMNS =====
  const contractColumns: ColumnsType<ContractProgress> = [
    {
      title: "TT",
      key: "stt",
      width: 50,
      align: "center",
      render: (_, __, idx) => <Text strong>{idx + 1}</Text>,
    },
    {
      title: "HĐ",
      dataIndex: "orderNo",
      key: "orderNo",
      width: 140,
      render: (v, r, idx) => {
        const isLast = contractRowInfo[idx]?.isLastInGroup;
        const isOnlyOne = contractRowInfo[idx]?.rowSpan === 1 && isLast;
        const showSurplusTag = isLast && !isOnlyOne;
        return (
          <Space size={4} wrap>
            {r.priorityOverride != null && (
              <Tag color="blue" style={{ fontSize: 10 }}>
                P{r.priorityOverride}
              </Tag>
            )}
            <Text italic={showSurplusTag}>{v}</Text>
            {showSurplusTag && (
              <Tag color="orange" style={{ fontSize: 10, marginInlineEnd: 0 }}>
                phần dư
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: "Khách hàng",
      dataIndex: "customerName",
      key: "customerName",
      width: 140,
      ellipsis: true,
    },
    {
      title: "Mặt hàng",
      dataIndex: "itemName",
      key: "itemName",
      width: 160,
      ellipsis: true,
      onCell: (_, idx) => ({
        rowSpan: contractRowInfo[idx ?? 0]?.rowSpan ?? 1,
        style: {
          fontWeight: 600,
          background: "#fafafa",
          verticalAlign: "middle" as const,
        },
      }),
    },
    {
      title: "Cam kết (kg)",
      dataIndex: "totalQty",
      key: "totalQty",
      align: "right",
      width: 110,
      render: (v) => new Intl.NumberFormat("vi-VN").format(v),
    },
    {
      title: "Đã giao",
      dataIndex: "deliveredQty",
      key: "deliveredQty",
      align: "right",
      width: 90,
      render: (v) => new Intl.NumberFormat("vi-VN").format(v),
    },
    {
      title: "SX tháng này",
      dataIndex: "allocatedThisMonth",
      key: "allocatedThisMonth",
      align: "right",
      width: 110,
      render: (v) => new Intl.NumberFormat("vi-VN").format(Math.round(v)),
    },
    {
      title: "Còn lại",
      dataIndex: "remainingQty",
      key: "remainingQty",
      align: "right",
      width: 90,
      render: (v) => new Intl.NumberFormat("vi-VN").format(Math.round(v)),
    },
    {
      title: "%",
      dataIndex: "progressPct",
      key: "progressPct",
      align: "center",
      width: 130,
      render: (v) => (
        <Progress
          percent={v}
          size="small"
          strokeColor={v >= 100 ? "#52c41a" : "#1677ff"}
        />
      ),
    },
    {
      title: "Đơn giá",
      dataIndex: "unitPriceUsd",
      key: "unitPriceUsd",
      align: "right",
      width: 90,
      render: (v) => fmtUsd(v),
    },
    {
      title: "Deadline",
      dataIndex: "deadline",
      key: "deadline",
      width: 100,
      render: (v, r) => {
        if (!v) return "-";
        const isLate = r.status === "ACTIVE" && dayjs(v).isBefore(dayjs());
        return <Text type={isLate ? "danger" : undefined}>{v}</Text>;
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (v) => {
        const map: Record<string, { color: string; label: string }> = {
          ACTIVE: { color: "processing", label: "Active" },
          COMPLETED: { color: "success", label: "Hoàn thành" },
          DEFERRED: { color: "warning", label: "Hoãn" },
        };
        const cfg = map[v] ?? { color: "default", label: v };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
  ];

  // ===== MATRIX COLUMNS =====
  const todayObj = dayjs();
  const todayDay =
    yearMonth === todayObj.format("YYYY-MM") ? todayObj.date() : -1;
  const isSunday = (day: number) =>
    dayjs(`${yearMonth}-${String(day).padStart(2, "0")}`).day() === 0;

  const matrixItems = matrix?.items ?? [];
  const itemIndexMap = new Map<number, number>();
  matrixItems.forEach((item, idx) => itemIndexMap.set(item.itemId, idx));

  const matrixColumns: ColumnsType<{ itemId: number; itemName: string }> = [
    {
      title: "Mặt hàng",
      dataIndex: "itemName",
      key: "itemName",
      fixed: "left",
      width: 160,
      onHeaderCell: () => ({
        style: {
          position: "sticky" as const,
          left: 0,
          zIndex: 2,
          background: "#fafafa",
          borderRight: "2px solid #d9d9d9",
          fontSize: 12,
          padding: "4px 8px",
        },
      }),
      onCell: (_: unknown, rowIdx) => {
        const bg = ROW_COLORS[(rowIdx ?? 0) % ROW_COLORS.length];
        return {
          style: {
            position: "sticky" as const,
            left: 0,
            zIndex: 1,
            background: bg,
            borderRight: "2px solid #d9d9d9",
            fontWeight: 600,
            fontSize: 12,
            padding: "3px 8px",
            whiteSpace: "nowrap" as const,
          },
        };
      },
    },
    ...(matrix?.days ?? []).map((day) => ({
      title: (() => {
        const isToday = day === todayDay;
        const isSun = isSunday(day);
        return (
          <span
            style={{
              display: "inline-block",
              width: "100%",
              textAlign: "center" as const,
              fontWeight: isToday ? 700 : 400,
              color: isToday ? "#fff" : isSun ? "#cf1322" : undefined,
              background: isToday ? "#1677ff" : undefined,
              borderRadius: isToday ? 4 : undefined,
              padding: isToday ? "1px 4px" : undefined,
            }}
          >
            {day}
          </span>
        );
      })(),
      key: `day-${day}`,
      align: "right" as const,
      width: 52,
      onHeaderCell: () => ({
        style: {
          fontSize: 12,
          padding: "4px 2px",
          textAlign: "center" as const,
          background: day === todayDay ? "#e6f4ff" : undefined,
        },
      }),
      onCell: (_: unknown, rowIdx: number | undefined) => {
        const bg = ROW_COLORS[(rowIdx ?? 0) % ROW_COLORS.length];
        return {
          style: {
            background: bg,
            fontSize: 12,
            padding: "3px 4px",
          },
        };
      },
      render: (_: unknown, row: { itemId: number }) => {
        const v = matrix?.data?.[row.itemId]?.[day];
        if (!v || v === 0) {
          return <span style={{ color: "#d9d9d9" }}>–</span>;
        }
        return (
          <span style={{ fontWeight: 500 }}>
            {new Intl.NumberFormat("vi-VN").format(Math.round(v))}
          </span>
        );
      },
    })),
    {
      title: (
        <Text strong style={{ fontSize: 12 }}>
          Tổng
        </Text>
      ),
      key: "total",
      align: "right" as const,
      fixed: "right" as const,
      width: 85,
      onHeaderCell: () => ({
        style: {
          fontSize: 12,
          padding: "4px 6px",
          background: "#e6e6e6",
          fontWeight: 700,
        },
      }),
      onCell: (_: unknown, rowIdx) => {
        const bg = ROW_COLORS_DARK[(rowIdx ?? 0) % ROW_COLORS_DARK.length];
        return {
          style: {
            background: bg,
            fontSize: 12,
            padding: "3px 6px",
            fontWeight: 700,
          },
        };
      },
      render: (_: unknown, row: { itemId: number }) => {
        const v = matrix?.totals?.[row.itemId] ?? 0;
        if (!v || v === 0) {
          return <span style={{ color: "#bfbfbf" }}>–</span>;
        }
        return (
          <Text strong style={{ fontSize: 12 }}>
            {new Intl.NumberFormat("vi-VN").format(Math.round(v))}
          </Text>
        );
      },
    },
  ];

  // ===== FIXED COST TABLE =====
  const fcColumns: ColumnsType<FixedCostLine> = [
    { title: "Khoản chi phí", dataIndex: "label", key: "label", width: 280 },
    {
      title: "Số tiền (VNĐ)",
      key: "amountVnd",
      align: "right",
      render: (_, row) => (
        <InputNumber
          value={fixedCostEdits[row.costType] ?? 0}
          onChange={(v) =>
            setFixedCostEdits((prev) => ({ ...prev, [row.costType]: v ?? 0 }))
          }
          formatter={(v) => new Intl.NumberFormat("vi-VN").format(Number(v))}
          parser={(v) => Number((v ?? "").replace(/[^0-9]/g, "")) as 0}
          style={{ width: 200 }}
          step={1000000}
        />
      ),
    },
  ];

  const tabItems = [
    {
      key: "dashboard",
      label: "Dashboard",
      children: (
        <Spin spinning={loading}>
          {/* Hôm nay */}
          {dashData && (
            <SummaryCards
              label="Hôm nay"
              summary={dashData.today.summary}
              color="#595959"
            />
          )}
          {/* MTD */}
          {dashData && (
            <SummaryCards
              label={`Đầu tháng → Hôm nay (${yearMonth})`}
              summary={dashData.mtd.summary}
              color="#1677ff"
            />
          )}
          {/* Projected */}
          {dashData && (
            <SummaryCards
              label="Ước tính cả tháng"
              summary={dashData.projected.summary}
              color="#722ed1"
            />
          )}

          {/* Contract progress table */}
          <Card
            size="small"
            title={<Text strong>Tiến độ hợp đồng</Text>}
            style={{ marginBottom: 12 }}
          >
            <Table
              dataSource={contracts}
              columns={contractColumns}
              rowKey="salesOrderItemId"
              size="small"
              pagination={false}
              scroll={{ x: 1200 }}
            />
          </Card>

          {/* Production matrix */}
          <Card
            size="small"
            title={<Text strong>Bảng sản lượng thực hiện (kg/ngày)</Text>}
          >
            <style>{`
              .matrix-table .ant-table-cell {
                font-size: 12px !important;
                padding: 3px 4px !important;
              }
              .matrix-table .ant-table-thead > tr > th {
                font-size: 12px !important;
                padding: 4px 4px !important;
              }
              .matrix-table .ant-table-row:hover > td {
                background: rgba(0,0,0,0.06) !important;
              }
              .matrix-table .ant-table-cell-fix-left,
              .matrix-table .ant-table-cell-fix-right {
                z-index: 2;
              }
            `}</style>
            <Table
              className="matrix-table"
              dataSource={matrixItems}
              columns={matrixColumns}
              rowKey="itemId"
              size="small"
              pagination={false}
              scroll={{ x: "max-content" }}
              bordered
            />
          </Card>
        </Spin>
      ),
    },
    {
      key: "monthly-params",
      label: "Thông số tháng",
      children: (
        <Spin spinning={loading}>
          {!paramsExist && (
            <Alert
              type="warning"
              showIcon
              message="Chưa nhập tỷ giá tháng này. Dashboard không thể tính DT/LN."
              style={{ marginBottom: 12 }}
            />
          )}
          <Collapse
            defaultActiveKey={["params"]}
            items={[
              {
                key: "params",
                label: <Text strong>Thông số tháng {yearMonth}</Text>,
                extra: (
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={savingParams}
                    onClick={(e) => {
                      e.stopPropagation();
                      saveInputParams();
                    }}
                    size="small"
                  >
                    Lưu
                  </Button>
                ),
                children: (
                  <Form layout="vertical" style={{ maxWidth: 480 }}>
                    <Form.Item label="Tỷ giá USD/VND" required>
                      <InputNumber
                        value={exchangeRate}
                        onChange={(v) => setExchangeRate(v)}
                        formatter={(v) =>
                          v
                            ? new Intl.NumberFormat("vi-VN").format(Number(v))
                            : ""
                        }
                        parser={(v) =>
                          Number((v ?? "").replace(/[^0-9]/g, "")) as 0
                        }
                        placeholder="VD: 25,400"
                        style={{ width: "100%" }}
                        min={1}
                        step={100}
                      />
                    </Form.Item>
                    <Form.Item label="Phí kho (USD/kg)">
                      <InputNumber
                        value={warehouseFee}
                        onChange={(v) => setWarehouseFee(v ?? 0.02)}
                        style={{ width: "100%" }}
                        min={0}
                        step={0.01}
                        precision={2}
                      />
                    </Form.Item>
                    <Form.Item label="Hệ số điều chỉnh phế">
                      <InputNumber
                        value={wasteAdjustmentFactor}
                        onChange={(v) => setWasteAdjustmentFactor(v ?? 0.95)}
                        style={{ width: "100%" }}
                        min={0}
                        max={1}
                        step={0.01}
                        precision={2}
                      />
                    </Form.Item>
                  </Form>
                ),
              },
            ]}
          />
        </Spin>
      ),
    },
    {
      key: "fixed-costs",
      label: "Chi phí cố định",
      children: (
        <Spin spinning={loading}>
          <Card
            size="small"
            title={<Text strong>Chi phí cố định tháng {yearMonth}</Text>}
            extra={
              <Space>
                <Button
                  icon={<CopyOutlined />}
                  loading={copyingFC}
                  onClick={copyFromPrevious}
                >
                  Copy từ tháng trước
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={savingFC}
                  onClick={saveFixedCosts}
                >
                  Lưu
                </Button>
              </Space>
            }
          >
            <Table
              dataSource={fixedCosts}
              columns={fcColumns}
              rowKey="costType"
              size="small"
              pagination={false}
            />
          </Card>
        </Spin>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            Doanh thu – Lợi nhuận
          </Title>
        </Col>
        <Col>
          <Space>
            <Select
              placeholder="Chọn nhà máy"
              style={{ width: 160 }}
              value={factoryId}
              onChange={setFactoryId}
              options={factories.map((f) => ({ label: f.name, value: f.id }))}
            />
            <DatePicker
              picker="month"
              value={dayjs(yearMonth, "YYYY-MM")}
              format="MM/YYYY"
              onChange={(d) => d && setYearMonth(d.format("YYYY-MM"))}
              allowClear={false}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={loadData}
              loading={loading}
            >
              Tải lại
            </Button>
          </Space>
        </Col>
      </Row>

      <Divider style={{ margin: "8px 0 16px" }} />

      {!factoryId ? (
        <Card>
          <Text type="secondary">Vui lòng chọn nhà máy để xem dữ liệu.</Text>
        </Card>
      ) : (
        <Tabs items={tabItems} />
      )}
    </div>
  );
}
