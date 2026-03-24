"use client";

import React, { useEffect, useState } from "react";
import {
    Table, Button, Modal, Form, Input,
    message, Card, Space, Popconfirm, Tag,
} from "antd";
import {
    PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import { useSession } from "next-auth/react";

interface EnergyTypeData {
    code: string;
    name: string;
    note?: string;
    createdAt: string;
}

export default function EnergyTypeCategoryPage() {
    const { data: session } = useSession();
    const [items, setItems] = useState<EnergyTypeData[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<EnergyTypeData | null>(null);
    const [form] = Form.useForm();

    const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

    const fetchItems = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/energy-type-categories");
            if (res.ok) setItems(await res.json());
            else message.error("Không tải được danh sách loại điện năng");
        } catch {
            message.error("Lỗi kết nối");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchItems(); }, []);

    const handleSave = async (values: { code: string; name: string; note?: string }) => {
        try {
            const isEditing = !!editingItem;
            const url = isEditing
                ? `/api/energy-type-categories/${editingItem!.code}`
                : "/api/energy-type-categories";
            const method = isEditing ? "PUT" : "POST";

            // Khi sửa: gửi cả code mới (API sẽ xử lý thay đổi code nếu cần)
            const payload = isEditing
                ? { code: values.code, name: values.name, note: values.note }
                : values;

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Lỗi lưu dữ liệu");

            message.success(isEditing ? "Cập nhật thành công!" : "Thêm mới thành công!");
            setIsModalOpen(false);
            setEditingItem(null);
            form.resetFields();
            fetchItems();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Lỗi lưu dữ liệu");
        }
    };

    const handleDelete = async (code: string) => {
        try {
            const res = await fetch(`/api/energy-type-categories/${code}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            message.success("Đã xóa loại điện năng");
            fetchItems();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Lỗi xóa loại điện năng");
        }
    };

    const openModal = (item?: EnergyTypeData) => {
        if (item) {
            setEditingItem(item);
            form.setFieldsValue(item);
        } else {
            setEditingItem(null);
            form.resetFields();
        }
        setIsModalOpen(true);
    };

    const columns = [
        {
            title: "Mã loại điện",
            dataIndex: "code",
            key: "code",
            width: 140,
            render: (code: string) => <Tag color="orange" style={{ fontWeight: 600, fontSize: 13 }}>{code}</Tag>,
        },
        {
            title: "Tên loại điện năng",
            dataIndex: "name",
            key: "name",
            render: (name: string) => <span style={{ fontWeight: 500 }}>{name}</span>,
        },
        {
            title: "Ghi chú",
            dataIndex: "note",
            key: "note",
            render: (note?: string) => note || <span style={{ color: "#bbb" }}>—</span>,
        },
        ...(isAdmin
            ? [{
                title: "Hành động",
                key: "action",
                align: "right" as const,
                width: 120,
                render: (_: unknown, record: EnergyTypeData) => (
                    <Space>
                        <Button icon={<EditOutlined />} size="small" onClick={() => openModal(record)} />
                        <Popconfirm
                            title="Xóa loại điện năng này?"
                            description="Hành động này không thể hoàn tác."
                            onConfirm={() => handleDelete(record.code)}
                            okText="Xóa"
                            cancelText="Hủy"
                        >
                            <Button icon={<DeleteOutlined />} size="small" danger />
                        </Popconfirm>
                    </Space>
                ),
            }]
            : []),
    ];

    if (!session) return <div className="p-10 text-center">Vui lòng đăng nhập...</div>;

    return (
        <div className="p-6">
            <Card
                title={
                    <Space>
                        <ThunderboltOutlined />
                        Danh mục Loại điện năng
                    </Space>
                }
                extra={
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={fetchItems}>Tải lại</Button>
                        {isAdmin && (
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
                                Thêm loại mới
                            </Button>
                        )}
                    </Space>
                }
            >
                <Table
                    rowKey="code"
                    columns={columns}
                    dataSource={items}
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    bordered
                    locale={{ emptyText: "Chưa có loại điện năng nào được tạo" }}
                />
            </Card>

            <Modal
                title={editingItem ? "Cập nhật Loại điện năng" : "Thêm Loại điện năng mới"}
                open={isModalOpen}
                onCancel={() => { setIsModalOpen(false); setEditingItem(null); form.resetFields(); }}
                footer={null}
                width={480}
            >
                <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
                    <Form.Item
                        name="code"
                        label="Mã loại điện"
                        rules={[{ required: true, message: "Vui lòng nhập mã loại điện" }]}
                        extra="Ví dụ: BT, CD, TD..."
                    >
                        <Input
                            placeholder="BT"
                            style={{ textTransform: "uppercase" }}
                            maxLength={20}
                        />
                    </Form.Item>

                    <Form.Item
                        name="name"
                        label="Tên loại điện năng"
                        rules={[{ required: true, message: "Vui lòng nhập tên loại điện năng" }]}
                    >
                        <Input placeholder="Ví dụ: Bình thường, Cao điểm, Thấp điểm" maxLength={100} />
                    </Form.Item>

                    <Form.Item name="note" label="Ghi chú (tùy chọn)">
                        <Input.TextArea
                            placeholder="Ví dụ: Khung giờ áp dụng..."
                            rows={3}
                            maxLength={200}
                        />
                    </Form.Item>

                    <div style={{ textAlign: "right", marginTop: 8 }}>
                        <Space>
                            <Button onClick={() => { setIsModalOpen(false); setEditingItem(null); form.resetFields(); }}>
                                Hủy bỏ
                            </Button>
                            <Button type="primary" htmlType="submit">
                                {editingItem ? "Cập nhật" : "Thêm mới"}
                            </Button>
                        </Space>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}
