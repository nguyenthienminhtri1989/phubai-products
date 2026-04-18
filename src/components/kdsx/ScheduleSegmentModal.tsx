"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Modal,
  Form,
  Select,
  InputNumber,
  Checkbox,
  Alert,
  Typography,
  Divider,
  Space,
  Tag,
  Spin,
} from "antd";
import { InfoCircleOutlined, WarningOutlined, LinkOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface Machine {
  id: number;
  name: string;
  model?: string | null;
  processId: number;
}

interface Item {
  id: number;
  name: string;
}

interface BenchmarkInfo {
  kgPerDay?: number;
  benchmarkId?: number;
  versionName?: string;
  empiricalNote?: string;
  notFound?: boolean;
  reason?: string;
  message?: string;
}

interface ScheduleSegmentModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (values: {
    machineId?: number;
    itemId: number;
    fromDay: number;
    toDay: number;
    kgPerDay: number;
    autoFill: boolean;
    note?: string;
  }) => Promise<void>;
  scheduleId: number;
  factoryId: number;
  yearMonth: string; // "YYYY-MM"
  daysInMonth: number;
  machines: Machine[];
  items: Item[];
  // Nếu edit thì truyền segment hiện tại
  editSegment?: {
    id: number;
    machineId: number;
    itemId: number;
    fromDay: number;
    toDay: number;
    kgPerDay: number;
    isManualKg: boolean;
    note?: string | null;
  } | null;
  // machineId cố định (khi click ô trống trên 1 hàng máy)
  defaultMachineId?: number;
  // Ngày cố định (khi click ô ngày cụ thể)
  defaultDay?: number;
}

