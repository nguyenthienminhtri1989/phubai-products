"use client";

import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, message, Space, Card, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined } from '@ant-design/icons';

interface Item {
    id: number;
    name: string;
}

export default function ItemPage() {
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Item | null>(null);

    const [form] = Form.useForm();
    // State dùng để tìm kiếm nhanh trên bảng (Client-side search)
    const [searchText, setSearchText] = useState('');

    // --- FETCH DATA ---
    const fetchItems = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/items');
            const data = await res.json();
            setItems(data);
        } catch (error) {
            message.error("Lỗi tải dữ liệu");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchItems(); }, []);

    // --- SAVE (ADD/EDIT) ---
    const handleSave = async (values: any) => {
        try {
            let res;
            if (editingItem) {
                res = await fetch(`/api/items/${editingItem.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(values),
                });
            } else {
                res = await fetch("/api/items", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(values),
                });
            }

            if (!res.ok) throw new Error("Lỗi từ server");

            message.success(editingItem ? "Cập nhật thành công" : "Thêm mới thành công");
            setIsModalOpen(false);
            form.resetFields();
            setEditingItem(null);
            fetchItems();
        } catch (error) {
            message.error("Có lỗi xảy ra");
        }
    };

    // --- DELETE ---
    const handleDelete = async (id: number) => {
        try {
            const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Không thể xóa");
            message.success("Đã xóa");
            fetchItems();
        } catch (error) {
            message.error("Lỗi: Mặt hàng đang được sử dụng, không thể xóa!");
        }
    };

    // --- FILTER CLIENT SIDE (Tìm kiếm trong bảng) ---
    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchText.toLowerCase())
    );

    const columns = [
        { title: 'ID', dataIndex: 'id', width: 80 },
        {
            title: 'Tên Mặt Hàng',
            dataIndex: 'name',
            render: (t: string) => <b style={{ fontSize: 15 }}>{t}</b>
        },
        {
            title: 'Hành động',
            width: 120,
            render: (_: any, record: Item) => (
                <Space>
                    <Button
                        icon={<EditOutlined />}
                        size="small"
                        onClick={() => {
                            setEditingItem(record);
                            form.setFieldsValue(record);
                            setIsModalOpen(true);
                        }}
                    />
                    <Popconfirm
                        title="Xóa mặt hàng?"
                        description="Hành động này không thể hoàn tác"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Xóa" cancelText="Hủy"
                    >
                        <Button icon={<DeleteOutlined />} danger size="small" />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <div style={{ padding: 20 }}>
            <Card
                title="Quản lý Danh mục Mặt Hàng"
                extra={
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                            setEditingItem(null);
                            form.resetFields();
                            setIsModalOpen(true);
                        }}
                    >
                        Thêm Mặt Hàng
                    </Button>
                }
            >
                <Input
                    prefix={<FileTextOutlined />}
                    placeholder="Tìm kiếm tên mặt hàng..."
                    style={{ width: 300, marginBottom: 16 }}
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                />

                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={filteredItems}
                    loading={loading}
                    bordered
                    pagination={{ pageSize: 10 }}
                />
            </Card>

            <Modal
                title={editingItem ? "Sửa tên mặt hàng" : "Thêm mặt hàng mới"}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item
                        name="name"
                        label="Tên mặt hàng"
                        rules={[{ required: true, message: 'Vui lòng nhập tên!' }]}
                    >
                        <Input placeholder="Ví dụ: 20/1 CVCm (60/40) W..." />
                    </Form.Item>

                    <div style={{ textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setIsModalOpen(false)}>Hủy</Button>
                            <Button type="primary" htmlType="submit">
                                {editingItem ? 'Cập Nhật' : 'Lưu Lại'}
                            </Button>
                        </Space>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}