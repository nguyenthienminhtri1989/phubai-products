"use client";
import { useState, useEffect, useMemo } from "react";
import {
  Table,
  Select,
  DatePicker,
  Button,
  Space,
  message,
  Tag,
  Typography,
  Modal,
  Popover,
  Segmented,
  Input,
} from "antd";
import {
  CopyOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  FilterOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

const { Text } = Typography;

interface Row {
  itemId: number;
  itemName: string;
  cottonRatio: number | null;
  cottonRate: number | null;
  peRate: number | null;
  isPureCotton: boolean;
  cottonMaterialType: { id: number; name: string } | null;
  peMaterialType: { id: number; name: string } | null;
}

interface MaterialType {
  id: number;
  name: string;
  category: string;
}

// Option đặc biệt cho dropdown bulk — "(không đổi)" để chỉ đổi 1 cột
const KEEP_AS_IS = -1;
const CLEAR_VALUE = -2;

export default function ItemMonthlyMaterialPage() {
  const [yearMonth, setYearMonth] = useState(dayjs().format("YYYY-MM"));
  const [rows, setRows] = useState<Row[]>([]);
  const [cottonTypes, setCottonTypes] = useState<MaterialType[]>([]);
  const [peTypes, setPeTypes] = useState<MaterialType[]>([]);
  const [loading, setLoading] = useState(false);
  const [edited, setEdited] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Bulk bar state
  const [bulkCotton, setBulkCotton] = useState<number>(KEEP_AS_IS);
  const [bulkPe, setBulkPe] = useState<number>(KEEP_AS_IS);

  // Filter
  const [filter, setFilter] = useState<
    "ALL" | "UNCONFIGURED" | "PURE_COTTON" | "BLEND"
  >("ALL");
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [rowsRes, typesRes] = await Promise.all([
      fetch(`/api/kdsx/item-monthly-materials?yearMonth=${yearMonth}`).then(
        (r) => r.json(),
      ),
      fetch(`/api/kdsx/material-types`).then((r) => r.json()),
    ]);
    setRows(rowsRes.rows ?? []);
    const types = typesRes.materialTypes ?? typesRes ?? [];
    setCottonTypes(types.filter((t: MaterialType) => t.category === "COTTON"));
    setPeTypes(types.filter((t: MaterialType) => t.category === "PE"));
    setLoading(false);
    setEdited(false);
    setSelectedIds([]);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearMonth]);

  // Lọc dòng hiển thị
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (search && !r.itemName.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (filter === "UNCONFIGURED")
        return !r.cottonMaterialType && !r.peMaterialType;
      if (filter === "PURE_COTTON") return r.isPureCotton;
      if (filter === "BLEND") return !r.isPureCotton && r.cottonRatio != null;
      return true;
    });
  }, [rows, filter, search]);

  // Tính "đa số" để highlight ô khác
  const majorityCotton = useMemo(
    () => findMajority(rows.map((r) => r.cottonMaterialType?.id)),
    [rows],
  );
  const majorityPe = useMemo(
    () =>
      findMajority(
        rows.filter((r) => !r.isPureCotton).map((r) => r.peMaterialType?.id),
      ),
    [rows],
  );

  // Đổi giá trị 1 dòng
  const updateRow = (
    itemId: number,
    field: "cottonMaterialType" | "peMaterialType",
    typeId: number | null,
  ) => {
    setRows((rs) =>
      rs.map((r) => {
        if (r.itemId !== itemId) return r;
        if (typeId == null) return { ...r, [field]: null };
        const list = field === "cottonMaterialType" ? cottonTypes : peTypes;
        const t = list.find((x) => x.id === typeId);
        return { ...r, [field]: t ? { id: t.id, name: t.name } : null };
      }),
    );
    setEdited(true);
  };

  // Áp dụng hàng loạt cho các dòng đã chọn
  const handleBulkApply = () => {
    if (selectedIds.length === 0) {
      message.warning("Chưa chọn dòng nào");
      return;
    }
    if (bulkCotton === KEEP_AS_IS && bulkPe === KEEP_AS_IS) {
      message.warning("Chưa chọn loại NVL nào để áp dụng");
      return;
    }

    setRows((rs) =>
      rs.map((r) => {
        if (!selectedIds.includes(r.itemId)) return r;
        const next = { ...r };
        // Áp cotton
        if (bulkCotton !== KEEP_AS_IS) {
          if (bulkCotton === CLEAR_VALUE) next.cottonMaterialType = null;
          else {
            const t = cottonTypes.find((x) => x.id === bulkCotton);
            if (t) next.cottonMaterialType = { id: t.id, name: t.name };
          }
        }
        // Áp pe — chỉ áp cho dòng KHÔNG phải sợi thuần
        if (bulkPe !== KEEP_AS_IS && !r.isPureCotton) {
          if (bulkPe === CLEAR_VALUE) next.peMaterialType = null;
          else {
            const t = peTypes.find((x) => x.id === bulkPe);
            if (t) next.peMaterialType = { id: t.id, name: t.name };
          }
        }
        return next;
      }),
    );
    setEdited(true);
    message.success(`Đã áp dụng cho ${selectedIds.length} dòng`);
    setBulkCotton(KEEP_AS_IS);
    setBulkPe(KEEP_AS_IS);
  };

  // Đặt tất cả cho 1 cột (từ link header)
  const handleSetAll = (field: "cotton" | "pe", typeId: number) => {
    const list = field === "cotton" ? cottonTypes : peTypes;
    const t = list.find((x) => x.id === typeId);
    if (!t) return;
    setRows((rs) =>
      rs.map((r) => {
        // Cột pe: bỏ qua sợi thuần
        if (field === "pe" && r.isPureCotton) return r;
        const key =
          field === "cotton" ? "cottonMaterialType" : "peMaterialType";
        return { ...r, [key]: { id: t.id, name: t.name } };
      }),
    );
    setEdited(true);
    message.success(`Đã đặt "${t.name}" cho tất cả dòng phù hợp`);
  };

  const handleSave = async () => {
    const payload = rows.map((r) => ({
      itemId: r.itemId,
      cottonMaterialTypeId: r.cottonMaterialType?.id ?? null,
      peMaterialTypeId: r.peMaterialType?.id ?? null,
    }));
    await fetch("/api/kdsx/item-monthly-materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearMonth, items: payload }),
    });
    message.success("Đã lưu cơ cấu NVL");
    fetchData();
  };

  const handleCopyPrev = () => {
    const prev = dayjs(yearMonth + "-01")
      .subtract(1, "month")
      .format("YYYY-MM");
    Modal.confirm({
      title: `Copy cơ cấu từ tháng ${prev}?`,
      content:
        "Mặt hàng đã cấu hình ở tháng hiện tại sẽ giữ nguyên. Chỉ điền các mặt hàng còn trống.",
      onOk: async () => {
        const res = await fetch(
          "/api/kdsx/item-monthly-materials/copy-from-previous",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ yearMonth, sourceYearMonth: prev }),
          },
        );
        const data = await res.json();
        message.success(`Đã copy ${data.copied} cấu hình`);
        fetchData();
      },
    });
  };

  // Options cho bulk dropdown — thêm "(không đổi)" và "(xóa)"
  const cottonOptions = [
    { value: KEEP_AS_IS, label: "(không đổi)" },
    { value: CLEAR_VALUE, label: "(xóa giá trị)" },
    ...cottonTypes.map((t) => ({ value: t.id, label: t.name })),
  ];
  const peOptions = [
    { value: KEEP_AS_IS, label: "(không đổi)" },
    { value: CLEAR_VALUE, label: "(xóa giá trị)" },
    ...peTypes.map((t) => ({ value: t.id, label: t.name })),
  ];

  // Popover content "Đặt tất cả"
  const setAllPopover = (field: "cotton" | "pe") => {
    const opts = field === "cotton" ? cottonTypes : peTypes;
    return (
      <div style={{ minWidth: 200 }}>
        <Text strong>
          Đặt {field === "cotton" ? "loại bông" : "loại xơ"} cho tất cả dòng:
        </Text>
        <Select
          autoFocus
          style={{ width: "100%", marginTop: 8 }}
          placeholder="Chọn..."
          options={opts.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => handleSetAll(field, v)}
        />
        {field === "pe" && (
          <Text
            type="secondary"
            style={{ fontSize: 11, display: "block", marginTop: 6 }}
          >
            Sợi 100% cotton sẽ được bỏ qua
          </Text>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* THANH CÔNG CỤ CHÍNH */}
      <Space style={{ marginBottom: 12 }} wrap>
        <DatePicker
          picker="month"
          value={dayjs(yearMonth + "-01")}
          format="MM/YYYY"
          allowClear={false}
          onChange={(d) => d && setYearMonth(d.format("YYYY-MM"))}
        />
        <Button icon={<CopyOutlined />} onClick={handleCopyPrev}>
          Copy tháng trước
        </Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          disabled={!edited}
        >
          Lưu
        </Button>
        <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
          {rows.length} mặt hàng ·{" "}
          {rows.filter((r) => r.cottonMaterialType || r.peMaterialType).length}{" "}
          đã cấu hình ·{" "}
          {
            rows.filter((r) => !r.cottonMaterialType && !r.peMaterialType)
              .length
          }{" "}
          còn trống
        </Text>
      </Space>

      {/* THANH BULK ACTION — chỉ hiện khi có dòng được chọn */}
      {selectedIds.length > 0 && (
        <div
          style={{
            background: "#E6F7FF",
            border: "1px solid #91D5FF",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 12,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Text strong style={{ color: "#0958D9" }}>
            <ThunderboltOutlined /> {selectedIds.length} mặt hàng đã chọn
          </Text>
          <Text>·</Text>
          <Text>Loại bông:</Text>
          <Select
            size="small"
            style={{ width: 200 }}
            value={bulkCotton}
            onChange={setBulkCotton}
            options={cottonOptions}
          />
          <Text>Loại xơ:</Text>
          <Select
            size="small"
            style={{ width: 200 }}
            value={bulkPe}
            onChange={setBulkPe}
            options={peOptions}
          />
          <Button size="small" type="primary" onClick={handleBulkApply}>
            Áp dụng cho {selectedIds.length} dòng
          </Button>
          <Button
            size="small"
            onClick={() => setSelectedIds([])}
            style={{ marginLeft: "auto" }}
          >
            Bỏ chọn
          </Button>
        </div>
      )}

      {/* THANH FILTER */}
      <Space style={{ marginBottom: 12 }}>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as typeof filter)}
          options={[
            { label: "Tất cả", value: "ALL" },
            { label: "Chưa cấu hình", value: "UNCONFIGURED" },
            { label: "Sợi thuần", value: "PURE_COTTON" },
            { label: "Sợi pha", value: "BLEND" },
          ]}
        />
        <Input
          placeholder="Tìm mặt hàng..."
          prefix={<FilterOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 200 }}
        />
      </Space>

      {/* BẢNG CHÍNH */}
      <Table
        dataSource={filteredRows}
        rowKey="itemId"
        loading={loading}
        pagination={{ pageSize: 30 }}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as number[]),
        }}
        columns={[
          {
            title: "Mặt hàng",
            dataIndex: "itemName",
            width: 180,
            render: (n) => <Text strong>{n}</Text>,
            sorter: (a: Row, b: Row) => a.itemName.localeCompare(b.itemName),
          },
          {
            title: "Tỷ lệ pha",
            key: "ratio",
            width: 110,
            align: "center" as const,
            render: (_: unknown, r: Row) =>
              r.cottonRatio == null ? (
                <Tag>Chưa có ĐM</Tag>
              ) : r.isPureCotton ? (
                <Tag color="orange">100% cotton</Tag>
              ) : (
                <Tag color="blue">{`${Math.round(r.cottonRatio * 100)}/${Math.round((1 - r.cottonRatio) * 100)}`}</Tag>
              ),
          },
          {
            title: (
              <Space>
                <span>Loại bông</span>
                <Popover
                  content={setAllPopover("cotton")}
                  trigger="click"
                  placement="bottomLeft"
                >
                  <a style={{ fontSize: 11, fontWeight: 400 }}>Đặt tất cả →</a>
                </Popover>
              </Space>
            ),
            key: "cotton",
            width: 240,
            render: (_: unknown, r: Row) => {
              const isDifferent =
                majorityCotton != null &&
                r.cottonMaterialType?.id != null &&
                r.cottonMaterialType.id !== majorityCotton;
              return (
                <Select
                  placeholder="Chọn loại bông..."
                  allowClear
                  style={{
                    width: "100%",
                    background: isDifferent ? "#FFF7E6" : undefined,
                  }}
                  value={r.cottonMaterialType?.id}
                  onChange={(v) =>
                    updateRow(r.itemId, "cottonMaterialType", v ?? null)
                  }
                  options={cottonTypes.map((t) => ({
                    value: t.id,
                    label: t.name,
                  }))}
                />
              );
            },
          },
          {
            title: (
              <Space>
                <span>Loại xơ</span>
                <Popover
                  content={setAllPopover("pe")}
                  trigger="click"
                  placement="bottomLeft"
                >
                  <a style={{ fontSize: 11, fontWeight: 400 }}>Đặt tất cả →</a>
                </Popover>
              </Space>
            ),
            key: "pe",
            width: 240,
            render: (_: unknown, r: Row) => {
              if (r.isPureCotton) {
                return (
                  <Text type="secondary" italic>
                    Sợi thuần — không dùng
                  </Text>
                );
              }
              const isDifferent =
                majorityPe != null &&
                r.peMaterialType?.id != null &&
                r.peMaterialType.id !== majorityPe;
              return (
                <Select
                  placeholder="Chọn loại xơ..."
                  allowClear
                  style={{
                    width: "100%",
                    background: isDifferent ? "#FFF7E6" : undefined,
                  }}
                  value={r.peMaterialType?.id}
                  onChange={(v) =>
                    updateRow(r.itemId, "peMaterialType", v ?? null)
                  }
                  options={peTypes.map((t) => ({ value: t.id, label: t.name }))}
                />
              );
            },
          },
          {
            title: "TH Cotton",
            dataIndex: "cottonRate",
            width: 90,
            align: "center" as const,
            render: (v: number | null) => (v != null ? v.toFixed(2) : "—"),
          },
          {
            title: "TH Xơ",
            dataIndex: "peRate",
            width: 90,
            align: "center" as const,
            render: (v: number | null, r: Row) =>
              r.isPureCotton ? "—" : v != null ? v.toFixed(2) : "—",
          },
        ]}
      />
    </div>
  );
}

// Helper: tìm giá trị xuất hiện nhiều nhất
function findMajority(values: (number | null | undefined)[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) {
    if (v == null) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let majority: number | null = null;
  let maxCount = 0;
  for (const [k, c] of counts) {
    if (c > maxCount) {
      maxCount = c;
      majority = k;
    }
  }
  // Chỉ tính "đa số" khi có ít nhất 2 dòng cùng giá trị
  return maxCount >= 2 ? majority : null;
}