export default function ScheduleSegmentModal({
  open,
  onClose,
  onSave,
  factoryId,
  yearMonth,
  daysInMonth,
  machines,
  items,
  editSegment,
  defaultMachineId,
  defaultDay,
}: ScheduleSegmentModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [autoFill, setAutoFill] = useState(true);
  const [benchmarkInfo, setBenchmarkInfo] = useState<BenchmarkInfo | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const isEdit = !!editSegment;

  // Reset form khi modal mở
  useEffect(() => {
    if (open) {
      const initialAutoFill = editSegment ? !editSegment.isManualKg : true;
      setAutoFill(initialAutoFill);
      setBenchmarkInfo(null);

      form.setFieldsValue({
        machineId: editSegment?.machineId ?? defaultMachineId,
        itemId: editSegment?.itemId ?? undefined,
        fromDay: editSegment?.fromDay ?? defaultDay ?? 1,
        toDay: editSegment?.toDay ?? defaultDay ?? daysInMonth,
        kgPerDay: editSegment?.kgPerDay ?? undefined,
        note: editSegment?.note ?? undefined,
      });

      // Nếu edit, lookup benchmark ngay
      if (editSegment) {
        lookupBenchmark(editSegment.machineId, editSegment.itemId);
      } else if (defaultMachineId && !editSegment) {
        // Không lookup vì chưa có itemId
      }
    }
  }, [open, editSegment, defaultMachineId, defaultDay, daysInMonth]);

  const lookupBenchmark = useCallback(
    async (machineId?: number, itemId?: number) => {
      if (!machineId || !itemId || !yearMonth || !factoryId) {
        setBenchmarkInfo(null);
        return;
      }
      setLookupLoading(true);
      try {
        const res = await fetch(
          `/api/kdsx/production-schedule/benchmark-lookup?machineId=${machineId}&itemId=${itemId}&yearMonth=${yearMonth}&factoryId=${factoryId}`
        );
        const data = await res.json();
        setBenchmarkInfo(data);

        // Auto-fill kgPerDay nếu đang ở chế độ auto
        if (!data.notFound && autoFill) {
          form.setFieldValue("kgPerDay", data.kgPerDay);
        }
      } catch {
        setBenchmarkInfo(null);
      } finally {
        setLookupLoading(false);
      }
    },
    [yearMonth, factoryId, autoFill, form]
  );

  const handleMachineOrItemChange = () => {
    const machineId = form.getFieldValue("machineId");
    const itemId = form.getFieldValue("itemId");
    lookupBenchmark(machineId, itemId);
  };

  const handleAutoFillChange = (checked: boolean) => {
    setAutoFill(checked);
    if (checked && benchmarkInfo && !benchmarkInfo.notFound) {
      form.setFieldValue("kgPerDay", benchmarkInfo.kgPerDay);
    }
  };

  const handleOk = async () => {
    try {
      await form.validateFields();
      const values = form.getFieldsValue();
      setLoading(true);
      await onSave({
        ...values,
        autoFill,
      });
      form.resetFields();
      setBenchmarkInfo(null);
    } catch (err) {
      // validation error — không cần xử lý
    } finally {
      setLoading(false);
    }
  };

  // Preview tổng kg
  const fromDay = Form.useWatch("fromDay", form);
  const toDay = Form.useWatch("toDay", form);
  const kgPerDay = Form.useWatch("kgPerDay", form);

  const totalDays = toDay && fromDay ? Math.max(0, toDay - fromDay + 1) : 0;
  const totalKg = totalDays && kgPerDay ? totalDays * kgPerDay : 0;

  const [month, year] = (() => {
    const [y, m] = yearMonth.split("-");
    return [m, y];
  })();

  return (
    <Modal
      title={isEdit ? "✏️ Sửa Segment Kế hoạch" : "➕ Thêm Segment Kế hoạch"}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={loading}
      okText={isEdit ? "Lưu thay đổi" : "Thêm"}
      cancelText="Hủy"
      width={560}
      destroyOnClose
    >
      <Form form={form} layout="vertical" size="middle">
        {/* Máy — disable khi edit */}
        <Form.Item
          label="Máy"
          name="machineId"
          rules={[{ required: true, message: "Chọn máy" }]}
        >
          <Select
            placeholder="Chọn máy..."
            showSearch
            filterOption={(input, opt) =>
              (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
            options={machines.map((m) => ({
              value: m.id,
              label: m.model ? `${m.name} (${m.model})` : m.name,
            }))}
            onChange={handleMachineOrItemChange}
            disabled={isEdit}
          />
        </Form.Item>

        {/* Mặt hàng */}
        <Form.Item
          label="Mặt hàng"
          name="itemId"
          rules={[{ required: true, message: "Chọn mặt hàng" }]}
        >
          <Select
            placeholder="Chọn mặt hàng..."
            showSearch
            filterOption={(input, opt) =>
              (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
            options={items.map((i) => ({ value: i.id, label: i.name }))}
            onChange={handleMachineOrItemChange}
          />
        </Form.Item>

        {/* Khoảng ngày */}
        <div style={{ display: "flex", gap: 12 }}>
          <Form.Item
            label={`Từ ngày (tháng ${month}/${year})`}
            name="fromDay"
            rules={[{ required: true, message: "Nhập ngày bắt đầu" }]}
            style={{ flex: 1 }}
          >
            <InputNumber min={1} max={daysInMonth} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            label={`Đến ngày (tháng ${month}/${year})`}
            name="toDay"
            rules={[{ required: true, message: "Nhập ngày kết thúc" }]}
            style={{ flex: 1 }}
          >
            <InputNumber min={1} max={daysInMonth} style={{ width: "100%" }} />
          </Form.Item>
        </div>

        <Divider style={{ margin: "8px 0" }} />

        {/* Auto-fill checkbox */}
        <Form.Item>
          <Checkbox
            checked={autoFill}
            onChange={(e) => handleAutoFillChange(e.target.checked)}
          >
            Tự động điền kg/ngày từ định mức thực nghiệm
          </Checkbox>
        </Form.Item>

        {/* Benchmark info panel */}
        {lookupLoading && (
          <div style={{ marginBottom: 12 }}>
            <Spin size="small" /> <Text type="secondary"> Đang tra cứu định mức...</Text>
          </div>
        )}

        {!lookupLoading && benchmarkInfo && !benchmarkInfo.notFound && (
          <Alert
            type="success"
            showIcon
            icon={<InfoCircleOutlined />}
            message={
              <span>
                Định mức thực nghiệm:{" "}
                <strong>{benchmarkInfo.kgPerDay?.toLocaleString()} kg/ngày</strong>{" "}
                <Tag color="blue">{benchmarkInfo.versionName}</Tag>
                {benchmarkInfo.empiricalNote && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {" "}— {benchmarkInfo.empiricalNote}
                  </Text>
                )}
              </span>
            }
            style={{ marginBottom: 12 }}
          />
        )}

        {!lookupLoading && benchmarkInfo?.notFound && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message={
              <span>
                {benchmarkInfo.message ?? "Chưa tìm thấy định mức EMPIRICAL."}{" "}
                <a href="/dashboard/productivity-benchmark" target="_blank" rel="noreferrer">
                  <LinkOutlined /> Cấu hình định mức →
                </a>
              </span>
            }
            style={{ marginBottom: 12 }}
          />
        )}

        {/* Kg/ngày */}
        <Form.Item
          label="Kg/ngày"
          name="kgPerDay"
          rules={[
            { required: true, message: "Nhập hoặc để tự động điền" },
            { type: "number", min: 0.01, message: "kgPerDay phải > 0" },
          ]}
        >
          <InputNumber
            min={0.01}
            style={{ width: "100%" }}
            disabled={autoFill && !!benchmarkInfo && !benchmarkInfo.notFound}
            formatter={(value) =>
              value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : ""
            }
            placeholder="kg/ngày"
          />
        </Form.Item>

        {/* Preview */}
        {totalKg > 0 && (
          <Alert
            type="info"
            showIcon={false}
            message={
              <Space>
                <Text>
                  Preview:{" "}
                  <strong>{totalDays} ngày</strong> ×{" "}
                  <strong>{kgPerDay?.toLocaleString()} kg/ngày</strong> ={" "}
                  <strong style={{ color: "#1677ff" }}>
                    {totalKg.toLocaleString()} kg ({(totalKg / 1000).toFixed(1)} tấn)
                  </strong>
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  (chưa trừ ngày nghỉ)
                </Text>
              </Space>
            }
            style={{ marginBottom: 8 }}
          />
        )}

        {/* Ghi chú */}
        <Form.Item label="Ghi chú" name="note">
          <Select
            mode="tags"
            style={{ width: "100%" }}
            placeholder="Ghi chú tùy chọn..."
            open={false}
            tokenSeparators={[]}
            maxTagCount={1}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
