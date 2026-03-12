"use client";

import React, { useEffect, useState, useMemo, useRef, Suspense } from "react";
import {
    Button, InputNumber, message, Tag, Spin, Result, Space,
    Typography, Modal, Progress, Select
} from "antd";
import {
    SaveOutlined, ArrowRightOutlined,
    CheckCircleOutlined, WarningOutlined, StopOutlined,
    LeftOutlined, RightOutlined,
    ThunderboltOutlined, ScanOutlined, SwapOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";

const { Title, Text } = Typography;

interface Machine {
    id: number;
    name: string;
    formulaType: number;
    processId: number;
    spindleCount?: number;
    currentItem?: { id: number; name: string };
    currentNE?: number;
    isActive?: boolean;
}

interface Item { id: number; name: string; }

interface Process { id: number; name: string; factoryId: number; }

// Auto-detect Ca & Ngay
function detectShiftAndDate() {
    const now = dayjs();
    const hour = now.hour();
    let shift = 1;
    let date = now;

    if (hour >= 13 && hour < 21) {
        shift = 1; date = now;
    } else if (hour >= 21) {
        shift = 2; date = now;
    } else if (hour >= 0 && hour < 5) {
        shift = 2; date = now.subtract(1, "day");
    } else if (hour >= 5 && hour < 13) {
        shift = 3; date = now.subtract(1, "day");
    }

    return { shift, date };
}

const SHIFT_SHORT: Record<number, string> = {
    1: "Ca 1", 2: "Ca 2", 3: "Ca 3",
};

// ============================
// COMPONENT CHINH
// ============================
function MobileInputContent() {
    const { data: session, status } = useSession();
    const searchParams = useSearchParams();
    const router = useRouter();

    // Params tu URL (QR Code hoac link)
    const paramMachineId = searchParams.get("machineId");
    const paramProcessId = searchParams.get("processId");

    // Init — auto-detect rồi cho phép người dùng sửa
    const { shift: initShift, date: initDate } = useMemo(() => detectShiftAndDate(), []);
    const [selectedShift, setSelectedShift] = useState(initShift);
    const [selectedDate, setSelectedDate] = useState<Dayjs>(initDate);

    // Modal đổi ngày/ca
    const [dateShiftModalVisible, setDateShiftModalVisible] = useState(false);
    const [tempDate, setTempDate] = useState<Dayjs>(initDate);
    const [tempShift, setTempShift] = useState(initShift);

    // State chon cong doan
    const [processes, setProcesses] = useState<Process[]>([]);
    const [selectedProcessId, setSelectedProcessId] = useState<number | null>(
        paramProcessId ? parseInt(paramProcessId) : null
    );

    // Danh sach may
    const [machines, setMachines] = useState<Machine[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loadingMachines, setLoadingMachines] = useState(false);
    const [initialLoading, setInitialLoading] = useState(!!paramMachineId); // Loading khi vao tu QR

    // Input states
    const [inputStates, setInputStates] = useState<Record<number, {
        startIndex: number;
        endIndex: number | null;
        inputNE: number;
        isReset: boolean;
        isStopped: boolean;
        saved: boolean;
        output: number;
    }>>({});

    // UI state
    const [saving, setSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [lastSavedOutput, setLastSavedOutput] = useState(0);
    const endIndexRef = useRef<any>(null);
    const machineBarRef = useRef<HTMLDivElement>(null);

    // Đổi hàng giữa ca
    const [items, setItems] = useState<Item[]>([]);
    const [itemChangeModalVisible, setItemChangeModalVisible] = useState(false);
    const [itemChangeCutover, setItemChangeCutover] = useState<number | null>(null);
    const [itemChangeNewId, setItemChangeNewId] = useState<number | null>(null);
    const [itemChangeSaving, setItemChangeSaving] = useState(false);
    const [totalOutput3Ca, setTotalOutput3Ca] = useState(0);

    // ============================
    // FETCH DATA
    // ============================

    useEffect(() => {
        if (status === "loading") return;
        if (status === "unauthenticated") return;

        const fetchInit = async () => {
            try {
                const [pRes, iRes] = await Promise.all([fetch("/api/processes"), fetch("/api/items")]);
                if (iRes.ok) setItems(await iRes.json());
                if (pRes.ok) {
                    const allProc = await pRes.json();
                    const userProcessIds: number[] = (session?.user as any)?.processIds || [];
                    if (session?.user?.role !== "ADMIN" && userProcessIds.length > 0) {
                        const userProcs = allProc.filter((p: Process) => userProcessIds.includes(p.id));
                        setProcesses(userProcs);
                        // Nếu không có paramMachineId và chỉ có 1 công đoạn => tự chọn
                        if (!paramMachineId && userProcs.length === 1) {
                            setSelectedProcessId(userProcs[0].id);
                        }
                    } else {
                        setProcesses(allProc);
                    }
                }

                // Neu co machineId tu QR -> Tim processId cua may do
                if (paramMachineId) {
                    const mRes = await fetch("/api/machines");
                    if (mRes.ok) {
                        const allMachines = await mRes.json();
                        const targetMachine = allMachines.find((m: Machine) => m.id === parseInt(paramMachineId));
                        if (targetMachine) {
                            setSelectedProcessId(targetMachine.processId);
                        } else {
                            message.error("Không tìm thấy máy #" + paramMachineId);
                            setInitialLoading(false);
                        }
                    }
                }
            } catch (e) { console.error(e); setInitialLoading(false); }
        };
        fetchInit();
    }, [status, session]);

    // Fetch machines khi chon cong doan
    const fetchDailyTotal = async (processId: number, date: Dayjs) => {
        try {
            const res = await fetch(`/api/production/daily-total?processId=${processId}&date=${date.format('YYYY-MM-DD')}`);
            if (res.ok) {
                const data = await res.json();
                setTotalOutput3Ca(data.total || 0);
            }
        } catch { /* ignore */ }
    };

    useEffect(() => {
        if (!selectedProcessId) return;
        const fetchMachines = async () => {
            setLoadingMachines(true);
            try {
                const [res] = await Promise.all([
                    fetch("/api/machines"),
                    fetchDailyTotal(selectedProcessId, selectedDate),
                ]);
                if (res.ok) {
                    const all = await res.json();
                    const filtered = all
                        .filter((m: Machine) => m.processId === selectedProcessId && m.isActive !== false)
                        .sort((a: Machine, b: Machine) => a.id - b.id);
                    setMachines(filtered);

                    // Neu vao tu QR -> nhay toi may do
                    if (paramMachineId) {
                        const targetIdx = filtered.findIndex((m: Machine) => m.id === parseInt(paramMachineId));
                        setCurrentIndex(targetIdx >= 0 ? targetIdx : 0);
                    } else {
                        setCurrentIndex(0);
                    }

                    await loadPreviousIndexes(filtered, selectedDate, selectedShift);
                }
            } catch (e) { message.error("Lỗi tải danh sách máy"); }
            finally { setLoadingMachines(false); setInitialLoading(false); }
        };
        fetchMachines();
    }, [selectedProcessId]);

    // Load chi so cu
    const loadPreviousIndexes = async (machineList: Machine[], date: Dayjs, shift: number) => {
        const dateStr = date.format("YYYY-MM-DD");
        const newStates: typeof inputStates = {};

        for (const m of machineList) {
            try {
                const res = await fetch(`/api/production/last-log?machineId=${m.id}&date=${dateStr}&shift=${shift}`);
                const lastLog = await res.json();

                const checkRes = await fetch(`/api/production/daily-input?machineId=${m.id}&date=${dateStr}&shift=${shift}`);
                let alreadySaved = false;
                let savedEnd = null;
                if (checkRes.ok) {
                    const existing = await checkRes.json();
                    if (existing && existing.id) {
                        alreadySaved = true;
                        savedEnd = existing.endIndex;
                    }
                }

                newStates[m.id] = {
                    startIndex: lastLog?.endIndex ?? 0,
                    endIndex: alreadySaved ? savedEnd : null,
                    inputNE: m.currentNE || 30,
                    isReset: false,
                    isStopped: false,
                    saved: alreadySaved,
                    output: 0,
                };
            } catch (e) {
                newStates[m.id] = {
                    startIndex: 0, endIndex: null, inputNE: m.currentNE || 30,
                    isReset: false, isStopped: false, saved: false, output: 0,
                };
            }
        }
        setInputStates(newStates);
    };

    // ============================
    // TINH TOAN
    // ============================

    const currentMachine = machines[currentIndex];
    const currentState = currentMachine ? inputStates[currentMachine.id] : null;

    const calculatedOutput = useMemo(() => {
        if (!currentMachine || !currentState) return 0;
        if (currentState.isStopped) return 0;
        const start = Number(currentState.startIndex) || 0;
        const end = Number(currentState.endIndex);
        if (currentState.endIndex === null || currentState.endIndex === undefined) return 0;

        const delta = end - start;
        const type = currentMachine.formulaType;
        let result = 0;

        if (type === 1) result = end;
        else if (type === 2) result = delta;
        else if (type === 3) {
            const ne = Number(currentState.inputNE) || 1;
            const spindles = currentMachine.spindleCount || 1;
            const denom = ne * 1000 * 1.693;
            if (denom !== 0) result = (delta * spindles) / denom;
        } else if (type === 4) {
            const ne = Number(currentState.inputNE) || 1;
            if (ne !== 0) result = delta / ne;
        }
        return parseFloat(result.toFixed(2));
    }, [currentMachine, currentState]);

    const updateCurrentState = (field: string, value: any) => {
        if (!currentMachine) return;
        setInputStates(prev => ({
            ...prev,
            [currentMachine.id]: { ...prev[currentMachine.id], [field]: value },
        }));
    };

    const savedCount = useMemo(() =>
        Object.values(inputStates).filter(s => s.saved).length
        , [inputStates]);

    const totalOutputCa = useMemo(() =>
        Object.values(inputStates).reduce((sum, s) => sum + (s.saved ? (s.output || 0) : 0), 0)
        , [inputStates]);

    // ============================
    // LUU
    // ============================

    const handleSave = async (andNext: boolean = false) => {
        if (!currentMachine || !currentState) return;

        if (calculatedOutput < 0 && !currentState.isStopped) {
            Modal.error({
                title: "Sản lượng âm!",
                content: 'Chỉ số SAU nhỏ hơn TRƯỚC. Xin kiểm tra lại. Nếu chỉ số trước bị sai, hãy bật "Sửa chỉ số trước" để chỉnh lại.',
            });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                recordDate: selectedDate.format("YYYY-MM-DD"),
                shift: selectedShift,
                machineId: currentMachine.id,
                itemId: currentMachine.currentItem?.id,
                startIndex: currentState.startIndex,
                endIndex: currentState.endIndex,
                inputNE: currentState.inputNE,
                finalOutput: calculatedOutput,
                note: currentState.isStopped ? "Máy dừng" : currentState.isReset ? "Sửa chỉ số trước" : "",
            };

            const res = await fetch("/api/production/daily-input", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Lỗi lưu");
            }

            setInputStates(prev => ({
                ...prev,
                [currentMachine.id]: { ...prev[currentMachine.id], saved: true, output: calculatedOutput },
            }));

            if (andNext && currentIndex < machines.length - 1) {
                setLastSavedOutput(calculatedOutput);
                setShowSuccess(true);
                setTimeout(() => {
                    setShowSuccess(false);
                    const nextIdx = currentIndex + 1;
                    setCurrentIndex(nextIdx);
                    // Cuon thanh may den may tiep theo
                    setTimeout(() => {
                        endIndexRef.current?.focus();
                        scrollMachineBarTo(nextIdx);
                    }, 200);
                }, 800);
            } else if (andNext && currentIndex >= machines.length - 1) {
                message.success("Đã nhập xong tất cả máy!");
            } else {
                message.success("Đã lưu!");
            }
        } catch (e: any) {
            message.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    // ============================
    // NAVIGATION
    // ============================

    const scrollMachineBarTo = (idx: number) => {
        if (machineBarRef.current) {
            const buttons = machineBarRef.current.querySelectorAll("button");
            if (buttons[idx]) {
                buttons[idx].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
            }
        }
    };

    const goTo = (index: number) => {
        if (index >= 0 && index < machines.length) {
            setCurrentIndex(index);
            setTimeout(() => {
                endIndexRef.current?.focus();
                scrollMachineBarTo(index);
            }, 200);
        }
    };

    // ============================
    // ĐỔI HÀNG GIỮA CA
    // ============================

    const handleMobileItemChange = async () => {
        if (!currentMachine || !currentState) return;
        if (!itemChangeCutover) { message.error("Vui lòng nhập chỉ số chốt"); return; }
        if (!itemChangeNewId) { message.error("Vui lòng chọn mặt hàng mới"); return; }
        if (!currentMachine.currentItem) { message.error("Máy chưa gán mặt hàng"); return; }

        const startIdx = currentState.startIndex || 0;
        const ne = currentState.inputNE || 30;
        const delta = itemChangeCutover - startIdx;
        const type = currentMachine.formulaType;
        let outputA = 0;
        if (type === 1) outputA = itemChangeCutover;
        else if (type === 2) outputA = delta;
        else if (type === 3) {
            const spindles = currentMachine.spindleCount || 1;
            const denom = ne * 1000 * 1.693;
            if (denom !== 0) outputA = (delta * spindles) / denom;
        } else if (type === 4) {
            if (ne !== 0) outputA = delta / ne;
        }
        outputA = parseFloat(outputA.toFixed(2));

        if (outputA < 0) { message.error("Chỉ số chốt nhỏ hơn chỉ số bắt đầu. Vui lòng kiểm tra lại."); return; }

        setItemChangeSaving(true);
        try {
            const dateStr = selectedDate.format("YYYY-MM-DD");

            const resA = await fetch("/api/production/daily-input", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recordDate: dateStr, shift: selectedShift,
                    machineId: currentMachine.id,
                    itemId: currentMachine.currentItem.id,
                    startIndex: startIdx, endIndex: itemChangeCutover,
                    inputNE: ne, finalOutput: outputA,
                    note: "Đổi mặt hàng trong ca",
                }),
            });
            if (!resA.ok) throw new Error("Lỗi lưu mặt hàng cũ");

            const resB = await fetch("/api/production/daily-input", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recordDate: dateStr, shift: selectedShift,
                    machineId: currentMachine.id,
                    itemId: itemChangeNewId,
                    startIndex: itemChangeCutover, endIndex: null,
                    inputNE: ne, finalOutput: 0,
                    note: "Mặt hàng mới",
                }),
            });
            if (!resB.ok) throw new Error("Lỗi lưu mặt hàng mới");

            const newItem = items.find(i => i.id === itemChangeNewId);
            setMachines(prev => prev.map(m => m.id === currentMachine.id
                ? { ...m, currentItem: newItem ? { id: newItem.id, name: newItem.name } : m.currentItem }
                : m
            ));
            setInputStates(prev => ({
                ...prev,
                [currentMachine.id]: {
                    ...prev[currentMachine.id],
                    startIndex: itemChangeCutover,
                    endIndex: null,
                    saved: true,
                    output: outputA,
                },
            }));

            message.success("Đã đổi mặt hàng thành công!");
            setItemChangeModalVisible(false);
        } catch (e: any) {
            message.error(e.message || "Lỗi khi đổi mặt hàng");
        } finally {
            setItemChangeSaving(false);
        }
    };

    // ============================
    // ĐỔI NGÀY / CA
    // ============================

    const openDateShiftModal = () => {
        setTempDate(selectedDate);
        setTempShift(selectedShift);
        setDateShiftModalVisible(true);
    };

    const confirmDateShift = async () => {
        const dateChanged = !tempDate.isSame(selectedDate, "day");
        const shiftChanged = tempShift !== selectedShift;
        setSelectedDate(tempDate);
        setSelectedShift(tempShift);
        setDateShiftModalVisible(false);
        if ((dateChanged || shiftChanged) && machines.length > 0) {
            await loadPreviousIndexes(machines, tempDate, tempShift);
        }
    };

    // Quet QR giua chung
    const handleScanQR = () => {
        // Mo camera quet QR (dung HTML5 input capture)
        // Hoac chuyen den trang quet
        const url = prompt("Nhập URL từ QR (hoặc dán link):");
        if (url) {
            try {
                const parsed = new URL(url);
                const mId = parsed.searchParams.get("machineId");
                if (mId) {
                    const targetIdx = machines.findIndex(m => m.id === parseInt(mId));
                    if (targetIdx >= 0) {
                        goTo(targetIdx);
                        message.success(`Đã chuyển đến ${machines[targetIdx].name}`);
                    } else {
                        // Máy không thuộc công đoạn này -> chuyển trang
                        window.location.href = `/production/mobile-input?machineId=${mId}`;
                    }
                }
            } catch (e) {
                message.error("Link không hợp lệ");
            }
        }
    };

    // ============================
    // RENDER
    // ============================

    if (status === "loading" || initialLoading) {
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
                    subTitle="Tài khoản của bạn chỉ có quyền xem. Liên hệ quản trị viên để được cấp quyền nhập liệu."
                    extra={<Button size="large" href="/" style={styles.bigBtn}>Về trang chủ</Button>} />
            </div>
        );
    }

    // Modal đổi ngày/ca (dùng chung cả 2 màn hình)
    const dateShiftModal = (
        <Modal
            open={dateShiftModalVisible}
            onCancel={() => setDateShiftModalVisible(false)}
            title="Ngày & Ca làm việc"
            centered
            footer={
                <Button type="primary" block size="large" onClick={confirmDateShift}
                    style={{ height: 48, fontSize: 16, fontWeight: 700 }}>
                    Xác nhận
                </Button>
            }
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <Button icon={<LeftOutlined />} size="large"
                    onClick={() => setTempDate(prev => prev.subtract(1, "day"))} />
                <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: 22, color: "#1677ff" }}>
                        {tempDate.format("DD/MM/YYYY")}
                    </div>
                    <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
                        {["CN", "T2", "T3", "T4", "T5", "T6", "T7"][tempDate.day()]}
                        {tempDate.isSame(dayjs(), "day") && <span style={{ color: "#52c41a", marginLeft: 6 }}>• Hôm nay</span>}
                    </div>
                </div>
                <Button icon={<RightOutlined />} size="large"
                    onClick={() => setTempDate(prev => prev.add(1, "day"))} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                {[1, 2, 3].map(s => (
                    <Button key={s} block size="large"
                        type={tempShift === s ? "primary" : "default"}
                        onClick={() => setTempShift(s)}
                        style={{ height: 52, fontSize: 17, fontWeight: tempShift === s ? 700 : 400 }}>
                        Ca {s}
                    </Button>
                ))}
            </div>
        </Modal>
    );

    // CHON CONG DOAN
    if (!selectedProcessId) {
        return (
            <div style={styles.page}>
                <div style={styles.header}>
                    <div style={{ width: 32 }} /> {/* spacer */}
                    <div style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>Nhập sản lượng</div>
                        <div
                            onClick={openDateShiftModal}
                            style={{ fontSize: 13, opacity: 0.9, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                            {SHIFT_SHORT[selectedShift]} — {selectedDate.format("DD/MM/YYYY")}
                            <span style={{ fontSize: 11, opacity: 0.7 }}>✏️</span>
                        </div>
                    </div>
                    <div style={{ width: 32 }} /> {/* spacer */}
                </div>
                {dateShiftModal}
                <div style={{ padding: 16 }}>
                    {/* Nut quet QR o dau */}
                    <Button
                        icon={<ScanOutlined />}
                        size="large" block
                        onClick={() => {
                            const url = prompt("Nhập URL từ QR:");
                            if (url) {
                                try {
                                    const parsed = new URL(url);
                                    const mId = parsed.searchParams.get("machineId");
                                    if (mId) window.location.href = `/production/mobile-input?machineId=${mId}`;
                                } catch { message.error("Link không hợp lệ"); }
                            }
                        }}
                        style={{
                            height: 56, fontSize: 17, fontWeight: 600, borderRadius: 12,
                            marginBottom: 20, background: "#1677ff", color: "#fff", border: "none",
                        }}
                    >
                        Quét QR để bắt đầu
                    </Button>

                    <div style={{
                        textAlign: "center", color: "#999", fontSize: 13, marginBottom: 20,
                        display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
                    }}>
                        <div style={{ flex: 1, height: 1, background: "#e8e8e8" }} />
                        <span>hoặc chọn công đoạn</span>
                        <div style={{ flex: 1, height: 1, background: "#e8e8e8" }} />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {processes.map(p => (
                            <Button
                                key={p.id} size="large" block
                                onClick={() => setSelectedProcessId(p.id)}
                                style={{
                                    height: 60, fontSize: 18, fontWeight: 600,
                                    borderRadius: 12, textAlign: "left", paddingLeft: 20,
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

    if (loadingMachines) {
        return <div style={styles.center}><Spin size="large" tip="Đang tải máy..." /></div>;
    }

    if (machines.length === 0) {
        return (
            <div style={styles.center}>
                <Result status="info" title="Không có máy nào"
                    extra={<Button size="large" onClick={() => { setSelectedProcessId(null); setMachines([]); }}>Chọn lại</Button>} />
            </div>
        );
    }

    if (!currentMachine || !currentState) {
        return <div style={styles.center}><Spin size="large" /></div>;
    }

    // Hien thong bao luu thanh cong nhanh
    if (showSuccess) {
        return (
            <div style={{
                ...styles.center, background: "linear-gradient(135deg, #f6ffed 0%, #e6fffb 100%)",
                flexDirection: "column",
            }}>
                <CheckCircleOutlined style={{ fontSize: 64, color: "#52c41a" }} />
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 16, color: "#389e0d" }}>
                    Đã lưu: {lastSavedOutput} kg
                </div>
                <div style={{ fontSize: 16, color: "#666", marginTop: 8 }}>
                    Chuyển sang máy tiếp theo...
                </div>
            </div>
        );
    }

    return (
        <div style={styles.page}>

            {/* HEADER */}
            <div style={styles.header}>
                <Button icon={<LeftOutlined />} size="small"
                    onClick={() => { setSelectedProcessId(null); setMachines([]); }}
                    style={{ border: "none", background: "transparent", color: "#fff", fontSize: 16 }} />
                <div
                    style={{ flex: 1, textAlign: "center", cursor: "pointer" }}
                    onClick={openDateShiftModal}
                >
                    <div style={{ fontSize: 14, opacity: 0.9, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {SHIFT_SHORT[selectedShift]} — {selectedDate.format("DD/MM/YYYY")}
                        <span style={{ fontSize: 11, opacity: 0.7 }}>✏️</span>
                    </div>
                </div>
                <Button icon={<ScanOutlined />} size="small"
                    onClick={handleScanQR}
                    style={{ border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: 14, borderRadius: 8 }}>
                    QR
                </Button>
            </div>

            {/* THANH MAY */}
            <div style={styles.machineBar}>
                <div ref={machineBarRef} style={{
                    display: "flex", gap: 6, overflowX: "auto", padding: "8px 12px",
                    WebkitOverflowScrolling: "touch" as any,
                }}>
                    {machines.map((m, idx) => {
                        const state = inputStates[m.id];
                        const isActive = idx === currentIndex;
                        const isSaved = state?.saved;
                        return (
                            <Button key={m.id} size="small" onClick={() => goTo(idx)}
                                style={{
                                    minWidth: 50, height: 36, borderRadius: 8, fontSize: 12,
                                    fontWeight: isActive ? 700 : 500, flexShrink: 0,
                                    background: isActive ? "#1677ff" : isSaved ? "#f6ffed" : "#fff",
                                    color: isActive ? "#fff" : isSaved ? "#389e0d" : "#333",
                                    border: isActive ? "2px solid #1677ff" : isSaved ? "2px solid #b7eb8f" : "1px solid #d9d9d9",
                                }}>
                                {isSaved && !isActive && <CheckCircleOutlined style={{ marginRight: 2 }} />}
                                {m.name}
                            </Button>
                        );
                    })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', marginBottom: 4, gap: 8 }}>
                    <Progress percent={Math.round((savedCount / machines.length) * 100)} size="small"
                        style={{ flex: 1 }}
                        format={() => `${savedCount}/${machines.length}`} />
                    <div style={{ fontSize: 12, color: '#389e0d', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {totalOutputCa} / {totalOutput3Ca} kg
                    </div>
                </div>
            </div>

            {/* TEN MAY */}
            <div style={styles.machineInfo}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#1677ff" }}>{currentMachine.name}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "center", flexWrap: "wrap" }}>
                    {currentMachine.currentItem
                        ? <Tag color="blue" style={{ fontSize: 13 }}>{currentMachine.currentItem.name}</Tag>
                        : <Tag color="red" style={{ fontSize: 13 }}>Chưa gán hàng</Tag>}
                    <Tag style={{ fontSize: 12 }}>CT{currentMachine.formulaType}</Tag>
                    {currentMachine.spindleCount && <Tag style={{ fontSize: 12 }}>{currentMachine.spindleCount} coc</Tag>}
                    {currentState.saved && <Tag color="green" style={{ fontSize: 12 }}>Đã nhập</Tag>}
                </div>
                {currentMachine.currentItem && (
                    <Button
                        type="link" size="small" icon={<SwapOutlined />}
                        onClick={() => { setItemChangeModalVisible(true); setItemChangeCutover(null); setItemChangeNewId(null); }}
                        style={{ marginTop: 4, color: "#d46b08", fontSize: 12 }}
                    >
                        Đổi hàng giữa ca
                    </Button>
                )}
            </div>

            {/* FORM */}
            <div style={styles.formArea}>
                {/* Switches */}
                <div style={styles.switchRow}>
                    <div
                        onClick={() => updateCurrentState("isStopped", !currentState.isStopped)}
                        style={{
                            ...styles.switchCard,
                            background: currentState.isStopped ? "#fff1f0" : "#f5f5f5",
                            border: currentState.isStopped ? "2px solid #ff4d4f" : "2px solid transparent",
                        }}>
                        <StopOutlined style={{ fontSize: 22, color: currentState.isStopped ? "#ff4d4f" : "#bbb" }} />
                        <div style={{ fontSize: 14, fontWeight: 600, color: currentState.isStopped ? "#ff4d4f" : "#888" }}>
                            {currentState.isStopped ? "MÁY DỪNG" : "ĐANG CHẠY"}
                        </div>
                    </div>
                    <div
                        onClick={() => !currentState.isStopped && updateCurrentState("isReset", !currentState.isReset)}
                        style={{
                            ...styles.switchCard,
                            background: currentState.isReset ? "#fffbe6" : "#f5f5f5",
                            border: currentState.isReset ? "2px solid #faad14" : "2px solid transparent",
                            opacity: currentState.isStopped ? 0.4 : 1,
                        }}>
                        <WarningOutlined style={{ fontSize: 22, color: currentState.isReset ? "#faad14" : "#bbb" }} />
                        <div style={{ fontSize: 14, fontWeight: 600, color: currentState.isReset ? "#d48806" : "#888" }}>
                            {currentState.isReset ? "Sửa chỉ số trước" : "Bình thường"}
                        </div>
                    </div>
                </div>

                {/* Chi so */}
                <div style={styles.indexRow}>
                    <div style={styles.indexBox}>
                        <div style={styles.indexLabel}>Chỉ số TRƯỚC</div>
                        <InputNumber
                            value={currentState.startIndex}
                            onChange={val => updateCurrentState("startIndex", val ?? 0)}
                            readOnly={!currentState.isReset}
                            disabled={currentState.isStopped}
                            style={styles.indexInput}
                            controls={false} inputMode="decimal"
                        />
                    </div>
                    <ArrowRightOutlined style={{ fontSize: 24, color: "#1677ff", marginTop: 28 }} />
                    <div style={styles.indexBox}>
                        <div style={styles.indexLabel}>Chỉ số SAU</div>
                        <InputNumber
                            ref={endIndexRef}
                            value={currentState.endIndex}
                            onChange={val => updateCurrentState("endIndex", val)}
                            disabled={currentState.isStopped}
                            style={{ ...styles.indexInput, borderColor: "#1677ff", borderWidth: 2 }}
                            controls={false} inputMode="decimal" placeholder="Nhap..."
                        />
                    </div>
                </div>

                {/* NE */}
                {(currentMachine.formulaType === 3 || currentMachine.formulaType === 4) && (
                    <div style={{ padding: "0 16px", marginBottom: 12 }}>
                        <div style={styles.indexLabel}>Chi số NE:</div>
                        <InputNumber
                            value={currentState.inputNE}
                            onChange={val => updateCurrentState("inputNE", val ?? 30)}
                            disabled={currentState.isStopped}
                            style={{ width: "100%", height: 48, fontSize: 20 }}
                            controls={false} inputMode="decimal"
                        />
                    </div>
                )}

                {/* KET QUA */}
                <div style={{
                    ...styles.outputBox,
                    background: calculatedOutput < 0 ? "#fff1f0" : "#f6ffed",
                    borderColor: calculatedOutput < 0 ? "#ffccc7" : "#b7eb8f",
                }}>
                    <div style={{ fontSize: 13, color: "#666" }}>Sản lượng</div>
                    <div style={{
                        fontSize: 48, fontWeight: 800, lineHeight: 1.1,
                        color: calculatedOutput < 0 ? "#ff4d4f" : "#389e0d",
                    }}>
                        {calculatedOutput}
                        <span style={{ fontSize: 18, fontWeight: 500, marginLeft: 4 }}>kg</span>
                    </div>
                </div>
            </div>

            {/* NUT BAM */}
            <div style={styles.actionBar}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <Button icon={<LeftOutlined />} disabled={currentIndex === 0}
                        onClick={() => goTo(currentIndex - 1)} style={{ ...styles.navBtn, flex: 1 }}>
                        Trước
                    </Button>
                    <Button disabled={currentIndex >= machines.length - 1}
                        onClick={() => goTo(currentIndex + 1)} style={{ ...styles.navBtn, flex: 1 }}>
                        Sau <RightOutlined />
                    </Button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <Button size="large" icon={<SaveOutlined />} onClick={() => handleSave(false)} loading={saving}
                        style={{ ...styles.saveBtn, flex: 1, background: "#fff", color: "#1677ff", border: "2px solid #1677ff" }}>
                        Lưu
                    </Button>
                    <Button type="primary" size="large" icon={<ThunderboltOutlined />}
                        onClick={() => handleSave(true)} loading={saving}
                        disabled={!currentState.isStopped && (currentState.endIndex === null || currentState.endIndex === undefined) && calculatedOutput === 0}
                        style={{ ...styles.saveBtn, flex: 2 }}>
                        Lưu & Tiếp →
                    </Button>
                </div>
            </div>

            {/* MODAL ĐỔI NGÀY / CA */}
            {dateShiftModal}

            {/* MODAL ĐỔI HÀNG GIỮA CA */}
            <Modal
                open={itemChangeModalVisible}
                onCancel={() => setItemChangeModalVisible(false)}
                footer={null}
                title={<span><SwapOutlined /> Đổi mặt hàng giữa ca</span>}
                centered
            >
                <div style={{ background: "#fffbe6", border: "1px solid #ffe58f", borderRadius: 8, padding: "8px 12px", marginBottom: 16, color: "#d48806", fontSize: 13 }}>
                    ⚠️ Chỉ sử dụng khi máy đổi mặt hàng giữa ca
                </div>
                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Đang chạy:</div>
                    <Tag color="blue" style={{ fontSize: 14 }}>{currentMachine.currentItem?.name}</Tag>
                </div>
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Chỉ số chốt (thời điểm đổi hàng):</div>
                    <InputNumber
                        value={itemChangeCutover}
                        onChange={val => setItemChangeCutover(val)}
                        style={{ width: "100%", height: 56, fontSize: 22 }}
                        controls={false} inputMode="decimal" placeholder="Nhập chỉ số..."
                    />
                </div>
                <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Mặt hàng mới:</div>
                    <Select
                        value={itemChangeNewId}
                        onChange={setItemChangeNewId}
                        style={{ width: "100%" }}
                        options={items
                            .filter(i => i.id !== currentMachine.currentItem?.id)
                            .map(i => ({ label: i.name, value: i.id }))}
                        placeholder="Chọn mặt hàng..."
                        showSearch
                        filterOption={(input, option) =>
                            (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                        }
                    />
                </div>
                <Button
                    type="primary" danger size="large" block
                    loading={itemChangeSaving}
                    icon={<SwapOutlined />}
                    onClick={handleMobileItemChange}
                    style={{ height: 56, fontSize: 17, fontWeight: 700 }}
                >
                    Lưu đổi hàng
                </Button>
            </Modal>
        </div>
    );
}

// ============================
// STYLES
// ============================
const styles: Record<string, React.CSSProperties> = {
    page: { minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f0f2f5", maxWidth: 480, margin: "0 auto" },
    center: { minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", padding: 20, background: "#f0f2f5" },
    header: { display: "flex", alignItems: "center", padding: "12px 8px", background: "linear-gradient(135deg, #1677ff, #0958d9)", color: "#fff" },
    machineBar: { background: "#fff", borderBottom: "1px solid #e8e8e8" },
    machineInfo: { textAlign: "center", padding: "14px 12px 10px", background: "#fff" },
    formArea: { flex: 1, padding: "12px 0", overflowY: "auto" },
    switchRow: { display: "flex", gap: 10, padding: "0 16px", marginBottom: 16 },
    switchCard: { flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: 14, borderRadius: 12, cursor: "pointer", gap: 6 },
    indexRow: { display: "flex", alignItems: "center", gap: 8, padding: "0 16px", marginBottom: 12 },
    indexBox: { flex: 1 },
    indexLabel: { fontSize: 13, fontWeight: 600, color: "#666", marginBottom: 4 },
    indexInput: { width: "100%", height: 56, fontSize: 24, fontWeight: 700, borderRadius: 12 },
    outputBox: { margin: "0 16px", padding: 16, borderRadius: 16, textAlign: "center", border: "2px solid" },
    actionBar: { padding: "12px 16px 24px", background: "#fff", borderTop: "1px solid #e8e8e8" },
    navBtn: { height: 40, borderRadius: 8, fontSize: 13, fontWeight: 500 },
    saveBtn: { height: 56, borderRadius: 12, fontSize: 18, fontWeight: 700 },
    bigBtn: { height: 56, fontSize: 18, borderRadius: 12 },
};

export default function MobileInputPage() {
    return (
        <Suspense fallback={<div style={styles.center}><Spin size="large" /></div>}>
            <MobileInputContent />
        </Suspense>
    );
}
