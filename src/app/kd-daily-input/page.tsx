"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  Table,
  Button,
  Select,
  DatePicker,
  InputNumber,
  Input,
  Space,
  Typography,
  Tag,
  Divider,
  message,
  Statistic,
  Spin,
  Alert,
} from "antd";
import {
  SaveOutlined,
  ReloadOutlined,
  KeyOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import "dayjs/locale/vi";

const { Text, Title } = Typography;

// ============================================================
// Types
// ============================================================
interface RowData {
  machineId: number;
  machineName: string;
  itemId: number;
  itemName: string;
  outputKg: number | null; // null = chưa nhập
  note: string;
  isDirty: boolean;
  existingId?: number;
}

interface Factory {
  id: number;
  name: string;
}

interface Process {
  id: number;
  name: string;
  factoryId: number;
}

interface Machine {
  id: number;
  name: string;
  processId: number;
  currentItemId?: number | null;
  currentItem?: { id: number; name: string } | null;
}

// ============================================================
// Main Page
// ============================================================
export default function KdDailyInputPage() {
  const [factories, setFactories] = useState<Factory[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [factoryId, setFactoryId] = useState<number | undefined>();
  const [processId, setProcessId] = useState<number | undefined>();
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  // Load factories on mount
  useEffect(() => {
    fetch("/api/factories")
      .then((r) => r.json())
      .then((data) => setFactories(Array.isArray(data) ? data : []))
      .catch(() => message.error("Không tải được danh sách nhà máy"));
  }, []);

  // Load processes when factory changes
  useEffect(() => {
    if (!factoryId) {
      setProcesses([]);
      setProcessId(undefined);
      return;
    }
    fetch(`/api/processes`)
      .then((r) => r.json())
      .then((data: Process[]) => {
        const filtered = Array.isArray(data)
          ? data.filter((p) => p.factoryId === factoryId)
          : [];
        setProcesses(filtered);
      })
      .catch(() => message.error("Không tải được danh sách công đoạn"));
  }, [factoryId]);

  // ============================================================
  // Tải danh sách máy + dữ liệu đã nhập
  // ============================================================
  const handleLoad = useCallback(async () => {
    if (!factoryId || !processId) {
      message.warning("Vui lòng chọn nhà máy và công đoạn");
      return;
    }

    setFetching(true);
    try {
      const dateStr = date.format("YYYY-MM-DD");

      // 1. Fetch machines theo processId
      const machinesRes = await fetch(`/api/machines?processId=${processId}`);
      const machinesData: Machine[] = await machinesRes.json();

      // 2. Fetch dữ liệu đã nhập của ngày này
      const existingRes = await fetch(
        `/api/kd-daily-input?factoryId=${factoryId}&processId=${processId}&date=${dateStr}`,
      );
      const existingData: any[] = await existingRes.json();

      // 3. Tạo map từ dữ liệu đã nhập: key = `${machineId}-${itemId}`
      const existingMap = new Map<string, any>();
      existingData.forEach((d) => {
        existingMap.set(`${d.machineId}-${d.itemId}`, d);
      });

      // 4. Build rows từ machines
      // Mỗi máy → 1 row với mặt hàng đang chạy (currentItem)
      // Nếu có dữ liệu đã nhập với itemId khác → thêm row extra
      const newRows: RowData[] = [];
      const handledKeys = new Set<string>();

      for (const machine of machinesData) {
        const currentItemId = machine.currentItemId;
        const currentItemName = machine.currentItem?.name ?? "Chưa cấu hình";

        // Row chính: dùng currentItem
        if (currentItemId) {
          const key = `${machine.id}-${currentItemId}`;
          const existing = existingMap.get(key);
          handledKeys.add(key);

          newRows.push({
            machineId: machine.id,
            machineName: machine.name,
            itemId: currentItemId,
            itemName: currentItemName,
            outputKg: existing ? existing.outputKg : null,
            note: existing?.note ?? "",
            isDirty: false,
            existingId: existing?.id,
          });
        } else {
          // Máy chưa cấu hình mặt hàng — vẫn hiện để biết
          newRows.push({
            machineId: machine.id,
            machineName: machine.name,
            itemId: 0,
            itemName: "Chưa cấu hình",
            outputKg: null,
            note: "",
            isDirty: false,
          });
        }
      }

      // 5. Thêm các row từ dữ liệu đã nhập mà không có trong danh sách máy hiện tại
      // (ví dụ: máy đã đổi mặt hàng sau khi nhập)
      existingData.forEach((d) => {
        const key = `${d.machineId}-${d.itemId}`;
        if (!handledKeys.has(key)) {
          newRows.push({
            machineId: d.machineId,
            machineName: d.machine?.name ?? `Máy #${d.machineId}`,
            itemId: d.itemId,
            itemName: d.item?.name ?? `Mặt hàng #${d.itemId}`,
            outputKg: d.outputKg,
            note: d.note ?? "",
            isDirty: false,
            existingId: d.id,
          });
        }
      });

      setRows(newRows);

      const entered = newRows.filter((r) => r.outputKg !== null).length;
      message.success(
        `Đã tải ${newRows.length} máy. Đã nhập: ${entered}/${newRows.length}`,
      );
    } catch (err) {
      message.error("Lỗi tải dữ liệu");
    } finally {
      setFetching(false);
    }
  }, [factoryId, processId, date]);

  // ============================================================
  // Điền 0 cho máy dừng chưa nhập
  // ============================================================
  const handleFillZero = useCallback(() => {
    const count = rows.filter((r) => r.outputKg === null).length;
    if (count === 0) {
      message.info("Tất cả máy đã được nhập liệu rồi");
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.outputKg === null ? { ...r, outputKg: 0, isDirty: true } : r,
      ),
    );
    message.info(`Đã điền 0 cho ${count} máy chưa nhập`);
  }, [rows]);

  // ============================================================
  // Paste từ Excel (Ctrl+V)
  // ============================================================
  const handlePaste = useCallback(
    (e: React.ClipboardEvent, startIndex: number) => {
      const text = e.clipboardData.getData("text");
      if (!text.includes("\n") && !text.includes("\t")) return; // paste 1 giá trị bình thường

      e.preventDefault();

      // Parse clipboard — hỗ trợ cả copy 1 cột lẫn nhiều cột từ Excel
      const lines = text
        .split("\n")
        .map((line) => line.split("\t")[0].trim())
        .filter((line) => line !== "");

      const values = lines.map((line) => {
        // Xử lý số có dấu phẩy hàng nghìn: "1,234" → 1234
        const cleaned = line.replace(/,/g, "").replace(/\./g, "");
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
      });

      if (values.length === 0) return;

      setRows((prev) => {
        const next = [...prev];
        values.forEach((val, i) => {
          const targetIndex = startIndex + i;
          if (targetIndex < next.length && val !== null) {
            next[targetIndex] = {
              ...next[targetIndex],
              outputKg: val,
              isDirty: true,
            };
          }
        });
        return next;
      });

      const filled = values.filter((v) => v !== null).length;
      const skipped = values.filter((v) => v === null).length;
      message.success(
        `Đã dán ${filled} giá trị` +
          (skipped > 0 ? ` (bỏ qua ${skipped} ô không hợp lệ)` : ""),
      );
    },
    [],
  );

  // ============================================================
  // Lưu tất cả
  // ============================================================
  const handleSave = useCallback(async () => {
    const dirty = rows.filter((r) => r.isDirty && r.outputKg !== null && r.itemId !== 0);
    if (dirty.length === 0) {
      message.warning("Không có thay đổi nào để lưu");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/kd-daily-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: date.format("YYYY-MM-DD"),
          factoryId,
          items: dirty.map((r) => ({
            machineId: r.machineId,
            itemId: r.itemId,
            outputKg: r.outputKg,
            note: r.note,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Lỗi không xác định");
      }

      message.success(
        `Đã lưu ${dirty.length} máy và cập nhật tiến độ hợp đồng`,
      );
      // Reset isDirty
      setRows((prev) => prev.map((r) => ({ ...r, isDirty: false })));
    } catch (err: any) {
      message.error(err.message ?? "Lỗi lưu dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [rows, date, factoryId]);

  // ============================================================
  // Columns
  // ============================================================
  const dirtyCount = rows.filter((r) => r.isDirty && r.outputKg !== null).length;
  const enteredCount = rows.filter((r) => r.outputKg !== null).length;
  const totalKg = rows.reduce((s, r) => s + (r.outputKg ?? 0), 0);

  const columns = [
    {
      title: "STT",
      width: 50,
      render: (_: any, __: any, i: number) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {i + 1}
        </Text>
      ),
    },
    {
      title: "Máy",
      dataIndex: "machineName",
      width: 110,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: "Mặt hàng đang chạy",
      dataIndex: "itemName",
      render: (v: string, r: RowData) => (
        <>
          <Tag color={r.itemId === 0 ? "default" : "blue"}>{v}</Tag>
          {rows.filter((row) => row.machineId === r.machineId).length > 1 && (
            <Tag color="warning" style={{ fontSize: 11 }}>
              Đổi MH
            </Tag>
          )}
        </>
      ),
    },
    {
      title: "Sản lượng cả ngày (kg)",
      width: 190,
      render: (_: any, r: RowData, i: number) => (
        <InputNumber
          style={{
            width: 145,
            borderColor:
              r.outputKg !== null ? "var(--color-border-success, #52c41a)" : undefined,
          }}
          min={0}
          step={10}
          value={r.outputKg ?? undefined}
          placeholder="Nhập kg..."
          disabled={r.itemId === 0}
          onChange={(v) => {
            setRows((prev) => {
              const next = [...prev];
              next[i] = { ...next[i], outputKg: v ?? null, isDirty: true };
              return next;
            });
          }}
          onPaste={(e) => handlePaste(e, i)}
          addonAfter="kg"
        />
      ),
    },
    {
      title: "Ghi chú",
      render: (_: any, r: RowData, i: number) => (
        <Input
          value={r.note}
          placeholder="Máy dừng, lý do..."
          onChange={(e) => {
            setRows((prev) => {
              const next = [...prev];
              next[i] = {
                ...next[i],
                note: e.target.value,
                isDirty: true,
              };
              return next;
            });
          }}
          style={{ width: 180 }}
        />
      ),
    },
    {
      title: "Trạng thái",
      width: 110,
      render: (_: any, r: RowData) => {
        if (r.itemId === 0)
          return <Tag color="default">Chưa cấu hình</Tag>;
        if (r.isDirty)
          return <Tag color="processing">Chưa lưu</Tag>;
        if (r.outputKg !== null)
          return <Tag color="success">Đã nhập</Tag>;
        return <Tag color="default">Chưa nhập</Tag>;
      },
    },
  ];

  return (
    <div style={{ padding: "0 8px" }}>
      {/* Header */}
      <Title level={4} style={{ marginBottom: 16 }}>
        Nhập sản lượng ngày — Phòng Kinh doanh
      </Title>

      {/* Filter bar */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          placeholder="Chọn nhà máy"
          style={{ width: 160 }}
          value={factoryId}
          onChange={(v) => {
            setFactoryId(v);
            setProcessId(undefined);
            setRows([]);
          }}
          options={factories.map((f) => ({ label: f.name, value: f.id }))}
        />
        <Select
          placeholder="Chọn công đoạn"
          style={{ width: 200 }}
          value={processId}
          onChange={(v) => {
            setProcessId(v);
            setRows([]);
          }}
          disabled={!factoryId}
          options={processes.map((p) => ({ label: p.name, value: p.id }))}
        />
        <DatePicker
          value={date}
          onChange={(d) => {
            if (d) setDate(d);
            setRows([]);
          }}
          format="DD/MM/YYYY"
          allowClear={false}
          style={{ width: 150 }}
        />
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          onClick={handleLoad}
          loading={fetching}
          disabled={!factoryId || !processId}
        >
          Tải danh sách
        </Button>
      </Space>

      {/* Thống kê + action buttons */}
      {rows.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <Space size="large">
            <Statistic
              title="Đã nhập"
              value={enteredCount}
              suffix={`/ ${rows.length} máy`}
              valueStyle={{ fontSize: 18, color: "#52c41a" }}
            />
            <Divider type="vertical" style={{ height: 40 }} />
            <Statistic
              title="Tổng sản lượng hôm nay"
              value={totalKg.toLocaleString("vi-VN")}
              suffix="kg"
              valueStyle={{ fontSize: 18 }}
            />
          </Space>

          <Space>
            <Button onClick={handleFillZero} disabled={rows.length === 0}>
              Nhập 0 cho máy dừng chưa nhập
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={loading}
              disabled={dirtyCount === 0}
              onClick={handleSave}
            >
              Lưu tất cả ({dirtyCount} máy)
            </Button>
          </Space>
        </div>
      )}

      {/* Gợi ý paste */}
      {rows.length > 0 && (
        <div
          style={{
            fontSize: 12,
            color: "#8c8c8c",
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <KeyOutlined style={{ fontSize: 13 }} />
          Mẹo: Bôi đen cột sản lượng trong Excel → Ctrl+C → Click vào ô đầu
          tiên → Ctrl+V để dán nhanh toàn bộ
        </div>
      )}

      {/* Bảng nhập liệu */}
      {fetching ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : rows.length > 0 ? (
        <Table
          dataSource={rows}
          size="middle"
          pagination={false}
          rowKey={(r) => `${r.machineId}-${r.itemId}`}
          columns={columns}
          rowClassName={(r) => (r.isDirty ? "ant-table-row-selected" : "")}
          scroll={{ x: 700 }}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3}>
                <Text strong>Tổng cộng</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3}>
                <Text strong style={{ color: "#1677ff" }}>
                  {totalKg.toLocaleString("vi-VN")} kg
                </Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} colSpan={2} />
            </Table.Summary.Row>
          )}
        />
      ) : (
        !fetching &&
        factoryId &&
        processId && (
          <Alert
            type="info"
            message="Chưa tải dữ liệu"
            description="Chọn nhà máy, công đoạn, ngày rồi bấm 'Tải danh sách' để bắt đầu nhập liệu."
            showIcon
          />
        )
      )}

      {!factoryId && (
        <Alert
          type="info"
          message="Hướng dẫn"
          description="Chọn Nhà máy → Công đoạn → Ngày → Bấm 'Tải danh sách' để bắt đầu nhập sản lượng cho phòng KD."
          showIcon
        />
      )}
    </div>
  );
}
