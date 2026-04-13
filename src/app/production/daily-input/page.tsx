// TEST LẠI XEM CODE CÓ PUSH LÊN GIT THÀNH CÔNG KHÔNG?

"use client";

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Card, Select, DatePicker, Button, Row, Col, Modal, Form, InputNumber, Switch, message, Tag, Statistic, Input } from 'antd';
import { SaveOutlined, ArrowRightOutlined, SwapOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
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
    todayLog?: {
        id: number;
        itemId: number;
        item?: { id: number; name: string }; // Tên mặt hàng thực tế của log ca này
        finalOutput: number;
        startIndex?: number;
        endIndex?: number;
        inputNE?: number;
        note?: string
    };
}

interface Item { id: number; name: string; }

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
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [totalOutput3Ca, setTotalOutput3Ca] = useState(0);

    // Đổi hàng giữa ca
    const [isItemChangeVisible, setIsItemChangeVisible] = useState(false);
    const [cutoverIndex, setCutoverIndex] = useState<number | null>(null);
    const [newItemId, setNewItemId] = useState<number | null>(null);
    const [itemChangeSaving, setItemChangeSaving] = useState(false);

    // Gán / thay đổi mặt hàng điều phối ngay trong modal
    const [quickAssignItemId, setQuickAssignItemId] = useState<number | null>(null);
    const [showQuickAssign, setShowQuickAssign] = useState(false);

    // Cảnh báo ca thiếu
    const [missingShifts, setMissingShifts] = useState<Array<{ date: string; shift: number; machineName: string }>>([]);
    const [warningDismissed, setWarningDismissed] = useState(false);

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
            const [resFac, resPro, resItems] = await Promise.all([
                fetch('/api/factories'), fetch('/api/processes'), fetch('/api/items')
            ]);
            if (resFac.ok) setFactories(await resFac.json());
            if (resPro.ok) setProcesses(await resPro.json());
            if (resItems.ok) setItems(await resItems.json());
        } catch (e) { message.error("Lỗi tải danh mục"); }
    };

    const calcOutputHelper = (machine: Machine, start: number, end: number, ne: number): number => {
        const delta = end - start;
        const type = machine.formulaType;
        let result = 0;
        if (type === 1) result = end;
        else if (type === 2) result = delta;
        else if (type === 3) {
            const spindles = machine.spindleCount || 1;
            const denom = ne * 1000 * 1.693;
            if (denom !== 0) result = (delta * spindles) / denom;
        } else if (type === 4) {
            if (ne !== 0) result = delta / ne;
        }
        return Math.round(result);
    };

    const handleItemChangeSave = async () => {
        if (!currentMachine || !currentMachine.currentItem) return;
        if (!cutoverIndex) { message.error('Vui lòng nhập chỉ số chốt'); return; }
        if (!newItemId) { message.error('Vui lòng chọn mặt hàng mới'); return; }

        const startIdx = form.getFieldValue('startIndex') || 0;
        const ne = form.getFieldValue('inputNE') || currentMachine.currentNE || 30;
        const outputA = calcOutputHelper(currentMachine, startIdx, cutoverIndex, ne);

        if (outputA < 0) {
            message.error('Chỉ số chốt nhỏ hơn chỉ số bắt đầu. Vui lòng kiểm tra lại.');
            return;
        }

        setItemChangeSaving(true);
        try {
            const dateStr = selectedDate.format('YYYY-MM-DD');

            const resA = await fetch('/api/production/daily-input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recordDate: dateStr, shift: selectedShift,
                    machineId: currentMachine.id,
                    itemId: currentMachine.currentItem.id,
                    startIndex: startIdx, endIndex: cutoverIndex,
                    inputNE: ne, finalOutput: outputA,
                    note: 'Đổi hàng giữa ca',
                }),
            });
            if (!resA.ok) throw new Error('Lỗi lưu mặt hàng cũ');

            const resB = await fetch('/api/production/daily-input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recordDate: dateStr, shift: selectedShift,
                    machineId: currentMachine.id,
                    itemId: newItemId,
                    startIndex: cutoverIndex, endIndex: null,
                    inputNE: ne, finalOutput: 0,
                    note: 'Mặt hàng mới',
                }),
            });
            if (!resB.ok) throw new Error('Lỗi lưu mặt hàng mới');

            message.success('Đã lưu đổi hàng! Máy đang chạy mặt hàng mới.');
            setIsItemChangeVisible(false);
            setIsModalOpen(false);
            fetchMachines();
        } catch (e: any) {
            message.error(e.message || 'Lỗi khi lưu đổi hàng');
        } finally {
            setItemChangeSaving(false);
        }
    };

    // --- TỰ ĐỘNG CHỌN NHÀ MÁY & CÔNG ĐOẠN NẾU USER CHỈ QUẢN LÝ 1 CÔNG ĐOẠN ---
    useEffect(() => {
        const isAdmin = session?.user?.role === "ADMIN";
        if (isAdmin) return;

        const rawProcessIds = (session?.user as any)?.processIds || [];
        const userProcessIds: number[] = Array.isArray(rawProcessIds) ? rawProcessIds.map(Number) : [];

        if (processes.length > 0 && userProcessIds.length === 1) {
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
            const [res, resTotal] = await Promise.all([
                fetch(`/api/production/daily-status${query}`),
                fetch(`/api/production/daily-total?processId=${selectedProcessId}&date=${dateStr}`),
            ]);
            setMachines(await res.json());
            if (resTotal.ok) {
                const data = await resTotal.json();
                setTotalOutput3Ca(data.total || 0);
            }
        } catch { message.error("Lỗi tải máy"); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchMachines(); }, [selectedProcessId, selectedDate, selectedShift]);

    const handleOpenMachine = async (machine: Machine) => {
        setCurrentMachine(machine);
        form.resetFields();
        setIsItemChangeVisible(false);
        setCutoverIndex(null);
        setNewItemId(null);

        // Khởi tạo quick assign: nếu chưa có currentItem → bắt buộc chọn; nếu đã có → ẩn, chỉ hiện khi bấm "Thay đổi"
        setQuickAssignItemId(machine.currentItem?.id ?? null);
        setShowQuickAssign(!machine.currentItem); // tự động mở nếu chưa gán

        const initValues: any = {
            isReset: false,
            isStopped: false,
            inputNE: machine.currentNE || 30,
            itemId: machine.currentItem?.id ?? null,
            startIndex: 0,
            endIndex: null
        };

        if (machine.todayLog) {
            // Chế độ sửa: điền lại giá trị đã nhập trước đó
            const log = machine.todayLog;
            initValues.itemId = log.itemId ?? machine.currentItem?.id; // Ưu tiên itemId của bản ghi cũ
            initValues.startIndex = log.startIndex ?? 0;
            initValues.endIndex = log.endIndex ?? null;
            initValues.inputNE = log.inputNE ?? machine.currentNE ?? 30;
            initValues.isStopped = log.note === "Máy dừng";
            initValues.isReset = log.note === "Sửa chỉ số trước" || log.note === "Reset đồng hồ";
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
        // Reset cảnh báo ca thiếu
        setMissingShifts([]);
        setWarningDismissed(false);

        setIsModalOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);

        // Kiểm tra ca thiếu sau khi mở modal (không block UI)
        const dateStr = selectedDate.format('YYYY-MM-DD');
        fetch(`/api/production-logs/check-missing-shifts?machineId=${machine.id}&recordDate=${dateStr}&shift=${selectedShift}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => { if (data?.hasMissing) setMissingShifts(data.missingShifts); })
            .catch(() => { /* Bỏ qua lỗi kiểm tra ca thiếu */ });
    };

    const totalOutput = useMemo(() =>
        machines.reduce((sum, m) => sum + (m.todayLog?.finalOutput ?? 0), 0),
        [machines]);

    const calculatedOutput = useMemo(() => {
        if (!currentMachine || watchIsStopped) return 0;

        // Luôn lấy giá trị từ form để đảm bảo tính toán theo số người dùng vừa sửa
        const start = Number(watchStartIndex) || 0;
        const end = Number(watchEndIndex);

        // Nếu chưa nhập chỉ số sau thì sản lượng tạm thời là 0
        if (watchEndIndex === null || watchEndIndex === undefined || isNaN(end)) return 0;

        let result = 0;
        const type = currentMachine.formulaType;
        const delta = end - start;

        // Công thức tính toán theo loại máy
        if (type === 1) result = end; // Nhập thẳng kg
        else if (type === 2) result = delta; // Chỉ số Sau - Trước
        else if (type === 3) { // Máy có cọc/NE
            const ne = Number(watchInputNE) || 1;
            const spindles = currentMachine.spindleCount || 1;
            const denominator = ne * 1000 * 1.693;
            if (denominator !== 0) result = (delta * spindles) / denominator;
        } else if (type === 4) { // Chỉ số / NE
            const ne = Number(watchInputNE) || 1;
            if (ne !== 0) result = delta / ne;
        }

        const final = Math.round(result);
        return isNaN(final) ? 0 : final;
    }, [watchEndIndex, watchStartIndex, watchIsReset, watchIsStopped, watchInputNE, currentMachine]);

    const handleSave = async (saveAndNext: boolean) => {
        try {
            const values = await form.validateFields();

            if (isNaN(calculatedOutput)) {
                message.error("Sản lượng tính toán không hợp lệ. Vui lòng kiểm tra lại các chỉ số.");
                return;
            }

            // Nếu sản lượng âm: 
            // - Nếu KHÔNG gạt "Sửa chỉ số trước": Báo lỗi yêu cầu kiểm tra lại.
            // - Nếu CÓ gạt "Sửa chỉ số trước": Cho phép lưu (tin tưởng người dùng đã chủ động sửa).
            if (calculatedOutput < 0 && !values.isStopped && !values.isReset) {
                Modal.error({
                    title: 'Lỗi số liệu!',
                    content: 'Sản lượng bị ÂM. Chỉ số SAU phải lớn hơn chỉ số TRƯỚC. Nếu đồng hồ bị quay vòng hoặc chỉ số trước bị sai, hãy bật "Sửa chỉ số trước" để chỉnh lại.'
                });
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
            // Xác định mặt hàng sẽ lưu vào log: ưu tiên quickAssignItemId (đã được người dùng chọn/giữ nguyên)
            const effectiveItemId = quickAssignItemId ?? values.itemId;
            if (!effectiveItemId) {
                message.error('Vui lòng chọn mặt hàng đang chạy trước khi lưu');
                return;
            }

            // Nếu mặt hàng thay đổi so với điều phối hiện tại → cập nhật điều phối máy luôn
            const prevItemId = currentMachine?.currentItem?.id ?? null;
            if (effectiveItemId !== prevItemId) {
                const assignRes = await fetch('/api/machines/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ machineIds: [currentMachine?.id], itemId: effectiveItemId }),
                });
                if (!assignRes.ok) {
                    message.warning('Không thể cập nhật điều phối, nhưng vẫn lưu sản lượng.');
                } else {
                    // Cập nhật local state để Card và modal title hiển thị đúng ngay
                    const newItem = items.find(i => i.id === effectiveItemId);
                    setCurrentMachine(prev => prev ? { ...prev, currentItem: newItem } : prev);
                    setMachines(prev => prev.map(m =>
                        m.id === currentMachine?.id ? { ...m, currentItem: newItem } : m
                    ));
                }
            }

            const payload = {
                recordDate: selectedDate.format('YYYY-MM-DD'),
                shift: selectedShift,
                machineId: currentMachine?.id,
                itemId: effectiveItemId,
                startIndex: values.startIndex,
                endIndex: values.endIndex,
                inputNE: values.inputNE,
                finalOutput: calculatedOutput,
                note: values.isStopped ? "Máy dừng" : (values.isReset ? "Sửa chỉ số trước" : "")
            };
            const res = await fetch('/api/production/daily-input', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Lỗi lưu');
            message.success("Đã lưu thành công!");
            const savedItem = items.find(i => i.id === effectiveItemId);
            setMachines(prev => prev.map(m => m.id === currentMachine?.id ? {
                ...m,
                todayLog: {
                    id: m.todayLog?.id ?? 0,
                    itemId: effectiveItemId,
                    item: savedItem ? { id: savedItem.id, name: savedItem.name } : m.todayLog?.item,
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

    const rawProcessIds = (session?.user as any)?.processIds || [];
    const userProcessIds: number[] = Array.isArray(rawProcessIds) ? rawProcessIds.map(Number) : [];
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
                        {isMobile ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {/* Điều hướng ngày */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0f5ff', borderRadius: 8, padding: '6px 10px' }}>
                                    <Button
                                        size="small"
                                        icon={<LeftOutlined />}
                                        onClick={() => setSelectedDate(prev => prev.subtract(1, 'day'))}
                                    />
                                    <div style={{ flex: 1, textAlign: 'center' }}>
                                        <div style={{ fontSize: 10, color: '#888', lineHeight: 1 }}>
                                            {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][selectedDate.day()]}
                                            {selectedDate.isSame(dayjs(), 'day') && <span style={{ color: '#52c41a', marginLeft: 4 }}>• Hôm nay</span>}
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: 17, color: '#1677ff', lineHeight: 1.3 }}>
                                            {selectedDate.format('DD/MM/YYYY')}
                                        </div>
                                    </div>
                                    <Button
                                        size="small"
                                        icon={<RightOutlined />}
                                        onClick={() => setSelectedDate(prev => prev.add(1, 'day'))}
                                    />
                                </div>
                                {/* Chọn ca */}
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {[1, 2, 3].map(s => (
                                        <Button
                                            key={s}
                                            block
                                            type={selectedShift === s ? 'primary' : 'default'}
                                            onClick={() => setSelectedShift(s)}
                                            style={{ height: 40, fontWeight: selectedShift === s ? 700 : 400 }}
                                        >
                                            Ca {s}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        ) : (
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
                        )}
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
                                    styles={{ content: { fontSize: isMobile ? 16 : 20, color: '#1890ff' } }}
                                />
                            </Col>
                            <Col>
                                <Statistic
                                    title="SL Ca / SL Ngày"
                                    value={`${Number(totalOutput).toLocaleString(undefined, { maximumFractionDigits: 2 })} / ${Number(totalOutput3Ca).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                                    suffix="kg"
                                    styles={{ content: { fontSize: isMobile ? 16 : 20, color: '#389e0d' } }}
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
                                        {/* Ưu tiên hiển thị mặt hàng thực tế của log ca đang xem, fallback về mặt hàng hiện tại */}
                                        {(m.todayLog?.item?.name ?? m.currentItem?.name) || <span style={{ color: 'red' }}>Chưa gán hàng</span>}
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
                onCancel={() => { setIsModalOpen(false); setIsItemChangeVisible(false); setCutoverIndex(null); setNewItemId(null); setMissingShifts([]); setWarningDismissed(false); setShowQuickAssign(false); setQuickAssignItemId(null); }}
                footer={null}
                width={isMobile ? '96vw' : 500}
                style={isMobile ? { top: 8 } : undefined}
                centered={!isMobile}
                title={
                    <span style={{ fontSize: isMobile ? 14 : 16 }}>
                        {currentMachine?.name} <Tag color="blue">
                            {/* Ưu tiên hiển thị mặt hàng thực tế của log ca đang xem */}
                            {currentMachine?.todayLog?.item?.name ?? currentMachine?.currentItem?.name}
                        </Tag>
                    </span>
                }
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="itemId" hidden><Input /></Form.Item>

                    {/* Cảnh báo ca thiếu */}
                    {missingShifts.length > 0 && !warningDismissed && (
                        <div style={{ background: '#fffbe6', border: '1px solid #faad14', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                            <div style={{ fontWeight: 600, color: '#d48806', marginBottom: 6 }}>
                                ⚠️ Chưa nhập sản lượng cho:
                            </div>
                            {missingShifts.map((s, i) => (
                                <div key={i} style={{ fontSize: 13, color: '#595959', marginBottom: 2 }}>
                                    • {s.machineName} — Ca {s.shift} — {dayjs(s.date).format('DD/MM/YYYY')}
                                </div>
                            ))}
                            <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 8 }}>
                                Sản lượng ca này có thể bị cộng dồn nếu các ca trên chưa được ghi nhận.
                            </div>
                            <Button
                                type="link" size="small"
                                onClick={() => setWarningDismissed(true)}
                                style={{ padding: 0, marginTop: 4, color: '#8c8c8c', height: 'auto' }}
                            >
                                [Bỏ qua]
                            </Button>
                        </div>
                    )}

                    {/* ── Gán / Thay đổi mặt hàng điều phối ── */}
                    {!showQuickAssign ? (
                        // Đã có mặt hàng → hiển thị tên + nút "Thay đổi"
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, background: '#f0f5ff', borderRadius: 8, padding: '8px 12px' }}>
                            <span style={{ fontSize: 12, color: '#666' }}>Mặt hàng:</span>
                            <Tag color="blue" style={{ margin: 0 }}>
                                {currentMachine?.todayLog?.item?.name ?? currentMachine?.currentItem?.name ?? '—'}
                            </Tag>
                            {!currentMachine?.todayLog && ( // Chỉ cho đổi điều phối khi chưa có log ca này
                                <Button
                                    type="link" size="small"
                                    style={{ padding: 0, marginLeft: 'auto', color: '#d46b08', fontSize: 12 }}
                                    onClick={() => setShowQuickAssign(true)}
                                >
                                    ✏️ Thay đổi
                                </Button>
                            )}
                        </div>
                    ) : (
                        // Chưa gán hoặc đang chọn lại
                        <div style={{
                            marginBottom: 14, padding: '10px 12px', borderRadius: 8,
                            background: !currentMachine?.currentItem ? '#fff1f0' : '#fffbe6',
                            border: `1px solid ${!currentMachine?.currentItem ? '#ffccc7' : '#faad14'}`,
                        }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: !currentMachine?.currentItem ? '#cf1322' : '#d48806' }}>
                                {!currentMachine?.currentItem ? '⚠️ Máy chưa gán mặt hàng — chọn mặt hàng để tiếp tục' : '✏️ Thay đổi mặt hàng điều phối'}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <Select
                                    style={{ flex: 1 }}
                                    placeholder="Chọn mặt hàng đang chạy..."
                                    value={quickAssignItemId}
                                    onChange={val => setQuickAssignItemId(val)}
                                    showSearch
                                    optionFilterProp="label"
                                    options={items.map(i => ({ value: i.id, label: i.name }))}
                                />
                                {currentMachine?.currentItem && (
                                    <Button size="small" onClick={() => {
                                        setQuickAssignItemId(currentMachine.currentItem!.id);
                                        setShowQuickAssign(false);
                                    }}>
                                        Hủy
                                    </Button>
                                )}
                            </div>
                            {quickAssignItemId && quickAssignItemId !== currentMachine?.currentItem?.id && (
                                <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 6 }}>
                                    Khi lưu sản lượng sẽ tự cập nhật điều phối máy sang mặt hàng này.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Switches trạng thái máy */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, background: '#f5f5f5', padding: '10px 14px', borderRadius: 8 }}>
                        <Form.Item name="isStopped" valuePropName="checked" noStyle>
                            <Switch checkedChildren="Máy dừng" unCheckedChildren="Máy đang chạy" />
                        </Form.Item>
                        <Form.Item name="isReset" valuePropName="checked" noStyle>
                            <Switch
                                checkedChildren="Sửa chỉ số trước"
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
                                    style={{ width: '100%', fontSize: isMobile ? 18 : 14, background: (!watchIsReset && !watchIsStopped) ? '#f5f5f5' : undefined }}
                                    disabled={watchIsStopped}
                                    readOnly={!watchIsReset}
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

                    {/* ĐỔI HÀNG GIỮA CA */}
                    {!isItemChangeVisible ? (
                        <div style={{ textAlign: 'center', marginBottom: 12 }}>
                            <Button
                                type="link" size="small" icon={<SwapOutlined />}
                                onClick={() => { setIsItemChangeVisible(true); setCutoverIndex(null); setNewItemId(null); }}
                                style={{ color: '#d46b08' }}
                            >
                                Đổi hàng giữa ca
                            </Button>
                        </div>
                    ) : (
                        <div style={{ background: '#fffbe6', border: '1px dashed #faad14', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                            <div style={{ color: '#d48806', fontSize: 12, marginBottom: 10 }}>
                                ⚠️ Chỉ sử dụng khi máy đổi mặt hàng giữa ca
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <span style={{ fontSize: 12, color: '#666' }}>Mặt hàng hiện tại: </span>
                                <Tag color="blue">{currentMachine?.currentItem?.name}</Tag>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Chỉ số chốt (thời điểm đổi hàng):</div>
                                <InputNumber
                                    value={cutoverIndex}
                                    onChange={val => setCutoverIndex(val)}
                                    style={{ width: '100%' }}
                                    controls={false}
                                    placeholder="Nhập chỉ số..."
                                />
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Mặt hàng mới:</div>
                                <Select
                                    value={newItemId}
                                    onChange={setNewItemId}
                                    style={{ width: '100%' }}
                                    options={items
                                        .filter(i => i.id !== currentMachine?.currentItem?.id)
                                        .map(i => ({ label: i.name, value: i.id }))}
                                    placeholder="Chọn mặt hàng mới..."
                                    showSearch
                                    filterOption={(input, option) =>
                                        (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                                    }
                                />
                            </div>
                            <Row gutter={8}>
                                <Col span={12}>
                                    <Button block onClick={() => setIsItemChangeVisible(false)}>Hủy</Button>
                                </Col>
                                <Col span={12}>
                                    <Button
                                        block type="primary" danger
                                        icon={<SwapOutlined />}
                                        loading={itemChangeSaving}
                                        onClick={handleItemChangeSave}
                                    >
                                        Lưu đổi hàng
                                    </Button>
                                </Col>
                            </Row>
                        </div>
                    )}

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
