"use client";

import React, { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import {
    Button, Tag, Spin, Result, Modal, Input,
    DatePicker, message, Typography, Radio,
} from "antd";
import {
    LeftOutlined, RightOutlined,
    CheckCircleOutlined, ExclamationCircleOutlined,
    ClockCircleOutlined, ReloadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

const { TextArea } = Input;
const { Text } = Typography;

// ============================
// TYPES
// ============================
interface Process { id: number; name: string; factoryId: number; }
interface Machine { id: number; name: string; processId: number; isActive: boolean; }
interface StopCategory { id: number; name: string; color: string; }
interface ActiveStop {
    id: number;
    machineId: number;
    startTime: string;
    category: StopCategory;
    severity: string;
    description?: string;
}

// ============================
// HELPERS
// ============================
function formatDuration(startTime: string): string {
    const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 60000);
    if (diff < 1) return "vừa dừng";
    if (diff < 60) return `${diff} phút`;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const SEVERITY_OPTS = [
    { value: "low",      label: "Nhẹ",         color: "#52c41a" },
    { value: "medium",   label: "Trung bình",  color: "#fa8c16" },
    { value: "high",     label: "Nặng",        color: "#ff4d4f" },
    { value: "critical", label: "Nghiêm trọng", color: "#820014" },
];

// ============================
// VIEW ENUM
// ============================
type View = "machine" | "report-stop" | "confirm-restart";

// ============================
// MAIN CONTENT
// ============================
function MobileStopsContent() {
    const { data: session, status } = useSession();
    const searchParams = useSearchParams();
    const paramProcessId = searchParams.get("processId");

    const userRole = (session?.user as any)?.role;
    const userProcessIds: number[] = (session?.user as any)?.processIds || [];

    // Data
    const [processes, setProcesses] = useState<Process[]>([]);
    const [selectedProcessId, setSelectedProcessId] = useState<number | null>(
        paramProcessId ? parseInt(paramProcessId) : null
    );
    const [machines, setMachines] = useState<Machine[]>([]);
    const [categories, setCategories] = useState<StopCategory[]>([]);
    const [activeStops, setActiveStops] = useState<ActiveStop[]>([]);

    // Navigation
    const [currentIndex, setCurrentIndex] = useState(0);
    const machineBarRef = React.useRef<HTMLDivElement>(null);

    // Loading
    const [loadingMachines, setLoadingMachines] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [refreshTick, setRefreshTick] = useState(0);

    // View state
    const [currentView, setCurrentView] = useState<View>("machine");

    // Report Stop form
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
    const [selectedSeverity, setSelectedSeverity] = useState("medium");
    const [stopDescription, setStopDescription] = useState("");
    const [useManualStopTime, setUseManualStopTime] = useState(false);
    const [manualStopTime, setManualStopTime] = useState<dayjs.Dayjs>(dayjs());
    const [submitting, setSubmitting] = useState(false);

    // Confirm Restart
    const [useManualRestartTime, setUseManualRestartTime] = useState(false);
    const [manualRestartTime, setManualRestartTime] = useState<dayjs.Dayjs>(dayjs());
    const [restarting, setRestarting] = useState(false);

    // ============================
    // FETCH INIT
    // ============================
    useEffect(() => {
        if (status === "loading") return;
        if (status === "unauthenticated") { setInitialLoading(false); return; }

        const init = async () => {
            try {
                const [pRes, cRes] = await Promise.all([
                    fetch("/api/processes"),
                    fetch("/api/production/stop-categories?activeOnly=true"),
                ]);
                const allProcs: Process[] = pRes.ok ? await pRes.json() : [];
                const cats: StopCategory[] = cRes.ok ? await cRes.json() : [];
                setCategories(cats);

                if (userRole !== "ADMIN" && userProcessIds.length > 0) {
                    const mine = allProcs.filter(p => userProcessIds.includes(p.id));
                    setProcesses(mine);
                    if (!paramProcessId && mine.length === 1) {
                        setSelectedProcessId(mine[0].id);
                    }
                } else {
                    setProcesses(allProcs);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setInitialLoading(false);
            }
        };
        init();
    }, [status, session]);

    // ============================
    // FETCH MACHINES + STOPS
    // ============================
    const loadData = useCallback(async () => {
        if (!selectedProcessId) return;
        setLoadingMachines(true);
        try {
            const [mRes, sRes] = await Promise.all([
                fetch(`/api/machines?processId=${selectedProcessId}`),
                fetch(`/api/production/machine-stops?processId=${selectedProcessId}&activeOnly=true&pageSize=200`),
            ]);
            const allMachines: Machine[] = mRes.ok ? await mRes.json() : [];
            const stopsData = sRes.ok ? await sRes.json() : { logs: [] };

            setMachines(allMachines.filter(m => m.isActive));
            setActiveStops(stopsData.logs || []);
        } catch {
            message.error("Lỗi tải dữ liệu");
        } finally {
            setLoadingMachines(false);
        }
    }, [selectedProcessId]);

    useEffect(() => {
        if (selectedProcessId) loadData();
    }, [selectedProcessId, refreshTick]);

    // Auto-refresh 60s
    useEffect(() => {
        const t = setInterval(() => setRefreshTick(v => v + 1), 60000);
        return () => clearInterval(t);
    }, []);

    // ============================
    // DERIVED STATE
    // ============================
    // Sort: stopped machines first
    const sortedMachines = useMemo(() =>
        [...machines].sort((a, b) => {
            const aStop = activeStops.find(s => s.machineId === a.id);
            const bStop = activeStops.find(s => s.machineId === b.id);
            if (aStop && !bStop) return -1;
            if (!aStop && bStop) return 1;
            return 0;
        }),
        [machines, activeStops]
    );

    const currentMachine = sortedMachines[currentIndex];
    const currentStop = currentMachine ? activeStops.find(s => s.machineId === currentMachine.id) || null : null;
    const stoppedCount = activeStops.length;

    // ============================
    // NAVIGATION
    // ============================
    const scrollBarTo = (idx: number) => {
        if (machineBarRef.current) {
            const btns = machineBarRef.current.querySelectorAll<HTMLElement>("[data-machine-btn]");
            btns[idx]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        }
    };

    const goTo = (idx: number) => {
        if (idx >= 0 && idx < sortedMachines.length) {
            setCurrentIndex(idx);
            setCurrentView("machine");
            setTimeout(() => scrollBarTo(idx), 100);
        }
    };

    // ============================
    // REPORT STOP
    // ============================
    const openReportStop = () => {
        setSelectedCategoryId(null);
        setSelectedSeverity("medium");
        setStopDescription("");
        setUseManualStopTime(false);
        setManualStopTime(dayjs());
        setCurrentView("report-stop");
    };

    const handleSubmitStop = async () => {
        if (!currentMachine) return;
        if (!selectedCategoryId) {
            message.warning("Vui lòng chọn nguyên nhân dừng");
            return;
        }
        const stopTime = useManualStopTime ? manualStopTime.toISOString() : new Date().toISOString();
        setSubmitting(true);
        try {
            const res = await fetch("/api/production/machine-stops", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    machineId: currentMachine.id,
                    categoryId: selectedCategoryId,
                    startTime: stopTime,
                    severity: selectedSeverity,
                    description: stopDescription || undefined,
                }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            message.success(`Đã báo dừng ${currentMachine.name}`);
            setCurrentView("machine");
            setRefreshTick(v => v + 1);
        } catch (e: any) {
            message.error(e.message || "Lỗi ghi nhận");
        } finally {
            setSubmitting(false);
        }
    };

    // ============================
    // CONFIRM RESTART
    // ============================
    const openConfirmRestart = () => {
        setUseManualRestartTime(false);
        setManualRestartTime(dayjs());
        setCurrentView("confirm-restart");
    };

    const handleSubmitRestart = async () => {
        if (!currentStop) return;
        const endTime = useManualRestartTime ? manualRestartTime.toISOString() : new Date().toISOString();
        setRestarting(true);
        try {
            const res = await fetch(`/api/production/machine-stops/${currentStop.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ endTime }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            message.success(`${currentMachine?.name} đã chạy lại!`);
            setCurrentView("machine");
            setRefreshTick(v => v + 1);
        } catch (e: any) {
            message.error(e.message || "Lỗi cập nhật");
        } finally {
            setRestarting(false);
        }
    };

    // ============================
    // RENDER GUARDS
    // ============================
    if (status === "loading" || initialLoading) {
        return <div style={S.center}><Spin size="large" tip="Đang tải..." /></div>;
    }
    if (status === "unauthenticated") {
        return (
            <div style={S.center}>
                <Result status="warning" title="Chưa đăng nhập"
                    extra={<Button type="primary" size="large" href="/login" style={S.bigBtn}>Đăng nhập</Button>} />
            </div>
        );
    }

    // ============================
    // SCREEN: CHỌN CÔNG ĐOẠN
    // ============================
    if (!selectedProcessId) {
        return (
            <div style={S.page}>
                <div style={{ ...S.header, background: "linear-gradient(135deg, #ff4d4f, #cf1322)" }}>
                    <div style={{ width: 32 }} />
                    <div style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>Dừng máy</div>
                        <div style={{ fontSize: 13, opacity: 0.85 }}>Chọn công đoạn làm việc</div>
                    </div>
                    <div style={{ width: 32 }} />
                </div>
                <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {processes.map(p => (
                            <Button key={p.id} size="large" block
                                onClick={() => { setSelectedProcessId(p.id); setCurrentIndex(0); }}
                                style={{ height: 64, fontSize: 18, fontWeight: 600, borderRadius: 14, textAlign: "left", paddingLeft: 20 }}>
                                {p.name}
                            </Button>
                        ))}
                        {processes.length === 0 && (
                            <div style={{ textAlign: "center", color: "#999", padding: 40 }}>
                                Không có công đoạn nào
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (loadingMachines) {
        return <div style={S.center}><Spin size="large" tip="Đang tải máy..." /></div>;
    }

    if (sortedMachines.length === 0) {
        return (
            <div style={S.center}>
                <Result status="info" title="Không có máy"
                    extra={<Button size="large" onClick={() => setSelectedProcessId(null)}>Chọn lại</Button>} />
            </div>
        );
    }

    // Process name for header
    const processName = processes.find(p => p.id === selectedProcessId)?.name || "";

    // ============================
    // SCREEN: BÁO DỪNG
    // ============================
    if (currentView === "report-stop" && currentMachine) {
        return (
            <div style={S.page}>
                {/* Header */}
                <div style={{ ...S.header, background: "linear-gradient(135deg, #ff4d4f, #cf1322)" }}>
                    <Button icon={<LeftOutlined />} size="small"
                        onClick={() => setCurrentView("machine")}
                        style={{ border: "none", background: "transparent", color: "#fff", fontSize: 16 }} />
                    <div style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>Báo dừng máy</div>
                        <div style={{ fontSize: 13, opacity: 0.85 }}>{currentMachine.name}</div>
                    </div>
                    <div style={{ width: 40 }} />
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 0" }}>

                    {/* Category grid */}
                    <div style={S.section}>
                        <div style={S.sectionTitle}>Nguyên nhân dừng <span style={{ color: "#ff4d4f" }}>*</span></div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                            {categories.map(cat => {
                                const selected = selectedCategoryId === cat.id;
                                return (
                                    <button key={cat.id}
                                        onClick={() => setSelectedCategoryId(cat.id)}
                                        style={{
                                            padding: "10px 16px",
                                            borderRadius: 10,
                                            border: `2px solid ${selected ? cat.color : "#d9d9d9"}`,
                                            background: selected ? cat.color : "#fff",
                                            color: selected ? "#fff" : cat.color,
                                            fontSize: 15, fontWeight: selected ? 700 : 500,
                                            cursor: "pointer",
                                            transition: "all 0.15s",
                                        }}>
                                        {cat.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Severity */}
                    <div style={S.section}>
                        <div style={S.sectionTitle}>Mức độ</div>
                        <div style={{ display: "flex", gap: 8 }}>
                            {SEVERITY_OPTS.map(s => (
                                <button key={s.value}
                                    onClick={() => setSelectedSeverity(s.value)}
                                    style={{
                                        flex: 1, padding: "10px 4px",
                                        borderRadius: 10,
                                        border: `2px solid ${selectedSeverity === s.value ? s.color : "#d9d9d9"}`,
                                        background: selectedSeverity === s.value ? s.color : "#fff",
                                        color: selectedSeverity === s.value ? "#fff" : "#333",
                                        fontSize: 13, fontWeight: selectedSeverity === s.value ? 700 : 500,
                                        cursor: "pointer",
                                    }}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Stop time */}
                    <div style={S.section}>
                        <div style={S.sectionTitle}>Thời gian dừng</div>
                        {!useManualStopTime ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div style={{
                                    background: "#fff1f0", border: "1px solid #ffccc7",
                                    borderRadius: 10, padding: "10px 14px",
                                    fontSize: 15, fontWeight: 600, color: "#cf1322",
                                }}>
                                    <ClockCircleOutlined style={{ marginRight: 6 }} />
                                    {dayjs().format("HH:mm — DD/MM/YYYY")}
                                </div>
                                <button onClick={() => setUseManualStopTime(true)}
                                    style={{ border: "none", background: "none", color: "#1677ff", fontSize: 14, cursor: "pointer" }}>
                                    Chỉnh sửa
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <DatePicker showTime value={manualStopTime}
                                    onChange={v => v && setManualStopTime(v)}
                                    format="HH:mm DD/MM/YYYY" style={{ flex: 1, height: 44 }}
                                    disabledDate={d => d.isAfter(dayjs())} />
                                <button onClick={() => setUseManualStopTime(false)}
                                    style={{ border: "none", background: "none", color: "#1677ff", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                                    Hiện tại
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    <div style={S.section}>
                        <div style={S.sectionTitle}>Mô tả thêm <span style={{ color: "#999", fontWeight: 400 }}>(tùy chọn)</span></div>
                        <TextArea rows={3} value={stopDescription}
                            onChange={e => setStopDescription(e.target.value)}
                            placeholder="Mô tả chi tiết sự cố..."
                            style={{ borderRadius: 10, fontSize: 15 }} />
                    </div>
                </div>

                {/* Save button */}
                <div style={S.actionBar}>
                    <Button danger type="primary" size="large" block loading={submitting}
                        onClick={handleSubmitStop}
                        style={{ height: 58, fontSize: 20, fontWeight: 700, borderRadius: 14 }}>
                        <ExclamationCircleOutlined /> Xác nhận dừng máy
                    </Button>
                </div>
            </div>
        );
    }

    // ============================
    // SCREEN: XÁC NHẬN CHẠY LẠI
    // ============================
    if (currentView === "confirm-restart" && currentMachine && currentStop) {
        return (
            <div style={S.page}>
                <div style={{ ...S.header, background: "linear-gradient(135deg, #52c41a, #237804)" }}>
                    <Button icon={<LeftOutlined />} size="small"
                        onClick={() => setCurrentView("machine")}
                        style={{ border: "none", background: "transparent", color: "#fff", fontSize: 16 }} />
                    <div style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>Máy đã chạy lại</div>
                        <div style={{ fontSize: 13, opacity: 0.85 }}>{currentMachine.name}</div>
                    </div>
                    <div style={{ width: 40 }} />
                </div>

                <div style={{ flex: 1, padding: 20 }}>
                    {/* Stop summary */}
                    <div style={{
                        background: "#fff1f0", border: "1px solid #ffccc7", borderRadius: 14,
                        padding: 18, marginBottom: 24,
                    }}>
                        <div style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>Thông tin dừng máy</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <Tag color={currentStop.category.color} style={{ fontSize: 14, padding: "4px 10px" }}>
                                {currentStop.category.name}
                            </Tag>
                            {(() => {
                                const sev = SEVERITY_OPTS.find(s => s.value === currentStop.severity);
                                return sev ? <Tag color={sev.color} style={{ fontSize: 13 }}>{sev.label}</Tag> : null;
                            })()}
                        </div>
                        <div style={{ fontSize: 15, color: "#cf1322", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                            <ClockCircleOutlined />
                            Đã dừng {formatDuration(currentStop.startTime)}
                        </div>
                        {currentStop.description && (
                            <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>
                                {currentStop.description}
                            </div>
                        )}
                    </div>

                    {/* Restart time */}
                    <div style={S.section}>
                        <div style={S.sectionTitle}>Thời gian chạy lại</div>
                        {!useManualRestartTime ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div style={{
                                    background: "#f6ffed", border: "1px solid #b7eb8f",
                                    borderRadius: 10, padding: "10px 14px",
                                    fontSize: 15, fontWeight: 600, color: "#389e0d",
                                }}>
                                    <ClockCircleOutlined style={{ marginRight: 6 }} />
                                    {dayjs().format("HH:mm — DD/MM/YYYY")}
                                </div>
                                <button onClick={() => setUseManualRestartTime(true)}
                                    style={{ border: "none", background: "none", color: "#1677ff", fontSize: 14, cursor: "pointer" }}>
                                    Chỉnh sửa
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <DatePicker showTime value={manualRestartTime}
                                    onChange={v => v && setManualRestartTime(v)}
                                    format="HH:mm DD/MM/YYYY" style={{ flex: 1, height: 44 }}
                                    disabledDate={d => d.isAfter(dayjs())} />
                                <button onClick={() => setUseManualRestartTime(false)}
                                    style={{ border: "none", background: "none", color: "#1677ff", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                                    Hiện tại
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div style={S.actionBar}>
                    <Button type="primary" size="large" block loading={restarting}
                        onClick={handleSubmitRestart}
                        style={{ height: 58, fontSize: 20, fontWeight: 700, borderRadius: 14, background: "#52c41a", borderColor: "#52c41a" }}>
                        <CheckCircleOutlined /> Xác nhận chạy lại
                    </Button>
                </div>
            </div>
        );
    }

    // ============================
    // SCREEN: TRẠNG THÁI MÁY (MAIN)
    // ============================
    const isStopped = !!currentStop;

    return (
        <div style={S.page}>
            {/* Header */}
            <div style={{ ...S.header, background: "linear-gradient(135deg, #ff4d4f, #cf1322)" }}>
                <Button icon={<LeftOutlined />} size="small"
                    onClick={() => { setSelectedProcessId(null); setMachines([]); setCurrentIndex(0); }}
                    style={{ border: "none", background: "transparent", color: "#fff", fontSize: 16 }} />
                <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{processName}</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                        {stoppedCount > 0
                            ? <span style={{ color: "#ffccc7" }}>⚠ {stoppedCount} máy đang dừng</span>
                            : "Tất cả máy đang chạy ✓"}
                    </div>
                </div>
                <Button icon={<ReloadOutlined />} size="small"
                    onClick={() => setRefreshTick(v => v + 1)}
                    style={{ border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", borderRadius: 8 }} />
            </div>

            {/* Machine bar */}
            <div style={S.machineBar}>
                <div ref={machineBarRef} style={{
                    display: "flex", gap: 6, overflowX: "auto", padding: "8px 12px",
                    WebkitOverflowScrolling: "touch" as any,
                }}>
                    {sortedMachines.map((m, idx) => {
                        const stopped = activeStops.find(s => s.machineId === m.id);
                        const isActive = idx === currentIndex;
                        return (
                            <button key={m.id} data-machine-btn
                                onClick={() => goTo(idx)}
                                style={{
                                    minWidth: 54, height: 38, borderRadius: 8, fontSize: 12,
                                    fontWeight: isActive ? 700 : 500, flexShrink: 0, cursor: "pointer",
                                    background: isActive ? (stopped ? "#ff4d4f" : "#52c41a") : stopped ? "#fff1f0" : "#f6ffed",
                                    color: isActive ? "#fff" : stopped ? "#cf1322" : "#389e0d",
                                    border: isActive ? `2px solid ${stopped ? "#ff4d4f" : "#52c41a"}` : `1px solid ${stopped ? "#ffccc7" : "#b7eb8f"}`,
                                }}>
                                {m.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Machine status card */}
            <div style={{ flex: 1, padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Status block */}
                <div style={{
                    borderRadius: 20,
                    border: `3px solid ${isStopped ? "#ff4d4f" : "#52c41a"}`,
                    background: isStopped ? "#fff1f0" : "#f6ffed",
                    padding: 24, textAlign: "center",
                }}>
                    {/* Machine name */}
                    <div style={{ fontSize: 32, fontWeight: 800, color: isStopped ? "#cf1322" : "#237804", marginBottom: 8 }}>
                        {currentMachine?.name}
                    </div>

                    {/* Status indicator */}
                    <div style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        fontSize: 20, fontWeight: 700,
                        color: isStopped ? "#ff4d4f" : "#52c41a",
                        marginBottom: isStopped ? 14 : 0,
                    }}>
                        {isStopped
                            ? <><ExclamationCircleOutlined /> ĐANG DỪNG</>
                            : <><CheckCircleOutlined /> ĐANG CHẠY</>}
                    </div>

                    {/* Stop details */}
                    {isStopped && currentStop && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                            <Tag color={currentStop.category.color} style={{ fontSize: 15, padding: "5px 14px" }}>
                                {currentStop.category.name}
                            </Tag>
                            {(() => {
                                const sev = SEVERITY_OPTS.find(s => s.value === currentStop.severity);
                                return sev ? <Tag color={sev.color} style={{ fontSize: 13 }}>{sev.label}</Tag> : null;
                            })()}
                            <div style={{ fontSize: 18, fontWeight: 600, color: "#cf1322", marginTop: 4 }}>
                                <ClockCircleOutlined style={{ marginRight: 6 }} />
                                Đã dừng {formatDuration(currentStop.startTime)}
                            </div>
                            {currentStop.description && (
                                <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
                                    {currentStop.description}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Prev / Next */}
                <div style={{ display: "flex", gap: 10 }}>
                    <Button icon={<LeftOutlined />} block size="large"
                        disabled={currentIndex === 0}
                        onClick={() => goTo(currentIndex - 1)}
                        style={{ height: 48, borderRadius: 12, fontSize: 15 }}>
                        Trước
                    </Button>
                    <Button block size="large"
                        disabled={currentIndex >= sortedMachines.length - 1}
                        onClick={() => goTo(currentIndex + 1)}
                        style={{ height: 48, borderRadius: 12, fontSize: 15 }}>
                        Sau <RightOutlined />
                    </Button>
                </div>
            </div>

            {/* Action button */}
            <div style={S.actionBar}>
                {isStopped ? (
                    <Button type="primary" size="large" block
                        onClick={openConfirmRestart}
                        style={{ height: 62, fontSize: 20, fontWeight: 700, borderRadius: 14, background: "#52c41a", borderColor: "#52c41a" }}>
                        <CheckCircleOutlined /> Máy đã chạy lại
                    </Button>
                ) : (
                    <Button danger type="primary" size="large" block
                        onClick={openReportStop}
                        style={{ height: 62, fontSize: 20, fontWeight: 700, borderRadius: 14 }}>
                        <ExclamationCircleOutlined /> Báo dừng máy
                    </Button>
                )}
            </div>
        </div>
    );
}

// ============================
// STYLES
// ============================
const S: Record<string, React.CSSProperties> = {
    page: {
        minHeight: "100vh", display: "flex", flexDirection: "column",
        background: "#f0f2f5", maxWidth: 480, margin: "0 auto",
    },
    center: {
        minHeight: "100vh", display: "flex", justifyContent: "center",
        alignItems: "center", padding: 20, background: "#f0f2f5",
    },
    header: {
        display: "flex", alignItems: "center", padding: "14px 10px",
        color: "#fff",
    },
    machineBar: {
        background: "#fff", borderBottom: "1px solid #e8e8e8",
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 15, fontWeight: 700, marginBottom: 10, color: "#333",
    },
    actionBar: {
        padding: "14px 16px 28px", background: "#fff", borderTop: "1px solid #e8e8e8",
    },
    bigBtn: { height: 56, fontSize: 18, borderRadius: 12 },
};

// ============================
// EXPORT
// ============================
export default function MobileStopsPage() {
    return (
        <Suspense fallback={<div style={S.center}><Spin size="large" /></div>}>
            <MobileStopsContent />
        </Suspense>
    );
}
