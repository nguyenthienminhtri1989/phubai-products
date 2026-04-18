"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Modal,
  Form,
  Select,
  InputNumber,
  Alert,
  Typography,
  Divider,
  Space,
  Tag,
  Spin,
} from "antd";
import { WarningOutlined, LinkOutlined } from "@ant-design/icons";

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
    machineId: number;
    itemId: number;
    fromDay: number;
    toDay: number;
    kgPerDay: number;
    autoFill: boolean;
    note?: string;
  }) => Promise<void>;
  onAllSaved?: () => Promise<void>; // callback sau khi save tất cả (thay vì gọi refresh mỗi lần)
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
  onAllSaved,
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
  const [isManualKg, setIsManualKg] = useState(false);
  const [benchmarkInfo, setBenchmarkInfo] = useState<BenchmarkInfo | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selectedMachineIds, setSelectedMachineIds] = useState<number[]>([]);
  const [multiMachineWarning, setMultiMachineWarning] = useState<string | null>(null);

  const isEdit = !!editSegment;

  // Reset form khi modal mở
  useEffect(() => {
    if (open) {
      setIsManualKg(editSegment ? editSegment.isManualKg : false);
      setBenchmarkInfo(null);
      setMultiMachineWarning(null);

      if (isEdit) {
        // Edit: dùng machineId đơn
        setSelectedMachineIds([editSegment!.machineId]);
        form.setFieldsValue({
          machineId: editSegment!.machineId,
          machineIds: undefined,
          itemId: editSegment?.itemId ?? undefined,
          fromDay: editSegment?.fromDay ?? 1,
          toDay: editSegment?.toDay ?? daysInMonth,
          kgPerDay: editSegment?.kgPerDay ?? undefined,
          note: editSegment?.note ?? undefined,
        });
        // Lookup để hiển thị info, nhưng không overwrite kgPerDay khi edit
        lookupBenchmark(editSegment!.machineId, editSegment!.itemId, /* overwrite */ false);
      } else {
        // Tạo mới: dùng machineIds array
        const initIds = defaultMachineId ? [defaultMachineId] : [];
        setSelectedMachineIds(initIds);
        form.setFieldsValue({
          machineId: undefined,
          machineIds: initIds.length > 0 ? initIds : undefined,
          itemId: undefined,
          fromDay: defaultDay ?? 1,
          toDay: defaultDay ?? daysInMonth,
          kgPerDay: undefined,
          note: undefined,
        });
      }
    }
  }, [open, editSegment, defaultMachineId, defaultDay, daysInMonth, isEdit]);

  const lookupBenchmark = useCallback(
    async (machineId?: number, itemId?: number, overwriteKg = true) => {
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

        // Auto-fill kgPerDay nếu tìm thấy benchmark và không phải nhập tay
        if (!data.notFound && overwriteKg && !isManualKg) {
          form.setFieldValue("kgPerDay", data.kgPerDay);
        }
      } catch {
        setBenchmarkInfo(null);
      } finally {
        setLookupLoading(false);
      }
    },
    [yearMonth, factoryId, isManualKg, form]
  );

  const handleMachineOrItemChange = () => {
    // Khi edit: chỉ hiển thị info, không overwrite. Khi tạo mới: 1 máy → lookup và fill.
    const machineId = isEdit
      ? form.getFieldValue("machineId")
      : selectedMachineIds.length === 1 ? selectedMachineIds[0] : undefined;
    const itemId = form.getFieldValue("itemId");
    lookupBenchmark(machineId, itemId, !isEdit);
  };

  const handleMachineIdsChange = (ids: number[]) => {
    setSelectedMachineIds(ids);
    setMultiMachineWarning(null);
    setBenchmarkInfo(null);
    form.setFieldValue("kgPerDay", undefined);
    setIsManualKg(false);

    const itemId = form.getFieldValue("itemId");

    if (ids.length === 0) return;

    if (ids.length === 1) {
      // 1 máy: lookup bình thường
      lookupBenchmark(ids[0], itemId, true);
      return;
    }

    // Nhiều máy: kiểm tra xem có cùng model không
    const selectedMachines = ids.map(id => machines.find(m => m.id === id)).filter(Boolean) as Machine[];
    const models = [...new Set(selectedMachines.map(m => m.model ?? ""))];

    if (models.length === 1 && models[0] !== "") {
      // Tất cả cùng model → lookup với máy đầu tiên, fill chung
      lookupBenchmark(ids[0], itemId, true);
    } else {
      // Khác model → để trống, hiện warning
      setMultiMachineWarning(
        "Các máy có loại máy (model) khác nhau. Nhập kg/ngày chung bên dưới hoặc tạo từng segment riêng."
      );
    }
  };

  const handleOk = async () => {
    try {
      await form.validateFields();
      const values = form.getFieldsValue();

      // Kiểm tra kgPerDay phải có
      if (!values.kgPerDay || values.kgPerDay <= 0) {
        form.setFields([{ name: "kgPerDay", errors: ["Vui lòng nhập kg/ngày (hoặc chờ tự động điền từ định mức)"] }]);
        return;
      }

      setLoading(true);
      const autoFillFlag = !isManualKg && !!benchmarkInfo && !benchmarkInfo.notFound;

      if (isEdit) {
        // Edit: save 1 segment duy nhất
        await onSave({
          machineId: editSegment!.machineId,
          itemId: values.itemId,
          fromDay: values.fromDay,
          toDay: values.toDay,
          kgPerDay: values.kgPerDay,
          autoFill: autoFillFlag,
          note: values.note,
        });
      } else {
        // Tạo mới: save tuần tự từng máy
        for (const machineId of selectedMachineIds) {
          await onSave({
            machineId,
            itemId: values.itemId,
            fromDay: values.fromDay,
            toDay: values.toDay,
            kgPerDay: values.kgPerDay,
            autoFill: autoFillFlag,
            note: values.note,
          });
        }
        // Gọi onAllSaved 1 lần sau khi save tất cả (nếu có)
        if (onAllSaved) await onAllSaved();
      }

      form.resetFields();
      setBenchmarkInfo(null);
      setMultiMachineWarning(null);
      setSelectedMachineIds([]);
      setIsManualKg(false);
    } catch {
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
        {/* Máy */}
        {isEdit ? (
          // Edit: single select, disabled
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
              disabled={true}
            />
          </Form.Item>
        ) : (
          // Tạo mới: multi-select
          <Form.Item
            label="Máy"
            name="machineIds"
            rules={[{ required: true, message: "Chọn ít nhất 1 máy" }]}
          >
            <Select
              mode="multiple"
              placeholder="Chọn 1 hoặc nhiều máy..."
              showSearch
              filterOption={(input, opt) =>
                (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
              options={machines.map((m) => ({
                value: m.id,
                label: m.model ? `${m.name} (${m.model})` : m.name,
              }))}
              onChange={handleMachineIdsChange}
              maxTagCount="responsive"
            />
          </Form.Item>
        )}

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

        {/* Benchmark lookup loading */}
        {lookupLoading && (
          <div style={{ marginBottom: 12 }}>
            <Spin size="small" /> <Text type="secondary"> Đang tra cứu định mức...</Text>
          </div>
        )}

        {/* Warning: nhiều máy khác model */}
        {!isEdit && multiMachineWarning && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message={multiMachineWarning}
            style={{ marginBottom: 12 }}
          />
        )}

        {/* Kg/ngày */}
        <Form.Item
          label="Kg/ngày"
          name="kgPerDay"
          rules={[{
            validator: (_, value) => {
              if (value !== undefined && value !== null && value <= 0)
                return Promise.reject("Kg/ngày phải > 0");
              return Promise.resolve();
            }
          }]}
        >
          <InputNumber
            min={0.01}
            style={{ width: "100%" }}
            formatter={(value) =>
              value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : ""
            }
            placeholder="Tự động từ định mức hoặc nhập tay"
            onChange={() => setIsManualKg(true)}
          />
        </Form.Item>

        {/* Hint benchmark inline */}
        {!lookupLoading && benchmarkInfo && !benchmarkInfo.notFound && (
          <div style={{ fontSize: 12, color: "#52c41a", marginTop: -16, marginBottom: 12 }}>
            ✓ Định mức thực nghiệm:{" "}
            <strong>{benchmarkInfo.kgPerDay?.toLocaleString()} kg/ngày</strong>
            {benchmarkInfo.versionName && <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>{benchmarkInfo.versionName}</Tag>}
            {benchmarkInfo.empiricalNote && (
              <span style={{ color: "#888" }}> — {benchmarkInfo.empiricalNote}</span>
            )}
          </div>
        )}

        {!lookupLoading && benchmarkInfo?.notFound && (
          <div style={{ fontSize: 12, color: "#faad14", marginTop: -16, marginBottom: 12 }}>
            ⚠ Chưa có định mức cho máy này.{" "}
            <a href="/dashboard/productivity-benchmark" target="_blank" rel="noreferrer">
              <LinkOutlined /> Cấu hình định mức →
            </a>
            {" — Nhập kg/ngày thủ công."}
          </div>
        )}

        {/* Preview */}
        {totalKg > 0 && (
          <Alert
            type="info"
            showIcon={false}
            message={
              <Space>
                <Text>
                  {!isEdit && selectedMachineIds.length > 1 ? (
                    <>
                      <strong>{selectedMachineIds.length} máy</strong> ×{" "}
                      <strong>{totalDays} ngày</strong> ×{" "}
                      <strong>{kgPerDay?.toLocaleString()} kg/ngày</strong> ={" "}
                      <strong style={{ color: "#1677ff" }}>
                        {(selectedMachineIds.length * totalKg).toLocaleString()} kg ({((selectedMachineIds.length * totalKg) / 1000).toFixed(1)} tấn)
                      </strong>{" "}(tổng {selectedMachineIds.length} máy)
                    </>
                  ) : (
                    <>
                      Preview:{" "}
                      <strong>{totalDays} ngày</strong> ×{" "}
                      <strong>{kgPerDay?.toLocaleString()} kg/ngày</strong> ={" "}
                      <strong style={{ color: "#1677ff" }}>
                        {totalKg.toLocaleString()} kg ({(totalKg / 1000).toFixed(1)} tấn)
                      </strong>
                    </>
                  )}
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
