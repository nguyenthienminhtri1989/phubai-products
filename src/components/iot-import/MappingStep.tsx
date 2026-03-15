"use client";

import React, { useEffect, useState } from "react";
import { Table, Select, Button, Alert, Typography, Space, Divider, message } from "antd";

const { Text, Title } = Typography;

interface ParseResult {
  unmappedMachines: string[];
  unmappedItems: string[];
  unmappedShifts: string[];
}

interface MachineOption { id: number; name: string; }
interface ItemOption { id: number; name: string; }

interface MappingStepProps {
  sourceId: number;
  parseResult: ParseResult;
  onMappingSaved: () => void;
}

export default function MappingStep({ sourceId, parseResult, onMappingSaved }: MappingStepProps) {
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [machineMap, setMachineMap] = useState<Record<string, number>>({});
  const [itemMap, setItemMap] = useState<Record<string, number>>({});
  const [shiftMap, setShiftMap] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [currentShiftMap, setCurrentShiftMap] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/machines").then((r) => r.json()).then((d) => setMachines(d));
    fetch("/api/items").then((r) => r.json()).then((d) => setItems(d));

    // Load existing shiftMap
    fetch(`/api/iot/mapping?sourceId=${sourceId}`).then((r) => r.json()).then((d) => {
      if (d.source?.shiftMap) setCurrentShiftMap(d.source.shiftMap);
    });
  }, [sourceId]);

  const machineColumns = [
    {
      title: "Tên trong file IoT",
      dataIndex: "iotName",
      key: "iotName",
      render: (v: string) => <Text code>{v}</Text>,
    },
    {
      title: "Máy tương ứng trong ERP",
      key: "erp",
      render: (_: any, record: { iotName: string }) => (
        <Select
          showSearch
          placeholder="Chọn máy..."
          style={{ width: "100%" }}
          value={machineMap[record.iotName]}
          onChange={(val) => setMachineMap((prev) => ({ ...prev, [record.iotName]: val }))}
          filterOption={(input, option) =>
            (option?.label as string || "").toLowerCase().includes(input.toLowerCase())
          }
          options={machines.map((m) => ({ value: m.id, label: m.name }))}
        />
      ),
    },
  ];

  const itemColumns = [
    {
      title: "Tên trong file IoT",
      dataIndex: "iotName",
      key: "iotName",
      render: (v: string) => <Text code>{v}</Text>,
    },
    {
      title: "Mặt hàng tương ứng trong ERP",
      key: "erp",
      render: (_: any, record: { iotName: string }) => (
        <Select
          showSearch
          placeholder="Chọn mặt hàng..."
          style={{ width: "100%" }}
          value={itemMap[record.iotName]}
          onChange={(val) => setItemMap((prev) => ({ ...prev, [record.iotName]: val }))}
          filterOption={(input, option) =>
            (option?.label as string || "").toLowerCase().includes(input.toLowerCase())
          }
          options={items.map((i) => ({ value: i.id, label: i.name }))}
        />
      ),
    },
  ];

  const shiftColumns = [
    {
      title: "Tên ca trong file IoT",
      dataIndex: "iotName",
      key: "iotName",
      render: (v: string) => <Text code>{v}</Text>,
    },
    {
      title: "Ca ERP",
      key: "erp",
      render: (_: any, record: { iotName: string }) => (
        <Select
          placeholder="Chọn ca..."
          style={{ width: 160 }}
          value={shiftMap[record.iotName] ?? currentShiftMap[record.iotName]}
          onChange={(val) => setShiftMap((prev) => ({ ...prev, [record.iotName]: val }))}
          options={[
            { value: 1, label: "Ca 1" },
            { value: 2, label: "Ca 2" },
            { value: 3, label: "Ca 3" },
          ]}
        />
      ),
    },
  ];

  const handleSave = async () => {
    // Kiểm tra chưa mapping hết
    const allMachinesMapped = parseResult.unmappedMachines.every((m) => machineMap[m]);
    const allItemsMapped = parseResult.unmappedItems.every((i) => itemMap[i]);
    const allShiftsMapped = parseResult.unmappedShifts.every(
      (s) => shiftMap[s] !== undefined || currentShiftMap[s] !== undefined
    );

    if (!allMachinesMapped || !allItemsMapped || !allShiftsMapped) {
      message.error("Vui lòng khớp hết tất cả tên chưa được mapping");
      return;
    }

    setSaving(true);
    try {
      const mergedShiftMap = { ...currentShiftMap, ...shiftMap };

      const res = await fetch("/api/iot/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId,
          machineMaps: parseResult.unmappedMachines.map((n) => ({ iotName: n, machineId: machineMap[n] })),
          itemMaps: parseResult.unmappedItems.map((n) => ({ iotName: n, itemId: itemMap[n] })),
          shiftMap: mergedShiftMap,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || "Lỗi lưu mapping");
        return;
      }

      message.success("Đã lưu mapping thành công");
      onMappingSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <Alert
        type="warning"
        showIcon
        message="Cần khớp tên"
        description="File Excel có các tên chưa được khớp với ERP. Vui lòng chọn tương ứng rồi nhấn Lưu."
      />

      {parseResult.unmappedMachines.length > 0 && (
        <>
          <Title level={5}>Khớp tên máy ({parseResult.unmappedMachines.length})</Title>
          <Table
            dataSource={parseResult.unmappedMachines.map((n) => ({ iotName: n, key: n }))}
            columns={machineColumns}
            pagination={false}
            size="small"
          />
        </>
      )}

      {parseResult.unmappedItems.length > 0 && (
        <>
          <Divider />
          <Title level={5}>Khớp tên mặt hàng ({parseResult.unmappedItems.length})</Title>
          <Table
            dataSource={parseResult.unmappedItems.map((n) => ({ iotName: n, key: n }))}
            columns={itemColumns}
            pagination={false}
            size="small"
          />
        </>
      )}

      {parseResult.unmappedShifts.length > 0 && (
        <>
          <Divider />
          <Title level={5}>Khớp tên ca ({parseResult.unmappedShifts.length})</Title>
          <Table
            dataSource={parseResult.unmappedShifts.map((n) => ({ iotName: n, key: n }))}
            columns={shiftColumns}
            pagination={false}
            size="small"
          />
        </>
      )}

      <Button type="primary" loading={saving} onClick={handleSave} size="large">
        Lưu mapping &amp; Tiếp tục
      </Button>
    </Space>
  );
}
