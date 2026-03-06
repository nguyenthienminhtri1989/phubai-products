"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback, Suspense } from "react";
import {
    Button, InputNumber, Switch, message, Tag, Spin, Result, Space,
    Typography, Modal, Progress, Badge
} from "antd";
import {
    SaveOutlined, ArrowRightOutlined, ArrowLeftOutlined,
    CheckCircleOutlined, WarningOutlined, StopOutlined,
    LeftOutlined, RightOutlined, HomeOutlined,
    ReloadOutlined, ThunderboltOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
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

interface Process { id: number; name: string; factoryId: number; }
interface Factory { id: number; name: string; }

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

const SHIFT_LABELS: Record<number, string> = {
    1: "Ca 1 (06-14h)",
    2: "Ca 2 (14-22h)",
    3: "Ca 3 (22-06h)",
};

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

    // Init
    const { shift: autoShift, date: autoDate } = useMemo(() => detectShiftAndDate(), []);
    const presetProcessId = searchParams.get("processId");

    // State chon cong doan
    const [factories, setFactories] = useState<Factory[]>([]);
    const [processes, setProcesses] = useState<Process[]>([]);
    const [selectedProcessId, setSelectedProcessId] = useState<number | null>(
        presetProcessId ? parseInt(presetProcessId) : null
    );

    // Danh sach may trong cong doan
    const [machines, setMachines] = useState<Machine[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0); // May hien tai dang nhap
    const [loadingMachines, setLoadingMachines] = useState(false);

    // Trang thai nhap lieu cho tung may
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

    // ============================
    // FETCH DATA
    // ============================

    // Fetch factories & processes
    useEffect(() => {
        if (status === "loading") return;
        if (status === "unauthenticated") return;

        const fetchData = async () => {
            try {
                const [fRes, pRes] = await Promise.all([
                    fetch("/api/factories"),
                    fetch("/api/processes"),
                ]);
                if (fRes.ok) setFactories(await fRes.json());
                if (pRes.ok) {
                    const allProc = await pRes.json();
                    // Loc theo quyen user
                    if (session?.user?.role !== "ADMIN" && session?.user?.processId) {
                        const userProcId = Number(session.user.processId);
                        setProcesses(allProc.filter((p: Process) => p.id === userProcId));
                        setSelectedProcessId(userProcId);
                    } else {
                        setProcesses(allProc);
                    }
                }
            } catch (e) { console.error(e); }
        };
        fetchData();
    }, [status, session]);

    // Fetch machines khi chon cong doan
    useEffect(() => {
        if (!selectedProcessId) return;
        const fetchMachines = async () => {
            setLoadingMachines(true);
            try {
                const res = await fetch("/api/machines");
                if (res.ok) {
                    const all = await res.json();
                    const filtered = all
                        .filter((m: Machine) => m.processId === selectedProcessId && m.isActive !== false)
                        .sort((a: Machine, b: Machine) => a.id - b.id);
                    setMachines(filtered);
                    setCurrentIndex(0);

                    // Fetch chi so cu cho tat ca may
                    await loadPreviousIndexes(filtered);
                }
            } catch (e) { message.error("Loi tai danh sach may"); }
            finally { setLoadingMachines(false); }
        };
        fetchMachines();
    }, [selectedProcessId]);

    // Load chi so cu cho tat ca may
    const loadPreviousIndexes = async (machineList: Machine[]) => {
        const dateStr = autoDate.format("YYYY-MM-DD");
        const newStates: typeof inputStates = {};

        for (const m of machineList) {
            try {
                const res = await fetch(`/api/production/last-log?machineId=${m.id}&date=${dateStr}&shift=${autoShift}`);
                const lastLog = await res.json();

                // Check da nhap chua (ca hien tai)
                const checkRes = await fetch(`/api/production/daily-input?machineId=${m.id}&date=${dateStr}&shift=${autoShift}`);
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

        const delta = currentState.isReset ? end : end - start;
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

    // Update state cho may hien tai
    const updateCurrentState = (field: string, value: any) => {
        if (!currentMachine) return;
        setInputStates(prev => ({
            ...prev,
            [currentMachine.id]: { ...prev[currentMachine.id], [field]: value },
        }));
    };

    // So may da nhap
    const savedCount = useMemo(() =>
        Object.values(inputStates).filter(s => s.saved).length
        , [inputStates]);

    // ============================
    // LUU
    // ============================

    const handleSave = async (andNext: boolean = false) => {
        if (!currentMachine || !currentState) return;

        if (calculatedOutput < 0 && !currentState.isReset && !currentState.isStopped) {
            Modal.error({
                title: "Sản lượng âm!",
                content: 'Chỉ số SAU nhỏ hơn chỉ số TRƯỚC. Nếu đồng hồ đã reset về 0, hãy bật "Đã Reset".',
            });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                recordDate: autoDate.format("YYYY-MM-DD"),
                shift: autoShift,
                machineId: currentMachine.id,
                itemId: currentMachine.currentItem?.id,
                startIndex: currentState.startIndex,
                endIndex: currentState.endIndex,
                inputNE: currentState.inputNE,
                finalOutput: calculatedOutput,
                note: currentState.isStopped ? "Máy dừng" : currentState.isReset ? "Reset đồng hồ" : "",
            };

            const res = await fetch("/api/production/daily-input", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Loi luu");
            }

            // Danh dau da luu
            setInputStates(prev => ({
                ...prev,
                [currentMachine.id]: { ...prev[currentMachine.id], saved: true, output: calculatedOutput },
            }));

            if (andNext && currentIndex < machines.length - 1) {
                // Luu & Tiep: chuyen sang may ke tiep
                setLastSavedOutput(calculatedOutput);
                setShowSuccess(true);
                setTimeout(() => {
                    setShowSuccess(false);
                    setCurrentIndex(prev => prev + 1);
                    setTimeout(() => endIndexRef.current?.focus(), 200);
                }, 800); // Hien thong bao nhanh 0.8s roi chuyen
            } else if (andNext && currentIndex >= machines.length - 1) {
                // Da nhap het
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

    const goTo = (index: number) => {
        if (index >= 0 && index < machines.length) {
            setCurrentIndex(index);
            setTimeout(() => endIndexRef.current?.focus(), 200);
        }
    };

    // ============================
    // RENDER
    // ============================

    // Chua dang nhap
    if (status === "loading") {
        return <div style={styles.center}><Spin size="large" /></div>;
    }
    if (status === "unauthenticated") {
        return (
            <div style={styles.center}>
                <Result status="warning" title="Chưa đăng nhập"
                    extra={<Button type="primary" size="large" href="/login" style={styles.bigBtn}>Đăng nhập</Button>} />
            </div>
        );
    }

    // Chua chon cong doan
    if (!selectedProcessId) {
        return (
            <div style={styles.page}>
                <div style={styles.header}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>Nhap san luong</div>
                    <Tag color="orange" style={{ fontSize: 14, padding: "4px 12px" }}>
                        {SHIFT_SHORT[autoShift]} — {autoDate.format("DD/MM")}
                    </Tag>
                </div>
                <div style={{ padding: 16 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#333" }}>
                        Chon cong doan:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {processes.map(p => (
                            <Button
                                key={p.id}
                                size="large"
                                block
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

    // Dang tai may
    if (loadingMachines) {
        return <div style={styles.center}><Spin size="large" tip="Đang tải danh sách máy..." /></div>;
    }

    // Khong co may
    if (machines.length === 0) {
        return (
            <div style={styles.center}>
                <Result status="info" title="Không có máy nào"
                    extra={<Button size="large" onClick={() => setSelectedProcessId(null)}>Chọn lại</Button>} />
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
                ...styles.center,
                background: "linear-gradient(135deg, #f6ffed 0%, #e6fffb 100%)",
                flexDirection: "column",
            }}>
                <CheckCircleOutlined style={{ fontSize: 64, color: "#52c41a" }} />
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 16, color: "#389e0d" }}>
                    Da luu: {lastSavedOutput} kg
                </div>
                <div style={{ fontSize: 16, color: "#666", marginTop: 8 }}>
                    Dang chuyen sang may tiep theo...
                </div>
            </div>
        );
    }

    return (
        <div style={styles.page}>

            {/* ===== HEADER ===== */}
            <div style={styles.header}>
                <Button
                    icon={<LeftOutlined />}
                    size="small"
                    onClick={() => setSelectedProcessId(null)}
                    style={{ border: "none", background: "transparent", color: "#fff", fontSize: 16 }}
                />
                <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 14, opacity: 0.8 }}>{SHIFT_SHORT[autoShift]} — {autoDate.format("DD/MM/YYYY")}</div>
                </div>
                <Tag style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 13 }}>
                    {savedCount}/{machines.length}
                </Tag>
            </div>

            {/* ===== THANH TIEN TRINH MAY ===== */}
            <div style={styles.machineBar}>
                <div style={{
                    display: "flex", gap: 6, overflowX: "auto", padding: "8px 12px",
                    WebkitOverflowScrolling: "touch",
                }}>
                    {machines.map((m, idx) => {
                        const state = inputStates[m.id];
                        const isActive = idx === currentIndex;
                        const isSaved = state?.saved;
                        return (
                            <Button
                                key={m.id}
                                size="small"
                                onClick={() => goTo(idx)}
                                style={{
                                    minWidth: 50, height: 36, borderRadius: 8, fontSize: 12,
                                    fontWeight: isActive ? 700 : 500, flexShrink: 0,
                                    background: isActive ? "#1677ff" : isSaved ? "#f6ffed" : "#fff",
                                    color: isActive ? "#fff" : isSaved ? "#389e0d" : "#333",
                                    border: isActive ? "2px solid #1677ff" : isSaved ? "2px solid #b7eb8f" : "1px solid #d9d9d9",
                                }}
                            >
                                {isSaved && !isActive && <CheckCircleOutlined style={{ marginRight: 2 }} />}
                                {m.name}
                            </Button>
                        );
                    })}
                </div>
                <Progress
                    percent={Math.round((savedCount / machines.length) * 100)}
                    size="small"
                    style={{ padding: "0 12px", marginBottom: 4 }}
                    format={() => `${savedCount}/${machines.length}`}
                />
            </div>

            {/* ===== TEN MAY + THONG TIN ===== */}
            <div style={styles.machineInfo}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#1677ff" }}>
                    {currentMachine.name}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "center", flexWrap: "wrap" }}>
                    {currentMachine.currentItem
                        ? <Tag color="blue" style={{ fontSize: 13 }}>{currentMachine.currentItem.name}</Tag>
                        : <Tag color="red" style={{ fontSize: 13 }}>Chưa gán hàng</Tag>}
                    <Tag style={{ fontSize: 12 }}>CT loại {currentMachine.formulaType}</Tag>
                    {currentMachine.spindleCount && <Tag style={{ fontSize: 12 }}>{currentMachine.spindleCount} cọc</Tag>}
                    {currentState.saved && <Tag color="green" style={{ fontSize: 12 }}>Đã nhập</Tag>}
                </div>
            </div>

            {/* ===== FORM NHAP ===== */}
            <div style={styles.formArea}>

                {/* Switches */}
                <div style={styles.switchRow}>
                    <div
                        onClick={() => updateCurrentState("isStopped", !currentState.isStopped)}
                        style={{
                            ...styles.switchCard,
                            background: currentState.isStopped ? "#fff1f0" : "#f5f5f5",
                            border: currentState.isStopped ? "2px solid #ff4d4f" : "2px solid transparent",
                        }}
                    >
                        <StopOutlined style={{ fontSize: 20, color: currentState.isStopped ? "#ff4d4f" : "#bbb" }} />
                        <div style={{ fontSize: 13, fontWeight: 600, color: currentState.isStopped ? "#ff4d4f" : "#888" }}>
                            {currentState.isStopped ? "MAY DUNG" : "Dang chay"}
                        </div>
                    </div>

                    <div
                        onClick={() => !currentState.isStopped && updateCurrentState("isReset", !currentState.isReset)}
                        style={{
                            ...styles.switchCard,
                            background: currentState.isReset ? "#fffbe6" : "#f5f5f5",
                            border: currentState.isReset ? "2px solid #faad14" : "2px solid transparent",
                            opacity: currentState.isStopped ? 0.4 : 1,
                        }}
                    >
                        <WarningOutlined style={{ fontSize: 20, color: currentState.isReset ? "#faad14" : "#bbb" }} />
                        <div style={{ fontSize: 13, fontWeight: 600, color: currentState.isReset ? "#d48806" : "#888" }}>
                            {currentState.isReset ? "ĐÃ RESET" : "Bình thường"}
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
                            controls={false}
                            inputMode="decimal"
                        />
                    </div>
                    <ArrowRightOutlined style={{ fontSize: 24, color: "#1677ff", marginTop: 28 }} />
                    <div style={styles.indexBox}>
                        <div style={styles.indexLabel}>Chi so SAU</div>
                        <InputNumber
                            ref={endIndexRef}
                            value={currentState.endIndex}
                            onChange={val => updateCurrentState("endIndex", val)}
                            disabled={currentState.isStopped}
                            style={{ ...styles.indexInput, borderColor: "#1677ff", borderWidth: 2 }}
                            controls={false}
                            inputMode="decimal"
                            placeholder="Nhap..."
                        />
                    </div>
                </div>

                {/* NE (chi hien voi formula 3, 4) */}
                {(currentMachine.formulaType === 3 || currentMachine.formulaType === 4) && (
                    <div style={{ padding: "0 16px", marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#666", marginBottom: 4 }}>Chỉ số NE:</div>
                        <InputNumber
                            value={currentState.inputNE}
                            onChange={val => updateCurrentState("inputNE", val ?? 30)}
                            disabled={currentState.isStopped}
                            style={{ width: "100%", height: 48, fontSize: 20 }}
                            controls={false}
                            inputMode="decimal"
                        />
                    </div>
                )}

                {/* KET QUA SAN LUONG */}
                <div style={{
                    ...styles.outputBox,
                    background: calculatedOutput < 0 ? "#fff1f0" : "#f6ffed",
                    borderColor: calculatedOutput < 0 ? "#ffccc7" : "#b7eb8f",
                }}>
                    <div style={{ fontSize: 13, color: "#666" }}>San luong</div>
                    <div style={{
                        fontSize: 48, fontWeight: 800, lineHeight: 1.1,
                        color: calculatedOutput < 0 ? "#ff4d4f" : "#389e0d",
                    }}>
                        {calculatedOutput}
                        <span style={{ fontSize: 18, fontWeight: 500, marginLeft: 4 }}>kg</span>
                    </div>
                </div>
            </div>

            {/* ===== NUT BAM ===== */}
            <div style={styles.actionBar}>
                {/* Nut chuyen may */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <Button
                        icon={<LeftOutlined />}
                        disabled={currentIndex === 0}
                        onClick={() => goTo(currentIndex - 1)}
                        style={{ ...styles.navBtn, flex: 1 }}
                    >
                        May truoc
                    </Button>
                    <Button
                        disabled={currentIndex >= machines.length - 1}
                        onClick={() => goTo(currentIndex + 1)}
                        style={{ ...styles.navBtn, flex: 1 }}
                    >
                        May sau <RightOutlined />
                    </Button>
                </div>

                {/* Nut Luu */}
                <div style={{ display: "flex", gap: 8 }}>
                    <Button
                        size="large"
                        icon={<SaveOutlined />}
                        onClick={() => handleSave(false)}
                        loading={saving}
                        style={{ ...styles.saveBtn, flex: 1, background: "#fff", color: "#1677ff", border: "2px solid #1677ff" }}
                    >
                        Luu
                    </Button>
                    <Button
                        type="primary"
                        size="large"
                        icon={<ThunderboltOutlined />}
                        onClick={() => handleSave(true)}
                        loading={saving}
                        disabled={!currentState.isStopped && (currentState.endIndex === null || currentState.endIndex === undefined) && calculatedOutput === 0}
                        style={{ ...styles.saveBtn, flex: 2 }}
                    >
                        Luu & Tiep →
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ============================
// STYLES - Toi uu mobile
// ============================
const styles: Record<string, React.CSSProperties> = {
    page: {
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f0f2f5",
        maxWidth: 480,
        margin: "0 auto",
    },
    center: {
        minHeight: "100vh", display: "flex", justifyContent: "center",
        alignItems: "center", padding: 20, background: "#f0f2f5",
    },
    header: {
        display: "flex", alignItems: "center", padding: "12px 12px",
        background: "linear-gradient(135deg, #1677ff, #0958d9)",
        color: "#fff",
    },
    machineBar: {
        background: "#fff",
        borderBottom: "1px solid #e8e8e8",
    },
    machineInfo: {
        textAlign: "center", padding: "16px 12px 12px",
        background: "#fff",
    },
    formArea: {
        flex: 1, padding: "12px 0", overflowY: "auto",
    },
    switchRow: {
        display: "flex", gap: 10, padding: "0 16px", marginBottom: 16,
    },
    switchCard: {
        flex: 1, display: "flex", flexDirection: "column" as const,
        alignItems: "center", justifyContent: "center",
        padding: 14, borderRadius: 12, cursor: "pointer",
        transition: "all 0.2s",
        gap: 6,
    },
    indexRow: {
        display: "flex", alignItems: "center", gap: 8, padding: "0 16px", marginBottom: 12,
    },
    indexBox: {
        flex: 1,
    },
    indexLabel: {
        fontSize: 13, fontWeight: 600, color: "#666", marginBottom: 4,
    },
    indexInput: {
        width: "100%", height: 56, fontSize: 24, fontWeight: 700,
        borderRadius: 12,
    },
    outputBox: {
        margin: "0 16px", padding: 16, borderRadius: 16,
        textAlign: "center", border: "2px solid",
    },
    actionBar: {
        padding: "12px 16px 24px",
        background: "#fff",
        borderTop: "1px solid #e8e8e8",
    },
    navBtn: {
        height: 40, borderRadius: 8, fontSize: 13, fontWeight: 500,
    },
    saveBtn: {
        height: 56, borderRadius: 12, fontSize: 18, fontWeight: 700,
    },
    bigBtn: {
        height: 56, fontSize: 18, borderRadius: 12,
    },
};

// ============================
// PAGE WRAPPER
// ============================
export default function MobileInputPage() {
    return (
        <Suspense fallback={<div style={styles.center}><Spin size="large" /></div>}>
            <MobileInputContent />
        </Suspense>
    );
}
