"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Button, Spin, Result, Card, Typography, Modal, Form,
    DatePicker, Input, InputNumber, message, Tag, Space, Progress, Select
} from 'antd';
import {
    HomeOutlined, LeftOutlined, CheckCircleOutlined,
    WarningOutlined, HistoryOutlined, PlusOutlined, ToolOutlined, DownOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const { Title, Text } = Typography;

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

const styles = {
    page: {
        background: "#f0f2f5",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column" as const,
        fontFamily: "'Inter', sans-serif",
    },
    header: {
        background: "linear-gradient(135deg, #001529 0%, #1677ff 100%)",
        color: "#fff",
        padding: "16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        position: "sticky" as const,
        top: 0,
        zIndex: 10,
    },
    center: {
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column" as const,
        background: "#f0f2f5",
        padding: 24,
    },
    bigBtn: {
        height: 48,
        fontSize: 16,
        fontWeight: 600,
        borderRadius: 8,
    },
    machineBar: {
        background: "#fff",
        borderBottom: "1px solid #e8e8e8",
        position: "sticky" as const,
        top: 60,
        zIndex: 9,
        boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
    },
    machineInfo: {
        background: "#fff",
        padding: "16px 20px",
        textAlign: "center" as const,
        borderBottom: "1px dashed #d9d9d9",
    },
};

export default function MobileMaintenancePage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [data, setData] = useState<MaintenanceTask[]>([]);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [processes, setProcesses] = useState<Process[]>([]);

    const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);

    const machineBarRef = useRef<HTMLDivElement>(null);

    // Modals
    const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null);
    const [completeForm] = Form.useForm();
    const [savingComplete, setSavingComplete] = useState(false);

    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [taskForm] = Form.useForm();
    const [savingNewTask, setSavingNewTask] = useState(false);

    // -- INIT --
    useEffect(() => {
        if (status === "loading" || status === "unauthenticated") return;

        const fetchInit = async () => {
            try {
                const [pRes, mRes, tRes] = await Promise.all([
                    fetch('/api/processes'),
                    fetch('/api/machines'),
                    fetch('/api/maintenance/tasks', { cache: 'no-store' })
                ]);

                if (pRes.ok) {
                    const allProc = await pRes.json();
                    const userProcessIds: number[] = (session?.user as any)?.processIds || [];
                    if (session?.user?.role !== "ADMIN" && userProcessIds.length > 0) {
                        const userProcs = allProc.filter((p: Process) => userProcessIds.includes(p.id));
                        setProcesses(userProcs);
                        if (userProcs.length === 1) setSelectedProcessId(userProcs[0].id);
                    } else {
                        setProcesses(allProc);
                    }
                }
                if (mRes.ok) setMachines(await mRes.json());
                if (tRes.ok) setData(await tRes.json());
            } catch (e) {
                message.error("Lỗi tải dữ liệu");
            } finally {
                setLoading(false);
            }
        };
        fetchInit();
    }, [status, session]);

    // -- RE-FETCH TASKS --
    const refreshTasks = async () => {
        try {
            const tRes = await fetch('/api/maintenance/tasks', { cache: 'no-store' });
            if (tRes.ok) setData(await tRes.json());
        } catch (e) {
            console.error("Lỗi tải lại tasks", e);
        }
    };

    // -- DATA FILTERS --
    const userProcessIds: number[] = (session?.user as any)?.processIds || [];
    const isAdmin = session?.user?.role === "ADMIN";

    // Danh sách máy thuộc công đoạn đã chọn
    const activeMachines = useMemo(() => {
        return machines
            .filter(m => m.processId === selectedProcessId)
            .sort((a, b) => a.id - b.id);
    }, [machines, selectedProcessId]);

    const currentMachine = activeMachines[currentIndex];

    // Tasks của máy hiện tại
    const currentMachineTasks = useMemo(() => {
        if (!currentMachine) return [];
        return data.filter(t => t.machineId === currentMachine.id);
    }, [data, currentMachine]);

    // --- NAVIGATION ---
    const scrollMachineBarTo = (idx: number) => {
        if (machineBarRef.current) {
            const buttons = machineBarRef.current.querySelectorAll("button");
            if (buttons[idx]) {
                buttons[idx].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
            }
        }
    };

    const goTo = (index: number) => {
        if (index >= 0 && index < activeMachines.length) {
            setCurrentIndex(index);
            setTimeout(() => {
                scrollMachineBarTo(index);
            }, 200);
        }
    };

    // --- XỬ LÝ LÕI ---
    const handleComplete = async (values: any) => {
        if (!selectedTask) return;
        setSavingComplete(true);
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
                refreshTasks();
            } else {
                message.error("Lỗi hệ thống");
            }
        } catch (err) {
            message.error("Lỗi kết nối server");
        } finally {
            setSavingComplete(false);
        }
    };

    const handleAddTask = async (values: any) => {
        if (!currentMachine) return;
        setSavingNewTask(true);
        try {
            const payload = {
                ...values,
                machineId: currentMachine.id, // Lấy ID máy đang chọn
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
                refreshTasks();
            } else {
                message.error("Có lỗi xảy ra");
            }
        } catch (err) {
            message.error("Lỗi kết nối server");
        } finally {
            setSavingNewTask(false);
        }
    };


    // -- RENDERS --

    if (status === "loading" || loading) {
        return <div style={styles.center}><Spin size="large" tip="Đang tải..." /></div>;
    }
    if (status === "unauthenticated") {
        return (
            <div style={styles.center}>
                <Result status="warning" title="Chưa đăng nhập"
                    extra={<Button type="primary" size="large" href="/login" style={styles.bigBtn}>Đăng nhập</Button>} />
            </div>
        );
    }

    const accessLevel = (session?.user as any)?.accessLevel;
    if (accessLevel === "READ_ONLY") {
        return (
            <div style={styles.center}>
                <Result status="403" title="Không có quyền"
                    subTitle="Chỉ có tài khoản cấp Quản lý hoặc Vận hành mới được nhập số liệu."
                    extra={<Button size="large" href="/" style={styles.bigBtn}>Về trang chủ</Button>} />
            </div>
        );
    }

    // -- CHỌN CÔNG ĐOẠN NẾU CHƯA CHỌN --
    if (!selectedProcessId) {
        return (
            <div style={styles.page}>
                <div style={styles.header}>
                    <Button type="text" icon={<HomeOutlined />} style={{ color: "white", fontSize: 18 }} onClick={() => router.push("/")} />
                    <div style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>Bảo dưỡng Thiết bị</div>
                    </div>
                    <div style={{ width: 32 }} />
                </div>
                <div style={{ padding: 16 }}>
                    <div style={{ textAlign: "center", color: "#666", fontSize: 14, marginBottom: 20 }}>
                        Vui lòng chọn công đoạn để xem và nhập dữ liệu bảo dưỡng
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {processes.map(p => (
                            <Button
                                key={p.id} size="large" block
                                onClick={() => {
                                    setSelectedProcessId(p.id);
                                    setCurrentIndex(0);
                                }}
                                style={{
                                    height: 60, fontSize: 18, fontWeight: 600,
                                    borderRadius: 12, textAlign: "left", paddingLeft: 20,
                                    boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
                                }}
                            >
                                {p.name}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (activeMachines.length === 0) {
        return (
            <div style={styles.center}>
                <Result status="info" title="Không có máy nào"
                    extra={<Button size="large" onClick={() => setSelectedProcessId(null)}>Chọn lại công đoạn</Button>} />
            </div>
        );
    }

    if (!currentMachine) return <div style={styles.center}><Spin size="large" /></div>;

    const renderTaskCard = (item: MaintenanceTask) => {
        const today = dayjs();
        const diff = dayjs(item.nextDueDate).diff(today, 'day');
        let cardStyle = {};
        let tag = null;
        let isOverdueOrWarning = false;

        if (diff < 0) {
            cardStyle = { borderLeft: '4px solid #cf1322', background: '#fff1f0' };
            tag = <Tag color="error" icon={<WarningOutlined />}>QUÁ HẠN ({Math.abs(diff)} ngày)</Tag>;
            isOverdueOrWarning = true;
        } else if (diff <= (item.leadTimeDays || 30)) {
            cardStyle = { borderLeft: '4px solid #faad14', background: '#fffbe6' };
            tag = <Tag color="warning" icon={<HistoryOutlined />}>ĐẾN HẠN</Tag>;
            isOverdueOrWarning = true;
        } else {
            cardStyle = { borderLeft: '4px solid #52c41a' };
            tag = <Tag color="success" icon={<CheckCircleOutlined />}>AN TOÀN</Tag>;
        }

        return (
            <Card key={item.id} size="small" style={{ marginBottom: 12, borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", ...cardStyle }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 16, color: '#333' }}>
                            {item.taskName}
                        </div>
                        <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                            Hạn bảo dưỡng: <b>{dayjs(item.nextDueDate).format('DD/MM/YYYY')}</b>
                        </div>
                        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                            {tag}
                            <span style={{ fontSize: 12, color: "#999" }}>Chu kỳ: {item.intervalMonths} tháng</span>
                        </div>
                    </div>
                    <Button
                        type={isOverdueOrWarning ? "primary" : "default"}
                        icon={<CheckCircleOutlined />}
                        onClick={() => { setSelectedTask(item); setIsCompleteModalOpen(true); }}
                        style={{ height: "auto", minHeight: 40, padding: "0 16px", borderRadius: 8, fontWeight: 600 }}
                    >
                        Bảo trì
                    </Button>
                </div>
            </Card>
        );
    };

    return (
        <div style={styles.page}>
            {/* --- HEADER --- */}
            <div style={styles.header}>
                <Button icon={<LeftOutlined />} size="small" onClick={() => setSelectedProcessId(null)}
                    style={{ border: "none", background: "transparent", color: "#fff", fontSize: 16 }} />
                <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                        {processes.find(p => p.id === selectedProcessId)?.name || 'Bảo dưỡng'}
                    </div>
                </div>
                <Button type="text" icon={<HomeOutlined />} style={{ color: "white", fontSize: 18 }} onClick={() => router.push("/")} />
            </div>

            {/* --- THANH MÁY --- */}
            <div style={styles.machineBar}>
                <div ref={machineBarRef} style={{
                    display: "flex", gap: 6, overflowX: "auto", padding: "8px 12px",
                    WebkitOverflowScrolling: "touch" as any,
                }}>
                    {activeMachines.map((m, idx) => {
                        const isActive = idx === currentIndex;
                        // Count overdue + warning tasks for this machine to show a tiny dot or distinct styling
                        const mTasks = data.filter(t => t.machineId === m.id);
                        const hasUrgent = mTasks.some(t => {
                            const diff = dayjs(t.nextDueDate).diff(dayjs(), 'day');
                            return diff <= (t.leadTimeDays || 30);
                        });

                        return (
                            <Button key={m.id} size="small" onClick={() => goTo(idx)}
                                style={{
                                    minWidth: 60, height: 36, borderRadius: 8, fontSize: 13,
                                    fontWeight: isActive ? 700 : 500, flexShrink: 0,
                                    background: isActive ? "#1677ff" : (hasUrgent ? "#fff1f0" : "#fff"),
                                    color: isActive ? "#fff" : (hasUrgent ? "#cf1322" : "#333"),
                                    border: isActive ? "2px solid #1677ff" : (hasUrgent ? "1px solid #ffa39e" : "1px solid #d9d9d9"),
                                }}>
                                {hasUrgent && !isActive && <WarningOutlined style={{ marginRight: 4 }} />}
                                {m.name}
                            </Button>
                        );
                    })}
                </div>
            </div>

            {/* --- THÔNG TIN MÁY ĐANG CHỌN --- */}
            <div style={styles.machineInfo}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#1677ff" }}>{currentMachine.name}</div>
                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                    Đang có {currentMachineTasks.length} hạng mục bảo dưỡng định kỳ
                </div>
            </div>

            {/* --- DANH SÁCH HẠNG MỤC CỦA MÁY --- */}
            <div style={{ flex: 1, padding: "16px", paddingBottom: 100 }}>
                {currentMachineTasks.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "#999" }}>
                        <ToolOutlined style={{ fontSize: 48, color: "#d9d9d9", marginBottom: 16 }} />
                        <div>Máy này chưa có hạng mục bảo dưỡng nào.</div>
                    </div>
                ) : (
                    currentMachineTasks.map(t => renderTaskCard(t))
                )}

                {/* --- NÚT THÊM HẠNG MỤC MỚI --- */}
                <Button
                    type="dashed"
                    block
                    size="large"
                    icon={<PlusOutlined />}
                    onClick={() => {
                        setIsTaskModalOpen(true);
                        taskForm.resetFields();
                    }}
                    style={{ marginTop: 16, height: 50, borderRadius: 12, fontWeight: 600 }}
                >
                    Thêm hạng mục bảo dưỡng mới
                </Button>
            </div>

            {/* --- MODAL HOÀN THÀNH BẢO TRÌ --- */}
            <Modal
                title={
                    <div style={{ paddingRight: 24, marginTop: -4 }}>
                        <div style={{ fontSize: 13, color: '#888', fontWeight: 400 }}>Cập nhật bảo trì: {currentMachine.name}</div>
                        <div style={{ fontSize: 17, color: '#1677ff', marginTop: 4 }}>{selectedTask?.taskName}</div>
                    </div>
                }
                open={isCompleteModalOpen}
                onCancel={() => setIsCompleteModalOpen(false)}
                footer={null}
                style={{ top: 20 }}
            >
                <div style={{ borderBottom: "1px dashed #e8e8e8", marginBottom: 16, paddingBottom: 12 }}>
                    <div style={{ fontSize: 13, color: "#666" }}>
                        Chu kỳ: <b>{selectedTask?.intervalMonths} tháng</b>
                    </div>
                    <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                        Lần cuối thực hiện: <b>{selectedTask?.lastPerformedDate ? dayjs(selectedTask.lastPerformedDate).format('DD/MM/YYYY') : 'Chưa từng thực hiện'}</b>
                    </div>
                </div>

                <Form form={completeForm} layout="vertical" onFinish={handleComplete}>
                    <Form.Item name="performedDate" label="Ngày thực hiện" initialValue={dayjs()} rules={[{ required: true }]}>
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" size="large" inputReadOnly />
                    </Form.Item>
                    <Form.Item name="performedBy" label="Người thực hiện" rules={[{ required: true }]} initialValue={(session?.user as any)?.fullName || ''}>
                        <Input placeholder="Vd: Nguyễn Văn A" size="large" />
                    </Form.Item>
                    <Form.Item name="cost" label="Chi phí vật tư thay thế (VND)">
                        <InputNumber
                            style={{ width: '100%' }}
                            formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={value => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                            addonAfter="₫"
                            size="large"
                        />
                    </Form.Item>
                    <Form.Item name="notes" label="Ghi chú kỹ thuật">
                        <Input.TextArea placeholder="Nhập tình trạng máy, vật tư đã thay..." rows={3} />
                    </Form.Item>
                    <div style={{ marginTop: 24 }}>
                        <Button type="primary" htmlType="submit" size="large" block loading={savingComplete} style={{ height: 50, fontSize: 16, fontWeight: 700, borderRadius: 8 }}>
                            Xác nhận hoàn tất
                        </Button>
                    </div>
                </Form>
            </Modal>

            {/* --- MODAL THÊM HẠNG MỤC MỚI --- */}
            <Modal
                title="Thêm hạng mục định kỳ mới"
                open={isTaskModalOpen}
                onCancel={() => setIsTaskModalOpen(false)}
                footer={null}
                style={{ top: 20 }}
            >
                <div>
                    <div style={{ fontSize: 14, marginBottom: 16 }}>
                        Thiết bị: <b style={{ color: "#1677ff" }}>{currentMachine.name}</b>
                    </div>
                    <Form form={taskForm} layout="vertical" onFinish={handleAddTask}>
                        <Form.Item name="taskName" label="Tên hạng mục" rules={[{ required: true, message: "Vui lòng nhập tên hạng mục" }]} help="VD: Thay dầu mỡ, vệ sinh màng lọc...">
                            <Input size="large" placeholder="Nhập tên hạng mục..." />
                        </Form.Item>

                        <Space style={{ width: '100%' }} align="start">
                            <Form.Item name="intervalMonths" label="Chu kỳ (Tháng)" rules={[{ required: true, message: "Bắt buộc" }]} style={{ width: '100%', flex: 1 }}>
                                <InputNumber size="large" style={{ width: '100%' }} min={0.5} step={0.5} placeholder="VD: 6 hoặc 1.5" />
                            </Form.Item>
                            <Form.Item name="nextDueDate" label="Bắt đầu từ" rules={[{ required: true, message: "Bắt buộc" }]} initialValue={dayjs()} style={{ width: '100%', flex: 1 }}>
                                <DatePicker size="large" style={{ width: '100%' }} format="DD/MM/YYYY" inputReadOnly />
                            </Form.Item>
                        </Space>

                        <Form.Item name="leadTimeDays" label="Cảnh báo trước (Ngày)" initialValue={30} help="Sẽ hiển thị cảnh báo VÀNG khi sắp đến hạn">
                            <InputNumber size="large" style={{ width: '100%' }} min={1} />
                        </Form.Item>
                        
                        <Form.Item name="description" label="Hướng dẫn chi tiết">
                            <Input.TextArea rows={2} placeholder="Quy trình, loại vật tư cần dùng..." />
                        </Form.Item>

                        <div style={{ marginTop: 24 }}>
                            <Button type="primary" htmlType="submit" size="large" block loading={savingNewTask} style={{ height: 50, fontSize: 16, fontWeight: 700, borderRadius: 8 }}>
                                Lưu hạng mục mới
                            </Button>
                        </div>
                    </Form>
                </div>
            </Modal>
        </div>
    );
}
