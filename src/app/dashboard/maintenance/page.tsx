"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
    Table, Tag, Button, Space, Card, Typography, Modal, Form,
    DatePicker, Input, InputNumber, message, Row, Col,
    Statistic, Select, Divider
} from 'antd';
import type { TableProps } from 'antd';
import {
    ToolOutlined, HistoryOutlined, CheckCircleOutlined,
    WarningOutlined, AlertOutlined, PlusOutlined, FilterOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useSession } from "next-auth/react"; // 1. IMPORT SESSION

const { Title } = Typography;
const { Option } = Select;

// --- DEFINITIONS TYPE ---
interface Factory { id: number; name: string; }
interface Process { id: number; name: string; factoryId: number; }

interface Machine {
    id: number;
    name: string;
    processId: number;
    process?: Process | null;
}

interface MaintenanceTask {
    id: string;
    machineId: number;
    taskName: string;
    description?: string | null;
    intervalMonths: number;
    lastPerformedDate?: string | Date | null;
    nextDueDate: string | Date;
    leadTimeDays: number;
    machine: Machine;
}

export default function MaintenancePage() {
    // 2. LẤY THÔNG TIN USER
    const { data: session } = useSession();

    // 3. STATE QUẢN LÝ DỮ LIỆU & BỘ LỌC
    const [data, setData] = useState<MaintenanceTask[]>([]);
    const [machines, setMachines] = useState<Machine[]>([]);

    // State danh mục (Lấy từ DB thay vì cứng)
    const [factories, setFactories] = useState<Factory[]>([]);
    const [processes, setProcesses] = useState<Process[]>([]);

    // State lựa chọn lọc (Áp dụng logic DailyInput)
    const [selectedFactoryId, setSelectedFactoryId] = useState<number | null>(null);
    const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
    const [filterStatus, setFilterStatus] = useState<string | null>(null);

    const [loading, setLoading] = useState(false);

    // Modals
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);

    const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null);

    const [taskForm] = Form.useForm();
    const [completeForm] = Form.useForm();

    // 4. FETCH DATA & METADATA
    const fetchMetadata = async () => {
        try {
            const [resFac, resPro, resMac, resTasks] = await Promise.all([
                fetch('/api/factories'),
                fetch('/api/processes'),
                fetch('/api/machines'),
                fetch('/api/maintenance/tasks', { cache: 'no-store' })
            ]);

            if (resFac.ok) setFactories(await resFac.json());
            if (resPro.ok) setProcesses(await resPro.json());
            if (resMac.ok) setMachines(await resMac.json());
            if (resTasks.ok) setData(await resTasks.json());

        } catch (e) { message.error("Lỗi tải dữ liệu hệ thống"); }
    };

    useEffect(() => { fetchMetadata(); }, []);

    // 5. THÔNG TIN PHÂN QUYỀN
    const userProcessIds: number[] = (session?.user as any)?.processIds || [];
    const isAdmin = session?.user?.role === "ADMIN";

    // Danh sách factory/process mà user được phép xem (admin = tất cả)
    const visibleFactories = useMemo(() => {
        if (isAdmin) return factories;
        return factories.filter(f => processes.some(p => userProcessIds.includes(p.id) && p.factoryId === f.id));
    }, [isAdmin, factories, processes, userProcessIds]);

    const visibleProcesses = useMemo(() => {
        return processes
            .filter(p => !selectedFactoryId || p.factoryId === selectedFactoryId)
            .filter(p => isAdmin || userProcessIds.includes(p.id));
    }, [isAdmin, processes, selectedFactoryId, userProcessIds]);

    // 6. LOGIC LỌC DỮ LIỆU
    const filteredData = useMemo(() => {
        return data.filter((item) => {
            // Giới hạn phạm vi theo quyền (non-admin chỉ thấy máy thuộc công đoạn của mình)
            const matchScope = isAdmin || userProcessIds.includes(item.machine.processId);

            // Lọc theo Nhà máy
            const machineProcess = processes.find(p => p.id === item.machine.processId);
            const matchFactory = !selectedFactoryId || (machineProcess?.factoryId === selectedFactoryId);

            // Lọc theo Công đoạn
            const matchProcess = !selectedProcessId || item.machine.processId === selectedProcessId;

            // Lọc theo Trạng thái
            const diff = dayjs(item.nextDueDate).diff(dayjs(), 'day');
            let status = 'safe';
            if (diff < 0) status = 'overdue';
            else if (diff <= (item.leadTimeDays || 30)) status = 'warning';
            const matchStatus = !filterStatus || status === filterStatus;

            return matchScope && matchFactory && matchProcess && matchStatus;
        });
    }, [data, isAdmin, userProcessIds, selectedFactoryId, selectedProcessId, filterStatus, processes]);

    // 7. LỌC DANH SÁCH MÁY (Dùng cho Modal Thêm Mới)
    const filteredMachinesForSelect = useMemo(() => {
        return machines
            .filter(m => isAdmin || userProcessIds.includes(m.processId))
            .filter(m => !selectedProcessId || m.processId === selectedProcessId);
    }, [machines, isAdmin, userProcessIds, selectedProcessId]);

    // LOGIC THỐNG KÊ (Tính trên tập dữ liệu ĐÃ LỌC để phản ánh đúng view của user)
    const stats = useMemo(() => {
        const today = dayjs();
        let overdue = 0, upcoming = 0;

        filteredData.forEach(item => {
            const d = dayjs(item.nextDueDate);
            const diff = d.diff(today, 'day');
            if (diff < 0) overdue++;
            else if (diff <= (item.leadTimeDays || 30)) upcoming++;
        });

        return { overdue, upcoming, total: filteredData.length };
    }, [filteredData]);

    // --- HANDLERS ---
    const handleAddTask = async (values: any) => {
        try {
            const payload = {
                ...values,
                machineId: Number(values.machineId),
                intervalMonths: Number(values.intervalMonths),
                leadTimeDays: Number(values.leadTimeDays || 30),
                nextDueDate: values.nextDueDate.toISOString()
            };

            const res = await fetch('/api/maintenance/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                message.success("Đã thêm hạng mục thành công");
                setIsTaskModalOpen(false);
                taskForm.resetFields();
                fetchMetadata(); // Reload data
            } else {
                message.error("Có lỗi xảy ra");
            }
        } catch (err) { message.error("Lỗi kết nối server"); }
    };

    const handleComplete = async (values: any) => {
        if (!selectedTask) return;
        try {
            const res = await fetch('/api/maintenance/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId: selectedTask.id,
                    performedBy: values.performedBy,
                    notes: values.notes,
                    cost: values.cost ? Number(values.cost) : 0,
                    performedDate: values.performedDate.toISOString(),
                }),
            });

            if (res.ok) {
                message.success("Cập nhật bảo dưỡng thành công!");
                setIsCompleteModalOpen(false);
                completeForm.resetFields();
                fetchMetadata();
            }
        } catch (err) { message.error("Lỗi hệ thống"); }
    };

    // COLUMNS DEFINITION
    const columns: TableProps<MaintenanceTask>['columns'] = [
        {
            title: 'Máy / Thiết bị',
            dataIndex: ['machine', 'name'],
            key: 'machine',
            render: (_, record) => (
                <div>
                    <b style={{ color: '#1890ff' }}>{record.machine.name}</b>
                    <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                        {record.machine.process?.name || '---'}
                    </div>
                </div>
            )
        },
        { title: 'Hạng mục', dataIndex: 'taskName', key: 'taskName' },
        {
            title: 'Hạn bảo dưỡng',
            dataIndex: 'nextDueDate',
            key: 'nextDueDate',
            render: (date) => <b>{dayjs(date).format('DD/MM/YYYY')}</b>,
            sorter: (a, b) => dayjs(a.nextDueDate).unix() - dayjs(b.nextDueDate).unix()
        },
        {
            title: 'Trạng thái',
            key: 'status',
            render: (_, record) => {
                const diff = dayjs(record.nextDueDate).diff(dayjs(), 'day');
                if (diff < 0) return <Tag color="error" icon={<WarningOutlined />}>QUÁ HẠN ({Math.abs(diff)} ngày)</Tag>;
                if (diff <= (record.leadTimeDays || 30)) return <Tag color="warning" icon={<HistoryOutlined />}>SẮP ĐẾN HẠN</Tag>;
                return <Tag color="success" icon={<CheckCircleOutlined />}>AN TOÀN</Tag>;
            }
        },
        {
            title: 'Thao tác',
            key: 'action',
            render: (_, record) => (
                <Button
                    size="small"
                    type="primary"
                    icon={<ToolOutlined />}
                    onClick={() => { setSelectedTask(record); setIsCompleteModalOpen(true); }}
                >
                    Bảo trì
                </Button>
            )
        }
    ];

    return (
        <div style={{ padding: 20 }}>
            {/* --- PHẦN BỘ LỌC THÔNG MINH (UPDATED) --- */}
            <Card style={{ marginBottom: 16 }} size="small" title="Bộ lọc dữ liệu">
                <Row gutter={16} align="middle">
                    <Col span={8}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Nhà máy & Công đoạn:</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Select
                                style={{ width: '50%' }}
                                placeholder="Tất cả nhà máy"
                                allowClear
                                options={visibleFactories.map(f => ({ label: f.name, value: f.id }))}
                                onChange={val => { setSelectedFactoryId(val ?? null); setSelectedProcessId(null); }}
                                value={selectedFactoryId}
                            />
                            <Select
                                style={{ width: '50%' }}
                                placeholder="Tất cả công đoạn"
                                allowClear
                                options={visibleProcesses.map(p => ({ label: p.name, value: p.id }))}
                                onChange={val => setSelectedProcessId(val ?? null)}
                                value={selectedProcessId}
                            />
                        </div>
                    </Col>
                    <Col span={6}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Trạng thái:</div>
                        <Select
                            placeholder="Tất cả trạng thái"
                            style={{ width: '100%' }}
                            allowClear
                            onChange={setFilterStatus}
                        >
                            <Option value="overdue">🔴 Quá hạn</Option>
                            <Option value="warning">🟡 Sắp đến hạn</Option>
                            <Option value="safe">🟢 An toàn</Option>
                        </Select>
                    </Col>
                    <Col span={10} style={{ textAlign: 'right', display: 'flex', alignItems: 'end', justifyContent: 'flex-end', height: '100%' }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsTaskModalOpen(true)} size="large">
                            Thêm lịch bảo trì
                        </Button>
                    </Col>
                </Row>
            </Card>

            {/* --- DASHBOARD STATS --- */}
            <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={8}>
                    <Card variant="borderless"><Statistic title="Tổng hạng mục (Đang lọc)" value={stats.total} prefix={<ToolOutlined />} /></Card>
                </Col>
                <Col span={8}>
                    <Card variant="borderless" style={{ borderLeft: '4px solid #cf1322' }}>
                        <Statistic title="Cần xử lý ngay" value={stats.overdue} styles={{ content: { color: '#cf1322' } }} prefix={<AlertOutlined />} />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card variant="borderless" style={{ borderLeft: '4px solid #faad14' }}>
                        <Statistic title="Sắp đến hạn" value={stats.upcoming} styles={{ content: { color: '#faad14' } }} prefix={<HistoryOutlined />} />
                    </Card>
                </Col>
            </Row>

            {/* --- DATA TABLE --- */}
            <Table
                columns={columns}
                dataSource={filteredData}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10, showSizeChanger: true }}
            />

            {/* --- MODAL 1: THÊM MỚI --- */}
            <Modal
                title="Thêm hạng mục bảo dưỡng định kỳ"
                open={isTaskModalOpen}
                onOk={() => taskForm.submit()}
                onCancel={() => setIsTaskModalOpen(false)}
                okText="Lưu lại" cancelText="Hủy"
                width={600}
            >
                <Form form={taskForm} layout="vertical" onFinish={handleAddTask}>
                    {/* CẢNH BÁO NẾU CHƯA CHỌN CÔNG ĐOẠN */}
                    {!selectedProcessId && (
                        <div style={{ marginBottom: 16, color: '#faad14', border: '1px dashed #faad14', padding: 8, borderRadius: 4 }}>
                            <WarningOutlined /> Vui lòng chọn <b>Công đoạn</b> ở bộ lọc bên ngoài để hiển thị đúng danh sách máy.
                        </div>
                    )}

                    <Form.Item name="machineId" label="Chọn máy / thiết bị" rules={[{ required: true, message: 'Vui lòng chọn máy' }]}>
                        <Select
                            showSearch
                            placeholder={selectedProcessId ? "Nhập tên máy để tìm..." : "Chọn công đoạn trước..."}
                            optionFilterProp="children"
                            filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                            // Chỉ hiển thị máy thuộc công đoạn đang chọn (tránh chọn nhầm máy xưởng khác)
                            options={filteredMachinesForSelect.map(m => ({ value: m.id, label: m.name }))}
                            disabled={!selectedProcessId}
                        />
                    </Form.Item>

                    <Form.Item name="taskName" label="Tên hạng mục (Vd: Thay dầu, tra mỡ)" rules={[{ required: true }]}><Input /></Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="intervalMonths" label="Chu kỳ (Tháng)" rules={[{ required: true }]}>
                                <InputNumber style={{ width: '100%' }} min={0.5} step={0.5} placeholder="Vd: 6 hoặc 1.5" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="nextDueDate" label="Ngày bắt đầu tính" rules={[{ required: true }]} initialValue={dayjs()}>
                                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="leadTimeDays" label="Cảnh báo trước (Ngày)" initialValue={30} help="Hệ thống sẽ báo vàng khi còn lại số ngày này">
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="description" label="Mô tả chi tiết"><Input.TextArea rows={2} /></Form.Item>
                </Form>
            </Modal>

            {/* --- MODAL 2: HOÀN THÀNH (Giữ nguyên) --- */}
            <Modal
                title={`Xác nhận hoàn tất: ${selectedTask?.taskName}`}
                open={isCompleteModalOpen}
                onOk={() => completeForm.submit()}
                onCancel={() => setIsCompleteModalOpen(false)}
                okText="Xác nhận & Cập nhật" cancelText="Đóng"
            >
                <Form form={completeForm} layout="vertical" onFinish={handleComplete}>
                    <Form.Item name="performedDate" label="Ngày thực hiện" initialValue={dayjs()} rules={[{ required: true }]}>
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>
                    <Form.Item name="performedBy" label="Người thực hiện" rules={[{ required: true }]}>
                        <Input placeholder="Vd: Nguyễn Văn A" />
                    </Form.Item>
                    <Form.Item name="cost" label="Chi phí vật tư (nếu có)">
                        <InputNumber
                            style={{ width: '100%' }}
                            formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={value => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                            addonAfter="VND"
                        />
                    </Form.Item>
                    <Form.Item name="notes" label="Ghi chú kỹ thuật">
                        <Input.TextArea placeholder="Tình trạng máy sau bảo dưỡng..." />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}