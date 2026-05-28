"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Popconfirm,
  message,
  Tooltip,
  Typography,
  Badge,
  Divider,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  AppstoreOutlined,
  LinkOutlined,
  KeyOutlined,
  OrderedListOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { useSession } from "next-auth/react";

const { Title, Text } = Typography;

// --- Types ---
interface PageItem {
  id: number;
  pageKey: string;
  pageName: string;
  pageGroup: string;
  path: string;
  sortOrder: number;
}

// --- Constants ---
const PAGE_GROUPS = [
  "SẢN XUẤT",
  "ĐỊNH MỨC",
  "ĐIỆN NĂNG",
  "KINH DOANH",
  "BÁO CÁO",
  "DANH MỤC",
  "HỆ THỐNG",
  "TỔNG QUAN",
  "MOBILE",
];

const GROUP_COLORS: Record<string, string> = {
  "SẢN XUẤT": "#1677ff",
  "ĐỊNH MỨC": "#722ed1",
  "ĐIỆN NĂNG": "#faad14",
  "KINH DOANH": "#52c41a",
  "BÁO CÁO": "#13c2c2",
  "DANH MỤC": "#8c8c8c",
  "HỆ THỐNG": "#f5222d",
  "TỔNG QUAN": "#2f54eb",
  "MOBILE": "#eb2f96",
};

