"use client";

import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, message, Tabs, Tag, Space, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PartitionOutlined, DashboardOutlined } from '@ant-design/icons';
import { useSession } from "next-auth/react";
import type { TableProps } from 'antd';

const { Option } = Select;

// --- ĐỊNH NGHĨA KIỂU DỮ LIỆU ---
interface Factory { id: number; name: string; }
interface Substation { id: number; code: string; name: string; factoryId: number; factory?: Factory; }
interface PowerMeter {
    id: number;
    code: string;
    name: string;
    description: string;
    type: number; // 1: Hạ thế, 2: Trung thế
    tu: number;
    ti: number;
    factoryId: number;
    substationId: number | null;
    factory?: Factory;
    substation?: Substation;
}

export default function EnergyMetersPage() {
    const { data: session } = useSession();
    const [activeTab, setActiveTab] = useState('1');
    const [loading, setLoading] = useState(false);

    const [factories, setFactories] = useState<Factory[]>([]);
    const [substations, setSubstations] = useState<Substation[]>([]);
    const [meters, setMeters] = useState<PowerMeter[]>([]);

    // Quyền thao tác (Sửa số 99 thành ID Tổ Điện thực tế của bạn)
    // Khai báo một mảng chứa ID của tất cả các Tổ Điện
    const ELECTRICAL_PROCESS_IDS = [15, 16];

    const userProcessIds: number[] = (session?.user as any)?.processIds || [];
    const canEdit = session?.user?.role === "ADMIN" || userProcessIds.some(id => ELECTRICAL_PROCESS_IDS.includes(id));

    // Modals state
    const [isSubModalOpen, setIsSubModalOpen] = useState(false);
    const [isMeterModalOpen, setIsMeterModalOpen] = useState(false);
    const [editingSub, setEditingSub] = useState<Substation | null>(null);
    const [editingMeter, setEditingMeter] = useState<PowerMeter | null>(null);

    const [subForm] = Form.useForm();
    const [meterForm] = Form.useForm();

    // --- FETCH DATA ---
    const fetchData = async () => {
        setLoading(true);
        try {
            const [facRes, subRes, metRes] = await Promise.all([
                fetch('/api/factories'),
                fetch('/api/energy/substations'),
                fetch('/api/energy/meters')
            ]);
            if (facRes.ok) setFactories(await facRes.json());
            if (subRes.ok) setSubstations(await subRes.json());
            if (metRes.ok) setMeters(await metRes.json());
        } catch (e) {
            message.error("Lỗi tải dữ liệu");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // --- XỬ LÝ TRẠM BIẾN ÁP (SUBSTATION) ---
    const handleSaveSubstation = async (values: any) => {
        try {
            const method = editingSub ? 'PUT' : 'POST';
            const payload = { ...values, id: editingSub?.id, factoryId: Number(values.factoryId) };

            const res = await fetch('/api/energy/substations', {
                method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });

            if (res.ok) {
                message.success("Đã lưu Trạm biến áp!");
                setIsSubModalOpen(false); subForm.resetFields(); fetchData();
            } else {
                const err = await res.json(); message.error(err.error);
            }
        } catch (e) { message.error("Lỗi hệ thống"); }
    };

    const handleDeleteSubstation = async (id: number) => {
        // Gọi API DELETE (Bạn cần viết API hỗ trợ method DELETE)
        message.warning("Chức năng xóa đang được khóa để bảo vệ dữ liệu!");
    };

    // --- XỬ LÝ ĐỒNG HỒ (METER) ---
    const handleSaveMeter = async (values: any) => {
        try {
            const method = editingMeter ? 'PUT' : 'POST';
            const payload = {
                ...values,
                id: editingMeter?.id,
                description: values.description || null,
                factoryId: Number(values.factoryId),
                substationId: values.substationId ? Number(values.substationId) : null,
                tu: Number(values.tu),
                ti: Number(values.ti)
            };

            const res = await fetch('/api/energy/meters', {
                method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });

            if (res.ok) {
                message.success("Đã lưu Đồng hồ!");
                setIsMeterModalOpen(false); meterForm.resetFields(); fetchData();
            } else {
                const err = await res.json(); message.error(err.error);
            }
        } catch (e) { message.error("Lỗi hệ thống"); }
    };

    // --- CỘT HIỂN THỊ (COLUMNS) ---
    const subColumns: TableProps<Substation>['columns'] = [
        { title: 'Mã trạm', dataIndex: 'code', key: 'code', render: text => <b>{text}</b> },
        { title: 'Tên trạm biến áp', dataIndex: 'name', key: 'name' },
        { title: 'Nhà máy quản lý', dataIndex: ['factory', 'name'], key: 'factoryName' },
        {
            title: 'Thao tác', key: 'action',
            render: (_, record) => canEdit ? (
                <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingSub(record); subForm.setFieldsValue(record); setIsSubModalOpen(true); }} />
                    <Popconfirm title="Xóa trạm này?" onConfirm={() => handleDeleteSubstation(record.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ) : <span style={{ color: '#ccc' }}>Chỉ xem</span>
        }
    ];

    const meterColumns: TableProps<PowerMeter>['columns'] = [
        { title: 'Mã đồng hồ', dataIndex: 'code', key: 'code', render: text => <b>{text}</b> },
        { title: 'Tên đồng hồ', dataIndex: 'name', key: 'name' },
        { title: 'Khu vực đo đếm', dataIndex: 'description', key: 'description', render: t => t || <span style={{ color: '#ccc' }}>---</span> },
        {
            title: 'Phân loại', dataIndex: 'type', key: 'type',
            render: (type) => type === 2 ? <Tag color="red">Trung thế (3 Giá)</Tag> : <Tag color="blue">Hạ thế</Tag>
        },
        { title: 'Hệ số TU', dataIndex: 'tu', key: 'tu' },
        { title: 'Hệ số TI', dataIndex: 'ti', key: 'ti' },
        { title: 'Nhà máy', dataIndex: ['factory', 'name'], key: 'factoryName' },
        { title: 'Thuộc Trạm', dataIndex: ['substation', 'name'], key: 'substationName', render: t => t || '---' },
        {
            title: 'Thao tác', key: 'action',
            render: (_, record) => canEdit ? (
                <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingMeter(record); meterForm.setFieldsValue(record); setIsMeterModalOpen(true); }} />
                </Space>
            ) : <span style={{ color: '#ccc' }}>Chỉ xem</span>
        }
    ];

    return (
        <div style={{ padding: 24 }}>
            <Card variant="borderless">
                <Tabs activeKey={activeTab} onChange={setActiveTab} tabBarExtraContent={
                    canEdit ? (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                            if (activeTab === '1') { setEditingSub(null); subForm.resetFields(); setIsSubModalOpen(true); }
                            else { setEditingMeter(null); meterForm.resetFields(); meterForm.setFieldsValue({ type: 1, tu: 1, ti: 1 }); setIsMeterModalOpen(true); }
                        }}>
                            Thêm mới {activeTab === '1' ? 'Trạm biến áp' : 'Đồng hồ'}
                        </Button>
                    ) : null
                }>
                    <Tabs.TabPane tab={<span><PartitionOutlined /> Danh mục Trạm Biến Áp</span>} key="1">
                        <Table columns={subColumns} dataSource={substations} rowKey="id" loading={loading} />
                    </Tabs.TabPane>
                    <Tabs.TabPane tab={<span><DashboardOutlined /> Danh mục Đồng hồ (Công tơ)</span>} key="2">
                        <Table columns={meterColumns} dataSource={meters} rowKey="id" loading={loading} />
                    </Tabs.TabPane>
                </Tabs>
            </Card>

            {/* Modal Trạm Biến Áp */}
            <Modal title={editingSub ? "Sửa Trạm Biến Áp" : "Thêm Trạm Biến Áp"} open={isSubModalOpen} onOk={() => subForm.submit()} onCancel={() => setIsSubModalOpen(false)}>
                <Form form={subForm} layout="vertical" onFinish={handleSaveSubstation}>
                    <Form.Item name="code" label="Mã Trạm (Vd: TBA-01)" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="name" label="Tên Trạm" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="factoryId" label="Nhà máy" rules={[{ required: true }]}>
                        <Select>{factories.map(f => <Option key={f.id} value={f.id}>{f.name}</Option>)}</Select>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal Đồng Hồ */}
            <Modal title={editingMeter ? "Sửa Đồng hồ" : "Thêm Đồng hồ"} open={isMeterModalOpen} onOk={() => meterForm.submit()} onCancel={() => setIsMeterModalOpen(false)}>
                <Form form={meterForm} layout="vertical" onFinish={handleSaveMeter}>
                    <Space align="baseline">
                        <Form.Item name="code" label="Mã đồng hồ" rules={[{ required: true }]}><Input /></Form.Item>
                        <Form.Item name="type" label="Loại đồng hồ">
                            <Select style={{ width: 150 }}>
                                <Option value={1}>Hạ thế</Option>
                                <Option value={2}>Trung thế</Option>
                            </Select>
                        </Form.Item>
                    </Space>
                    <Form.Item name="name" label="Tên đồng hồ" rules={[{ required: true }]}><Input /></Form.Item>

                    <Form.Item name="description" label="Mô tả / Đo cho các máy nào?">
                        <Input.TextArea rows={2} placeholder="Vd: Đo đếm cho máy sợi con, máy ống..." />
                    </Form.Item>

                    <Space align="baseline">
                        <Form.Item name="tu" label="Hệ số biến điện áp (TU)" initialValue={1} rules={[{ required: true }]}><InputNumber min={1} /></Form.Item>
                        <Form.Item name="ti" label="Hệ số biến dòng điện (TI)" initialValue={1} rules={[{ required: true }]}><InputNumber min={1} /></Form.Item>
                    </Space>

                    <Form.Item name="factoryId" label="Nhà máy quản lý" rules={[{ required: true }]}>
                        <Select>{factories.map(f => <Option key={f.id} value={f.id}>{f.name}</Option>)}</Select>
                    </Form.Item>

                    <Form.Item
                        shouldUpdate={(prev, curr) => prev.type !== curr.type || prev.factoryId !== curr.factoryId}
                        noStyle
                    >
                        {({ getFieldValue }) => {
                            const isTrungThe = getFieldValue('type') === 2;
                            const selectedFac = getFieldValue('factoryId');
                            return (
                                <Form.Item name="substationId" label="Thuộc trạm biến áp (Không bắt buộc với Trung thế)">
                                    <Select allowClear placeholder="Chọn trạm biến áp..." disabled={!selectedFac}>
                                        {substations.filter(s => s.factoryId === selectedFac).map(s => (
                                            <Option key={s.id} value={s.id}>{s.name}</Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            );
                        }}
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}