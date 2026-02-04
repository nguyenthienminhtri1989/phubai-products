"use client";

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Card, Select, DatePicker, Button, Row, Col, Modal, Form, InputNumber, Switch, message, Tag, Statistic, Alert, Input } from 'antd';
import { SaveOutlined, ArrowRightOutlined, HistoryOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useSession } from "next-auth/react";

// --- 1. ĐỊNH NGHĨA KIỂU DỮ LIỆU ---
interface Machine {
    id: number;
    name: string;
    formulaType: number; // 1,2,3,4
    processId: number;
    spindleCount?: number; // Cho loại 3
    currentItem?: { id: number; name: string };
    currentNE?: number; // Cho loại 3,4
    // Dữ liệu tạm để hiển thị trạng thái trên lưới
    lastLog?: { endIndex: number };
    todayLog?: { id: number; finalOutput: number }; // Nếu đã nhập hôm nay
}

interface Factory { id: number; name: string; }
interface Process { id: number; name: string; factoryId: number; }

export default function DailyInputPage() {

    // --- 2. STATE QUẢN LÝ BỘ LỌC ---
    const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
    const [selectedShift, setSelectedShift] = useState<number>(1);
    const [selectedFactoryId, setSelectedFactoryId] = useState<number | null>(null);
    const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);

    // --- 3. STATE DỮ LIỆU ---
    const [machines, setMachines] = useState<Machine[]>([]);
    const [factories, setFactories] = useState<Factory[]>([]);
    const [processes, setProcesses] = useState<Process[]>([]);
    const [loading, setLoading] = useState(false);

    // --- 4. STATE MODAL NHẬP LIỆU ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentMachine, setCurrentMachine] = useState<Machine | null>(null);
    const [form] = Form.useForm();

    // Các biến theo dõi giá trị trong form để tính toán realtime
    const watchEndIndex = Form.useWatch('endIndex', form);
    const watchStartIndex = Form.useWatch('startIndex', form);
    const watchIsReset = Form.useWatch('isReset', form);
    const watchIsStopped = Form.useWatch('isStopped', form);
    const watchInputNE = Form.useWatch('inputNE', form);

    // Ref để focus vào ô nhập
    const inputRef = useRef<any>(null);

    // --- 5. LOGIC KHỞI TẠO NGÀY GIỜ THÔNG MINH (SỚM 1 TIẾNG) ---
    useEffect(() => {
        const hour = dayjs().hour();
        // 05:00 - 12:59 -> Ca 3 ngày hôm qua
        if (hour >= 5 && hour < 13) {
            setSelectedShift(3);
            setSelectedDate(dayjs().subtract(1, 'day'));
        }
        // 13:00 - 20:59 -> Ca 1 ngày hôm nay
        else if (hour >= 13 && hour < 21) {
            setSelectedShift(1);
            setSelectedDate(dayjs());
        }
        // 21:00 - 04:59 -> Ca 2 ngày hôm nay (Lưu ý: 21h-23h là hôm nay, 0h-4h là hôm nay)
        else {
            setSelectedShift(2);
            setSelectedDate(dayjs()); // 21h đêm nay vẫn là ngày hôm nay
        }

        // Tải danh mục Factory/Process lần đầu
        fetchMetadata();
    }, []);

    const fetchMetadata = async () => {
        const [resFac, resPro] = await Promise.all([fetch('/api/factories'), fetch('/api/processes')]);
        setFactories(await resFac.json());
        setProcesses(await resPro.json());
    };

    // --- 6. TẢI DANH SÁCH MÁY & TRẠNG THÁI ---
    const fetchMachines = async () => {
        if (!selectedProcessId) return;
        setLoading(true);
        try {
            // Gửi kèm Date & Shift để server check xem máy nào đã nhập rồi
            const dateStr = selectedDate.format('YYYY-MM-DD');
            const query = `?processId=${selectedProcessId}&date=${dateStr}&shift=${selectedShift}`;
            const res = await fetch(`/api/production/daily-status${query}`); // API này ta sẽ viết sau
            const data = await res.json();
            setMachines(data);
        } catch (error) {
            message.error("Lỗi tải danh sách máy");
        } finally {
            setLoading(false);
        }
    };

    // Tự động tải lại khi đổi bộ lọc
    useEffect(() => { fetchMachines(); }, [selectedProcessId, selectedDate, selectedShift]);

    // --- 7. MỞ MODAL NHẬP LIỆU ---
    const handleOpenMachine = async (machine: Machine) => {
        // --- THÊM ĐOẠN NÀY ---
        if (!machine.currentItem) {
            message.warning(`Máy ${machine.name} chưa được gán mặt hàng! Vui lòng gán mặt hàng trước.`);
            // Tùy chọn: Có thể return luôn để không cho mở modal
            // return; 
        }
        // --------------------

        setCurrentMachine(machine);
        form.resetFields();

        // Giá trị mặc định
        const initValues: any = {
            startIndex: 0, // Mặc định 0, sẽ fetch sau
            endIndex: null,
            isReset: false,
            isStopped: false,
            // Lấy từ cấu hình máy (Auto-fill)
            inputNE: machine.currentNE || 30, // Default tạm nếu chưa có
            itemId: machine.currentItem?.id,
            itemName: machine.currentItem?.name // Chỉ để hiện, ko submit
        };

        // Nếu đã nhập hôm nay rồi (Sửa lại)
        if (machine.todayLog) {
            // Logic load dữ liệu cũ để sửa... (Ta làm sau cho đơn giản)
            message.info("Đang mở chế độ chỉnh sửa");
        } else {
            // --- LOGIC QUAN TRỌNG: LẤY CHỈ SỐ TRƯỚC ---
            // Gọi API lấy bản ghi gần nhất của máy này
            try {
                const res = await fetch(`/api/production/last-log?machineId=${machine.id}&date=${selectedDate.format('YYYY-MM-DD')}&shift=${selectedShift}`);
                const lastLog = await res.json();

                if (lastLog && lastLog.endIndex !== undefined) {
                    initValues.startIndex = lastLog.endIndex;
                } else {
                    // Máy mới chưa có lịch sử -> Cho phép nhập tay startIndex
                    // Ta dùng 1 cờ hiệu để UI biết mà mở khóa ô input
                    initValues.isNewMachine = true;
                }
            } catch (e) { console.error(e); }
        }

        form.setFieldsValue(initValues);
        setIsModalOpen(true);

        // Focus vào ô endIndex sau 100ms
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    // --- 8. LOGIC TÍNH TOÁN SẢN LƯỢNG (REAL-TIME) ---
    const calculatedOutput = useMemo(() => {
        if (!currentMachine) return 0;

        // Nếu máy dừng -> Sản lượng 0
        if (watchIsStopped) return 0;

        const start = Number(watchStartIndex) || 0;
        const end = Number(watchEndIndex) || 0;

        // Nếu chưa nhập số cuối -> 0
        if (watchEndIndex === null || watchEndIndex === undefined) return 0;

        // Logic Delta (Chênh lệch)
        let delta = 0;
        if (watchIsReset) {
            delta = end; // Nếu reset, coi như chạy từ 0 đến End
        } else {
            delta = end - start;
        }

        // Nếu âm (và không reset) -> Trả về âm để UI cảnh báo
        if (delta < 0) return delta;

        // ÁP DỤNG CÔNG THỨC
        const type = currentMachine.formulaType;
        let result = 0;

        if (type === 1) {
            result = end; // Nhập thẳng (Với loại 1, ô EndIndex chính là sản lượng)
        } else if (type === 2) {
            result = delta; // Trừ lùi
        } else if (type === 3) {
            // ((Cuối - Đầu) * Số cọc) / (Chi số * 1000 * 1.693)
            const ne = Number(watchInputNE) || 1;
            const spindles = currentMachine.spindleCount || 1;
            const denominator = ne * 1000 * 1.693;
            if (denominator !== 0) {
                result = (delta * spindles) / denominator;
            }
        } else if (type === 4) {
            // (Cuối - Đầu) / Chi số
            const ne = Number(watchInputNE) || 1;
            if (ne !== 0) result = delta / ne;
        }

        return parseFloat(result.toFixed(2)); // Làm tròn 2 số thập phân
    }, [watchEndIndex, watchStartIndex, watchIsReset, watchIsStopped, watchInputNE, currentMachine]);

    // --- 9. LƯU DỮ LIỆU ---
    const handleSave = async (saveAndNext: boolean) => {
        try {
            const values = await form.validateFields();

            // Kiểm tra logic an toàn
            if (calculatedOutput < 0 && !values.isReset && !values.isStopped) {
                message.error("Sản lượng bị ÂM. Vui lòng kiểm tra lại hoặc tích 'Reset đồng hồ'");
                return;
            }

            // Gửi API
            const payload = {
                recordDate: selectedDate.format('YYYY-MM-DD'),
                shift: selectedShift,
                machineId: currentMachine?.id,
                itemId: values.itemId, // ID mặt hàng đang chạy (lấy từ form hidden)
                endIndex: values.endIndex,
                inputNE: values.inputNE,
                finalOutput: calculatedOutput,
                note: values.isStopped ? "Máy dừng" : (values.isReset ? "Reset đồng hồ" : "")
            };

            const res = await fetch('/api/production/daily-input', { // API Save
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Lỗi lưu');

            message.success("Đã lưu!");

            // Cập nhật lại trạng thái máy trong list (để đổi màu xanh)
            setMachines(prev => prev.map(m =>
                m.id === currentMachine?.id
                    ? { ...m, todayLog: { id: 0, finalOutput: calculatedOutput } }
                    : m
            ));

            if (saveAndNext) {
                // Tìm máy tiếp theo trong list
                const currentIndex = machines.findIndex(m => m.id === currentMachine?.id);
                if (currentIndex < machines.length - 1) {
                    handleOpenMachine(machines[currentIndex + 1]); // Mở máy kế tiếp
                } else {
                    setIsModalOpen(false);
                    message.success("Đã nhập hết danh sách!");
                }
            } else {
                setIsModalOpen(false);
            }

        } catch (e) {
            message.error("Có lỗi xảy ra");
        }
    };

    // --- GIAO DIỆN ---
    return (
        <div style={{ padding: 20 }}>
            {/* 1. THANH CÔNG CỤ (FILTERS) */}
            <Card style={{ marginBottom: 16 }} size="small">
                <Row gutter={16} align="middle">
                    <Col span={6}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Nhà máy & Công đoạn:</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Select
                                style={{ width: '50%' }} placeholder="Nhà máy"
                                options={factories.map(f => ({ label: f.name, value: f.id }))}
                                onChange={val => { setSelectedFactoryId(val); setSelectedProcessId(null); }}
                            />
                            <Select
                                style={{ width: '50%' }} placeholder="Công đoạn"
                                options={processes.filter(p => p.factoryId === selectedFactoryId).map(p => ({ label: p.name, value: p.id }))}
                                onChange={setSelectedProcessId}
                                value={selectedProcessId}
                            />
                        </div>
                    </Col>
                    <Col span={6}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Ngày & Ca sản xuất:</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <DatePicker
                                value={selectedDate}
                                onChange={val => val && setSelectedDate(val)}
                                format="DD/MM/YYYY" style={{ flex: 1 }}
                                allowClear={false}
                            />
                            <Select
                                value={selectedShift}
                                onChange={setSelectedShift}
                                style={{ width: 80 }}
                                options={[{ label: 'Ca 1', value: 1 }, { label: 'Ca 2', value: 2 }, { label: 'Ca 3', value: 3 }]}
                            />
                        </div>
                    </Col>
                    <Col span={12} style={{ textAlign: 'right' }}>
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
                <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Vui lòng chọn Công đoạn để bắt đầu</div>
            ) : (
                <Row gutter={[12, 12]}>
                    {machines.map(machine => {
                        const isDone = !!machine.todayLog;
                        return (
                            <Col xs={12} sm={8} md={6} lg={4} key={machine.id}>
                                <Card
                                    hoverable
                                    onClick={() => handleOpenMachine(machine)}
                                    style={{
                                        cursor: 'pointer',
                                        border: isDone ? '2px solid #52c41a' : '1px solid #d9d9d9',
                                        background: isDone ? '#f6ffed' : '#fff'
                                    }}
                                    bodyStyle={{ padding: 12 }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <b>{machine.name}</b>
                                        {isDone && <SaveOutlined style={{ color: '#52c41a' }} />}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#666', marginTop: 4, height: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {machine.currentItem?.name || '-'}
                                    </div>

                                    <div style={{ marginTop: 8, textAlign: 'right' }}>
                                        {isDone ? (
                                            <b style={{ fontSize: 18, color: '#52c41a' }}>{machine.todayLog?.finalOutput} <small>kg</small></b>
                                        ) : (
                                            <span style={{ color: '#ccc' }}>Chưa nhập</span>
                                        )}
                                    </div>
                                </Card>
                            </Col>
                        )
                    })}
                </Row>
            )}

            {/* 3. MODAL NHẬP LIỆU (TRÁI TIM CỦA TRANG) */}
            <Modal
                title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 30 }}>
                        <span>
                            {currentMachine?.name}
                            <Tag style={{ marginLeft: 8 }} color="blue">{currentMachine?.currentItem?.name}</Tag>
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 'normal', color: '#888' }}>
                            Công thức loại: {currentMachine?.formulaType}
                        </span>
                    </div>
                }
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
                width={500}
                centered
            >
                <Form form={form} layout="vertical">
                    {/* Trường ẩn lưu ID mặt hàng */}
                    <Form.Item name="itemId" hidden><Input /></Form.Item>

                    {/* SWITCH: Máy dừng & Reset */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, background: '#f5f5f5', padding: 10, borderRadius: 6 }}>
                        <Form.Item name="isStopped" valuePropName="checked" noStyle>
                            <Switch checkedChildren="Máy dừng" unCheckedChildren="Máy đang chạy" />
                        </Form.Item>
                        <Form.Item name="isReset" valuePropName="checked" noStyle>
                            <Switch
                                checkedChildren="Đã Reset/Thay đồng hồ"
                                unCheckedChildren="Đồng hồ bình thường"
                                style={{ background: watchIsReset ? '#faad14' : undefined }}
                                disabled={watchIsStopped}
                            />
                        </Form.Item>
                    </div>

                    {/* Cảnh báo nếu máy dừng */}
                    {watchIsStopped && <Alert message="Máy dừng sẽ được ghi nhận sản lượng = 0" type="warning" showIcon style={{ marginBottom: 16 }} />}

                    {/* INPUTS CHÍNH */}
                    <Row gutter={16}>
                        {/* Chỉ số TRƯỚC */}
                        <Col span={12}>
                            <Form.Item
                                name="startIndex"
                                label="Chỉ số TRƯỚC (Ca trước)"
                            >
                                <InputNumber
                                    style={{ width: '100%' }}
                                    readOnly={!watchIsReset && !form.getFieldValue('isNewMachine')}
                                    disabled={watchIsStopped}
                                    variant={(!watchIsReset && !form.getFieldValue('isNewMachine')) ? "filled" : "outlined"}
                                />
                            </Form.Item>
                        </Col>

                        {/* Chỉ số SAU */}
                        <Col span={12}>
                            <Form.Item
                                name="endIndex"
                                label="Chỉ số SAU (Hiện tại)"
                                rules={[{ required: !watchIsStopped, message: 'Nhập chỉ số!' }]}
                            >
                                <InputNumber
                                    ref={inputRef}
                                    style={{ width: '100%', fontWeight: 'bold', fontSize: 16 }}
                                    disabled={watchIsStopped}
                                    onPressEnter={() => handleSave(true)} // Enter là lưu & next luôn
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Input phụ cho loại 3, 4 (Chi số) */}
                    {(currentMachine?.formulaType === 3 || currentMachine?.formulaType === 4) && (
                        <Form.Item name="inputNE" label="Chi số (NE) thực tế">
                            <InputNumber style={{ width: '100%' }} disabled={watchIsStopped} />
                        </Form.Item>
                    )}

                    {/* KẾT QUẢ TÍNH TOÁN */}
                    <div style={{ textAlign: 'center', padding: 15, background: calculatedOutput < 0 ? '#fff1f0' : '#f6ffed', borderRadius: 8, border: calculatedOutput < 0 ? '1px solid #ffccc7' : '1px solid #b7eb8f' }}>
                        <div style={{ color: '#666', fontSize: 12 }}>Sản lượng ước tính:</div>
                        <div style={{ fontSize: 28, fontWeight: 'bold', color: calculatedOutput < 0 ? 'red' : '#389e0d' }}>
                            {calculatedOutput} <small>kg</small>
                        </div>

                        {/* Cảnh báo logic */}
                        {calculatedOutput < 0 && !watchIsReset && !watchIsStopped && (
                            <div style={{ color: 'red', marginTop: 5 }}>
                                <WarningOutlined /> Chỉ số sau nhỏ hơn chỉ số trước!
                            </div>
                        )}
                        {calculatedOutput > 1000 && (
                            <div style={{ color: '#faad14', marginTop: 5 }}>
                                <WarningOutlined /> Sản lượng quá lớn, hãy kiểm tra lại!
                            </div>
                        )}
                    </div>

                    {/* ACTION BUTTONS */}
                    <Row gutter={16} style={{ marginTop: 24 }}>
                        <Col span={8}>
                            <Button block onClick={() => setIsModalOpen(false)}>Hủy</Button>
                        </Col>
                        <Col span={8}>
                            <Button block icon={<SaveOutlined />} onClick={() => handleSave(false)} disabled={watchIsStopped ? false : calculatedOutput < 0}>Lưu</Button>
                        </Col>
                        <Col span={8}>
                            <Button block type="primary" icon={<ArrowRightOutlined />} onClick={() => handleSave(true)} disabled={watchIsStopped ? false : calculatedOutput < 0}>
                                Lưu & Tiếp
                            </Button>
                        </Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
}