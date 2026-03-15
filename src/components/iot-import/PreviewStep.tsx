"use client";

import React, { useState } from "react";
import { Table, Tag, Tabs, Row, Col, Card, Statistic, Tooltip, Typography } from "antd";
import {
  CheckCircleOutlined,
  EditOutlined,
  MinusCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

interface ParsedRow {
  rowIndex: number;
  rawDate: string;
  rawShift: string;
  rawMachine: string;
  rawItem: string | null;
  rawOutput: number;
  mappedDate: string | null;
  mappedShift: number | null;
  mappedMachineId: number | null;
  mappedMachineName: string | null;
  mappedItemId: number | null;
  mappedItemName: string | null;
  finalOutput: number;
  status: "READY" | "NO_MACHINE" | "NO_ITEM" | "NO_SHIFT" | "NO_DATE";
  action: "INSERT" | "UPDATE" | null;
}

interface PreviewStepProps {
  rows: ParsedRow[];
}

const statusReasonMap: Record<string, string> = {
  NO_MACHINE: "Chưa có mapping máy",
  NO_ITEM: "Chưa có mapping mặt hàng",
  NO_SHIFT: "Chưa nhận ra ca làm việc",
  NO_DATE: "Không đọc được ngày",
};

export default function PreviewStep({ rows }: PreviewStepProps) {
  const [activeTab, setActiveTab] = useState("all");

  const insertRows = rows.filter((r) => r.action === "INSERT");
  const updateRows = rows.filter((r) => r.action === "UPDATE");
  const errorRows = rows.filter((r) => r.status !== "READY");

  const getFilteredRows = () => {
    switch (activeTab) {
      case "insert": return insertRows;
      case "update": return updateRows;
      case "error": return errorRows;
      default: return rows;
    }
  };

  const getRowStyle = (record: ParsedRow) => {
    if (record.status !== "READY") return { background: "#fff1f0" };
    if (record.action === "INSERT") return { background: "#f6ffed" };
    if (record.action === "UPDATE") return { background: "#e6f4ff" };
    return {};
  };

  const columns = [
    {
      title: "STT",
      dataIndex: "rowIndex",
      key: "rowIndex",
      width: 60,
    },
    {
      title: "Ngày",
      key: "date",
      width: 110,
      render: (r: ParsedRow) => r.mappedDate || <Text type="danger">{r.rawDate}</Text>,
    },
    {
      title: "Ca",
      key: "shift",
      width: 70,
      render: (r: ParsedRow) =>
        r.mappedShift ? `Ca ${r.mappedShift}` : <Text type="danger">{r.rawShift}</Text>,
    },
    {
      title: "Máy",
      key: "machine",
      render: (r: ParsedRow) =>
        r.mappedMachineName || <Text type="danger">{r.rawMachine}</Text>,
    },
    {
      title: "Mặt hàng",
      key: "item",
      render: (r: ParsedRow) =>
        r.mappedItemName
          ? r.mappedItemName
          : r.rawItem
          ? <Text type="danger">{r.rawItem}</Text>
          : <Text type="secondary">—</Text>,
    },
    {
      title: "Sản lượng",
      dataIndex: "finalOutput",
      key: "finalOutput",
      width: 100,
      render: (v: number) => v.toLocaleString("vi-VN"),
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 150,
      render: (r: ParsedRow) => {
        if (r.status !== "READY") {
          return (
            <Tooltip title={statusReasonMap[r.status] || r.status}>
              <Tag color="error" icon={<CloseCircleOutlined />}>
                {statusReasonMap[r.status] || r.status}
              </Tag>
            </Tooltip>
          );
        }
        if (r.action === "INSERT") {
          return <Tag color="success" icon={<CheckCircleOutlined />}>Thêm mới</Tag>;
        }
        return <Tag color="processing" icon={<EditOutlined />}>Cập nhật</Tag>;
      },
    },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Sẵn sàng thêm mới"
              value={insertRows.length}
              valueStyle={{ color: "#52c41a" }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Sẽ cập nhật"
              value={updateRows.length}
              valueStyle={{ color: "#1677ff" }}
              prefix={<EditOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Bỏ qua"
              value={0}
              valueStyle={{ color: "#8c8c8c" }}
              prefix={<MinusCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Lỗi chưa khớp"
              value={errorRows.length}
              valueStyle={{ color: errorRows.length > 0 ? "#ff4d4f" : "#8c8c8c" }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: "all", label: `Tất cả (${rows.length})` },
          { key: "insert", label: `Thêm mới (${insertRows.length})` },
          { key: "update", label: `Cập nhật (${updateRows.length})` },
          { key: "error", label: `Lỗi (${errorRows.length})` },
        ]}
      />

      <Table
        dataSource={getFilteredRows()}
        columns={columns}
        rowKey="rowIndex"
        pagination={{ pageSize: 20 }}
        size="small"
        scroll={{ x: 700 }}
        onRow={(record) => ({ style: getRowStyle(record) })}
      />
    </div>
  );
}
