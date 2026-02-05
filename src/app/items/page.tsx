"use client";

import React, { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, message, Card, Space, Popconfirm, Tag } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useSession } from "next-auth/react";

interface ItemData {
    id: number;
    name: string;
    code?: string;
    ne?: number;
    composition?: string;
    twist?: number;
    weavingStyle?: string;
    material?: string;
    _count?: { productionLogs: number };
}

export default function ItemsManagementPage() {
    const { data: session } = useSession();
    const [items, setItems] = useState<ItemData[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ItemData | null>(null);
    const [searchText, setSearchText] = useState("");

    const [form] = Form.useForm();

    // --- 1. Load dữ liệu ---
    const fetchItems = async () => {
        setLoading(true);
        try {
            const query = searchText ? `?search=${encodeURIComponent(searchText)}` : "";
            const res = await fetch(`/api/items${query}`);
            if (res.ok) {
                setItems(await res.json());
            } else {
                message.error("Không tải được danh sách");
            }
        } catch (e) {
            message.error("Lỗi kết nối");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    // --- 2. Xử lý Lưu (Thêm/Sửa) ---
    // --- 2. Xử lý Lưu (Thêm/Sửa) ---
    const handleSave = async (values: any) => {
        try {
            // Nếu có editingItem -> PUT vào /api/items/[id]
            // Nếu không -> POST vào /api/items

            const url = editingItem
                ? `/api/items/${editingItem.id}`
                : "/api/items";

            const method = editingItem ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Lỗi lưu dữ liệu");

            message.success(editingItem ? "Cập nhật thành công!" : "Tạo mới thành công!");
            setIsModalOpen(false);
            setEditingItem(null);
            form.resetFields();
            fetchItems();
        } catch (error: any) {
            message.error(error.message);
        }
    };

    // --- 3. Xử lý Xóa ---
    const handleDelete = async (id: number) => {
        try {
            // Gọi đúng chuẩn RESTful: DELETE /api/items/[id]
            const res = await fetch(`/api/items/${id}`, { method: "DELETE" });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            message.success("Đã xóa mặt hàng");
            fetchItems();
        } catch (error: any) {
            message.error(error.message);
        }
    };

    // --- 4. Mở Modal ---
    const openModal = (item?: ItemData) => {
        if (item) {
            setEditingItem(item);
            form.setFieldsValue(item);
        } else {
            setEditingItem(null);
            form.resetFields();
        }
        setIsModalOpen(true);
    };

    // --- 5. Cột bảng ---
    const columns = [
        {
            title: "Tên mặt hàng",
            dataIndex: "name",
            key: "name",
            render: (text: string, r: ItemData) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{text}</div>
                    {r.code && <Tag color="blue">{r.code}</Tag>}
                </div>
            )
        },
        {
            title: "Chi số (NE)",
            dataIndex: "ne",
            key: "ne",
            align: 'center' as const,
            render: (ne: number) => ne ? <Tag color="geekblue">{ne}</Tag> : "-"
        },
        {
            title: "Thành phần",
            dataIndex: "composition",
            key: "composition",
        },
        {
            title: "Thông số khác",
            key: "specs",
            render: (_: any, r: ItemData) => (
                <Space direction="vertical" size={0} style={{ fontSize: 12, color: '#666' }}>
                    {r.material && <div>NL: {r.material}</div>}
                    {r.twist && <div>Độ săn: {r.twist}</div>}
                    {r.weavingStyle && <div>Kiểu: {r.weavingStyle}</div>}
                </Space>
            )
        },
        {
            title: "Trạng thái",
            key: "status",
            render: (_: any, r: ItemData) => {
                const count = r._count?.productionLogs || 0;
                return count > 0
                    ? <Tag color="green">Đang sản xuất ({count})</Tag>
                    : <Tag>Chưa dùng</Tag>
            }
        },
        {
            title: "Hành động",
            key: "action",
            align: 'right' as const,
            render: (_: any, r: ItemData) => (
                <Space>
                    <Button icon={<EditOutlined />} size="small" onClick={() => openModal(r)} />

                    <Popconfirm
                        title="Xóa mặt hàng này?"
                        description="Hành động này không thể hoàn tác."
                        onConfirm={() => handleDelete(r.id)}
                        okText="Xóa"
                        cancelText="Hủy"
                        disabled={(r._count?.productionLogs || 0) > 0} // Khóa nút xóa nếu đang dùng
                    >
                        <Button
                            icon={<DeleteOutlined />}
                            size="small"
                            danger
                            disabled={(r._count?.productionLogs || 0) > 0}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    if (!session) return <div className="p-10 text-center">Vui lòng đăng nhập...</div>;

    return (
        <div className="p-6">
            <Card
                title="Danh mục Mặt hàng Sợi"
                extra={
                    <Space>
                        <Input
                            placeholder="Tìm tên hoặc mã..."
                            prefix={<SearchOutlined />}
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            onPressEnter={fetchItems}
                            style={{ width: 200 }}
                        />
                        <Button icon={<ReloadOutlined />} onClick={fetchItems}>Tải lại</Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>Thêm mới</Button>
                    </Space>
                }
            >
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={items}
                    loading={loading}
                    pagination={{ pageSize: 8 }}
                    bordered
                />
            </Card>

            {/* MODAL THÊM / SỬA */}
            <Modal
                title={editingItem ? "Cập nhật Mặt hàng" : "Thêm Mặt hàng mới"}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
                width={600}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                        <Form.Item
                            name="name"
                            label="Tên đầy đủ mặt hàng"
                            rules={[{ required: true, message: "Vui lòng nhập tên" }]}
                        >
                            <Input placeholder="Ví dụ: CVC 30 Combed" />
                        </Form.Item>

                        <Form.Item name="code" label="Mã viết tắt">
                            <Input placeholder="CVC30" />
                        </Form.Item>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                        <Form.Item name="ne" label="Chi số (NE)">
                            <InputNumber style={{ width: '100%' }} placeholder="30" min={1} />
                        </Form.Item>

                        <Form.Item name="twist" label="Độ săn (Twist)">
                            <InputNumber style={{ width: '100%' }} placeholder="850" />
                        </Form.Item>

                        <Form.Item name="weavingStyle" label="Kiểu dệt">
                            <Input placeholder="Dệt thoi / Kim" />
                        </Form.Item>
                    </div>

                    <Form.Item name="composition" label="Thành phần">
                        <Input placeholder="Ví dụ: 60% Cotton - 40% Poly" />
                    </Form.Item>

                    <Form.Item name="material" label="Nguyên liệu đầu vào">
                        <Input placeholder="Ví dụ: Bông Mỹ, Xơ Thái..." />
                    </Form.Item>

                    <div style={{ textAlign: "right", marginTop: 16 }}>
                        <Space>
                            <Button onClick={() => setIsModalOpen(false)}>Hủy bỏ</Button>
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