"use client";

import React, { useEffect, useState } from "react";
import {
    Table, Button, Modal, Form, Input,
    message, Card, Space, Popconfirm, Tag,
} from "antd";
import {
    PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, ClockCircleOutlined,
} from "@ant-design/icons";
import { useSession } from "next-auth/react";

interface ShiftData {
    code: string;
    name: string;
    note?: string;
    createdAt: string;
}

export default function ShiftCategoryPage() {
    const { data: session } = useSession();
    const [shifts, setShifts] = useState<ShiftData[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingShift, setEditingShift] = useState<ShiftData | null>(null);
    const [form] = Form.useForm();

    const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

    // --- 1. Tải dữ liệu ---
    const fetchShifts = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/shift-categories");
            if (res.ok) setShifts(await res.json());
            else message.error("Không tải được danh sách ca làm việc");
        } catch {
            message.error("Lỗi kết nối");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchShifts(); }, []);

    // --- 2. Lưu (Thêm / Sửa) ---
    const handleSave = async (values: { code: string; name: string; note?: string }) => {
        try {
            const isEditing = !!editingShift;
            const url = isEditing
                ? `/api/shift-categories/${editingShift!.code}`
                : "/api/shift-categories";
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
            setEditingShift(null);
            form.resetFields();
            fetchShifts();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Lỗi lưu dữ liệu");
        }
    };

    // --- 3. Xóa ---
    const handleDelete = async (code: string) => {
        try {
            const res = await fetch(`/api/shift-categories/${code}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            message.success("Đã xóa ca làm việc");
            fetchShifts();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Lỗi xóa ca làm việc");
        }
    };

    // --- 4. Mở Modal ---
    const openModal = (shift?: ShiftData) => {
        if (shift) {
            setEditingShift(shift);
            form.setFieldsValue(shift);
        } else {
            setEditingShift(null);
            form.resetFields();
        }
        setIsModalOpen(true);
    };

    // --- 5. Cột bảng ---
    const columns = [
        {
            title: "Mã ca",
            dataIndex: "code",
            key: "code",
            width: 120,
            render: (code: string) => <Tag color="blue" style={{ fontWeight: 600, fontSize: 13 }}>{code}</Tag>,
        },
        {
            title: "Tên ca làm việc",
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
                render: (_: unknown, record: ShiftData) => (
                    <Space>
                        <Button
                            icon={<EditOutlined />}
                            size="small"
                            onClick={() => openModal(record)}
                        />
                        <Popconfirm
                            title="Xóa ca làm việc này?"
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
                        <ClockCircleOutlined />
                        Danh mục Ca làm việc
                    </Space>
                }
                extra={
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={fetchShifts}>
                            Tải lại
                        </Button>
                        {isAdmin && (
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => openModal()}
                            >
                                Thêm ca mới
                            </Button>
                        )}
                    </Space>
                }
            >
                <Table
                    rowKey="code"
                    columns={columns}
                    dataSource={shifts}
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    bordered
                    locale={{ emptyText: "Chưa có ca làm việc nào được tạo" }}
                />
            </Card>

            {/* MODAL THÊM / SỬA */}
            <Modal
                title={editingShift ? "Cập nhật Ca làm việc" : "Thêm Ca làm việc mới"}
                open={isModalOpen}
                onCancel={() => { setIsModalOpen(false); setEditingShift(null); form.resetFields(); }}
                footer={null}
                width={480}
            >
                <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
                    <Form.Item
                        name="code"
                        label="Mã ca"
                        rules={[{ required: true, message: "Vui lòng nhập mã ca" }]}
                        extra={editingShift ? "Mã ca không thể thay đổi sau khi tạo" : "Ví dụ: CA1, CA2, SANG, CHIEU..."}
                    >
                        <Input
                            placeholder="CA1"
                            disabled={!!editingShift}
                            style={{ textTransform: "uppercase" }}
                            maxLength={20}
                        />
                    </Form.Item>

                    <Form.Item
                        name="name"
                        label="Tên ca làm việc"
                        rules={[{ required: true, message: "Vui lòng nhập tên ca" }]}
                    >
                        <Input placeholder="Ví dụ: Ca sáng, Ca chiều, Ca đêm" maxLength={100} />
                    </Form.Item>

                    <Form.Item name="note" label="Ghi chú (tùy chọn)">
                        <Input.TextArea
                            placeholder="Ví dụ: 06:00 - 14:00"
                            rows={3}
                            maxLength={200}
                        />
                    </Form.Item>

                    <div style={{ textAlign: "right", marginTop: 8 }}>
                        <Space>
                            <Button onClick={() => { setIsModalOpen(false); setEditingShift(null); form.resetFields(); }}>
                                Hủy bỏ
                            </Button>
                            <Button type="primary" htmlType="submit">
                                {editingShift ? "Cập nhật" : "Thêm mới"}
                            </Button>
                        </Space>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}
