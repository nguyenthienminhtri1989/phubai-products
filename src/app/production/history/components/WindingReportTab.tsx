"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  DatePicker,
  Select,
  Button,
  Table,
  Row,
  Col,
  Statistic,
  Space,
  message,
  Tag,
  Alert,
  Divider,
} from "antd";
import {
  SearchOutlined,
  FileExcelOutlined,
  ReloadOutlined,
  FilterOutlined,
  BankOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { naturalSortBy } from "@/utils/naturalSort";

const { RangePicker } = DatePicker;

const FACTORY_COLORS = [
  { bg: "linear-gradient(to right, #e6f7ff, #ffffff)", text: "#1677ff" },
  { bg: "linear-gradient(to right, #fff7e6, #ffffff)", text: "#d48806" },
];

export default function WindingReportTab() {
  // Dữ liệu danh mục
  const [factories, setFactories] = useState<any[]>([]); // dùng cho filter Nhà máy doanh thu
  const [sourceOptions, setSourceOptions] = useState<any[]>([]); // các nguồn sợi
  const [machines, setMachines] = useState<any[]>([]); // chỉ máy ống
  const [items, setItems] = useState<any[]>([]);

  // Bộ lọc
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf("month"),
    dayjs(),
  ]);
  const [selectedRevenueFactories, setSelectedRevenueFactories] = useState<
    number[]
  >([]);
  const [selectedSources, setSelectedSources] = useState<number[]>([]);
  const [selectedMachines, setSelectedMachines] = useState<number[]>([]);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [selectedShifts, setSelectedShifts] = useState<number[]>([]);

  // Kết quả
  const [byRevenueFactory, setByRevenueFactory] = useState<any[]>([]);
  const [pivot, setPivot] = useState<any[]>([]);
  const [sourceProcesses, setSourceProcesses] = useState<any[]>([]);
  const [orphanCount, setOrphanCount] = useState(0);
  const [totalKg, setTotalKg] = useState(0);

  const [loading, setLoading] = useState(false);

  const handleSearch = async (overrides?: {
    revenueFactoryIds?: number[];
    sourceProcessIds?: number[];
    machineIds?: number[];
    itemIds?: number[];
    shifts?: number[];
  }) => {
    setLoading(true);
    try {
      const payload = {
        fromDate: dateRange[0].format("YYYY-MM-DD"),
        toDate: dateRange[1].format("YYYY-MM-DD"),
        revenueFactoryIds: overrides?.revenueFactoryIds ?? selectedRevenueFactories,
        sourceProcessIds: overrides?.sourceProcessIds ?? selectedSources,
        machineIds: overrides?.machineIds ?? selectedMachines,
        itemIds: overrides?.itemIds ?? selectedItems,
        shifts: overrides?.shifts ?? selectedShifts,
      };

      const res = await fetch("/api/production/winding-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setByRevenueFactory(data.byRevenueFactory || []);
      setPivot(data.pivot || []);
      setSourceProcesses(data.sourceProcesses || []);
      setOrphanCount(data.orphanCount || 0);
      setTotalKg(data.totalKg || 0);
    } catch (e) {
      message.error("Lỗi tải báo cáo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [f, sp, m, i] = await Promise.all([
          fetch("/api/factories").then((r) => r.json()),
          fetch("/api/processes/source-options").then((r) => r.json()),
          fetch("/api/machines").then((r) => r.json()),
          fetch("/api/items").then((r) => r.json()),
        ]);

        // Nhà máy doanh thu = unique revenueFactory lấy từ sourceOptions
        const revenueFactories = Array.from(
          new Map(
            (Array.isArray(sp) ? sp : [])
              .map((p: any) => p.revenueFactory)
              .filter(Boolean)
              .map((rf: any) => [rf.id, rf]),
          ).values(),
        );

        setFactories(revenueFactories);
        setSourceOptions(Array.isArray(sp) ? sp : []);

        // Chỉ giữ máy ống (process.isRevenueProcess = true)
        const windingMachines = (Array.isArray(m) ? m : []).filter(
          (mc: any) => mc.process?.isRevenueProcess === true,
        );
        setMachines(windingMachines);

        setItems(Array.isArray(i) ? i : []);
      } catch (e) {
        console.error(e);
        message.error("Lỗi tải danh mục");
      }
    };
    fetchData();
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pivotColumns = useMemo(() => {
    const cols: any[] = [
      {
        title: "Ngày",
        dataIndex: "date",
        key: "date",
        width: 110,
        fixed: "left" as const,
        render: (d: string) => dayjs(d).format("DD/MM/YYYY"),
      },
    ];
    sourceProcesses.forEach((sp) => {
      cols.push({
        title: (
          <div>
            <div>{sp.name}</div>
            <Tag color="cyan" style={{ fontSize: 10, margin: 0 }}>
              → {sp.revenueFactory?.name}
            </Tag>
          </div>
        ),
        key: `src-${sp.id}`,
        align: "right" as const,
        render: (_: any, row: any) => {
          const v = row.bySource?.[sp.id];
          return v != null ? (
            <span>
              {v.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </span>
          ) : (
            <span style={{ color: "#ccc" }}>—</span>
          );
        },
      });
    });
    cols.push({
      title: "Tổng (kg)",
      dataIndex: "total",
      key: "total",
      align: "right" as const,
      fixed: "right" as const,
      width: 120,
      render: (n: number) => (
        <b style={{ color: "#389e0d" }}>
          {n.toLocaleString(undefined, { maximumFractionDigits: 1 })}
        </b>
      ),
    });
    return cols;
  }, [sourceProcesses]);

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Tổng hợp theo NM
    const sheet1Data: any[] = [];
    byRevenueFactory.forEach((rf) => {
      sheet1Data.push({
        "Nhà máy": rf.name,
        "Tổng kg": rf.totalKg,
        "Số bản ghi": rf.recordCount,
        "Chi tiết nguồn": rf.bySource
          .map((s: any) => `${s.sourceName}: ${s.kg.toFixed(1)} kg`)
          .join(" | "),
      });
    });
    const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
    XLSX.utils.book_append_sheet(wb, ws1, "Tổng hợp theo NM");

    // Sheet 2: Pivot ngày × nguồn
    const sheet2Data = pivot.map((row) => {
      const out: any = { Ngày: dayjs(row.date).format("DD/MM/YYYY") };
      sourceProcesses.forEach((sp) => {
        out[sp.name] = row.bySource[sp.id] || 0;
      });
      out["Tổng (kg)"] = row.total;
      return out;
    });
    const totalsRow: any = { Ngày: "TỔNG CỘNG" };
    let grand = 0;
    sourceProcesses.forEach((sp) => {
      const s = pivot.reduce((acc, r) => acc + (r.bySource[sp.id] || 0), 0);
      totalsRow[sp.name] = s;
    });
    grand = pivot.reduce((acc, r) => acc + r.total, 0);
    totalsRow["Tổng (kg)"] = grand;
    sheet2Data.push(totalsRow);

    const ws2 = XLSX.utils.json_to_sheet(sheet2Data);
    XLSX.utils.book_append_sheet(wb, ws2, "Pivot ngày x nguồn");

    XLSX.writeFile(wb, `BaoCao_NguonSoi_${dayjs().format("DDMM_HHmm")}.xlsx`);
  };

  return (
    <>
      <Card
        title={
          <span>
            <FilterOutlined /> Bộ lọc
          </span>
        }
        style={{ marginBottom: 20 }}
        size="small"
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>
              Khoảng thời gian:
            </div>
            <RangePicker
              value={dateRange}
              onChange={(v) => setDateRange(v as any)}
              style={{ width: "100%" }}
              format="DD/MM/YYYY"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>
              Nhà máy doanh thu:
            </div>
            <Select
              mode="multiple"
              allowClear
              style={{ width: "100%" }}
              placeholder="Tất cả"
              options={factories.map((f: any) => ({
                label: f.name,
                value: f.id,
              }))}
              onChange={setSelectedRevenueFactories}
              maxTagCount="responsive"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Nguồn sợi:</div>
            <Select
              mode="multiple"
              allowClear
              style={{ width: "100%" }}
              placeholder="Tất cả nguồn"
              options={sourceOptions
                .filter(
                  (p) =>
                    !selectedRevenueFactories.length ||
                    selectedRevenueFactories.includes(p.revenueFactory?.id),
                )
                .map((p) => ({
                  label: `${p.name} → ${p.revenueFactory?.name || "?"}`,
                  value: p.id,
                }))}
              onChange={setSelectedSources}
              maxTagCount="responsive"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Máy ống:</div>
            <Select
              mode="multiple"
              allowClear
              style={{ width: "100%" }}
              placeholder="Tất cả"
              options={machines
                .sort((a: any, b: any) => naturalSortBy(a.name, b.name))
                .map((m: any) => ({ label: m.name, value: m.id }))}
              onChange={setSelectedMachines}
              maxTagCount="responsive"
            />
          </Col>
          <Col xs={12} md={6}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Ca:</div>
            <Select
              mode="multiple"
              style={{ width: "100%" }}
              placeholder="Tất cả"
              options={[
                { label: "Ca 1", value: 1 },
                { label: "Ca 2", value: 2 },
                { label: "Ca 3", value: 3 },
              ]}
              onChange={setSelectedShifts}
            />
          </Col>
          <Col xs={12} md={6}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Mặt hàng:</div>
            <Select
              mode="multiple"
              allowClear
              style={{ width: "100%" }}
              placeholder="Tất cả"
              options={items.map((i: any) => ({ label: i.name, value: i.id }))}
              onChange={setSelectedItems}
              maxTagCount="responsive"
            />
          </Col>
          <Col
            xs={24}
            md={12}
            style={{
              textAlign: "right",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "flex-end",
            }}
          >
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  setSelectedRevenueFactories([]);
                  setSelectedSources([]);
                  setSelectedMachines([]);
                  setSelectedItems([]);
                  setSelectedShifts([]);
                  handleSearch({
                    revenueFactoryIds: [],
                    sourceProcessIds: [],
                    machineIds: [],
                    itemIds: [],
                    shifts: [],
                  });
                }}
              >
                Reset filter
              </Button>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={() => handleSearch()}
                loading={loading}
              >
                Xem báo cáo
              </Button>
              <Button
                icon={<FileExcelOutlined />}
                onClick={exportToExcel}
                disabled={pivot.length === 0}
                style={{ color: "green", borderColor: "green" }}
              >
                Xuất Excel
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {orphanCount > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Có ${orphanCount} bản ghi đánh ống chưa gán nguồn sợi`}
          description="Các bản ghi này KHÔNG được tính vào báo cáo dưới đây. Vào trang /machines hoặc /production/winding-input để cấu hình nguồn."
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {byRevenueFactory.map((rf, idx) => {
          const color = FACTORY_COLORS[idx % FACTORY_COLORS.length];
          return (
            <Col xs={24} md={12} key={rf.id}>
              <Card
                variant="borderless"
                style={{ height: "100%", background: color.bg }}
              >
                <Statistic
                  title={
                    <span>
                      <BankOutlined /> {rf.name} (theo nguồn sợi)
                    </span>
                  }
                  value={rf.totalKg}
                  precision={1}
                  suffix="kg"
                  styles={{
                    content: {
                      color: color.text,
                      fontWeight: "bold",
                      fontSize: 28,
                    },
                  }}
                />
                <Divider style={{ margin: "12px 0" }} />
                <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                  {rf.recordCount} bản ghi · phân theo nguồn:
                </div>
                <Space wrap>
                  {rf.bySource.map((s: any) => (
                    <Tag
                      key={s.sourceProcessId}
                      color="cyan"
                      style={{ padding: "4px 8px" }}
                    >
                      {s.sourceName}:{" "}
                      <b>
                        {s.kg.toLocaleString(undefined, {
                          maximumFractionDigits: 1,
                        })}{" "}
                        kg
                      </b>
                    </Tag>
                  ))}
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Card
        title="Sản lượng theo ngày × nguồn sợi"
        size="small"
        styles={{ body: { padding: 0 } }}
      >
        <Table
          rowKey="date"
          columns={pivotColumns}
          dataSource={pivot}
          loading={loading}
          bordered
          size="middle"
          pagination={false}
          scroll={{ x: "max-content" }}
          summary={() => {
            const totals: Record<number, number> = {};
            let grand = 0;
            pivot.forEach((r) => {
              Object.entries(r.bySource).forEach(([id, kg]) => {
                totals[Number(id)] = (totals[Number(id)] || 0) + (kg as number);
              });
              grand += r.total;
            });
            return (
              <Table.Summary fixed>
                <Table.Summary.Row
                  style={{ background: "#fafafa", fontWeight: 600 }}
                >
                  <Table.Summary.Cell index={0}>Tổng cộng</Table.Summary.Cell>
                  {sourceProcesses.map((sp, idx) => (
                    <Table.Summary.Cell
                      key={sp.id}
                      index={idx + 1}
                      align="right"
                    >
                      {(totals[sp.id] || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                    </Table.Summary.Cell>
                  ))}
                  <Table.Summary.Cell
                    index={sourceProcesses.length + 1}
                    align="right"
                  >
                    <span style={{ color: "#389e0d" }}>
                      {grand.toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                    </span>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
      </Card>
    </>
  );
}
