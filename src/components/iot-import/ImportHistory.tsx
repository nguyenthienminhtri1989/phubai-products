"use client";

import React, { useEffect, useState } from "react";
import { Table, Tag, Button, Drawer, Typography, Space } from "antd";
import { EyeOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface ImportLog {
  id: number;
  importedAt: string;
  source: { id: number; name: string };
  fileName: string;
  insertedRows: number;
  updatedRows: number;
  skippedRows: number;
  errorRows: number;
  totalRows: number;
  status: string;
  importedByName: string | null;
  errorDetail: any;
}

export default function ImportHistory() {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ImportLog | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/iot/import-logs");
      if (res.ok) setLogs(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const statusColor: Record<string, string> = {
    SUCCESS: "success",
    PARTIAL: "warning",
    FAILED: "error",
  };

  const statusLabel: Record<string, string> = {
    SUCCESS: "Thành công",
    PARTIAL: "Một phần",
    FAILED: "Thất bại",
  };

  const columns = [
    {
      title: "Thời gian",
      dataIndex: "importedAt",
      key: "importedAt",
      width: 160,
      render: (v: string) => new Date(v).toLocaleString("vi-VN"),
    },
    {
      title: "Nguồn IoT",
      dataIndex: ["source", "name"],
      key: "source",
    },
    {
      title: "Tên file",
      dataIndex: "fileName",
      key: "fileName",
      ellipsis: true,
    },
    {
      title: "Thêm mới",
      dataIndex: "insertedRows",
      key: "insertedRows",
      width: 90,
      render: (v: number) => <Text style={{ color: "#52c41a" }}>{v}</Text>,
    },
    {
      title: "Cập nhật",
      dataIndex: "updatedRows",
      key: "updatedRows",
      width: 90,
      render: (v: number) => <Text style={{ color: "#1677ff" }}>{v}</Text>,
    },
    {
      title: "Bỏ qua",
      dataIndex: "skippedRows",
      key: "skippedRows",
      width: 80,
      render: (v: number) => <Text type="secondary">{v}</Text>,
    },
    {
      title: "Lỗi",
      dataIndex: "errorRows",
      key: "errorRows",
      width: 70,
      render: (v: number) => v > 0 ? <Text type="danger">{v}</Text> : <Text type="secondary">0</Text>,
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (v: string) => <Tag color={statusColor[v] || "default"}>{statusLabel[v] || v}</Tag>,
    },
    {
      title: "Người thực hiện",
      dataIndex: "importedByName",
      key: "importedByName",
      width: 130,
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      title: "",
      key: "action",
      width: 60,
      render: (_: any, record: ImportLog) =>
        record.errorDetail ? (
          <Button
            type="text"
            icon={<EyeOutlined />}
            size="small"
            onClick={() => { setSelectedLog(record); setDrawerOpen(true); }}
          />
        ) : null,
    },
  ];

  return (
    <>
      <Table
        dataSource={logs}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        size="small"
        scroll={{ x: 900 }}
      />

      <Drawer
        title={`Chi tiết lỗi — ${selectedLog?.fileName}`}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={600}
      >
        {selectedLog?.errorDetail && (
          <Space direction="vertical" style={{ width: "100%" }}>
            {(selectedLog.errorDetail as any[]).map((err: any, idx: number) => (
              <div key={idx} style={{ padding: 8, background: "#fff1f0", borderRadius: 4, border: "1px solid #ffa39e" }}>
                <Text strong>Dòng {err.row?.rowIndex || "?"}: </Text>
                <Text type="danger">{err.reason}</Text>
                {err.row && (
                  <div style={{ marginTop: 4, fontSize: 12, color: "#888" }}>
                    Máy: {err.row.rawMachine} | Ca: {err.row.rawShift} | Ngày: {err.row.rawDate}
                  </div>
                )}
              </div>
            ))}
          </Space>
        )}
      </Drawer>
    </>
  );
}
