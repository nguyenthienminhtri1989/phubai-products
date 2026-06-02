"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography,
  Table,
  Button,
  Modal,
  Form,
  InputNumber,
  Select,
  Space,
  Popconfirm,
  message,
  Tag,
  Alert,
  Card,
  Progress,
  Row,
  Col,
  Input,
  DatePicker,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

const { Title, Text } = Typography;

// =============================================
// TYPES
// =============================================
interface ItemInfo {
  id: number;
  name: string;
  code: string | null;
  ne: number | null;
  material: string | null;
  composition: string | null;
  yarnType?: string;
}

interface RawMaterialRate {
  id: number;
  itemId: number;
  item: ItemInfo;
  cottonRate: number | null;
  peRate: number | null;
  cottonRatio: number;
  wasteRate: number | null;
  doubleTwistGcRate: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
}

type EditMode = "create" | "fix" | "new-version";

// =============================================
// HELPERS
// =============================================
type YarnGroup = "COCD" | "COCM" | "CVCM" | "CRC" | "KHÁC";

function detectYarnGroup(name: string): YarnGroup {
  const upper = name.toUpperCase();
  if (upper.includes("CVCM")) return "CVCM";
  if (upper.includes("CRC")) return "CRC";
  if (upper.includes("COCM")) return "COCM";
  if (upper.includes("COCD") || upper.includes("CD")) return "COCD";
  if (upper.includes("CM")) return "COCM";
  return "KHÁC";
}

function isDoubleTwist(name: string): boolean {
  return name.includes("/2") || name.toUpperCase().includes("XE ĐÔI");
}

function hasPE(item: ItemInfo): boolean {
  return item.yarnType === "BLENDED";
}

const GROUP_COLORS: Record<YarnGroup, string> = {
  COCD: "blue",
  COCM: "green",
  CVCM: "orange",
  CRC: "purple",
  KHÁC: "default",
};

const GROUP_ORDER: YarnGroup[] = ["COCD", "COCM", "CVCM", "CRC", "KHÁC"];

function fmt3(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toFixed(3);
}

