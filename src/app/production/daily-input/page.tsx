"use client";

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Card, Select, DatePicker, Button, Row, Col, Modal, Form, InputNumber, Switch, message, Tag, Statistic, Input } from 'antd';
import { SaveOutlined, ArrowRightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useSession } from "next-auth/react"; // 1. IMPORT SESSION

interface Machine {
    id: number;
    name: string;
    formulaType: number;
    processId: number;
    spindleCount?: number;
    currentItem?: { id: number; name: string };
    currentNE?: number;
    todayLog?: { id: number; finalOutput: number };
}

interface Factory { id: number; name: string; }
interface Process { id: number; name: string; factoryId: number; }

export default function DailyInputPage() {
    // 2. LẤY THÔNG TIN USER
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

    // --- 3. LOGIC TỰ ĐỘNG CHỌN NHÀ MÁY & CÔNG ĐOẠN THEO USER ---
    useEffect(() => {
        // Chỉ chạy khi đã tải xong danh mục VÀ đã có session
        if (processes.length > 0 && session?.user?.processId) {
            const userProcessId = Number(session.user.processId);

            // Tìm công đoạn của user trong danh sách
            const targetProcess = processes.find(p => p.id === userProcessId);

            if (targetProcess) {
                // Tự động set Factory trước
                setSelectedFactoryId(targetProcess.factoryId);
                // Sau đó set Process
                setSelectedProcessId(targetProcess.id);
            }
        }
    }, [processes, session]); // Chạy lại khi processes hoặc session thay đổi

    // --- TẢI MÁY ---
    const fetchMachines = async () => {
        if (!selectedProcessId) return;
        setLoading(true);
        try {
            const dateStr = selectedDate.format('YYYY-MM-DD');
            const query = `?processId=${selectedProcessId}&date=${dateStr}&shift=${selectedShift}`;
            const res = await fetch(`/api/production/daily-status${query}`);
            const data = await res.json();
            setMachines(data);
        } catch (error) {
            message.error("Lỗi tải máy");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchMachines(); }, [selectedProcessId, selectedDate, selectedShift]);

    // --- CÁC HÀM XỬ LÝ KHÁC GIỮ NGUYÊN ---
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
            message.info("Máy này đã nhập liệu rồi.");
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
        return parseFloat(result.toFixed(2));
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
            setMachines(prev => prev.map(m => m.id === currentMachine?.id ? { ...m, todayLog: { id: 0, finalOutput: calculatedOutput } } : m));

            if (saveAndNext) {
                const idx = machines.findIndex(m => m.id === currentMachine?.id);
                if (idx < machines.length - 1) handleOpenMachine(machines[idx + 1]);
                else { setIsModalOpen(false); message.success("Đã nhập hết danh sách!"); }
            } else { setIsModalOpen(false); }
        } catch (e) { message.error("Lỗi khi lưu dữ liệu"); }
    };

    // 1. Xác định xem có nên khóa hay không?
    const isRestrictedUser = session?.user?.role !== "ADMIN" && !!session?.user?.processId;

    // --- GIAO DIỆN ---
    return (
        <div style={{ padding: 20 }}>
            <Card style={{ marginBottom: 16 }} size="small">
                <Row gutter={16} align="middle">
                    <Col span={8}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Nhà máy & Công đoạn:</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Select
                                style={{ width: '50%' }}
                                placeholder="Chọn Nhà máy"
                                options={factories.map(f => ({ label: f.name, value: f.id }))}
                                onChange={val => { setSelectedFactoryId(val); setSelectedProcessId(null); }}
                                value={selectedFactoryId}
                                // KHÓA NHÀ MÁY NẾU USER BỊ GIỚI HẠN
                                disabled={isRestrictedUser}
                            />
                            <Select
                                style={{ width: '50%' }}
                                placeholder="Chọn Công đoạn"
                                options={processes.filter(p => p.factoryId === selectedFactoryId).map(p => ({ label: p.name, value: p.id }))}
                                onChange={setSelectedProcessId}
                                // KHÓA CÔNG ĐOẠN NẾU USER BỊ GIỚI HẠN (Hoặc chưa chọn nhà máy)
                                disabled={!selectedFactoryId || isRestrictedUser}
                            />
                        </div>
                    </Col>
                    <Col span={8}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Ngày & Ca sản xuất:</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <DatePicker value={selectedDate} onChange={val => val && setSelectedDate(val)} format="DD/MM/YYYY" allowClear={false} style={{ flex: 1 }} />
                            <Select value={selectedShift} onChange={setSelectedShift} style={{ width: 100 }} options={[{ label: 'Ca 1', value: 1 }, { label: 'Ca 2', value: 2 }, { label: 'Ca 3', value: 3 }]} />
                        </div>
                    </Col>
                    <Col span={8} style={{ textAlign: 'right' }}>
                        <Statistic title="Tiến độ nhập liệu" value={machines.filter(m => m.todayLog).length} suffix={`/ ${machines.length} máy`} valueStyle={{ fontSize: 20, color: '#1890ff' }} />
                    </Col>
                </Row>
            </Card>

            {!selectedProcessId ? (
                <div style={{ textAlign: 'center', padding: 50, background: '#fff', borderRadius: 8 }}>
                    <div style={{ color: '#999', marginBottom: 10 }}>Vui lòng chọn <b>Nhà máy</b> và <b>Công đoạn</b> để hiển thị danh sách máy.</div>
                </div>
            ) : (
                <Row gutter={[12, 12]}>
                    {machines.length === 0 && <div style={{ width: '100%', textAlign: 'center', padding: 20 }}>Không có máy nào trong công đoạn này.</div>}
                    {machines.map(m => {
                        const isDone = !!m.todayLog;
                        return (
                            <Col key={m.id} xs={12} sm={8} md={6} lg={4}>
                                <Card hoverable onClick={() => handleOpenMachine(m)} style={{ cursor: 'pointer', border: isDone ? '2px solid #52c41a' : '1px solid #d9d9d9', background: isDone ? '#f6ffed' : '#fff' }} bodyStyle={{ padding: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <b>{m.name}</b>
                                        {isDone && <SaveOutlined style={{ color: '#52c41a' }} />}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                        {m.currentItem?.name || <span style={{ color: 'red' }}>Chưa gán hàng</span>}
                                    </div>
                                    <div style={{ marginTop: 8, textAlign: 'right', fontWeight: 'bold', fontSize: 16 }}>
                                        {isDone ? <span style={{ color: 'green' }}>{m.todayLog?.finalOutput} <small>kg</small></span> : <span style={{ color: '#ccc' }}>--</span>}
                                    </div>
                                </Card>
                            </Col>
                        )
                    })}
                </Row>
            )}

            <Modal open={isModalOpen} onCancel={() => setIsModalOpen(false)} footer={null} width={500} centered title={<span>{currentMachine?.name} <Tag color="blue">{currentMachine?.currentItem?.name}</Tag></span>}>
                <Form form={form} layout="vertical">
                    <Form.Item name="itemId" hidden><Input /></Form.Item>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, background: '#f5f5f5', padding: 10, borderRadius: 6 }}>
                        <Form.Item name="isStopped" valuePropName="checked" noStyle><Switch checkedChildren="Máy dừng" unCheckedChildren="Máy đang chạy" /></Form.Item>
                        <Form.Item name="isReset" valuePropName="checked" noStyle><Switch checkedChildren="Đã Reset" unCheckedChildren="Bình thường" disabled={watchIsStopped} style={{ background: watchIsReset ? '#faad14' : undefined }} /></Form.Item>
                    </div>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="startIndex" label="Chỉ số TRƯỚC">
                                <InputNumber style={{ width: '100%' }} readOnly={!watchIsReset && !form.getFieldValue('isNewMachine')} variant="filled" disabled={watchIsStopped} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="endIndex" label="Chỉ số SAU" rules={[{ required: !watchIsStopped, message: 'Nhập chỉ số!' }]}>
                                <InputNumber ref={inputRef} style={{ width: '100%', fontWeight: 'bold', fontSize: 16 }} onPressEnter={() => handleSave(true)} disabled={watchIsStopped} />
                            </Form.Item>
                        </Col>
                    </Row>
                    {(currentMachine?.formulaType === 3 || currentMachine?.formulaType === 4) && (
                        <Form.Item name="inputNE" label="Chi số (NE) thực tế">
                            <InputNumber style={{ width: '100%' }} disabled={watchIsStopped} />
                        </Form.Item>
                    )}
                    <div style={{ textAlign: 'center', padding: 15, background: calculatedOutput < 0 ? '#fff1f0' : '#f6ffed', marginBottom: 20, borderRadius: 8, border: calculatedOutput < 0 ? '1px solid #ffccc7' : '1px solid #b7eb8f' }}>
                        <div style={{ color: '#666', fontSize: 12 }}>Sản lượng ước tính:</div>
                        <div style={{ fontSize: 28, fontWeight: 'bold', color: calculatedOutput < 0 ? 'red' : '#389e0d' }}>
                            {calculatedOutput} <small>kg</small>
                        </div>
                    </div>
                    <Row gutter={16}>
                        <Col span={8}><Button block onClick={() => setIsModalOpen(false)}>Hủy</Button></Col>
                        <Col span={8}><Button block icon={<SaveOutlined />} onClick={() => handleSave(false)} disabled={!watchIsStopped && calculatedOutput < 0}>Lưu</Button></Col>
                        <Col span={8}><Button block type="primary" icon={<ArrowRightOutlined />} onClick={() => handleSave(true)} disabled={!watchIsStopped && calculatedOutput < 0}>Lưu & Tiếp</Button></Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
}