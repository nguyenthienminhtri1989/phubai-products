"use client";

import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, InputNumber, Input, message, Tag, Typography } from 'antd';
import { EditOutlined, DollarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { TableProps } from 'antd';

const { Title } = Typography;

// Định nghĩa Type
interface ElectricityPrice {
    id: number;
    type: string;
    name: string;
    price: number;
    description: string;
    updatedAt: string;
}

export default function ElectricityPricePage() {
    const [data, setData] = useState<ElectricityPrice[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<ElectricityPrice | null>(null);

    const [form] = Form.useForm();

    const fetchPrices = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/energy/prices');
            if (res.ok) {
                setData(await res.json());
            } else {
                message.error("Không thể tải cấu hình giá điện");
            }
        } catch (e) {
            message.error("Lỗi kết nối");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPrices();
    }, []);

    // Xử lý khi bấm nút Cập nhật
    const handleEdit = (record: ElectricityPrice) => {
        setEditingRecord(record);
        form.setFieldsValue({
            price: record.price,
            description: record.description,
        });
        setIsModalOpen(true);
    };

    // Lưu dữ liệu
    const handleSave = async (values: any) => {
        if (!editingRecord) return;
        try {
            const res = await fetch('/api/energy/prices', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingRecord.id,
                    price: values.price,
                    description: values.description,
                }),
            });

            if (res.ok) {
                message.success(`Đã cập nhật giá điện ${editingRecord.name}`);
                setIsModalOpen(false);
                fetchPrices();
            } else {
                message.error("Cập nhật thất bại");
            }
        } catch (e) {
            message.error("Lỗi hệ thống");
        }
    };

    // Cấu hình cột hiển thị
    const columns: TableProps<ElectricityPrice>['columns'] = [
        {
            title: 'Loại điện / Khung giờ',
            dataIndex: 'name',
            key: 'name',
            render: (text, record) => {
                let color = 'blue';
                if (record.type === 'PEAK') color = 'red';
                if (record.type === 'OFF_PEAK') color = 'green';
                return <Tag color={color} style={{ fontSize: 14, padding: '4px 8px' }}>{text}</Tag>;
            }
        },
        {
            title: 'Đơn giá (VNĐ/kWh)',
            dataIndex: 'price',
            key: 'price',
            render: (val) => (
                <strong style={{ fontSize: 16, color: '#cf1322' }}>
                    {val.toLocaleString('vi-VN')} đ
                </strong>
            )
        },
        {
            title: 'Quy định giờ',
            dataIndex: 'description',
            key: 'description',
        },
        {
            title: 'Cập nhật lần cuối',
            dataIndex: 'updatedAt',
            key: 'updatedAt',
            render: (date) => dayjs(date).format('DD/MM/YYYY HH:mm')
        },
        {
            title: 'Thao tác',
            key: 'action',
            render: (_, record) => (
                <Button
                    type="primary"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(record)}
                >
                    Cập nhật
                </Button>
            )
        }
    ];

    return (
        <div style={{ padding: 24 }}>
            <Card
                title={<Title level={4}><DollarOutlined /> Cấu hình đơn giá điện trung thế</Title>}
                bordered={false}
            >
                <Table
                    columns={columns}
                    dataSource={data}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                />
            </Card>

            <Modal
                title={`Cập nhật giá điện: ${editingRecord?.name}`}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={() => form.submit()}
                okText="Lưu thay đổi"
                cancelText="Hủy"
            >
                <div style={{ marginBottom: 20, padding: 10, background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4 }}>
                    Lưu ý: Đơn giá mới sẽ chỉ áp dụng cho việc tính toán tiền điện từ ngày cập nhật trở đi, không làm thay đổi lịch sử các ngày trước đó.
                </div>

                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item
                        name="price"
                        label="Đơn giá mới (VNĐ)"
                        rules={[{ required: true, message: 'Vui lòng nhập đơn giá' }]}
                    >
                        <InputNumber
                            style={{ width: '100%', fontSize: 18, fontWeight: 'bold' }}
                            formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={value => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                            addonAfter="VNĐ"
                        />
                    </Form.Item>
                    <Form.Item
                        name="description"
                        label="Ghi chú khung giờ"
                    >
                        <Input.TextArea rows={2} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}