// =============================================
// COMPONENT
// =============================================
export default function RawMaterialRatesPage() {
  const [rates, setRates] = useState<RawMaterialRate[]>([]);
  const [allItems, setAllItems] = useState<ItemInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>("create");
  const [editingRate, setEditingRate] = useState<RawMaterialRate | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const [searchText, setSearchText] = useState("");
  const [filterGroup, setFilterGroup] = useState<YarnGroup | "ALL">("ALL");
  const [selectedItem, setSelectedItem] = useState<ItemInfo | null>(null);

  const fetchRates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kdsx/raw-material-rates");
      if (res.ok) setRates(await res.json());
      else message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/items");
    if (res.ok) setAllItems(await res.json());
  }, []);

  useEffect(() => {
    fetchRates();
    fetchItems();
  }, [fetchRates, fetchItems]);

  const itemIdsWithRate = useMemo(() => new Set(rates.map((r) => r.itemId)), [rates]);

  const itemsWithoutRate = useMemo(
    () => allItems.filter((i) => !itemIdsWithRate.has(i.id)),
    [allItems, itemIdsWithRate]
  );

  // =============================================
  // ACTIVE RATE — mỗi item chỉ có 1 active (effectiveTo = null, effectiveFrom lớn nhất)
  // =============================================
  const activeRateIdByItem = useMemo(() => {
    const map = new Map<number, number>(); // itemId -> rateId
    rates.forEach((r) => {
      if (!r.effectiveTo) {
        const existingId = map.get(r.itemId);
        if (!existingId) {
          map.set(r.itemId, r.id);
        } else {
          const existing = rates.find((x) => x.id === existingId)!;
          if (dayjs(r.effectiveFrom).isAfter(dayjs(existing.effectiveFrom))) {
            map.set(r.itemId, r.id);
          }
        }
      }
    });
    return map;
  }, [rates]);

  function isActiveRate(r: RawMaterialRate) {
    return activeRateIdByItem.get(r.itemId) === r.id;
  }

  // =============================================
  // STATS
  // =============================================
  const stats = useMemo(() => {
    return GROUP_ORDER.map((group) => {
      const groupItems = allItems.filter((i) => detectYarnGroup(i.name) === group);
      const configured = groupItems.filter((i) => itemIdsWithRate.has(i.id));
      return { group, total: groupItems.length, configured: configured.length };
    }).filter((s) => s.total > 0);
  }, [allItems, itemIdsWithRate]);

  const unconfiguredItems = useMemo(
    () => allItems.filter((i) => !itemIdsWithRate.has(i.id)),
    [allItems, itemIdsWithRate]
  );

  // =============================================
  // FILTER + SORT
  // =============================================
  const filteredRates = useMemo(() => {
    let data = [...rates];
    if (searchText) {
      const s = searchText.toLowerCase();
      data = data.filter((r) => r.item.name.toLowerCase().includes(s));
    }
    if (filterGroup !== "ALL") {
      data = data.filter((r) => detectYarnGroup(r.item.name) === filterGroup);
    }
    data.sort((a, b) => {
      const ga = GROUP_ORDER.indexOf(detectYarnGroup(a.item.name));
      const gb = GROUP_ORDER.indexOf(detectYarnGroup(b.item.name));
      if (ga !== gb) return ga - gb;
      const nameCompare = a.item.name.localeCompare(b.item.name, "vi");
      if (nameCompare !== 0) return nameCompare;
      // Cùng item: active trước, rồi sắp xếp effectiveFrom giảm dần
      const aActive = isActiveRate(a) ? 0 : 1;
      const bActive = isActiveRate(b) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return dayjs(b.effectiveFrom).diff(dayjs(a.effectiveFrom));
    });
    return data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates, searchText, filterGroup, activeRateIdByItem]);

  // =============================================
  // ROW SPAN — gộp cột "Mặt hàng" cho các rows cùng item
  // =============================================
  const rowSpanMap = useMemo(() => {
    const countMap = new Map<number, number>();
    filteredRates.forEach((r) => countMap.set(r.itemId, (countMap.get(r.itemId) || 0) + 1));
    const result = new Map<number, number>(); // rateId -> rowSpan
    const seen = new Set<number>();
    filteredRates.forEach((r) => {
      if (!seen.has(r.itemId)) {
        result.set(r.id, countMap.get(r.itemId)!);
        seen.add(r.itemId);
      } else {
        result.set(r.id, 0);
      }
    });
    return result;
  }, [filteredRates]);

  // =============================================
  // MODAL OPEN HELPERS
  // =============================================
  function openCreate() {
    setEditMode("create");
    setEditingRate(null);
    setSelectedItem(null);
    form.resetFields();
    form.setFieldsValue({ effectiveFrom: dayjs(), cottonRatio: 100 });
    setModalOpen(true);
  }

  function openFixTypo(r: RawMaterialRate) {
    setEditMode("fix");
    setEditingRate(r);
    setSelectedItem(r.item);
    form.setFieldsValue({
      itemId: r.itemId,
      cottonRate: r.cottonRate,
      cottonRatio: Math.round(r.cottonRatio * 100),
      peRate: r.peRate,
      effectiveFrom: r.effectiveFrom ? dayjs(r.effectiveFrom) : dayjs(),
      effectiveTo: r.effectiveTo ? dayjs(r.effectiveTo) : null,
      note: r.note,
    });
    setModalOpen(true);
  }

  function openNewVersion(r: RawMaterialRate) {
    setEditMode("new-version");
    setEditingRate(r);
    setSelectedItem(r.item);
    // Pre-fill từ phiên bản gần nhất (kể cả đã đóng), user chỉ sửa chỗ thay đổi
    form.setFieldsValue({
      itemId: r.itemId,
      cottonRate: r.cottonRate,
      cottonRatio: Math.round(r.cottonRatio * 100),
      peRate: r.peRate,
      effectiveFrom: dayjs(), // mặc định hôm nay, user điều chỉnh
      effectiveTo: null,
      note: r.note,
    });
    setModalOpen(true);
  }

  // =============================================
  // SAVE
  // =============================================
  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const payload: Record<string, unknown> = {
        cottonRate: values.cottonRate ?? null,
        cottonRatio: values.cottonRatio != null ? values.cottonRatio / 100 : 1.0,
        peRate: values.peRate ?? null,
        effectiveFrom: values.effectiveFrom ? values.effectiveFrom.format("YYYY-MM-DD") : null,
        effectiveTo: values.effectiveTo ? values.effectiveTo.format("YYYY-MM-DD") : null,
        note: values.note || null,
      };

      let url: string;
      let method: string;

      if (editMode === "create") {
        payload.itemId = values.itemId;
        url = "/api/kdsx/raw-material-rates";
        method = "POST";
      } else if (editMode === "fix") {
        url = `/api/kdsx/raw-material-rates/${editingRate!.id}`;
        method = "PUT";
      } else {
        // new-version — gửi itemId, server tự tìm active version
        payload.itemId = editingRate!.itemId;
        url = "/api/kdsx/raw-material-rates/new-version";
        method = "POST";
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || "Lỗi lưu dữ liệu");
        return;
      }

      const successMsg =
        editMode === "create"
          ? "Đã tạo định mức mới"
          : editMode === "fix"
          ? "Đã sửa lỗi nhập liệu"
          : "Đã tạo phiên bản định mức mới — phiên bản cũ đã được đóng lại";

      message.success(successMsg);
      setModalOpen(false);
      fetchRates();
    } catch {
      // antd validation errors are shown inline
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/kdsx/raw-material-rates/${id}`, { method: "DELETE" });
    if (res.ok) {
      message.success("Đã xóa");
      fetchRates();
    } else {
      const err = await res.json();
      message.error(err.error || "Không thể xóa");
    }
  }

  // =============================================
  // COLUMNS
  // =============================================
  const columns = [
    {
      title: "Mặt hàng",
      key: "item",
      width: 160,
      onCell: (r: RawMaterialRate) => ({ rowSpan: rowSpanMap.get(r.id) ?? 1 }),
      render: (_: unknown, r: RawMaterialRate) => (
        <Text strong>{r.item.name}</Text>
      ),
    },
    {
      title: "Nhóm sợi",
      key: "group",
      width: 80,
      onCell: (r: RawMaterialRate) => ({ rowSpan: rowSpanMap.get(r.id) ?? 1 }),
      render: (_: unknown, r: RawMaterialRate) => {
        const g = detectYarnGroup(r.item.name);
        return <Tag color={GROUP_COLORS[g]}>{g}</Tag>;
      },
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 120,
      render: (_: unknown, r: RawMaterialRate) =>
        isActiveRate(r) ? (
          <Tag color="green">Đang áp dụng</Tag>
        ) : (
          <Tag color="default">Lịch sử</Tag>
        ),
    },
    {
      title: (
        <Tooltip title="kg nguyên liệu / kg thành phẩm">
          ĐM Cotton <InfoCircleOutlined />
        </Tooltip>
      ),
      key: "cottonRate",
      width: 110,
      align: "right" as const,
      render: (_: unknown, r: RawMaterialRate) => (
        <Text code>{fmt3(r.cottonRate)}</Text>
      ),
    },
    {
      title: (
        <Tooltip title="Tỷ lệ thành phần cotton (100% = thuần cotton, 60% = sợi pha 60/40)">
          Tỷ lệ cotton <InfoCircleOutlined />
        </Tooltip>
      ),
      key: "cottonRatio",
      width: 130,
      render: (_: unknown, r: RawMaterialRate) => {
        const cr = r.cottonRatio ?? 1.0;
        if (cr >= 1.0) return <Tag color="green">100% cotton</Tag>;
        return (
          <Tag color="orange">
            {Math.round(cr * 100)}% / {Math.round((1 - cr) * 100)}% PE
          </Tag>
        );
      },
    },
    {
      title: (
        <Tooltip title="PE/Benma — giá trị GỐC (kg NL/kg TP), KHÔNG nhân tỷ lệ">
          ĐM PE (gốc) <InfoCircleOutlined />
        </Tooltip>
      ),
      key: "peRate",
      width: 110,
      align: "right" as const,
      render: (_: unknown, r: RawMaterialRate) =>
        hasPE(r.item) ? (
          <Text code>{fmt3(r.peRate)}</Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Hiệu lực từ",
      key: "effectiveFrom",
      width: 110,
      render: (_: unknown, r: RawMaterialRate) =>
        r.effectiveFrom ? dayjs(r.effectiveFrom).format("DD/MM/YYYY") : "—",
    },
    {
      title: "Đến",
      key: "effectiveTo",
      width: 120,
      render: (_: unknown, r: RawMaterialRate) =>
        r.effectiveTo ? (
          dayjs(r.effectiveTo).format("DD/MM/YYYY")
        ) : (
          <Tag color="green">Không thời hạn</Tag>
        ),
    },
    {
      title: "Thao tác",
      key: "action",
      width: 160,
      fixed: "right" as const,
      render: (_: unknown, r: RawMaterialRate) => {
        const hasActiveForItem = activeRateIdByItem.has(r.itemId);
        const tooltipNewVersion = hasActiveForItem
          ? "Tạo phiên bản định mức mới — phiên bản đang active sẽ tự động đóng lại"
          : "Tạo phiên bản định mức mới (mặt hàng này chưa có phiên bản active)";
        return (
        <Space size={4}>
          <Tooltip title={tooltipNewVersion}>
            <Button
              size="small"
              type="primary"
              icon={<HistoryOutlined />}
              onClick={() => openNewVersion(r)}
            >
              Phiên bản mới
            </Button>
          </Tooltip>
          <Tooltip title="Sửa lỗi nhập liệu — chỉ dùng khi chưa có sản xuất nào áp dụng định mức này">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openFixTypo(r)}
            />
          </Tooltip>
          <Popconfirm
            title="Xóa định mức này?"
            onConfirm={() => handleDelete(r.id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
        );
      },
    },
  ];

  // =============================================
  // MODAL TITLE & DESCRIPTION
  // =============================================
  const modalTitle = useMemo(() => {
    if (editMode === "create") return "Thêm định mức tiêu hao NVL";
    if (editMode === "fix")
      return `Sửa lỗi nhập liệu: ${editingRate?.item.name}`;
    return `Tạo phiên bản định mức mới: ${editingRate?.item.name}`;
  }, [editMode, editingRate]);

  const showPE = selectedItem ? hasPE(selectedItem) : false;

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Space>
          <ExperimentOutlined style={{ fontSize: 22, color: "#1677ff" }} />
          <Title level={3} style={{ margin: 0 }}>
            Định mức Tiêu hao NVL
          </Title>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Thêm định mức
        </Button>
      </div>

      {/* Stats cards */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {stats.map((s) => (
          <Col key={s.group} xs={12} sm={6}>
            <Card
              size="small"
              style={{
                borderLeft: `4px solid var(--ant-${GROUP_COLORS[s.group]}-6, #1677ff)`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text strong>
                  <Tag color={GROUP_COLORS[s.group]} style={{ marginRight: 4 }}>
                    {s.group}
                  </Tag>
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {s.configured}/{s.total}
                </Text>
              </div>
              <Progress
                percent={s.total > 0 ? Math.round((s.configured / s.total) * 100) : 0}
                size="small"
                status={s.configured === s.total ? "success" : "active"}
                style={{ marginTop: 4 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Warning */}
      {unconfiguredItems.length > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
          message={`${unconfiguredItems.length} mặt hàng chưa có định mức`}
          description={
            <span>
              Nếu không có định mức, chi phí NVL sẽ tính ra = 0 khiến lợi nhuận kế hoạch sai.&nbsp;
              Mặt hàng chưa cấu hình:{" "}
              {unconfiguredItems
                .slice(0, 8)
                .map((i) => i.name)
                .join(", ")}
              {unconfiguredItems.length > 8
                ? ` và ${unconfiguredItems.length - 8} mặt hàng khác...`
                : ""}
            </span>
          }
        />
      )}

      {/* Info về versioning */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message='Để thay đổi định mức từ một ngày nào đó, dùng nút "Phiên bản mới" — phiên bản cũ sẽ được đóng lại tự động và số liệu các tháng đã qua không bị ảnh hưởng.'
      />

      {/* Filters */}
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search
          placeholder="Tìm theo tên mặt hàng..."
          allowClear
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 260 }}
        />
        <Select
          value={filterGroup}
          onChange={(v) => setFilterGroup(v)}
          style={{ width: 140 }}
          options={[
            { label: "Tất cả nhóm", value: "ALL" },
            ...GROUP_ORDER.map((g) => ({ label: g, value: g })),
          ]}
        />
      </Space>

      {/* Table */}
      <Table
        dataSource={filteredRates}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
        size="middle"
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 30, showSizeChanger: true }}
        rowClassName={(r) => (isActiveRate(r) ? "" : "rate-history-row")}
      />

      <style>{`
        .rate-history-row td {
          background: #fafafa !important;
          color: #aaa;
        }
        .rate-history-row td .ant-tag {
          opacity: 0.6;
        }
      `}</style>

      {/* Modal */}
      <Modal
        title={modalTitle}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText={editMode === "new-version" ? "Tạo phiên bản mới" : "Lưu"}
        cancelText="Hủy"
        width={680}
        destroyOnClose
      >
        {editMode === "new-version" && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="Phiên bản cũ sẽ được đóng lại (effectiveTo = ngày áp dụng mới - 1). Số liệu các tháng đã qua sẽ không thay đổi."
          />
        )}
        {editMode === "fix" && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Sửa lỗi nhập liệu — chỉ dùng khi định mức này chưa được áp dụng vào bất kỳ bản ghi sản xuất nào. Nếu đã có sản xuất, server sẽ từ chối."
          />
        )}

        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          {/* Mặt hàng */}
          <Form.Item
            name="itemId"
            label="Mặt hàng"
            rules={[{ required: true, message: "Chọn mặt hàng" }]}
          >
            <Select
              showSearch
              disabled={editMode !== "create"}
              placeholder={
                editMode !== "create"
                  ? editingRate?.item.name
                  : "Chọn mặt hàng chưa có định mức..."
              }
              optionFilterProp="label"
              onChange={(val) => {
                const item = allItems.find((i) => i.id === val) || null;
                setSelectedItem(item);
                if (item && !hasPE(item)) form.setFieldValue("peRate", null);
              }}
              options={(editMode === "create" ? itemsWithoutRate : allItems).map((i) => ({
                value: i.id,
                label: i.name,
              }))}
            />
          </Form.Item>

          {/* Detected info */}
          {selectedItem && (
            <div
              style={{
                background: "#f6f8fa",
                borderRadius: 6,
                padding: "8px 12px",
                marginBottom: 16,
                fontSize: 13,
                color: "#555",
              }}
            >
              Nhóm sợi:{" "}
              <Tag color={GROUP_COLORS[detectYarnGroup(selectedItem.name)]}>
                {detectYarnGroup(selectedItem.name)}
              </Tag>
              {isDoubleTwist(selectedItem.name) && <Tag color="volcano">Sợi xe đôi</Tag>}
              {hasPE(selectedItem) && <Tag color="orange">Có PE/Benma</Tag>}
            </div>
          )}

          <Row gutter={16}>
            {/* Cotton Rate */}
            <Col span={12}>
              <Form.Item
                name="cottonRate"
                label="Định mức Cotton (kg NL/kg TP)"
                rules={[{ required: true, message: "Nhập định mức cotton" }]}
              >
                <InputNumber
                  style={{ width: "100%" }}
                  step={0.001}
                  precision={3}
                  min={0}
                  placeholder="VD: 1.120"
                />
              </Form.Item>
            </Col>

            {/* PE Rate */}
            <Col span={12}>
              <Form.Item
                name="peRate"
                label={
                  <span>
                    ĐM PE/Benma (kg NL/kg TP — giá trị GỐC){" "}
                    {!showPE && (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        (chỉ CVCM)
                      </Text>
                    )}
                  </span>
                }
              >
                <InputNumber
                  style={{ width: "100%" }}
                  step={0.001}
                  precision={3}
                  min={0}
                  disabled={!showPE}
                  placeholder={
                    showPE ? "VD: 1.02 (giá trị gốc, KHÔNG nhân tỷ lệ)" : "—"
                  }
                />
              </Form.Item>
            </Col>

            {/* Cotton Ratio */}
            <Col span={12}>
              <Form.Item
                name="cottonRatio"
                label={
                  <Tooltip title="Tỷ lệ thành phần cotton trong sợi. 100% = thuần cotton. 60% = sợi CVCM (60% bông, 40% PE)">
                    Tỷ lệ cotton (%) <InfoCircleOutlined />
                  </Tooltip>
                }
                rules={[{ required: true, message: "Nhập tỷ lệ cotton" }]}
              >
                <InputNumber
                  style={{ width: "100%" }}
                  step={5}
                  precision={0}
                  min={1}
                  max={100}
                  formatter={(v) => (v != null ? `${v}%` : "")}
                  parser={(v) => {
                    if (!v) return 100 as unknown as 100;
                    return parseFloat(v.replace("%", "")) as unknown as 100;
                  }}
                  placeholder="VD: 100 (thuần cotton), 60 (CVCM)"
                />
              </Form.Item>
            </Col>

            {/* Effective From */}
            <Col span={12}>
              {(() => {
                // Tìm active version của item đang được tạo phiên bản mới
                const activeId = editingRate ? activeRateIdByItem.get(editingRate.itemId) : undefined;
                const activeVersion = activeId ? rates.find((x) => x.id === activeId) : undefined;
                const hasActive = !!activeVersion;

                const labelNewVersion = hasActive
                  ? `Ngày áp dụng mới (định mức active từ ${dayjs(activeVersion!.effectiveFrom).format("DD/MM/YYYY")} sẽ tự động đóng vào ngày hôm trước)`
                  : "Ngày bắt đầu áp dụng định mức";

                return (
                  <Form.Item
                    name="effectiveFrom"
                    label={editMode === "new-version" ? labelNewVersion : "Hiệu lực từ ngày"}
                    rules={[{ required: true, message: "Chọn ngày hiệu lực" }]}
                  >
                    <DatePicker
                      style={{ width: "100%" }}
                      format="DD/MM/YYYY"
                      placeholder="dd/mm/yyyy"
                      disabledDate={
                        editMode === "new-version" && activeVersion
                          ? (d) => d.isBefore(dayjs(activeVersion.effectiveFrom).add(1, "day"))
                          : undefined
                      }
                    />
                  </Form.Item>
                );
              })()}
            </Col>

            {/* Effective To — chỉ hiện cho fix/create, không cho new-version */}
            {editMode !== "new-version" && (
              <Col span={12}>
                <Form.Item
                  name="effectiveTo"
                  label='Hiệu lực đến (để trống = "Không thời hạn")'
                >
                  <DatePicker
                    style={{ width: "100%" }}
                    format="DD/MM/YYYY"
                    placeholder="Không thời hạn"
                  />
                </Form.Item>
              </Col>
            )}

            {/* Note */}
            <Col span={24}>
              <Form.Item name="note" label="Ghi chú">
                <Input placeholder="Ghi chú thêm (nếu có)" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
