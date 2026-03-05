"use client";

import React, { useEffect, useState } from "react";
import { Table, Card, Button, Input, Select, Tag, Space, Modal, Form, message, InputNumber, Switch, Popconfirm, Row, Col } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, RobotOutlined, ThunderboltOutlined, SearchOutlined } from "@ant-design/icons";
import { useSession } from "next-auth/react";

// Định nghĩa kiểu
interface MachineData {
    id: number;
    name: string;
    processId: number;
    process?: { name: string; factory?: { name: string } };
    currentItem?: { name: string; code: string };
    formulaType: number;
    spindleCount?: number;
    currentNE?: number;
    isActive: boolean;
}

export default function MachinesPage() {
    const { data: session } = useSession();
    const [machines, setMachines] = useState<MachineData[]>([]);
    const [loading, setLoading] = useState(false);

    // Data danh mục
    const [factories, setFactories] = useState<any[]>([]);
    const [processes, setProcesses] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);

    // Filter state
    const [filterFactory, setFilterFactory] = useState<number | null>(null);
    const [filterProcess, setFilterProcess] = useState<number | null>(null);
    const [searchText, setSearchText] = useState("");

    // Modal Create/Edit
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMachine, setEditingMachine] = useState<MachineData | null>(null);
    const [form] = Form.useForm();

    // Modal Dispatch (Điều phối)
    const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [dispatchForm] = Form.useForm();

    const isAdmin = session?.user?.role === "ADMIN";
    const isManager = (session?.user as any)?.accessLevel === "MANAGER";
    const userProcessIds: number[] = (session?.user as any)?.processIds || [];

    const canEdit = (m: MachineData) => isAdmin || (isManager && userProcessIds.includes(m.processId));

    // 1. Load Data
    const fetchData = async () => {
        setLoading(true);
        try {
            // Lấy danh mục
            const [fRes, pRes, iRes] = await Promise.all([
                fetch('/api/factories'), fetch('/api/processes'), fetch('/api/items')
            ]);
            setFactories(await fRes.json());
            setProcesses(await pRes.json());
            setItems(await iRes.json());

            // Admin dùng filter controls; non-admin lấy tất cả rồi lọc client-side
            let query = "?";
            if (isAdmin) {
                if (filterFactory) query += `factoryId=${filterFactory}&`;
                if (filterProcess) query += `processId=${filterProcess}`;
            }

            const mRes = await fetch(`/api/machines${query}`);
            let mData: MachineData[] = await mRes.json();

            // Non-admin: chỉ giữ máy thuộc công đoạn của mình
            if (!isAdmin) {
                mData = mData.filter(m => userProcessIds.includes(m.processId));
            }

            // Lọc local theo tên
            if (searchText) {
                mData = mData.filter(m => m.name.toLowerCase().includes(searchText.toLowerCase()));
            }
            setMachines(mData);
        } catch (e) { message.error("Lỗi tải dữ liệu"); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, [filterFactory, filterProcess, session]); // Reload khi đổi filter hoặc session load xong

    // 2. Xử lý Thêm / Sửa
    const handleSave = async (values: any) => {
        try {
            const url = editingMachine ? `/api/machines/${editingMachine.id}` : "/api/machines";
            const method = editingMachine ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values)
            });
            if (!res.ok) throw new Error("Lỗi lưu");

            message.success("Thành công!");
            setIsModalOpen(false);
            fetchData();
        } catch (e) { message.error("Lỗi khi lưu"); }
    };

    // 3. Xử lý Xóa
    const handleDelete = async (id: number) => {
        const res = await fetch(`/api/machines/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (res.ok) { message.success("Đã xóa"); fetchData(); }
        else message.error(data.error);
    };

    // 4. Xử lý ĐIỀU PHỐI (BATCH ASSIGN)
    const handleDispatch = async (values: any) => {
        try {
            const res = await fetch("/api/machines/batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    machineIds: selectedRowKeys,
                    itemId: values.itemId
                })
            });
            if (!res.ok) throw new Error("Lỗi điều phối");

            message.success(`Đã gán mặt hàng cho ${selectedRowKeys.length} máy!`);
            setIsDispatchModalOpen(false);
            setSelectedRowKeys([]); // Clear selection
            fetchData();
        } catch (e) { message.error("Có lỗi xảy ra"); }
    };

    // Columns
    const columns = [
        {
            title: "Tên máy", dataIndex: "name", width: 120,
            render: (text: string, r: any) => <b style={{ color: r.isActive ? '#000' : '#ccc' }}>{text} {r.isActive ? '' : '(Dừng)'}</b>
        },
        {
            title: "Công đoạn", dataIndex: ["process", "name"], width: 150,
            render: (t: string, r: any) => (
                <div>
                    <div style={{ fontSize: 11, color: '#888' }}>{r.process?.factory?.name}</div>
                    <div>{t}</div>
                </div>
            )
        },
        {
            title: "Mặt hàng đang chạy", key: "item",
            render: (_: any, r: MachineData) => r.currentItem ? <Tag color="blue">{r.currentItem.name}</Tag> : <Tag color="red">Chưa gán</Tag>
        },
        {
            title: "Cấu hình", key: "config", responsive: ['lg'] as any,
            render: (_: any, r: MachineData) => (
                <div style={{ fontSize: 12, color: '#666' }}>
                    <div>Công thức: Loại {r.formulaType}</div>
                    {r.spindleCount && <div>Số cọc: {r.spindleCount}</div>}
                    {r.currentNE != null && <div>Chi số (NE): <b style={{ color: '#1677ff' }}>{r.currentNE}</b></div>}
                </div>
            )
        },
        {
            title: "Hành động", key: "action", width: 100, align: 'right' as const,
            render: (_: any, r: MachineData) => canEdit(r) ? (
                <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingMachine(r); form.setFieldsValue(r); setIsModalOpen(true); }} />
                    {isAdmin && (
                        <Popconfirm title="Xóa máy này?" onConfirm={() => handleDelete(r.id)}>
                            <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    )}
                </Space>
            ) : null
        }
    ];

    // Chỉ Admin và Manager mới được vào
    if (!isAdmin && !isManager) return <div className="p-10">Bạn không có quyền truy cập trang này.</div>;

    return (
        <div style={{ padding: 20 }}>
            <Card title={<span><RobotOutlined /> Quản lý & Điều phối Máy</span>} extra={isAdmin ? <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingMachine(null); form.resetFields(); setIsModalOpen(true); }}>Thêm máy mới</Button> : null}>
                {/* TOOLBAR */}
                <Row gutter={16} style={{ marginBottom: 16 }}>
                    {isAdmin && (
                        <>
                            <Col span={6}>
                                <Select
                                    style={{ width: '100%' }} placeholder="Lọc theo Nhà máy" allowClear
                                    options={factories.map(f => ({ label: f.name, value: f.id }))}
                                    onChange={setFilterFactory}
                                />
                            </Col>
                            <Col span={6}>
                                <Select
                                    style={{ width: '100%' }} placeholder="Lọc theo Công đoạn" allowClear
                                    options={processes
                                        .filter(p => !filterFactory || p.factoryId === filterFactory)
                                        .map(p => ({ label: p.name, value: p.id }))}
                                    onChange={setFilterProcess}
                                />
                            </Col>
                        </>
                    )}
                    <Col span={isAdmin ? 6 : 18}>
                        <Input placeholder="Tìm tên máy..." prefix={<SearchOutlined />} onChange={e => setSearchText(e.target.value)} />
                    </Col>
                    <Col span={6} style={{ textAlign: 'right' }}>
                        <Button icon={<ReloadOutlined />} onClick={fetchData}>Tải lại</Button>
                    </Col>
                </Row>

                {/* THANH ĐIỀU PHỐI (Hiện ra khi chọn dòng) */}
                {selectedRowKeys.length > 0 && (
                    <div style={{ marginBottom: 16, background: '#e6f7ff', padding: '10px 20px', borderRadius: 6, border: '1px solid #91d5ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#1890ff' }}><b>Đã chọn {selectedRowKeys.length} máy</b>. Bạn muốn làm gì?</span>
                        <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => setIsDispatchModalOpen(true)}>
                            Điều phối (Gán mặt hàng loạt)
                        </Button>
                    </div>
                )}

                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={machines}
                    loading={loading}
                    rowSelection={{
                        selectedRowKeys,
                        onChange: setSelectedRowKeys,
                        getCheckboxProps: (record: MachineData) => ({
                            disabled: !canEdit(record),
                        }),
                    }}
                    pagination={{ pageSize: 20 }}
                />
            </Card>

            {/* MODAL 1: CREATE / EDIT MACHINE */}
            <Modal
                title={editingMachine ? "Cập nhật máy" : "Thêm máy mới"}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item name="name" label="Tên máy" rules={[{ required: true }]}>
                        <Input placeholder="Ví dụ: Máy 01" />
                    </Form.Item>

                    <Form.Item name="processId" label="Thuộc Công đoạn" rules={[{ required: true }]}>
                        <Select
                            disabled={!isAdmin && !!editingMachine}
                            options={(isAdmin ? processes : processes.filter(p => userProcessIds.includes(p.id)))
                                .map(p => ({ label: `${p.name} (${p.factory?.name})`, value: p.id }))}
                        />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="formulaType" label="Công thức tính" rules={[{ required: true }]}>
                                <Select options={[
                                    { label: 'Loại 1: Sản lượng trực tiếp', value: 1 },
                                    { label: 'Loại 2: Trừ lùi (Cuối - Đầu)', value: 2 },
                                    { label: 'Loại 3: Dành cho máy Thô', value: 3 },
                                    { label: 'Loại 4: (Cuối - Đầu) / Chi số', value: 4 },
                                ]} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="spindleCount" label="Số cọc (Nếu có)">
                                <InputNumber style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="currentNE" label="Chi số hiện tại (NE)" tooltip="Dùng cho công thức Loại 3 và 4. Giá trị này sẽ được dùng mặc định khi nhập liệu sản lượng.">
                                <InputNumber style={{ width: '100%' }} min={0} placeholder="Ví dụ: 30" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="isActive" valuePropName="checked" label="Trạng thái">
                        <Switch checkedChildren="Hoạt động" unCheckedChildren="Tạm dừng" defaultChecked />
                    </Form.Item>

                    <Button type="primary" htmlType="submit" block>Lưu thông tin</Button>
                </Form>
            </Modal>

            {/* MODAL 2: DISPATCH (ĐIỀU PHỐI) */}
            <Modal
                title={<span><ThunderboltOutlined /> Điều phối sản xuất</span>}
                open={isDispatchModalOpen}
                onCancel={() => setIsDispatchModalOpen(false)}
                footer={null}
            >
                <div style={{ marginBottom: 16 }}>
                    Bạn đang thực hiện đổi mặt hàng cho <b>{selectedRowKeys.length} máy</b> đã chọn.
                    <br />Chi số (NE) của từng máy sẽ <b>giữ nguyên</b>. Hãy cập nhật thủ công trong mục Sửa máy nếu cần.
                </div>
                <Form form={dispatchForm} layout="vertical" onFinish={handleDispatch}>
                    <Form.Item name="itemId" label="Chọn mặt hàng muốn chạy:" rules={[{ required: true, message: 'Vui lòng chọn hàng' }]}>
                        <Select
                            showSearch
                            optionFilterProp="label"
                            placeholder="Tìm tên mặt hàng..."
                            options={items.map(i => ({ label: `${i.name} (NE: ${i.ne})`, value: i.id }))}
                        />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block size="large">Xác nhận chuyển đổi</Button>
                </Form>
            </Modal>
        </div>
    );
}