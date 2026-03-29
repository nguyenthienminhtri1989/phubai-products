"use client";

import React, { useEffect, useState, useMemo, useRef } from 'react';
// ---> THÊM Alert VÀO ĐÂY
import { Card, Select, DatePicker, Button, Row, Col, Modal, Form, InputNumber, Switch, message, Tag, Statistic, Divider, Space, Alert } from 'antd';
// ---> THÊM RobotOutlined, UserOutlined VÀO ĐÂY
import { SaveOutlined, ArrowRightOutlined, ThunderboltOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useSession } from "next-auth/react";

// --- TYPES ---
interface Factory { id: number; name: string; }
interface Substation { id: number; name: string; factoryId: number; }
interface PowerMeter {
    id: number;
    code: string;
    name: string;
    type: number; // 1: Hạ thế, 2: Trung thế
    tu: number;
    ti: number;
    isAuto: boolean; // ---> THÊM TRƯỜNG NÀY ĐỂ NHẬN DIỆN IOT
    todayRecord?: any;
}
interface ElectricityPrice {
    type: string;
    price: number;
}

export default function EnergyDailyInputPage() {
    const { data: session } = useSession();

    // --- STATES ---
    const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs().subtract(1, 'day'));
    const [selectedFactoryId, setSelectedFactoryId] = useState<number | null>(null);
    const [selectedSubstationId, setSelectedSubstationId] = useState<number | null>(null);

    const [factories, setFactories] = useState<Factory[]>([]);
    const [substations, setSubstations] = useState<Substation[]>([]);
    const [meters, setMeters] = useState<PowerMeter[]>([]);
    const [prices, setPrices] = useState<ElectricityPrice[]>([]);
    const [loading, setLoading] = useState(false);

    // Modal & Form
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentMeter, setCurrentMeter] = useState<PowerMeter | null>(null);
    const [form] = Form.useForm();
    const firstInputRef = useRef<any>(null);

    const ELECTRICAL_PROCESS_IDS = [15, 16];
    const userProcessIds: number[] = (session?.user as any)?.processIds || [];
    const canEdit = session?.user?.role === "ADMIN" || userProcessIds.some(id => ELECTRICAL_PROCESS_IDS.includes(id));

    // --- LẤY DANH MỤC & GIÁ ĐIỆN ---
    useEffect(() => {
        const fetchMetadata = async () => {
            try {
                const [facRes, subRes, priceRes] = await Promise.all([
                    fetch('/api/factories'),
                    fetch('/api/energy/substations'),
                    fetch('/api/energy/prices')
                ]);
                if (facRes.ok) setFactories(await facRes.json());
                if (subRes.ok) setSubstations(await subRes.json());
                if (priceRes.ok) setPrices(await priceRes.json());
            } catch (e) { message.error("Lỗi tải danh mục"); }
        };
        fetchMetadata();
    }, []);

    // --- TẢI DANH SÁCH ĐỒNG HỒ ---
    const fetchMeters = async () => {
        if (!selectedSubstationId) return;
        setLoading(true);
        try {
            const dateStr = selectedDate.format('YYYY-MM-DD');
            const res = await fetch(`/api/energy/daily-status?substationId=${selectedSubstationId}&date=${dateStr}`);
            if (res.ok) {
                setMeters(await res.json());
            }
        } catch (error) { message.error("Lỗi tải danh sách đồng hồ"); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchMeters(); }, [selectedSubstationId, selectedDate]);

    // --- MỞ MODAL NHẬP LIỆU & TÌM CHỈ SỐ CŨ ---
    const handleOpenMeter = async (meter: PowerMeter) => {
        setCurrentMeter(meter);
        form.resetFields();

        const initValues: any = { isReset: false };

        if (meter.todayRecord) {
            message.info("Đồng hồ này đã được chốt chỉ số cho ngày này.");
            // Tùy bạn nạp lại data cũ nếu muốn sửa
        } else {
            try {
                const res = await fetch(`/api/energy/last-record?meterId=${meter.id}&date=${selectedDate.format('YYYY-MM-DD')}`);
                if (res.ok) {
                    const lastRecord = await res.json();
                    if (lastRecord) {
                        if (meter.type === 1) {
                            initValues.prevTotal = lastRecord.currTotal || 0;
                        } else {
                            initValues.prevNormal = lastRecord.currNormal || 0;
                            initValues.prevPeak = lastRecord.currPeak || 0;
                            initValues.prevOffPeak = lastRecord.currOffPeak || 0;
                        }
                    } else {
                        initValues.isNewMeter = true;
                    }
                }
            } catch (e) { console.error("Lỗi tìm chỉ số cũ"); }
        }

        form.setFieldsValue(initValues);
        setIsModalOpen(true);
        setTimeout(() => firstInputRef.current?.focus(), 100);
    };

    // --- WATCH & TÍNH TOÁN REALTIME ---
    const watchIsReset = Form.useWatch('isReset', form);
    const currTotal = Form.useWatch('currTotal', form);
    const prevTotal = Form.useWatch('prevTotal', form);
    const currN = Form.useWatch('currNormal', form); const prevN = Form.useWatch('prevNormal', form);
    const currP = Form.useWatch('currPeak', form); const prevP = Form.useWatch('prevPeak', form);
    const currO = Form.useWatch('currOffPeak', form); const prevO = Form.useWatch('prevOffPeak', form);

    const calculations = useMemo(() => {
        if (!currentMeter) return { consTotal: 0, costTotal: 0, error: false };

        const multiplier = currentMeter.tu * currentMeter.ti;
        let consN = 0, consP = 0, consO = 0, totalCons = 0, totalCost = 0;
        let hasError = false;

        const pNormal = prices.find(p => p.type === 'NORMAL')?.price || 0;
        const pPeak = prices.find(p => p.type === 'PEAK')?.price || 0;
        const pOffPeak = prices.find(p => p.type === 'OFF_PEAK')?.price || 0;

        if (currentMeter.type === 1) {
            const curr = Number(currTotal) || 0; const prev = Number(prevTotal) || 0;
            if (curr < prev && !watchIsReset) hasError = true;
            const delta = watchIsReset ? curr : Math.max(0, curr - prev);
            totalCons = delta * multiplier;
            totalCost = totalCons * pNormal;
        } else {
            const cN = Number(currN) || 0; const pN = Number(prevN) || 0;
            const cP = Number(currP) || 0; const pP = Number(prevP) || 0;
            const cO = Number(currO) || 0; const pO = Number(prevO) || 0;

            if ((cN < pN || cP < pP || cO < pO) && !watchIsReset) hasError = true;

            consN = (watchIsReset ? cN : Math.max(0, cN - pN)) * multiplier;
            consP = (watchIsReset ? cP : Math.max(0, cP - pP)) * multiplier;
            consO = (watchIsReset ? cO : Math.max(0, cO - pO)) * multiplier;

            totalCons = consN + consP + consO;
            totalCost = (consN * pNormal) + (consP * pPeak) + (consO * pOffPeak);
        }

        return { consTotal: totalCons, costTotal: totalCost, error: hasError };
    }, [currTotal, prevTotal, currN, prevN, currP, prevP, currO, prevO, watchIsReset, currentMeter, prices]);

    // --- LƯU DỮ LIỆU ---
    const handleSave = async (saveAndNext: boolean) => {
        if (!canEdit) { message.error("Bạn không có quyền nhập chỉ số điện"); return; }
        try {
            const values = await form.validateFields();
            if (calculations.error) {
                Modal.error({ title: 'Lỗi số liệu', content: 'Chỉ số SAU đang nhỏ hơn chỉ số TRƯỚC. Nếu đã thay đồng hồ, vui lòng bật "Reset đồng hồ".' });
                return;
            }

            const payload = {
                recordDate: selectedDate.format('YYYY-MM-DD'),
                meterId: currentMeter?.id,
                isReset: values.isReset,
                ...values,
                consTotal: calculations.consTotal,
                costTotal: calculations.costTotal,
                // Chú ý: Backend sẽ ép dataSource thành "MANUAL"
            };

            const res = await fetch('/api/energy/daily-input', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Lỗi lưu');
            message.success("Đã chốt chỉ số thành công!");

            // Cập nhật lại state ảo để UI hiện xanh lên ngay, đồng thời set dataSource là MANUAL
            setMeters(prev => prev.map(m => m.id === currentMeter?.id ? { ...m, todayRecord: { ...payload, dataSource: "MANUAL" } } : m));

            if (saveAndNext) {
                const idx = meters.findIndex(m => m.id === currentMeter?.id);
                if (idx < meters.length - 1) handleOpenMeter(meters[idx + 1]);
                else { setIsModalOpen(false); message.success("Đã nhập hết trạm này!"); }
            } else { setIsModalOpen(false); }

        } catch (e) { /* Validate failed or API error */ }
    };

    return (
        <div style={{ padding: 20 }}>
            {/* HEADER BỘ LỌC (Giữ nguyên của bạn) */}
            <Card style={{ marginBottom: 16 }} size="small">
                <Row gutter={16} align="middle">
                    <Col span={8}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Nhà máy & Trạm Biến Áp:</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Select
                                style={{ width: '50%' }} placeholder="Chọn Nhà máy"
                                options={factories.map(f => ({ label: f.name, value: f.id }))}
                                onChange={val => { setSelectedFactoryId(val); setSelectedSubstationId(null); }}
                                value={selectedFactoryId}
                            />
                            <Select
                                style={{ width: '50%' }} placeholder="Chọn Trạm"
                                options={substations.filter(s => s.factoryId === selectedFactoryId).map(s => ({ label: s.name, value: s.id }))}
                                onChange={setSelectedSubstationId}
                                value={selectedSubstationId} disabled={!selectedFactoryId}
                            />
                        </div>
                    </Col>
                    <Col span={8}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Ngày chốt số liệu (Mặc định hôm qua):</div>
                        <DatePicker value={selectedDate} onChange={val => val && setSelectedDate(val)} format="DD/MM/YYYY" allowClear={false} style={{ width: '100%' }} />
                    </Col>
                    <Col span={8} style={{ textAlign: 'right' }}>
                        <Statistic title="Tiến độ chốt sổ" value={meters.filter(m => m.todayRecord).length} suffix={`/ ${meters.length} đồng hồ`} styles={{ content: { fontSize: 20, color: '#1890ff' } }} />
                    </Col>
                </Row>
            </Card>

            {/* DANH SÁCH ĐỒNG HỒ */}
            {!selectedSubstationId ? (
                <div style={{ textAlign: 'center', padding: 50, background: '#fff', borderRadius: 8 }}>Vui lòng chọn <b>Trạm biến áp</b>.</div>
            ) : (
                <Row gutter={[12, 12]}>
                    {meters.map(m => {
                        const isDone = !!m.todayRecord;
                        const isAutoRecord = m.todayRecord?.dataSource === "AUTO";

                        return (
                            <Col key={m.id} xs={12} sm={8} md={6} lg={4}>
                                <Card hoverable onClick={() => handleOpenMeter(m)} style={{ border: isDone ? '2px solid #52c41a' : '1px solid #d9d9d9', background: isDone ? '#f6ffed' : '#fff' }} bodyStyle={{ padding: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <b>{m.code}</b>
                                        {isDone && <SaveOutlined style={{ color: '#52c41a' }} />}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#666', marginTop: 4, height: 45, overflow: 'hidden' }}>
                                        {m.name}
                                        {/* ---> HIỂN THỊ TAG IOT / THỦ CÔNG */}
                                        <div style={{ marginTop: 4 }}>
                                            {m.isAuto
                                                ? <Tag bordered={false} color="blue" style={{ margin: 0 }}><RobotOutlined /> Tự động</Tag>
                                                : <Tag bordered={false} color="default" style={{ margin: 0 }}><UserOutlined /> Nhập tay</Tag>}
                                        </div>
                                    </div>
                                    <div style={{ marginTop: 8, textAlign: 'right', fontWeight: 'bold' }}>
                                        {isDone
                                            ? <>
                                                <div style={{ fontSize: 15, color: isAutoRecord ? '#52c41a' : '#d48806' }}>
                                                    {Number(m.todayRecord?.consTotal ?? 0).toLocaleString('en-US')} <small style={{ fontWeight: 'normal', fontSize: 11 }}>kWh</small>
                                                </div>
                                                <div style={{ fontSize: 11, color: isAutoRecord ? '#52c41a' : '#d48806', fontWeight: 'normal' }}>
                                                    Đã chốt ({isAutoRecord ? 'Tự động' : 'Bằng tay'})
                                                </div>
                                            </>
                                            : <span style={{ color: '#ccc' }}>--</span>}
                                    </div>
                                </Card>
                            </Col>
                        )
                    })}
                </Row>
            )}

            {/* MODAL NHẬP CHỈ SỐ */}
            <Modal open={isModalOpen} onCancel={() => setIsModalOpen(false)} footer={null} width={650} centered title={<span><ThunderboltOutlined style={{ color: '#faad14' }} /> {currentMeter?.name} <Tag color="blue">{currentMeter?.code}</Tag> (Hệ số: {currentMeter ? (currentMeter.tu * currentMeter.ti) : 1})</span>}>

                {/* ---> CẢNH BÁO AN TOÀN CHO ĐỒNG HỒ TỰ ĐỘNG */}
                {currentMeter?.isAuto && (
                    <Alert
                        message="Đồng hồ đang chạy Tự động (IoT)"
                        description="Hệ thống sẽ tự động chốt số liệu cho đồng hồ này. Bạn CHỈ NÊN nhập tay trong trường hợp gateway rớt mạng hoặc gặp sự cố để đảm bảo tính liên tục của dữ liệu."
                        type="warning"
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                )}

                <Form form={form} layout="vertical">
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, background: '#f5f5f5', padding: 10, borderRadius: 6 }}>
                        <Form.Item name="isReset" valuePropName="checked" noStyle>
                            <Switch checkedChildren="Đã Reset / Thay đồng hồ" unCheckedChildren="Bình thường" style={{ background: watchIsReset ? '#faad14' : undefined }} />
                        </Form.Item>
                    </div>

                    {/* ... (TOÀN BỘ PHẦN RENDER FORM HẠ THẾ & TRUNG THẾ GIỮ NGUYÊN CỦA BẠN) ... */}
                    {currentMeter?.type === 1 ? (
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="prevTotal" label="Chỉ số TRƯỚC (Tổng)">
                                    <InputNumber style={{ width: '100%' }} readOnly={!watchIsReset && !form.getFieldValue('isNewMeter')} variant="filled" />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="currTotal" label="Chỉ số SAU (Tổng)" rules={[{ required: true }]}>
                                    <InputNumber ref={firstInputRef} style={{ width: '100%', fontWeight: 'bold', fontSize: 16 }} onPressEnter={() => handleSave(true)} />
                                </Form.Item>
                            </Col>
                        </Row>
                    ) : (
                        <>
                            <Divider titlePlacement="left" style={{ margin: '8px 0' }}>1. Giờ Bình thường</Divider>
                            <Row gutter={16}>
                                <Col span={12}><Form.Item name="prevNormal" label="Chỉ số Trước"><InputNumber style={{ width: '100%' }} readOnly={!watchIsReset && !form.getFieldValue('isNewMeter')} variant="filled" /></Form.Item></Col>
                                <Col span={12}><Form.Item name="currNormal" label="Chỉ số Sau" rules={[{ required: true }]}><InputNumber ref={firstInputRef} style={{ width: '100%', fontWeight: 'bold' }} /></Form.Item></Col>
                            </Row>
                            <Divider titlePlacement="left" style={{ margin: '8px 0' }}>2. Giờ Cao điểm</Divider>
                            <Row gutter={16}>
                                <Col span={12}><Form.Item name="prevPeak" label="Chỉ số Trước"><InputNumber style={{ width: '100%' }} readOnly={!watchIsReset && !form.getFieldValue('isNewMeter')} variant="filled" /></Form.Item></Col>
                                <Col span={12}><Form.Item name="currPeak" label="Chỉ số Sau" rules={[{ required: true }]}><InputNumber style={{ width: '100%', fontWeight: 'bold' }} /></Form.Item></Col>
                            </Row>
                            <Divider titlePlacement="left" style={{ margin: '8px 0' }}>3. Giờ Thấp điểm</Divider>
                            <Row gutter={16}>
                                <Col span={12}><Form.Item name="prevOffPeak" label="Chỉ số Trước"><InputNumber style={{ width: '100%' }} readOnly={!watchIsReset && !form.getFieldValue('isNewMeter')} variant="filled" /></Form.Item></Col>
                                <Col span={12}><Form.Item name="currOffPeak" label="Chỉ số Sau" rules={[{ required: true }]}><InputNumber style={{ width: '100%', fontWeight: 'bold' }} onPressEnter={() => handleSave(true)} /></Form.Item></Col>
                            </Row>
                        </>
                    )}

                    {/* KẾT QUẢ TÍNH TOÁN (Giữ nguyên) */}
                    <div style={{ padding: 15, background: calculations.error ? '#fff1f0' : '#e6f7ff', marginBottom: 20, borderRadius: 8, border: calculations.error ? '1px solid #ffccc7' : '1px solid #91d5ff' }}>
                        <Row gutter={16}>
                            <Col span={12} style={{ textAlign: 'center', borderRight: '1px solid #ccc' }}>
                                <div style={{ color: '#666', fontSize: 12 }}>Điện năng tiêu thụ trong ngày:</div>
                                <div style={{ fontSize: 24, fontWeight: 'bold', color: calculations.error ? 'red' : '#0958d9' }}>
                                    {calculations.consTotal.toLocaleString('en-US')} <small>kWh</small>
                                </div>
                            </Col>
                            <Col span={12} style={{ textAlign: 'center' }}>
                                <div style={{ color: '#666', fontSize: 12 }}>Thành tiền ước tính:</div>
                                <div style={{ fontSize: 24, fontWeight: 'bold', color: calculations.error ? 'red' : '#cf1322' }}>
                                    {calculations.costTotal.toLocaleString('en-US')} <small>VNĐ</small>
                                </div>
                            </Col>
                        </Row>
                    </div>

                    <Row gutter={16}>
                        <Col span={8}><Button block onClick={() => setIsModalOpen(false)}>Hủy</Button></Col>
                        <Col span={8}><Button block icon={<SaveOutlined />} onClick={() => handleSave(false)} disabled={!canEdit || calculations.error}>Lưu</Button></Col>
                        <Col span={8}><Button block type="primary" icon={<ArrowRightOutlined />} onClick={() => handleSave(true)} disabled={!canEdit || calculations.error}>Lưu & Tiếp</Button></Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
}