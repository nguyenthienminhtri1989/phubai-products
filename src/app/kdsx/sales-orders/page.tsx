"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Space,
  Popconfirm,
  message,
  Tag,
  Collapse,
  InputNumber,
  Switch,
  Tooltip,
} from "antd";
import { PlusOutlined, DeleteOutlined, EyeOutlined, LineChartOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";

const { Title } = Typography;

interface Factory { id: number; name: string; }
interface Customer { id: number; name: string; code: string | null; }
interface Item { id: number; name: string; code: string | null; }
interface SalesOrderItem {
  id: number;
  itemId: number;
  item: Item;
  plannedQty: number;
  unitPrice: number;
  sellingCostRate: number | null;
  note: string | null;
}
interface SalesOrder {
  id: number;
  orderNo: string;
  customerId: number;
  customer: Customer;
  factoryId: number;
  factory: Factory;
  signedDate: string | null;
  deliveryDate: string;
  startDate: string | null;
  status: string;
  note: string | null;
  isActive: boolean;
  items: SalesOrderItem[];
}

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  ACTIVE:    { color: "green",   label: "Đang SX" },
  DONE:      { color: "blue",    label: "Hoàn thành" },
  OVERDUE:   { color: "red",     label: "Quá hạn" },
  CANCELLED: { color: "default", label: "Đã huỷ" },
};

