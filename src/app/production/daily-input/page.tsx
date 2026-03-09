"use client";

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Card, Select, DatePicker, Button, Row, Col, Modal, Form, InputNumber, Switch, message, Tag, Statistic, Input } from 'antd';
import { SaveOutlined, ArrowRightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useSession } from "next-auth/react";

interface Machine {
    id: number;
    name: string;
    formulaType: number;
    processId: number;
    spindleCount?: number;
    currentItem?: { id: number; name: string };
    currentNE?: number;
    todayLog?: { id: number; finalOutput: number; startIndex?: number; endIndex?: number; inputNE?: number; note?: string };
}

interface Factory { id: number; name: string; }
interface Process { id: number; name: string; factoryId: number; }

export default function DailyInputPage() {
    const { data: session } = useSession();

    // --- STATE ---
    const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
    const [selectedShift, setSelectedShift] = useState<number>(1);
    const [selectedFactoryId, setSelectedFactoryId] = useState<number | null>(null);
    const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);

    const [machines, setMachines] = useState<Machine[]>([]);
    const [factories, setFactories] = useState<Factory[]>([]);
    const [processes, setProcesses] = useState<Process[]>([]);
    const [loading, setLoading] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Modal & Form
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentMachine, setCurrentMachine] = useState<Machine | null>(null);
    const [form] = Form.useForm();
    const inputRef = useRef<any>(null);

    const watchEndIndex = Form.useWatch('endIndex', form);
    const watchStartIndex = Form.useWatch('startIndex', form);
    const watchIsReset = Form.useWatch('isReset', form);
    const watchIsStopped = Form.useWatch('isStopped', form);
    const watchInputNE = Form.useWatch('inputNE', form);

    // --- DETECT MOBILE ---
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // --- LOGIC CHỌN CA & NGÀY ---
    useEffect(() => {
        const now = dayjs();
        const hour = now.hour();

        if (hour >= 13 && hour < 21) {
            setSelectedShift(1);
            setSelectedDate(now);
        } else if (hour >= 21) {
            setSelectedShift(2);
            setSelectedDate(now);
        } else if (hour >= 0 && hour < 5) {
            setSelectedShift(2);
            setSelectedDate(now.subtract(1, 'day'));
        } else if (hour >= 5 && hour < 13) {
            setSelectedShift(3);
            setSelectedDate(now.subtract(1, 'day'));
        }

        fetchMetadata();
    }, []);

    const fetchMetadata = async () => {
        try {
            const [resFac, resPro] = await Promise.all([fetch('/api/factories'), fetch('/api/processes')]);
            if (resFac.ok && resPro.ok) {
                setFactories(await resFac.json());
                setProcesses(await resPro.json());
            }
        } catch (e) { message.error("Lỗi tải danh mục"); }
    };

    // --- TỰ ĐỘNG CHỌN NHÀ MÁY & CÔNG ĐOẠN THEO USER ---
    useEffect(() => {
        const userProcessIds: number[] = (session?.user as any)?.processIds || [];
        if (processes.length > 0 && userProcessIds.length > 0) {
            const userProcessId = userProcessIds[0];
            const targetProcess = processes.find(p => p.id === userProcessId);
            if (targetProcess) {
                setSelectedFactoryId(targetProcess.factoryId);
                setSelectedProcessId(targetProcess.id);
            }
        }
    }, [processes, session]);

    // --- TẢI MÁY ---
    const fetchMachines = async () => {
        if (!selectedProcessId) return;
        setLoading(true);
        try {
            const dateStr = selectedDate.format('YYYY-MM-DD');
            const query = `?processId=${selectedProcessId}&date=${dateStr}&shift=${selectedShift}`;
            const res = await fetch(`/api/production/daily-status${query}`);
            setMachines(await res.json());
        } catch { message.error("Lỗi tải máy"); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchMachines(); }, [selectedProcessId, selectedDate, selectedShift]);

    const handleOpenMachine = async (machine: Machine) => {
        if (!machine.currentItem) {
            message.warning(`Máy ${machine.name} chưa gán mặt hàng!`);
            return;
        }
        setCurrentMachine(machine);
        form.resetFields();

        const initValues: any = {
            isReset: false,
            isStopped: false,
            inputNE: machine.currentNE || 30,
            itemId: machine.currentItem?.id,
            startIndex: 0,
            endIndex: null
        };

        if (machine.todayLog) {
            // Chế độ sửa: điền lại giá trị đã nhập trước đó
            const log = machine.todayLog;
            initValues.startIndex = log.startIndex ?? 0;
            initValues.endIndex = log.endIndex ?? null;
            initValues.inputNE = log.inputNE ?? machine.currentNE ?? 30;
            initValues.isStopped = log.note === "Máy dừng";
            initValues.isReset = log.note === "Reset đồng hồ";
            message.info("Đang sửa dữ liệu đã nhập. Lưu lại để cập nhật.");
        } else {
            try {
                const res = await fetch(`/api/production/last-log?machineId=${machine.id}&date=${selectedDate.format('YYYY-MM-DD')}&shift=${selectedShift}`);
                const lastLog = await res.json();
                if (lastLog && lastLog.endIndex !== undefined) {
                    initValues.startIndex = lastLog.endIndex;
                } else {
                    initValues.isNewMachine = true;
                }
            } catch (e) { console.error(e); }
        }
        form.setFieldsValue(initValues);
        setIsModalOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const totalOutput = useMemo(() =>
        machines.reduce((sum, m) => sum + (m.todayLog?.finalOutput ?? 0), 0),
    [machines]);

    const calculatedOutput = useMemo(() => {
        if (!currentMachine || watchIsStopped) return 0;
        const start = Number(watchStartIndex) || 0;
        const end = Number(watchEndIndex);
        if (watchEndIndex === null || watchEndIndex === undefined) return 0;

        const delta = watchIsReset ? end : end - start;
        const type = currentMachine.formulaType;
        let result = 0;

        if (type === 1) result = end;
        else if (type === 2) result = delta;
        else if (type === 3) {
            const ne = Number(watchInputNE) || 1;
            const spindles = currentMachine.spindleCount || 1;
            const denominator = ne * 1000 * 1.693;
            if (denominator !== 0) result = (delta * spindles) / denominator;
        } else if (type === 4) {
            const ne = Number(watchInputNE) || 1;
            if (ne !== 0) result = delta / ne;
        }
        return Math.round(result);
    }, [watchEndIndex, watchStartIndex, watchIsReset, watchIsStopped, watchInputNE, currentMachine]);

    const handleSave = async (saveAndNext: boolean) => {
        try {
            const values = await form.validateFields();
            if (calculatedOutput < 0 && !values.isReset && !values.isStopped) {
                Modal.error({ title: 'Lỗi số liệu!', content: 'Sản lượng bị ÂM. Có phải đồng hồ đã bị Reset về 0? Hãy tích vào ô "Đã Reset".' });
                return;
            }
            if (calculatedOutput > 1000) {
                Modal.confirm({
                    title: 'Cảnh báo số liệu lớn',
                    content: `Sản lượng ${calculatedOutput} kg là rất lớn. Bạn có chắc chắn nhập đúng không?`,
                    onOk: () => submitData(values, saveAndNext),
                });
                return;
            }
            await submitData(values, saveAndNext);
        } catch (e) { }
    };

    const submitData = async (values: any, saveAndNext: boolean) => {
        try {
            const payload = {
                recordDate: selectedDate.format('YYYY-MM-DD'),
                shift: selectedShift,
                machineId: currentMachine?.id,
                itemId: values.itemId,
                startIndex: values.startIndex,
                endIndex: values.endIndex,
                inputNE: values.inputNE,
                finalOutput: calculatedOutput,
                note: values.isStopped ? "Máy dừng" : (values.isReset ? "Reset đồng hồ" : "")
            };
            const res = await fetch('/api/production/daily-input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Lỗi lưu');
            message.success("Đã lưu thành công!");
            setMachines(prev => prev.map(m => m.id === currentMachine?.id ? {
                ...m,
                todayLog: {
                    id: m.todayLog?.id ?? 0,
                    finalOutput: calculatedOutput,
                    startIndex: payload.startIndex,
                    endIndex: payload.endIndex,
                    inputNE: payload.inputNE,
                    note: payload.note,
                }
            } : m));

            if (saveAndNext) {
                const idx = machines.findIndex(m => m.id === currentMachine?.id);
                if (idx < machines.length - 1) handleOpenMachine(machines[idx + 1]);
                else { setIsModalOpen(false); message.success("Đã nhập hết danh sách!"); }
            } else { setIsModalOpen(false); }
        } catch (e) { message.error("Lỗi khi lưu dữ liệu"); }
    };

    const userProcessIds: number[] = (session?.user as any)?.processIds || [];
    const isAdmin = session?.user?.role === "ADMIN";
    const isReadOnly = !isAdmin && (session?.user as any)?.accessLevel === "READ_ONLY";
    // Lock selectors only when user has exactly 1 process (auto-assigned). Multi-process users can switch between their own.
    const isLocked = !isAdmin && userProcessIds.length === 1;
    // Filter options for non-admin users to only their allowed factories & processes
    const visibleProcesses = isAdmin ? processes : processes.filter(p => userProcessIds.includes(p.id));
    const allowedFactoryIds = isAdmin ? null : [...new Set(visibleProcesses.map(p => p.factoryId))];
    const visibleFactories = isAdmin ? factories : factories.filter(f => allowedFactoryIds!.includes(f.id));
    const doneMachines = machines.filter(m => m.todayLog).length;

    // --- GIAO DIỆN ---
    return (
        <div style={{ padding: isMobile ? 8 : 20 }}>
            {isReadOnly && (
                <div style={{ background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8, padding: '10px 16px', marginBottom: 10, color: '#d46b08', fontWeight: 500 }}>
                    Tài khoản chỉ có quyền <b>xem</b>. Liên hệ quản trị viên để được cấp quyền nhập liệu.
                </div>
            )}

            {/* THANH BỘ LỌC */}
            <Card style={{ marginBottom: 10 }} size="small">
                <Row gutter={[8, 8]} align="middle">

                    {/* Nhà máy + Công đoạn */}
                    <Col xs={24} md={8}>
                        {!isMobile && <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 12, color: '#888' }}>Nhà máy & Công đoạn</div>}
                        <div style={{ display: 'flex', gap: 6 }}>
                            <Select
                                style={{ flex: 1, minWidth: 0 }}
                                placeholder="Nhà máy"
                                options={visibleFactories.map(f => ({ label: f.name, value: f.id }))}
                                onChange={val => { setSelectedFactoryId(val); setSelectedProcessId(null); }}
                                value={selectedFactoryId}
                                disabled={isLocked}
                            />
                            <Select
                                style={{ flex: 1, minWidth: 0 }}
                                placeholder="Công đoạn"
                                options={visibleProcesses.filter(p => p.factoryId === selectedFactoryId).map(p => ({ label: p.name, value: p.id }))}
                                onChange={setSelectedProcessId}
                                value={selectedProcessId}
                                disabled={!selectedFactoryId || isLocked}
                            />
                        </div>
                    </Col>

                    {/* Ngày + Ca */}
                    <Col xs={24} md={8}>
                        {!isMobile && <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 12, color: '#888' }}>Ngày & Ca sản xuất</div>}
                        <div style={{ display: 'flex', gap: 6 }}>
                            <DatePicker
                                value={selectedDate}
                                onChange={val => val && setSelectedDate(val)}
                                format="DD/MM/YYYY"
                                allowClear={false}
                                style={{ flex: 1 }}
                            />
                            <Select
                                value={selectedShift}
                                onChange={setSelectedShift}
                                style={{ width: 80 }}
                                options={[{ label: 'Ca 1', value: 1 }, { label: 'Ca 2', value: 2 }, { label: 'Ca 3', value: 3 }]}
                            />
                        </div>
                    </Col>

                    {/* Thống kê */}
                    <Col xs={24} md={8}>
                        <Row
                            justify={isMobile ? 'space-around' : 'end'}
                            gutter={isMobile ? 0 : 32}
                            style={isMobile ? { borderTop: '1px solid #f0f0f0', paddingTop: 8 } : {}}
                        >
                            <Col>
                                <Statistic
                                    title="Tiến độ nhập liệu"
                                    value={doneMachines}
                                    suffix={`/ ${machines.length} máy`}
                                    valueStyle={{ fontSize: isMobile ? 16 : 20, color: '#1890ff' }}
                                />
                            </Col>
                            <Col>
                                <Statistic
                                    title="Tổng sản lượng"
                                    value={totalOutput}
                                    suffix="kg"
                                    valueStyle={{ fontSize: isMobile ? 16 : 20, color: '#389e0d' }}
                                />
                            </Col>
                        </Row>
                    </Col>
                </Row>
            </Card>

            {/* LƯỚI MÁY */}
            {!selectedProcessId ? (
                <div style={{ textAlign: 'center', padding: 40, background: '#fff', borderRadius: 8 }}>
                    <div style={{ color: '#999' }}>Vui lòng chọn <b>Nhà máy</b> và <b>Công đoạn</b> để hiển thị danh sách máy.</div>
                </div>
            ) : (
                <Row gutter={[8, 8]}>
                    {machines.length === 0 && !loading && (
                        <div style={{ width: '100%', textAlign: 'center', padding: 20 }}>Không có máy nào trong công đoạn này.</div>
                    )}
                    {machines.map(m => {
                        const isDone = !!m.todayLog;
                        return (
                            <Col key={m.id} xs={12} sm={8} md={6} lg={4}>
                                <Card
                                    hoverable={!isReadOnly}
                                    onClick={() => !isReadOnly && handleOpenMachine(m)}
                                    style={{
                                        cursor: isReadOnly ? 'default' : 'pointer',
                                        border: isDone ? '2px solid #52c41a' : '1px solid #d9d9d9',
                                        background: isDone ? '#f6ffed' : '#fff',
                                        opacity: isReadOnly ? 0.8 : 1,
                                    }}
                                    bodyStyle={{ padding: isMobile ? 10 : 12 }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <b style={{ fontSize: isMobile ? 13 : 14 }}>{m.name}</b>
                                        {isDone && <SaveOutlined style={{ color: '#52c41a', flexShrink: 0 }} />}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#666', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {m.currentItem?.name || <span style={{ color: 'red' }}>Chưa gán hàng</span>}
                                    </div>
                                    <div style={{ marginTop: 6, textAlign: 'right', fontWeight: 'bold', fontSize: isMobile ? 15 : 16 }}>
                                        {isDone
                                            ? <span style={{ color: 'green' }}>{m.todayLog?.finalOutput} <small>kg</small></span>
                                            : <span style={{ color: '#ccc' }}>--</span>
                                        }
                                    </div>
                                </Card>
                            </Col>
                        );
                    })}
                </Row>
            )}

            {/* MODAL NHẬP LIỆU */}
            <Modal
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
                width={isMobile ? '96vw' : 500}
                style={isMobile ? { top: 8 } : undefined}
                centered={!isMobile}
                title={
                    <span style={{ fontSize: isMobile ? 14 : 16 }}>
                        {currentMachine?.name} <Tag color="blue">{currentMachine?.currentItem?.name}</Tag>
                    </span>
                }
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="itemId" hidden><Input /></Form.Item>

                    {/* Switches trạng thái máy */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, background: '#f5f5f5', padding: '10px 14px', borderRadius: 8 }}>
                        <Form.Item name="isStopped" valuePropName="checked" noStyle>
                            <Switch checkedChildren="Máy dừng" unCheckedChildren="Máy đang chạy" />
                        </Form.Item>
                        <Form.Item name="isReset" valuePropName="checked" noStyle>
                            <Switch
                                checkedChildren="Đã Reset"
                                unCheckedChildren="Bình thường"
                                disabled={watchIsStopped}
                                style={{ background: watchIsReset ? '#faad14' : undefined }}
                            />
                        </Form.Item>
                    </div>

                    {/* Chỉ số */}
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="startIndex" label="Chỉ số TRƯỚC">
                                <InputNumber
                                    style={{ width: '100%', fontSize: isMobile ? 18 : 14 }}
                                    readOnly={!watchIsReset && !form.getFieldValue('isNewMachine')}
                                    variant="filled"
                                    disabled={watchIsStopped}
                                    controls={false}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="endIndex" label="Chỉ số SAU" rules={[{ required: !watchIsStopped, message: 'Nhập chỉ số!' }]}>
                                <InputNumber
                                    ref={inputRef}
                                    style={{ width: '100%', fontWeight: 'bold', fontSize: isMobile ? 22 : 16 }}
                                    onPressEnter={() => handleSave(true)}
                                    disabled={watchIsStopped}
                                    controls={false}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* NE */}
                    {(currentMachine?.formulaType === 3 || currentMachine?.formulaType === 4) && (
                        <Form.Item name="inputNE" label="Chi số (NE) thực tế">
                            <InputNumber
                                style={{ width: '100%', fontSize: isMobile ? 18 : 14 }}
                                disabled={watchIsStopped}
                                controls={false}
                            />
                        </Form.Item>
                    )}

                    {/* Kết quả tính toán */}
                    <div style={{
                        textAlign: 'center',
                        padding: isMobile ? '14px 12px' : 15,
                        background: calculatedOutput < 0 ? '#fff1f0' : '#f6ffed',
                        marginBottom: isMobile ? 14 : 20,
                        borderRadius: 10,
                        border: calculatedOutput < 0 ? '1px solid #ffccc7' : '1px solid #b7eb8f',
                    }}>
                        <div style={{ color: '#888', fontSize: 12 }}>Sản lượng ước tính</div>
                        <div style={{ fontSize: isMobile ? 38 : 28, fontWeight: 'bold', color: calculatedOutput < 0 ? 'red' : '#389e0d', lineHeight: 1.2 }}>
                            {calculatedOutput} <small style={{ fontSize: '45%', fontWeight: 'normal' }}>kg</small>
                        </div>
                    </div>

                    {/* Nút hành động */}
                    <Row gutter={8}>
                        <Col span={8}>
                            <Button block style={{ height: isMobile ? 48 : undefined }} onClick={() => setIsModalOpen(false)}>
                                Hủy
                            </Button>
                        </Col>
                        <Col span={8}>
                            <Button
                                block
                                icon={<SaveOutlined />}
                                style={{ height: isMobile ? 48 : undefined }}
                                onClick={() => handleSave(false)}
                                disabled={!watchIsStopped && calculatedOutput < 0}
                            >
                                Lưu
                            </Button>
                        </Col>
                        <Col span={8}>
                            <Button
                                block
                                type="primary"
                                icon={<ArrowRightOutlined />}
                                style={{ height: isMobile ? 48 : undefined }}
                                onClick={() => handleSave(true)}
                                disabled={!watchIsStopped && calculatedOutput < 0}
                            >
                                Lưu & Tiếp
                            </Button>
                        </Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
}
