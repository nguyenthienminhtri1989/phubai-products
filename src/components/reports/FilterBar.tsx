"use client";

import React, { useEffect, useState } from "react";
import { Card, Row, Col, DatePicker, Select, Checkbox, Button, Space } from "antd";
import { FilterOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";

const { RangePicker } = DatePicker;

export interface FilterValues {
  dateRange: [Dayjs, Dayjs];
  factoryId: number | null;
  processId: number | null;
  machineIds: number[];
  itemIds: number[];
  shifts: number[];
}

interface FilterBarProps {
  onApply: (filters: FilterValues) => void;
  loading: boolean;
}

const SHIFT_OPTIONS = [
  { label: "Ca 1", value: 1 },
  { label: "Ca 2", value: 2 },
  { label: "Ca 3", value: 3 },
];

export default function FilterBar({ onApply, loading }: FilterBarProps) {
  const [factories, setFactories] = useState<any[]>([]);
  const [processes, setProcesses] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);

  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(29, "day"),
    dayjs(),
  ]);
  const [factoryId, setFactoryId] = useState<number | null>(null);
  const [processId, setProcessId] = useState<number | null>(null);
  const [machineIds, setMachineIds] = useState<number[]>([]);
  const [itemIds, setItemIds] = useState<number[]>([]);
  const [shifts, setShifts] = useState<number[]>([1, 2, 3]);

  // Load master data
  useEffect(() => {
    Promise.all([
      fetch("/api/factories").then((r) => r.json()),
      fetch("/api/processes").then((r) => r.json()),
      fetch("/api/machines").then((r) => r.json()),
      fetch("/api/items").then((r) => r.json()),
    ]).then(([f, p, m, i]) => {
      setFactories(Array.isArray(f) ? f : []);
      setProcesses(Array.isArray(p) ? p : []);
      setMachines(Array.isArray(m) ? m : []);
      setItems(Array.isArray(i) ? i : []);
    });
  }, []);

  // Cascade: filter processes by factory
  const filteredProcesses = factoryId
    ? processes.filter((p) => p.factoryId === factoryId)
    : processes;

  // Cascade: filter machines by process
  const filteredMachines = processId
    ? machines.filter((m) => m.processId === processId)
    : factoryId
    ? machines.filter((m) => filteredProcesses.some((p) => p.id === m.processId))
    : machines;

  const handleFactoryChange = (val: number | null) => {
    setFactoryId(val);
    setProcessId(null);
    setMachineIds([]);
  };

  const handleProcessChange = (val: number | null) => {
    setProcessId(val);
    setMachineIds([]);
  };

  const handleApply = () => {
    onApply({ dateRange, factoryId, processId, machineIds, itemIds, shifts });
  };

  const handleReset = () => {
    const defaultRange: [Dayjs, Dayjs] = [dayjs().subtract(29, "day"), dayjs()];
    setDateRange(defaultRange);
    setFactoryId(null);
    setProcessId(null);
    setMachineIds([]);
    setItemIds([]);
    setShifts([1, 2, 3]);
    onApply({
      dateRange: defaultRange,
      factoryId: null,
      processId: null,
      machineIds: [],
      itemIds: [],
      shifts: [1, 2, 3],
    });
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <FilterOutlined />
          <span>Bộ lọc</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Row gutter={[12, 12]} align="middle">
        {/* Khoảng thời gian */}
        <Col xs={24} sm={12} lg={6}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Khoảng thời gian</div>
          <RangePicker
            style={{ width: "100%" }}
            value={dateRange}
            onChange={(vals) => {
              if (vals && vals[0] && vals[1]) {
                setDateRange([vals[0], vals[1]]);
              }
            }}
            format="DD/MM/YYYY"
            allowClear={false}
          />
        </Col>

        {/* Nhà máy */}
        <Col xs={24} sm={12} lg={4}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Nhà máy</div>
          <Select
            style={{ width: "100%" }}
            placeholder="Tất cả"
            allowClear
            value={factoryId}
            onChange={handleFactoryChange}
            options={factories.map((f) => ({ value: f.id, label: f.name }))}
          />
        </Col>

        {/* Công đoạn */}
        <Col xs={24} sm={12} lg={4}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Công đoạn</div>
          <Select
            style={{ width: "100%" }}
            placeholder="Tất cả"
            allowClear
            value={processId}
            onChange={handleProcessChange}
            options={filteredProcesses.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Col>

        {/* Máy */}
        <Col xs={24} sm={12} lg={4}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Máy</div>
          <Select
            mode="multiple"
            style={{ width: "100%" }}
            placeholder="Tất cả"
            allowClear
            value={machineIds}
            onChange={setMachineIds}
            maxTagCount="responsive"
            options={filteredMachines.map((m) => ({ value: m.id, label: m.name }))}
          />
        </Col>

        {/* Mặt hàng */}
        <Col xs={24} sm={12} lg={4}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Mặt hàng</div>
          <Select
            mode="multiple"
            style={{ width: "100%" }}
            placeholder="Tất cả"
            allowClear
            value={itemIds}
            onChange={setItemIds}
            maxTagCount="responsive"
            options={items.map((i) => ({ value: i.id, label: i.name }))}
          />
        </Col>

        {/* Ca */}
        <Col xs={24} sm={12} lg={6}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Ca làm việc</div>
          <Checkbox.Group
            options={SHIFT_OPTIONS}
            value={shifts}
            onChange={(vals) => setShifts(vals as number[])}
          />
        </Col>

        {/* Buttons */}
        <Col xs={24} sm={12} lg={6}>
          <Space>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleApply}
              loading={loading}
            >
              Áp dụng
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              Reset
            </Button>
          </Space>
        </Col>
      </Row>
    </Card>
  );
}