export default function SalesOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SalesOrder | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [filterFactory, setFilterFactory] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, factoriesRes, customersRes, itemsRes] = await Promise.all([
        fetch(`/api/kdsx/sales-orders${filterFactory ? `?factoryId=${filterFactory}` : ""}`),
        fetch("/api/factories"),
        fetch("/api/kdsx/customers"),
        fetch("/api/items"),
      ]);
      if (ordersRes.ok) setOrders(await ordersRes.json());
      if (factoriesRes.ok) setFactories(await factoriesRes.json());
      if (customersRes.ok) setCustomers(await customersRes.json());
      if (itemsRes.ok) setItems(await itemsRes.json());
    } finally {
      setLoading(false);
    }
  }, [filterFactory]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldValue("items", [{}]);
    setModalOpen(true);
  }

  function openEdit(o: SalesOrder) {
    setEditing(o);
    form.setFieldsValue({
      orderNo: o.orderNo,
      customerId: o.customerId,
      factoryId: o.factoryId,
      signedDate: o.signedDate ? dayjs(o.signedDate) : null,
      deliveryDate: o.deliveryDate ? dayjs(o.deliveryDate) : null,
      startDate: o.startDate ? dayjs(o.startDate) : null,
      note: o.note,
      isActive: o.isActive,
      items: o.items.map((it) => ({
        itemId: it.itemId,
        plannedQty: it.plannedQty,
        unitPrice: it.unitPrice,
        sellingCostRate: it.sellingCostRate != null ? it.sellingCostRate * 100 : null,
        note: it.note,
      })),
    });
    setModalOpen(true);
  }

  async function handleSave() {
    // Tách validateFields ra riêng để bắt lỗi validation đúng cách
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      // Ant Design tự hiển thị lỗi inline trên từng field — không cần làm gì thêm
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...values,
        signedDate: values.signedDate ? values.signedDate.format("YYYY-MM-DD") : null,
        deliveryDate: values.deliveryDate ? values.deliveryDate.format("YYYY-MM-DD") : null,
        startDate: values.startDate ? values.startDate.format("YYYY-MM-DD") : null,
        items: values.items?.map((item: any) => ({
          ...item,
          sellingCostRate: item.sellingCostRate != null ? item.sellingCostRate / 100 : null,
        })),
      };
      const url = editing ? `/api/kdsx/sales-orders/${editing.id}` : "/api/kdsx/sales-orders";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        message.error(err.error || "Lỗi lưu dữ liệu");
        return;
      }
      message.success(editing ? "Đã cập nhật" : "Đã tạo hợp đồng");
      setModalOpen(false);
      fetchAll();
    } catch (e: any) {
      message.error("Lỗi không xác định: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/kdsx/sales-orders/${id}`, { method: "DELETE" });
    if (res.ok) {
      message.success("Đã xóa");
      fetchAll();
    } else {
      const err = await res.json();
      message.error(err.error || "Không thể xóa");
    }
  }

  const columns = [
    { title: "Số HĐ", dataIndex: "orderNo", key: "orderNo", render: (v: string) => <strong>{v}</strong> },
    { title: "Khách hàng", key: "customer", render: (_: unknown, r: SalesOrder) => r.customer.name },
    { title: "Nhà máy", key: "factory", render: (_: unknown, r: SalesOrder) => r.factory.name },
    {
      title: "Deadline",
      dataIndex: "deliveryDate",
      key: "deliveryDate",
      render: (v: string) => v ? dayjs(v).format("DD/MM/YYYY") : "-",
    },
    {
      title: "Trạng thái SX",
      dataIndex: "status",
      key: "status",
      render: (v: string) => {
        const cfg = STATUS_TAG[v] ?? { color: "default", label: v };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: "Hiệu lực",
      dataIndex: "isActive",
      key: "isActive",
      render: (v: boolean) => <Tag color={v ? "green" : "red"}>{v ? "Hiệu lực" : "Hết HLực"}</Tag>,
    },
    {
      title: "Thao tác",
      key: "action",
      width: 150,
      render: (_: unknown, row: SalesOrder) => (
        <Space>
          <Tooltip title="Tiến độ">
            <Button
              size="small"
              icon={<LineChartOutlined />}
              onClick={() => router.push(`/kdsx/sales-orders/${row.id}?tab=progress`)}
            />
          </Tooltip>
          <Tooltip title="Xem/Sửa">
            <Button size="small" icon={<EyeOutlined />} onClick={() => openEdit(row)} />
          </Tooltip>
          <Popconfirm
            title="Xóa hợp đồng này?"
            onConfirm={() => handleDelete(row.id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const expandedRowRender = (record: SalesOrder) => {
    const cols = [
      { title: "Loại sợi", key: "item", render: (_: unknown, r: SalesOrderItem) => r.item.name },
      { title: "SL HĐ (kg)", dataIndex: "plannedQty", key: "qty" },
      { title: "Đơn giá (USD/kg)", dataIndex: "unitPrice", key: "price" },
      {
        title: "CP BH (%)",
        key: "sellingCostRate",
        render: (_: unknown, r: SalesOrderItem) =>
          r.sellingCostRate != null ? `${(r.sellingCostRate * 100).toFixed(0)}%` : "-",
      },
      { title: "Ghi chú", dataIndex: "note", key: "note", render: (v: string | null) => v || "-" },
    ];
    return (
      <Table
        dataSource={record.items}
        columns={cols}
        rowKey="id"
        pagination={false}
        size="small"
      />
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
        <Title level={3} style={{ margin: 0 }}>Hợp đồng bán hàng</Title>
        <Space>
          <Select
            placeholder="Lọc nhà máy"
            allowClear
            options={factories.map((f) => ({ label: f.name, value: f.id }))}
            onChange={(v) => setFilterFactory(v ?? null)}
            style={{ width: 130 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Tạo hợp đồng
          </Button>
        </Space>
      </div>

      <Table
        dataSource={orders}
        columns={columns}
        rowKey="id"
        loading={loading}
        bordered
        size="middle"
        expandable={{ expandedRowRender }}
      />

      <Modal
        title={editing ? `Sửa HĐ ${editing.orderNo}` : "Tạo hợp đồng mới"}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        width={800}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Space style={{ width: "100%", display: "flex" }} size="middle">
            <Form.Item name="orderNo" label="Số hợp đồng" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder="VD: 431PB25" />
            </Form.Item>
            <Form.Item name="customerId" label="Khách hàng" rules={[{ required: true }]} style={{ flex: 2 }}>
              <Select
                options={customers.map((c) => ({ label: c.name, value: c.id }))}
                showSearch
                optionFilterProp="label"
                placeholder="Chọn khách hàng"
                popupMatchSelectWidth={false}
              />
            </Form.Item>
          </Space>
          <Space style={{ width: "100%" }} size="middle">
            <Form.Item name="factoryId" label="Nhà máy thực hiện" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={factories.map((f) => ({ label: f.name, value: f.id }))} placeholder="Chọn NM" />
            </Form.Item>
            <Form.Item name="signedDate" label="Ngày ký" style={{ flex: 1 }}>
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
            </Form.Item>
          </Space>
          <Space style={{ width: "100%" }} size="middle">
            <Form.Item name="deliveryDate" label="Deadline giao hàng" style={{ flex: 1 }}>
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="startDate" label="Ngày bắt đầu SX" style={{ flex: 1 }}>
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
            </Form.Item>
          </Space>
          {editing && (
            <Form.Item name="isActive" label="Trạng thái" valuePropName="checked">
              <Switch checkedChildren="Hiệu lực" unCheckedChildren="Hết HLực" />
            </Form.Item>
          )}
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>

            <>
              <Title level={5}>Chi tiết sợi trong HĐ</Title>
              <Form.List name="items">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...restField }) => (
                      <Space key={key} style={{ display: "flex", marginBottom: 8 }} align="baseline">
                        <Form.Item {...restField} name={[name, "itemId"]} rules={[{ required: true, message: "Chọn loại sợi" }]}>
                          <Select
                            options={items.map((i) => ({ label: i.name, value: i.id }))}
                            showSearch
                            optionFilterProp="label"
                            placeholder="Loại sợi"
                            style={{ width: 220 }}
                          />
                        </Form.Item>
                        <Form.Item {...restField} name={[name, "plannedQty"]} rules={[{ required: true }]}>
                          <InputNumber placeholder="SL (kg)" min={0} style={{ width: 120 }} />
                        </Form.Item>
                        <Form.Item {...restField} name={[name, "unitPrice"]} rules={[{ required: true }]}>
                          <InputNumber placeholder="Giá (USD/kg)" min={0} step={0.01} style={{ width: 130 }} />
                        </Form.Item>
                        <Form.Item
                          {...restField}
                          name={[name, "sellingCostRate"]}
                          rules={[{ required: true, message: "Nhập %" }]}
                        >
                          <InputNumber
                            placeholder="CP BH (%)"
                            min={0}
                            max={100}
                            step={1}
                            style={{ width: 110 }}
                          />
                        </Form.Item>
                        <Form.Item {...restField} name={[name, "note"]}>
                          <Input placeholder="Ghi chú" style={{ width: 150 }} />
                        </Form.Item>
                        <Button danger onClick={() => remove(name)}>Xóa</Button>
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                      Thêm loại sợi
                    </Button>
                  </>
                )}
              </Form.List>
            </>
        </Form>
      </Modal>
    </div>
  );
}
