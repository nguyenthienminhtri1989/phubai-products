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
}

interface RawMaterialRate {
  id: number;
  itemId: number;
  item: ItemInfo;
  cottonRate: number | null;
  peRate: number | null;
  wasteRate: number | null;
  sellingCostRate: number | null;
  doubleTwistGcRate: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
}

// =============================================
// HELPERS — phát hiện nhóm sợi từ tên
// =============================================
type YarnGroup = "COCD" | "COCM" | "CVCM" | "CRC" | "KHÁC";

function detectYarnGroup(name: string): YarnGroup {
  const upper = name.toUpperCase();
  if (upper.includes("CVCM")) return "CVCM";
  if (upper.includes("CRC")) return "CRC";
  if (upper.includes("COCM") || upper.includes("COCM")) return "COCM";
  if (upper.includes("COCD") || upper.includes("CD")) return "COCD";
  if (upper.includes("CM")) return "COCM";
  return "KHÁC";
}

// Sợi xe đôi: tên chứa "/2" hoặc "XE ĐÔI"
function isDoubleTwist(name: string): boolean {
  return name.includes("/2") || name.toUpperCase().includes("XE ĐÔI");
}

// Chỉ CVCM mới có PE
function hasPE(name: string): boolean {
  return detectYarnGroup(name) === "CVCM";
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

function fmtPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(0)}%`;
}

function fmt2(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toFixed(2);
}

// =============================================
// COMPONENT
// =============================================
export default function RawMaterialRatesPage() {
  const [rates, setRates] = useState<RawMaterialRate[]>([]);
  const [allItems, setAllItems] = useState<ItemInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterialRate | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Filter state
  const [searchText, setSearchText] = useState("");
  const [filterGroup, setFilterGroup] = useState<YarnGroup | "ALL">("ALL");

  // Dynamic form state
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

  // Items đã có định mức (có ít nhất 1 bản ghi)
  const itemIdsWithRate = useMemo(() => new Set(rates.map((r) => r.itemId)), [rates]);

  // Items chưa có định mức — dùng cho form tạo mới
  const itemsWithoutRate = useMemo(
    () => allItems.filter((i) => !itemIdsWithRate.has(i.id)),
    [allItems, itemIdsWithRate]
  );

  // =============================================
  // STATS — 4 cards
  // =============================================
  const stats = useMemo(() => {
    return GROUP_ORDER.map((group) => {
      const groupItems = allItems.filter((i) => detectYarnGroup(i.name) === group);
      const configured = groupItems.filter((i) => itemIdsWithRate.has(i.id));
      return { group, total: groupItems.length, configured: configured.length };
    }).filter((s) => s.total > 0);
  }, [allItems, itemIdsWithRate]);

  // Items chưa có định mức (cảnh báo)
  const unconfiguredItems = useMemo(
    () => allItems.filter((i) => !itemIdsWithRate.has(i.id)),
    [allItems, itemIdsWithRate]
  );

  // =============================================
  // FILTER TABLE
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
    // Sort: nhóm sợi → tên item
    data.sort((a, b) => {
      const ga = GROUP_ORDER.indexOf(detectYarnGroup(a.item.name));
      const gb = GROUP_ORDER.indexOf(detectYarnGroup(b.item.name));
      if (ga !== gb) return ga - gb;
      return a.item.name.localeCompare(b.item.name, "vi");
    });
    return data;
  }, [rates, searchText, filterGroup]);

  // =============================================
  // MODAL OPEN
  // =============================================
  function openCreate() {
    setEditing(null);
    setSelectedItem(null);
    form.resetFields();
    form.setFieldsValue({ effectiveFrom: dayjs() });
    setModalOpen(true);
  }

  function openEdit(r: RawMaterialRate) {
    setEditing(r);
    setSelectedItem(r.item);
    form.setFieldsValue({
      itemId: r.itemId,
      cottonRate: r.cottonRate,
      peRate: r.peRate,
      wasteRate: r.wasteRate,
      sellingCostRate: r.sellingCostRate,
      doubleTwistGcRate: r.doubleTwistGcRate,
      effectiveFrom: r.effectiveFrom ? dayjs(r.effectiveFrom) : dayjs(),
      effectiveTo: r.effectiveTo ? dayjs(r.effectiveTo) : null,
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

      const payload = {
        itemId: values.itemId,
        cottonRate: values.cottonRate ?? null,
        peRate: values.peRate ?? null,
        wasteRate: values.wasteRate ?? null,
        sellingCostRate: values.sellingCostRate ?? null,
        doubleTwistGcRate: values.doubleTwistGcRate ?? null,
        effectiveFrom: values.effectiveFrom
          ? values.effectiveFrom.format("YYYY-MM-DD")
          : null,
        effectiveTo: values.effectiveTo
          ? values.effectiveTo.format("YYYY-MM-DD")
          : null,
        note: values.note || null,
      };

      const url = editing
        ? `/api/kdsx/raw-material-rates/${editing.id}`
        : "/api/kdsx/raw-material-rates";
      const method = editing ? "PUT" : "POST";

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

      message.success(editing ? "Đã cập nhật định mức" : "Đã tạo định mức mới");
      setModalOpen(false);
      fetchRates();
    } catch {
      // validation error — antd shows inline
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/kdsx/raw-material-rates/${id}`, {
      method: "DELETE",
    });
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
      render: (_: unknown, r: RawMaterialRate) => (
        <Text strong>{r.item.name}</Text>
      ),
    },
    {
      title: "Nhóm sợi",
      key: "group",
      width: 90,
      render: (_: unknown, r: RawMaterialRate) => {
        const g = detectYarnGroup(r.item.name);
        return <Tag color={GROUP_COLORS[g]}>{g}</Tag>;
      },
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
        <Tooltip title="PE/Benma — chỉ sợi CVCM">
          ĐM PE/Benma <InfoCircleOutlined />
        </Tooltip>
      ),
      key: "peRate",
      width: 110,
      align: "right" as const,
      render: (_: unknown, r: RawMaterialRate) =>
        hasPE(r.item.name) ? (
          <Text code>{fmt2(r.peRate)}</Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Phế thu hồi",
      key: "wasteRate",
      width: 100,
      align: "right" as const,
      render: (_: unknown, r: RawMaterialRate) => fmtPct(r.wasteRate),
    },
    {
      title: "CP Bán hàng",
      key: "sellingCostRate",
      width: 100,
      align: "right" as const,
      render: (_: unknown, r: RawMaterialRate) => fmtPct(r.sellingCostRate),
    },
    {
      title: (
        <Tooltip title="USD/kg — chỉ sợi xe đôi (/2)">
          CP GC xe đôi <InfoCircleOutlined />
        </Tooltip>
      ),
      key: "doubleTwistGcRate",
      width: 115,
      align: "right" as const,
      render: (_: unknown, r: RawMaterialRate) =>
        isDoubleTwist(r.item.name) ? (
          <Text code>{fmt2(r.doubleTwistGcRate)}</Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Hiệu lực từ",
      key: "effectiveFrom",
      width: 110,
      render: (_: unknown, r: RawMaterialRate) =>
        r.effectiveFrom
          ? dayjs(r.effectiveFrom).format("DD/MM/YYYY")
          : "—",
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
      width: 90,
      fixed: "right" as const,
      render: (_: unknown, r: RawMaterialRate) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(r)}
          />
          <Popconfirm
            title="Xóa định mức này?"
            onConfirm={() => handleDelete(r.id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // =============================================
  // RENDER
  // =============================================
  const showPE = selectedItem ? hasPE(selectedItem.name) : false;
  const showGC = selectedItem ? isDoubleTwist(selectedItem.name) : false;

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
            <Card size="small" style={{ borderLeft: `4px solid var(--ant-${GROUP_COLORS[s.group]}-6, #1677ff)` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
              {unconfiguredItems.length > 8 ? ` và ${unconfiguredItems.length - 8} mặt hàng khác...` : ""}
            </span>
          }
        />
      )}

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
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
      />

      {/* Modal */}
      <Modal
        title={
          editing
            ? `Sửa định mức: ${editing.item.name}`
            : "Thêm định mức tiêu hao NVL"
        }
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        width={660}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {/* Mặt hàng */}
          <Form.Item
            name="itemId"
            label="Mặt hàng"
            rules={[{ required: true, message: "Chọn mặt hàng" }]}
          >
            <Select
              showSearch
              disabled={!!editing}
              placeholder={
                editing
                  ? editing.item.name
                  : "Chọn mặt hàng chưa có định mức..."
              }
              optionFilterProp="label"
              onChange={(val) => {
                const item = allItems.find((i) => i.id === val) || null;
                setSelectedItem(item);
                // Clear conditional fields
                if (item) {
                  if (!hasPE(item.name)) form.setFieldValue("peRate", null);
                  if (!isDoubleTwist(item.name))
                    form.setFieldValue("doubleTwistGcRate", null);
                }
              }}
              options={(editing ? allItems : itemsWithoutRate).map((i) => ({
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
              {isDoubleTwist(selectedItem.name) && (
                <Tag color="volcano">Sợi xe đôi</Tag>
              )}
              {hasPE(selectedItem.name) && (
                <Tag color="orange">Có PE/Benma</Tag>
              )}
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
                    Định mức PE/Benma{" "}
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
                  step={0.01}
                  precision={2}
                  min={0}
                  disabled={!showPE}
                  placeholder={showPE ? "VD: 1.02" : "—"}
                />
              </Form.Item>
            </Col>

            {/* Waste Rate */}
            <Col span={12}>
              <Form.Item
                name="wasteRate"
                label="Hệ số Phế thu hồi (0.07 = 7%)"
                rules={[{ required: true, message: "Nhập hệ số phế" }]}
              >
                <InputNumber
                  style={{ width: "100%" }}
                  step={0.01}
                  precision={2}
                  min={0}
                  max={1}
                  placeholder="VD: 0.07"
                  formatter={(v) =>
                    v != null ? `${(Number(v) * 100).toFixed(0)}%` : ""
                  }
                  parser={(v) => {
                    if (!v) return 0 as unknown as 0;
                    return (parseFloat(v.replace("%", "")) / 100) as unknown as 0;
                  }}
                />
              </Form.Item>
            </Col>

            {/* Selling Cost Rate */}
            <Col span={12}>
              <Form.Item
                name="sellingCostRate"
                label="Hệ số CP Bán hàng (0.08 = 8%)"
                rules={[{ required: true, message: "Nhập hệ số CP bán hàng" }]}
              >
                <InputNumber
                  style={{ width: "100%" }}
                  step={0.01}
                  precision={2}
                  min={0}
                  max={1}
                  placeholder="VD: 0.08"
                  formatter={(v) =>
                    v != null ? `${(Number(v) * 100).toFixed(0)}%` : ""
                  }
                  parser={(v) => {
                    if (!v) return 0 as unknown as 0;
                    return (parseFloat(v.replace("%", "")) / 100) as unknown as 0;
                  }}
                />
              </Form.Item>
            </Col>

            {/* Double Twist GC Rate */}
            <Col span={12}>
              <Form.Item
                name="doubleTwistGcRate"
                label={
                  <span>
                    CP GC xe đôi (USD/kg){" "}
                    {!showGC && (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        (chỉ sợi /2)
                      </Text>
                    )}
                  </span>
                }
              >
                <InputNumber
                  style={{ width: "100%" }}
                  step={0.01}
                  precision={2}
                  min={0}
                  disabled={!showGC}
                  placeholder={showGC ? "VD: 0.45" : "—"}
                />
              </Form.Item>
            </Col>

            {/* Effective From */}
            <Col span={12}>
              <Form.Item
                name="effectiveFrom"
                label="Hiệu lực từ ngày"
                rules={[{ required: true, message: "Chọn ngày hiệu lực" }]}
              >
                <DatePicker
                  style={{ width: "100%" }}
                  format="DD/MM/YYYY"
                  placeholder="dd/mm/yyyy"
                />
              </Form.Item>
            </Col>

            {/* Effective To */}
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
