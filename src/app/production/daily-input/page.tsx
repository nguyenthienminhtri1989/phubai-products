"use client";

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Card, Select, DatePicker, Button, Row, Col, Modal, Form, InputNumber, Switch, message, Tag, Statistic, Input } from 'antd';
import { SaveOutlined, ArrowRightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

// --- 1. ĐỊNH NGHĨA KIỂU DỮ LIỆU ---
interface Machine {
    id: number;
    name: string;
    formulaType: number; // 1,2,3,4
    processId: number;
    spindleCount?: number;
    currentItem?: { id: number; name: string };
    currentNE?: number;
    todayLog?: { id: number; finalOutput: number };
}

interface Factory { id: number; name: string; }
interface Process { id: number; name: string; factoryId: number; }

export default function DailyInputPage() {

    // --- STATE QUẢN LÝ BỘ LỌC ---
    const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
    const [selectedShift, setSelectedShift] = useState<number>(1);
    const [selectedFactoryId, setSelectedFactoryId] = useState<number | null>(null);
    const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);

    // --- STATE DỮ LIỆU ---
    const [machines, setMachines] = useState<Machine[]>([]);
    const [factories, setFactories] = useState<Factory[]>([]);
    const [processes, setProcesses] = useState<Process[]>([]);
    const [loading, setLoading] = useState(false);

    // --- STATE MODAL & FORM ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentMachine, setCurrentMachine] = useState<Machine | null>(null);
    const [form] = Form.useForm();
    const inputRef = useRef<any>(null);

    // Watch Form Values (Để tính toán realtime)
    const watchEndIndex = Form.useWatch('endIndex', form);
    const watchStartIndex = Form.useWatch('startIndex', form);
    const watchIsReset = Form.useWatch('isReset', form);
    const watchIsStopped = Form.useWatch('isStopped', form);
    const watchInputNE = Form.useWatch('inputNE', form);

    // --- 2. LOGIC TỰ ĐỘNG CHỌN CA & NGÀY (THÔNG MINH) ---
    useEffect(() => {
        const now = dayjs();
        const hour = now.hour();

        // 13:00 - 20:59 -> Ca 1 (Hôm nay)
        if (hour >= 13 && hour < 21) {
            setSelectedShift(1);
            setSelectedDate(now);
        }
        // 21:00 - 23:59 -> Ca 2 (Hôm nay)
        else if (hour >= 21) {
            setSelectedShift(2);
            setSelectedDate(now);
        }
        // 00:00 - 04:59 -> Ca 2 (Ca đêm hôm qua)
        else if (hour >= 0 && hour < 5) {
            setSelectedShift(2);
            setSelectedDate(now.subtract(1, 'day'));
        }
        // 05:00 - 12:59 -> Ca 3 (Ca đêm rạng sáng nay -> Thuộc ngày hôm qua)
        else if (hour >= 5 && hour < 13) {
            setSelectedShift(3);
            setSelectedDate(now.subtract(1, 'day'));
        }

        // Tải danh mục Nhà máy & Công đoạn ngay khi vào trang
        fetchMetadata();
    }, []);

    const fetchMetadata = async () => {
        try {
            const [resFac, resPro] = await Promise.all([fetch('/api/factories'), fetch('/api/processes')]);
            if (resFac.ok && resPro.ok) {
                setFactories(await resFac.json());
                setProcesses(await resPro.json());
            }
        } catch (e) { message.error("Lỗi tải danh mục nhà máy"); }
    };

    // --- 3. TẢI DANH SÁCH MÁY (KHI CHỌN CÔNG ĐOẠN) ---
    const fetchMachines = async () => {
        if (!selectedProcessId) return; // Chỉ tải khi đã chọn công đoạn
        setLoading(true);
        try {
            const dateStr = selectedDate.format('YYYY-MM-DD');
            const query = `?processId=${selectedProcessId}&date=${dateStr}&shift=${selectedShift}`;
            const res = await fetch(`/api/production/daily-status${query}`);
            const data = await res.json();
            setMachines(data);
        } catch (error) {
            console.error("Error fetching machines:", error);
            message.error("Lỗi tải danh sách máy");
        } finally {
            setLoading(false);
        }
    };

    // Tự động tải lại khi đổi Ngày, Ca, hoặc Công đoạn
    useEffect(() => { fetchMachines(); }, [selectedProcessId, selectedDate, selectedShift]);

    // --- 4. MỞ MODAL & AUTO-FILL CHỈ SỐ CŨ ---
    const handleOpenMachine = async (machine: Machine) => {
        if (!machine.currentItem) {
            message.warning(`Máy ${machine.name} chưa được gán mặt hàng! Vui lòng gán trước.`);
            return;
        }

        setCurrentMachine(machine);
        form.resetFields();

        const initValues: any = {
            isReset: false,
            isStopped: false,
            inputNE: machine.currentNE || 30,
            itemId: machine.currentItem?.id,
            itemName: machine.currentItem?.name,
            startIndex: 0,
            endIndex: null
        };

        if (machine.todayLog) {
            // Nếu đã nhập hôm nay -> Load lại (Logic mở rộng sau này)
            message.info("Máy này đã nhập liệu rồi.");
            // Nếu muốn cho sửa lại thì cần logic load detail ở đây
        } else {
            // TÌM BẢN GHI CŨ NHẤT ĐỂ LẤY CHỈ SỐ CUỐI -> LÀM CHỈ SỐ ĐẦU
            try {
                const res = await fetch(`/api/production/last-log?machineId=${machine.id}&date=${selectedDate.format('YYYY-MM-DD')}&shift=${selectedShift}`);
                const lastLog = await res.json();

                if (lastLog && lastLog.endIndex !== undefined) {
                    initValues.startIndex = lastLog.endIndex;
                } else {
                    initValues.isNewMachine = true; // Máy mới tinh -> Cho nhập tay
                }
            } catch (e) { console.error(e); }
        }

        form.setFieldsValue(initValues);
        setIsModalOpen(true);
        // Focus vào ô nhập sau 100ms
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    // --- 5. TÍNH TOÁN SẢN LƯỢNG REAL-TIME ---
    const calculatedOutput = useMemo(() => {
        if (!currentMachine || watchIsStopped) return 0;

        const start = Number(watchStartIndex) || 0;
        const end = Number(watchEndIndex);

        // Nếu chưa nhập số cuối hoặc để trống
        if (watchEndIndex === null || watchEndIndex === undefined) return 0;

        let delta = 0;
        // Nếu Reset -> Tính từ 0 lên End. Nếu không -> End - Start
        if (watchIsReset) delta = end;
        else delta = end - start;

        // Công thức
        const type = currentMachine.formulaType;
        let result = 0;

        if (type === 1) result = end; // Loại 1: Sản lượng trực tiếp
        else if (type === 2) result = delta; // Loại 2: Trừ lùi
        else if (type === 3) { // Loại 3: Máy sợi con
            const ne = Number(watchInputNE) || 1;
            const spindles = currentMachine.spindleCount || 1;
            const denominator = ne * 1000 * 1.693;
            if (denominator !== 0) result = (delta * spindles) / denominator;
        } else if (type === 4) { // Loại 4: Chia chi số
            const ne = Number(watchInputNE) || 1;
            if (ne !== 0) result = delta / ne;
        }

        return parseFloat(result.toFixed(2));
    }, [watchEndIndex, watchStartIndex, watchIsReset, watchIsStopped, watchInputNE, currentMachine]);

    // --- 6. XỬ LÝ LƯU (CÓ CẢNH BÁO) ---
    const handleSave = async (saveAndNext: boolean) => {
        try {
            const values = await form.validateFields();

            // A. Check SỐ ÂM
            if (calculatedOutput < 0 && !values.isReset && !values.isStopped) {
                Modal.error({
                    title: 'Lỗi số liệu!',
                    content: 'Sản lượng bị ÂM. Có phải đồng hồ đã bị Reset về 0? Hãy tích vào ô "Đã Reset/Thay đồng hồ".',
                });
                return;
            }

            // B. Check SỐ QUÁ LỚN (Sanity Check)
            if (calculatedOutput > 1000) {
                Modal.confirm({
                    title: 'Cảnh báo số liệu lớn',
                    content: `Sản lượng ${calculatedOutput} kg là rất lớn. Bạn có chắc chắn nhập đúng không?`,
                    onOk: () => submitData(values, saveAndNext),
                });
                return;
            }

            await submitData(values, saveAndNext);

        } catch (e) { /* Validate form fail */ }
    };

    const submitData = async (values: any, saveAndNext: boolean) => {
        try {
            const payload = {
                recordDate: selectedDate.format('YYYY-MM-DD'),
                shift: selectedShift,
                machineId: currentMachine?.id,
                itemId: values.itemId,
                startIndex: values.startIndex, // Lưu chỉ số đầu
                endIndex: values.endIndex,     // Lưu chỉ số cuối
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

            // Cập nhật UI ngay lập tức (Đổi màu thẻ máy)
            setMachines(prev => prev.map(m =>
                m.id === currentMachine?.id ? { ...m, todayLog: { id: 0, finalOutput: calculatedOutput } } : m
            ));

            if (saveAndNext) {
                // Tìm máy tiếp theo để mở luôn
                const idx = machines.findIndex(m => m.id === currentMachine?.id);
                if (idx < machines.length - 1) handleOpenMachine(machines[idx + 1]);
                else { setIsModalOpen(false); message.success("Đã nhập hết danh sách!"); }
            } else {
                setIsModalOpen(false);
            }
        } catch (e) { message.error("Lỗi khi lưu dữ liệu"); }
    };

    // --- GIAO DIỆN ---
    return (
        <div style={{ padding: 20 }}>
            {/* 1. THANH CÔNG CỤ (FILTERS) - ĐÃ CÓ ĐẦY ĐỦ NHÀ MÁY & CÔNG ĐOẠN */}
            <Card style={{ marginBottom: 16 }} size="small">
                <Row gutter={16} align="middle">
                    {/* Cột 1: Chọn Nhà máy & Công đoạn */}
                    <Col span={8}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Nhà máy & Công đoạn:</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Select
                                style={{ width: '50%' }}
                                placeholder="Chọn Nhà máy"
                                options={factories.map(f => ({ label: f.name, value: f.id }))}
                                onChange={val => { setSelectedFactoryId(val); setSelectedProcessId(null); }}
                                value={selectedFactoryId}
                            />
                            <Select
                                style={{ width: '50%' }}
                                placeholder="Chọn Công đoạn"
                                options={processes.filter(p => p.factoryId === selectedFactoryId).map(p => ({ label: p.name, value: p.id }))}
                                onChange={setSelectedProcessId}
                                value={selectedProcessId}
                                disabled={!selectedFactoryId} // Khóa nếu chưa chọn nhà máy
                            />
                        </div>
                    </Col>

                    {/* Cột 2: Chọn Ngày & Ca */}
                    <Col span={8}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Ngày & Ca sản xuất:</div>
                        <div style={{ display: 'flex', gap: 8 }}>
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
                                style={{ width: 100 }}
                                options={[{ label: 'Ca 1', value: 1 }, { label: 'Ca 2', value: 2 }, { label: 'Ca 3', value: 3 }]}
                            />
                        </div>
                    </Col>

                    {/* Cột 3: Thống kê */}
                    <Col span={8} style={{ textAlign: 'right' }}>
                        <Statistic
                            title="Tiến độ nhập liệu"
                            value={machines.filter(m => m.todayLog).length}
                            suffix={`/ ${machines.length} máy`}
                            valueStyle={{ fontSize: 20, color: '#1890ff' }}
                        />
                    </Col>
                </Row>
            </Card>

            {/* 2. LƯỚI MÁY (GRID) */}
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
                                <Card
                                    hoverable
                                    onClick={() => handleOpenMachine(m)}
                                    style={{
                                        cursor: 'pointer',
                                        border: isDone ? '2px solid #52c41a' : '1px solid #d9d9d9',
                                        background: isDone ? '#f6ffed' : '#fff'
                                    }}
                                    bodyStyle={{ padding: 12 }}
                                >
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

            {/* 3. MODAL NHẬP LIỆU */}
            <Modal
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
                width={500}
                centered
                title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingRight: 30 }}>
                        <span>{currentMachine?.name} <Tag color="blue">{currentMachine?.currentItem?.name}</Tag></span>
                    </div>
                }
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="itemId" hidden><Input /></Form.Item>

                    {/* Switch Trạng thái */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, background: '#f5f5f5', padding: 10, borderRadius: 6 }}>
                        <Form.Item name="isStopped" valuePropName="checked" noStyle>
                            <Switch checkedChildren="Máy dừng" unCheckedChildren="Máy đang chạy" />
                        </Form.Item>
                        <Form.Item name="isReset" valuePropName="checked" noStyle>
                            <Switch checkedChildren="Đã Reset/Thay đồng hồ" unCheckedChildren="Đồng hồ bình thường" disabled={watchIsStopped} style={{ background: watchIsReset ? '#faad14' : undefined }} />
                        </Form.Item>
                    </div>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="startIndex" label="Chỉ số TRƯỚC (Ca trước)">
                                {/* ReadOnly trừ khi là máy mới hoặc Reset */}
                                <InputNumber style={{ width: '100%' }} readOnly={!watchIsReset && !form.getFieldValue('isNewMachine')} variant="filled" disabled={watchIsStopped} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="endIndex" label="Chỉ số SAU (Hiện tại)" rules={[{ required: !watchIsStopped, message: 'Nhập chỉ số!' }]}>
                                <InputNumber ref={inputRef} style={{ width: '100%', fontWeight: 'bold', fontSize: 16 }} onPressEnter={() => handleSave(true)} disabled={watchIsStopped} />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Nhập Chi số thực tế nếu là loại 3,4 */}
                    {(currentMachine?.formulaType === 3 || currentMachine?.formulaType === 4) && (
                        <Form.Item name="inputNE" label="Chi số (NE) thực tế">
                            <InputNumber style={{ width: '100%' }} disabled={watchIsStopped} />
                        </Form.Item>
                    )}

                    {/* Kết quả tính toán */}
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