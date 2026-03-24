"use client";

import React, { useEffect, useState } from "react";
import {
    Table, Button, Modal, Form, Input,
    message, Card, Space, Popconfirm, Tag,
} from "antd";
import {
    PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, GroupOutlined,
} from "@ant-design/icons";
import { useSession } from "next-auth/react";

interface MeterGroupData {
    id: number;
    groupCode: string;
    groupName: string;
    note?: string;
    createdAt: string;
}

export default function MeterGroupCategoryPage() {
    const { data: session } = useSession();
    const [items, setItems] = useState<MeterGroupData[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<MeterGroupData | null>(null);
    const [form] = Form.useForm();

    const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

    const fetchItems = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/meter-group-categories");
            if (res.ok) setItems(await res.json());
            else message.error("Không tải được danh sách nhóm đồng hồ");
        } catch {
            message.error("Lỗi kết nối");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchItems(); }, []);

    const handleSave = async (values: { groupCode: string; groupName: string; note?: string }) => {
        try {
            const isEditing = !!editingItem;
            const url = isEditing
                ? `/api/meter-group-categories/${editingItem!.id}`
                : "/api/meter-group-categories";
            const method = isEditing ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
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

    const handleDelete = async (id: number) => {
        try {
            const res = await fetch(`/api/meter-group-categories/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            message.success("Đã xóa nhóm đồng hồ");
            fetchItems();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Lỗi xóa nhóm đồng hồ");
        }
    };

    const openModal = (item?: MeterGroupData) => {
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
            title: "ID",
            dataIndex: "id",
            key: "id",
            width: 70,
            render: (id: number) => <span style={{ color: "#999", fontSize: 12 }}>#{id}</span>,
        },
        {
            title: "Mã nhóm",
            dataIndex: "groupCode",
            key: "groupCode",
            width: 140,
            render: (code: string) => <Tag color="purple" style={{ fontWeight: 600, fontSize: 13 }}>{code}</Tag>,
        },
        {
            title: "Tên nhóm đồng hồ",
            dataIndex: "groupName",
            key: "groupName",
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
                render: (_: unknown, record: MeterGroupData) => (
                    <Space>
                        <Button icon={<EditOutlined />} size="small" onClick={() => openModal(record)} />
                        <Popconfirm
                            title="Xóa nhóm đồng hồ này?"
                            description="Hành động này không thể hoàn tác."
                            onConfirm={() => handleDelete(record.id)}
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
                        <GroupOutlined />
                        Danh mục Nhóm đồng hồ điện
                    </Space>
                }
                extra={
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={fetchItems}>Tải lại</Button>
                        {isAdmin && (
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
                                Thêm nhóm mới
                            </Button>
                        )}
                    </Space>
                }
            >
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={items}
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    bordered
                    locale={{ emptyText: "Chưa có nhóm đồng hồ nào được tạo" }}
                />
            </Card>

            <Modal
                title={editingItem ? "Cập nhật Nhóm đồng hồ" : "Thêm Nhóm đồng hồ mới"}
                open={isModalOpen}
                onCancel={() => { setIsModalOpen(false); setEditingItem(null); form.resetFields(); }}
                footer={null}
                width={480}
            >
                <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
                    <Form.Item
                        name="groupCode"
                        label="Mã nhóm"
                        rules={[{ required: true, message: "Vui lòng nhập mã nhóm" }]}
                        extra="Ví dụ: MG01, HT-NM1, TT-NM2..."
                    >
                        <Input
                            placeholder="MG01"
                            style={{ textTransform: "uppercase" }}
                            maxLength={20}
                        />
                    </Form.Item>

                    <Form.Item
                        name="groupName"
                        label="Tên nhóm đồng hồ"
                        rules={[{ required: true, message: "Vui lòng nhập tên nhóm" }]}
                    >
                        <Input placeholder="Ví dụ: Hạ thế Nhà máy 1, Trung thế tổng..." maxLength={100} />
                    </Form.Item>

                    <Form.Item name="note" label="Ghi chú (tùy chọn)">
                        <Input.TextArea
                            placeholder="Ví dụ: Bao gồm các công tơ khu vực..."
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
