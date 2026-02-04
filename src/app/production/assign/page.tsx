"use client";
import React, { useEffect, useState, useCallback } from 'react';
import { Table, Button, Card, Select, message, Tag, Space, Divider } from 'antd';
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';

export default function AssignProductionPage() {
    const [machines, setMachines] = useState([]);
    const [items, setItems] = useState([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]); // Lưu các máy đang tích chọn
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    // --- 1. Tải dữ liệu (Dùng useCallback để tránh lỗi render vòng lặp) ---
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [resMac, resItem] = await Promise.all([
                fetch('/api/machines'),
                fetch('/api/items')
            ]);

            if (resMac.ok && resItem.ok) {
                setMachines(await resMac.json());
                setItems(await resItem.json());
            } else {
                message.error("Không tải được dữ liệu");
            }
        } catch (error) {
            message.error("Lỗi hệ thống");
        } finally {
            setLoading(false);
        }
    }, []); // [] Rỗng nghĩa là hàm này không thay đổi, chỉ tạo 1 lần

    // Gọi hàm khi trang vừa load
    useEffect(() => {
        fetchData();
    }, [fetchData]); // Chỉ chạy lại nếu hàm fetchData thay đổi (mà ta đã cố định nó bằng useCallback rồi)

    // --- 2. Xử lý nút "Áp dụng" ---
    const handleBulkUpdate = async () => {
        if (selectedRowKeys.length === 0) return message.warning('Vui lòng chọn ít nhất 1 máy!');
        if (!selectedItemId) return message.warning('Vui lòng chọn mặt hàng!');

        try {
            const res = await fetch('/api/machines/bulk-update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    machineIds: selectedRowKeys,
                    itemId: selectedItemId
                })
            });

            if (res.ok) {
                message.success(`Đã gán hàng cho ${selectedRowKeys.length} máy!`);
                setSelectedRowKeys([]); // Bỏ chọn
                fetchData(); // Load lại bảng để thấy kết quả mới
            } else {
                message.error('Lỗi cập nhật');
            }
        } catch (error) {
            message.error('Lỗi hệ thống');
        }
    };

    // --- Cấu hình bảng ---
    const columns = [
        { title: 'Tên Máy', dataIndex: 'name', width: 100, render: (t: any) => <b>{t}</b> },
        { title: 'Nhà máy', render: (_: any, r: any) => r.process?.factory?.name },
        {
            title: 'Đang chạy hàng',
            dataIndex: 'currentItem',
            render: (item: any) => item ? <Tag color="blue">{item.name}</Tag> : <span style={{ color: '#ccc' }}>Trống</span>
        }
    ];

    return (
        <div style={{ padding: 20 }}>
            <Card title="Điều Phối Mặt Hàng Cho Máy (Gán Hàng Loạt)">

                {/* THANH CÔNG CỤ */}
                <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                        <span style={{ marginRight: 10, fontWeight: 500 }}>1. Chọn Mặt Hàng muốn chạy:</span>
                        <Select
                            showSearch
                            style={{ width: 300 }}
                            placeholder="Tìm tên mặt hàng..."
                            optionFilterProp="children"
                            onChange={(val) => setSelectedItemId(val)}
                            filterOption={(input, option: any) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                            options={items.map((i: any) => ({ label: i.name, value: i.id }))}
                        />
                    </div>

                    <div style={{ borderLeft: '1px solid #d9d9d9', paddingLeft: 16 }}>
                        <span style={{ marginRight: 10 }}>2. Áp dụng cho <b>{selectedRowKeys.length}</b> máy đang chọn:</span>
                        <Button
                            type="primary"
                            icon={<ThunderboltOutlined />}
                            onClick={handleBulkUpdate}
                            disabled={selectedRowKeys.length === 0 || !selectedItemId}
                        >
                            Cập Nhật Ngay
                        </Button>
                    </div>
                </div>

                {/* BẢNG CHỌN MÁY */}
                <Table
                    rowKey="id"
                    rowSelection={{
                        selectedRowKeys,
                        onChange: (newSelectedKeys) => setSelectedRowKeys(newSelectedKeys),
                    }}
                    columns={columns}
                    dataSource={machines}
                    loading={loading}
                    pagination={{ pageSize: 20 }} // Hiện nhiều máy để dễ chọn
                    size="small"
                />
            </Card>
        </div>
    );
}