// Helper: tự sinh pageKey từ path
function pathToPageKey(path: string): string {
  return path
    .replace(/^\//, "")
    .replace(/\//g, ".")
    .replace(/[^a-z0-9._-]/gi, "-")
    .toLowerCase();
}

export default function PageRegistryPage() {
  const { data: session } = useSession();
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<PageItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [form] = Form.useForm();

  const isAdmin = (session?.user as any)?.userRole === "ADMIN";

  // Fetch
  const fetchPages = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/page-registry");
      if (res.ok) {
        setPages(await res.json());
      } else {
        message.error("Không tải được danh sách trang");
      }
    } catch {
      message.error("Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchPages();
  }, [isAdmin]);

  // Open modal — create or edit
  const openCreate = () => {
    setEditingPage(null);
    form.resetFields();
    form.setFieldsValue({ sortOrder: 50 });
    setModalOpen(true);
  };

  const openEdit = (record: PageItem) => {
    setEditingPage(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  // Auto-fill pageKey when path changes (only when creating)
  const handlePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editingPage) {
      form.setFieldValue("pageKey", pathToPageKey(e.target.value));
    }
  };

  // Save (create or update)
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const method = editingPage ? "PUT" : "POST";
      const body = editingPage ? { id: editingPage.id, ...values } : values;

      const res = await fetch("/api/page-registry", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok) {
        message.success(
          editingPage ? "Cập nhật trang thành công!" : "Thêm trang thành công!",
        );
        setModalOpen(false);
        fetchPages();
      } else {
        message.error(data.error || "Lỗi lưu dữ liệu");
      }
    } catch (err: any) {
      if (err?.errorFields) {
        // Validation error — antd handles display
      } else {
        message.error("Lỗi không xác định");
      }
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/page-registry?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        message.success("Đã xoá trang");
        setPages((prev) => prev.filter((p) => p.id !== id));
      } else {
        message.error(data.error || "Lỗi xoá trang");
      }
    } catch {
      message.error("Lỗi kết nối");
    }
  };

  // Filter
  const displayedPages = useMemo(() => {
    if (!filterGroup) return pages;
    return pages.filter((p) => p.pageGroup === filterGroup);
  }, [pages, filterGroup]);

  // Group counts
  const groupCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of pages) {
      map[p.pageGroup] = (map[p.pageGroup] || 0) + 1;
    }
    return map;
  }, [pages]);

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <ExclamationCircleOutlined
          style={{ fontSize: 48, color: "#f5222d", marginBottom: 16 }}
        />
        <br />
        <Text type="danger">Không có quyền truy cập trang này</Text>
      </div>
    );
  }

  const columns = [
    {
      title: "#",
      dataIndex: "sortOrder",
      key: "sortOrder",
      width: 60,
      align: "center" as const,
      sorter: (a: PageItem, b: PageItem) => a.sortOrder - b.sortOrder,
      render: (v: number) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {v}
        </Text>
      ),
    },
    {
      title: "Tên trang",
      dataIndex: "pageName",
      key: "pageName",
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: "Nhóm",
      dataIndex: "pageGroup",
      key: "pageGroup",
      width: 140,
      render: (group: string) => (
        <Tag
          color={GROUP_COLORS[group] || "default"}
          style={{ fontWeight: 600 }}
        >
          {group}
        </Tag>
      ),
    },
    {
      title: "Đường dẫn",
      dataIndex: "path",
      key: "path",
      render: (path: string) => (
        <Space size={4}>
          <LinkOutlined style={{ color: "#aaa" }} />
          <Text code style={{ fontSize: 12 }}>
            {path}
          </Text>
        </Space>
      ),
    },
    {
      title: "Page Key",
      dataIndex: "pageKey",
      key: "pageKey",
      render: (key: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {key}
        </Text>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 120,
      align: "center" as const,
      render: (_: unknown, record: PageItem) => (
        <Space size={8}>
          <Tooltip title="Sửa trang">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Xoá trang này?"
            description={
              <Text type="warning">
                Lưu ý: Xoá trang sẽ xoá toàn bộ phân quyền liên quan đến trang
                này.
              </Text>
            }
            okText="Xoá"
            cancelText="Huỷ"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record.id)}
          >
            <Tooltip title="Xoá trang">
              <Button size="small" icon={<DeleteOutlined />} danger />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 20 }}>
      <Card
        title={
          <Space>
            <AppstoreOutlined />
            <span>Quản lý Danh sách Trang (Page Registry)</span>
            <Badge count={pages.length} color="#1677ff" />
          </Space>
        }
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchPages}
              loading={loading}
            >
              Làm mới
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Thêm trang mới
            </Button>
          </Space>
        }
      >
        {/* Description */}
        <div
          style={{
            background: "#f6f8fa",
            border: "1px solid #e8ecf0",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 20,
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <AppstoreOutlined style={{ color: "#1677ff", marginTop: 2 }} />
          <div>
            <Text strong style={{ display: "block", marginBottom: 4 }}>
              Về Page Registry
            </Text>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Đây là danh sách các trang được đăng ký vào hệ thống phân quyền.
              Mỗi khi bạn tạo một trang mới, hãy thêm nó vào đây để Admin có thể
              cấp quyền truy cập cho từng người dùng tại trang{" "}
              <strong>Phân quyền</strong>.
            </Text>
          </div>
        </div>

        {/* Group filter */}
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Tag
            style={{ cursor: "pointer", padding: "4px 12px", fontSize: 13 }}
            color={!filterGroup ? "blue" : "default"}
            onClick={() => setFilterGroup(null)}
          >
            Tất cả ({pages.length})
          </Tag>
          {Object.entries(groupCounts).map(([group, count]) => (
            <Tag
              key={group}
              style={{ cursor: "pointer", padding: "4px 12px", fontSize: 13 }}
              color={
                filterGroup === group
                  ? GROUP_COLORS[group] || "blue"
                  : "default"
              }
              onClick={() =>
                setFilterGroup(filterGroup === group ? null : group)
              }
            >
              {group} ({count})
            </Tag>
          ))}
        </div>

        <Table
          dataSource={displayedPages}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          size="middle"
          bordered
        />
      </Card>

      {/* Add / Edit Modal */}
      <Modal
        title={
          <Space>
            {editingPage ? <EditOutlined /> : <PlusOutlined />}
            <span>{editingPage ? "Cập nhật trang" : "Thêm trang mới"}</span>
          </Space>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText={editingPage ? "Cập nhật" : "Thêm trang"}
        cancelText="Huỷ"
        width={580}
        destroyOnClose
      >
        <Divider style={{ margin: "12px 0" }} />

        <Form form={form} layout="vertical" requiredMark="optional">
          {/* Path */}
          <Form.Item
            name="path"
            label={
              <Space size={4}>
                <LinkOutlined />
                <span>Đường dẫn trang (path)</span>
              </Space>
            }
            rules={[
              { required: true, message: "Nhập đường dẫn trang" },
              {
                pattern: /^\/.+/,
                message: "Đường dẫn phải bắt đầu bằng /",
              },
            ]}
            extra="Ví dụ: /kdsx/production-schedule"
          >
            <Input
              placeholder="/ten-module/ten-trang"
              prefix={<LinkOutlined style={{ color: "#aaa" }} />}
              onChange={handlePathChange}
            />
          </Form.Item>

          {/* Page Name */}
          <Form.Item
            name="pageName"
            label="Tên hiển thị"
            rules={[{ required: true, message: "Nhập tên hiển thị" }]}
            extra="Tên thân thiện, hiển thị trong bảng phân quyền"
          >
            <Input placeholder="VD: Kế hoạch SX tháng" />
          </Form.Item>

          {/* Page Group */}
          <Form.Item
            name="pageGroup"
            label={
              <Space size={4}>
                <AppstoreOutlined />
                <span>Nhóm trang</span>
              </Space>
            }
            rules={[{ required: true, message: "Chọn nhóm trang" }]}
          >
            <Select
              placeholder="Chọn nhóm..."
              options={PAGE_GROUPS.map((g) => ({ value: g, label: g }))}
            />
          </Form.Item>

          {/* Page Key */}
          <Form.Item
            name="pageKey"
            label={
              <Space size={4}>
                <KeyOutlined />
                <span>Page Key</span>
              </Space>
            }
            rules={[
              { required: true, message: "Nhập page key" },
              {
                pattern: /^[a-z0-9._-]+$/,
                message: "Chỉ dùng chữ thường, số, dấu chấm, gạch ngang",
              },
            ]}
            extra="Khoá duy nhất. Được tự động sinh từ đường dẫn, nhưng bạn có thể chỉnh."
          >
            <Input
              placeholder="kdsx.production-schedule"
              prefix={<KeyOutlined style={{ color: "#aaa" }} />}
            />
          </Form.Item>

          {/* Sort Order */}
          <Form.Item
            name="sortOrder"
            label={
              <Space size={4}>
                <OrderedListOutlined />
                <span>Thứ tự hiển thị</span>
              </Space>
            }
            extra="Số nhỏ hơn hiển thị trước trong cùng một nhóm"
          >
            <InputNumber
              min={0}
              max={9999}
              style={{ width: "100%" }}
              placeholder="50"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
