"use client";

import React, { useEffect, useState, useMemo, useRef, Suspense } from "react";
import {
    Button, InputNumber, Select, message, Tag, Spin, Result, Modal, Progress,
} from "antd";
import {
    SaveOutlined, CheckCircleOutlined, LeftOutlined, RightOutlined,
    HomeOutlined, PlusOutlined, DeleteOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { detectShiftAndDate } from "@/lib/production-utils";

// ============================
// TYPES
// ============================
interface WMachine {
    id: number;
    name: string;
    processId: number;
    allowMultiItemPerShift?: boolean;
    currentItem?: { id: number; name: string };
    currentLot?: { id: number; lotNumber: string } | null;
    itemAssignments?: Array<{
        itemId: number;
        item: { id: number; name: string };
        lotId?: number | null;
        lot?: { id: number; lotNumber: string } | null;
        sortOrder: number;
    }>;
    todayLogs?: Array<{
        id: number;
        itemId: number;
        item?: { id: number; name: string };
        finalOutput: number | null;
        lotId?: number | null;
        note?: string;
    }>;
}

interface ItemInput {
    _uid: string;
    itemId: number;
    itemName: string;
    lotId: number | null;
    lotNumber: string | null;
    outputKg: number | null;
    note: string;
    isDirty: boolean;
    isExtra: boolean;        // Dòng thêm giữa ca
    existingLogId?: number;
}

interface Process { id: number; name: string; factoryId: number; }
interface Item { id: number; name: string; }
interface LotOption { id: number; lotNumber: string; item?: { id: number; name: string } | null; }

let _uid = 0;
const uid = () => `wi-${++_uid}`;

const SHIFT_LABEL: Record<number, string> = { 1: "Ca 1", 2: "Ca 2", 3: "Ca 3" };

// ============================
// MAIN COMPONENT
// ============================
function MobileWindingContent() {
    const { data: session, status } = useSession();
    const searchParams = useSearchParams();
    const router = useRouter();

    const paramProcessId = searchParams.get("processId");

    const { shift: initShift, date: initDate } = useMemo(() => detectShiftAndDate(), []);
    const [selectedShift, setSelectedShift] = useState(initShift);
    const [selectedDate, setSelectedDate] = useState<Dayjs>(initDate);

    // Modal đổi ngày/ca
    const [dateShiftModalOpen, setDateShiftModalOpen] = useState(false);
    const [tempDate, setTempDate] = useState<Dayjs>(initDate);
    const [tempShift, setTempShift] = useState(initShift);

    // Metadata
    const [processes, setProcesses] = useState<Process[]>([]);
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [allLots, setAllLots] = useState<LotOption[]>([]);

    // State chọn công đoạn
    const [selectedProcessId, setSelectedProcessId] = useState<number | null>(
        paramProcessId ? parseInt(paramProcessId) : null
    );

    // Danh sách máy
    const [machines, setMachines] = useState<WMachine[]>([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [loading, setLoading] = useState(false);

    // Items của từng máy: machineId → ItemInput[]
    const [machineItems, setMachineItems] = useState<Record<number, ItemInput[]>>({});

    // UI
    const [saving, setSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [lastSavedKg, setLastSavedKg] = useState(0);
    const machineBarRef = useRef<HTMLDivElement>(null);

    // Modal thêm mặt hàng giữa ca
    const [addItemModalOpen, setAddItemModalOpen] = useState(false);

    // ============================
    // FETCH METADATA
    // ============================
    useEffect(() => {
        if (status === "loading" || status === "unauthenticated") return;
        const load = async () => {
            try {
                const [pRes, iRes, lRes] = await Promise.all([
                    fetch("/api/processes"),
                    fetch("/api/items"),
                    fetch("/api/lots"),
                ]);
                if (iRes.ok) setAllItems(await iRes.json());
                if (lRes.ok) setAllLots(await lRes.json());
                if (pRes.ok) {
                    const allProc: Process[] = await pRes.json();
                    const userProcessIds: number[] = (session?.user as any)?.processIds || [];
                    const isAdmin = session?.user?.role === "ADMIN";
                    const visible = isAdmin || userProcessIds.length === 0
                        ? allProc
                        : allProc.filter(p => userProcessIds.includes(p.id));
                    setProcesses(visible);
                    if (!paramProcessId && visible.length === 1) {
                        setSelectedProcessId(visible[0].id);
                    }
                }
            } catch (e) { console.error(e); }
        };
        load();
    }, [status, session]);

    // ============================
    // FETCH MACHINES
    // ============================
    const fetchMachines = async (
        processId: number,
        date: Dayjs,
        shift: number
    ) => {
        setLoading(true);
        try {
            const dateStr = date.format("YYYY-MM-DD");
            const res = await fetch(
                `/api/production/daily-status?processId=${processId}&date=${dateStr}&shift=${shift}`
            );
            if (!res.ok) throw new Error();
            const all: WMachine[] = await res.json();
            const multiMachines = all.filter(m => m.allowMultiItemPerShift);
            setMachines(multiMachines);
            setCurrentIdx(0);
            buildMachineItems(multiMachines);
        } catch {
            message.error("Lỗi tải danh sách máy");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedProcessId) fetchMachines(selectedProcessId, selectedDate, selectedShift);
    }, [selectedProcessId]);

    // Re-fetch khi đổi ca/ngày
    const handleConfirmDateShift = async () => {
        setSelectedDate(tempDate);
        setSelectedShift(tempShift);
        setDateShiftModalOpen(false);
        if (selectedProcessId) {
            await fetchMachines(selectedProcessId, tempDate, tempShift);
        }
    };

    // ============================
    // BUILD ITEM STATE FROM API DATA
    // ============================
    const buildMachineItems = (machineList: WMachine[]) => {
        const map: Record<number, ItemInput[]> = {};
        for (const m of machineList) {
            const assignments = m.itemAssignments || [];
            const logs = m.todayLogs || [];
            const items: ItemInput[] = [];
            const addedIds = new Set<number>();

            for (const a of assignments) {
                const log = logs.find(l => l.itemId === a.itemId);
                addedIds.add(a.itemId);
                items.push({
                    _uid: uid(),
                    itemId: a.itemId,
                    itemName: a.item.name,
                    lotId: log?.lotId ?? a.lot?.id ?? null,
                    lotNumber: a.lot?.lotNumber ?? null,
                    outputKg: log?.finalOutput ?? null,
                    note: log?.note || "",
                    isDirty: false,
                    isExtra: false,
                    existingLogId: log?.id,
                });
            }

            // Logs cho items không có trong assignment (thêm giữa ca cũ)
            for (const log of logs) {
                if (!addedIds.has(log.itemId)) {
                    items.push({
                        _uid: uid(),
                        itemId: log.itemId,
                        itemName: log.item?.name || `Item ${log.itemId}`,
                        lotId: log.lotId ?? null,
                        lotNumber: null,
                        outputKg: log.finalOutput ?? null,
                        note: log.note || "",
                        isDirty: false,
                        isExtra: true,
                        existingLogId: log.id,
                    });
                }
            }

            // Nếu máy chưa có gì → 1 slot trống cho user nhập
            if (items.length === 0) {
                items.push({
                    _uid: uid(),
                    itemId: m.currentItem?.id || 0,
                    itemName: m.currentItem?.name || "",
                    lotId: m.currentLot?.id || null,
                    lotNumber: m.currentLot?.lotNumber || null,
                    outputKg: null,
                    note: "",
                    isDirty: false,
                    isExtra: false,
                });
            }

            map[m.id] = items;
        }
        setMachineItems(map);
    };

    // ============================
    // ITEM EDIT HELPERS
    // ============================
    const updateItem = (machineId: number, itemUid: string, patch: Partial<ItemInput>) => {
        setMachineItems(prev => ({
            ...prev,
            [machineId]: prev[machineId].map(it =>
                it._uid === itemUid ? { ...it, ...patch, isDirty: true } : it
            ),
        }));
    };

    const addExtraItem = (machineId: number) => {
        setMachineItems(prev => ({
            ...prev,
            [machineId]: [
                ...(prev[machineId] || []),
                {
                    _uid: uid(),
                    itemId: 0,
                    itemName: "",
                    lotId: null,
                    lotNumber: null,
                    outputKg: null,
                    note: "",
                    isDirty: true,
                    isExtra: true,
                },
            ],
        }));
    };

    const removeExtraItem = (machineId: number, itemUid: string) => {
        setMachineItems(prev => ({
            ...prev,
            [machineId]: prev[machineId].filter(it => it._uid !== itemUid),
        }));
    };

    // ============================
    // SAVE
    // ============================
    const handleSave = async (andNext: boolean = false) => {
        const machine = machines[currentIdx];
        if (!machine) return;

        const items = machineItems[machine.id] || [];
        const dirtyItems = items.filter(it => it.isDirty && it.itemId > 0);
        if (dirtyItems.length === 0) {
            if (andNext) goNext();
            return;
        }

        setSaving(true);
        let ok = 0, fail = 0;
        const dateStr = selectedDate.format("YYYY-MM-DD");

        for (const it of dirtyItems) {
            try {
                const res = await fetch("/api/production/daily-input", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        machineId: machine.id,
                        recordDate: dateStr,
                        shift: selectedShift,
                        itemId: it.itemId,
                        startIndex: 0,
                        endIndex: 0,
                        inputNE: null,
                        finalOutput: it.outputKg || 0,
                        efficiency: null,
                        note: it.note,
                        lotId: it.lotId,
                    }),
                });
                if (res.ok) ok++;
                else fail++;
            } catch { fail++; }
        }

        setSaving(false);

        if (fail > 0) {
            message.error(`Lỗi ${fail} dòng`);
            return;
        }

        // Mark machine as saved (all items not dirty)
        const totalKg = items.reduce((s, it) => s + (it.outputKg || 0), 0);
        setMachineItems(prev => ({
            ...prev,
            [machine.id]: prev[machine.id].map(it => ({ ...it, isDirty: false })),
        }));

        if (andNext) {
            setLastSavedKg(totalKg);
            setShowSuccess(true);
            setTimeout(() => {
                setShowSuccess(false);
                goNext();
            }, 700);
        } else {
            message.success(`Đã lưu ${ok} mặt hàng!`);
        }
    };

    // ============================
    // NAVIGATION
    // ============================
    const scrollBarTo = (idx: number) => {
        if (machineBarRef.current) {
            const btns = machineBarRef.current.querySelectorAll("button");
            btns[idx]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        }
    };

    const goTo = (idx: number) => {
        if (idx >= 0 && idx < machines.length) {
            setCurrentIdx(idx);
            setTimeout(() => scrollBarTo(idx), 100);
        }
    };

    const goNext = () => {
        if (currentIdx < machines.length - 1) goTo(currentIdx + 1);
        else message.success("Đã nhập xong tất cả máy!");
    };

    // ============================
    // COMPUTED
    // ============================
    const machineSaved = useMemo(() => {
        const result: Record<number, boolean> = {};
        for (const m of machines) {
            const items = machineItems[m.id] || [];
            const hasDirty = items.some(it => it.isDirty);
            const hasData = items.some(it => (it.outputKg ?? 0) > 0 || it.existingLogId);
            result[m.id] = hasData && !hasDirty;
        }
        return result;
    }, [machines, machineItems]);

    const savedCount = useMemo(
        () => machines.filter(m => machineSaved[m.id]).length,
        [machines, machineSaved]
    );

    const currentMachine = machines[currentIdx];
    const currentItems = currentMachine ? (machineItems[currentMachine.id] || []) : [];
    const currentTotalKg = currentItems.reduce((s, it) => s + (it.outputKg || 0), 0);
    const hasDirty = currentItems.some(it => it.isDirty);

    // Lots theo item
    const getLotsForItem = (itemId: number) =>
        allLots.filter(l => !l.item || l.item.id === itemId);

    // ============================
    // AUTH GUARD
    // ============================
    if (status === "loading") {
        return <div style={S.center}><Spin size="large" tip="Đang tải..." /></div>;
    }
    if (status === "unauthenticated") {
        return (
            <div style={S.center}>
                <Result status="warning" title="Chưa đăng nhập"
                    extra={<Button type="primary" size="large" href="/login">Đăng nhập</Button>} />
            </div>
        );
    }
    const isReadOnly = (session?.user as any)?.accessLevel === "READ_ONLY";
    if (isReadOnly) {
        return (
            <div style={S.center}>
                <Result status="403" title="Không có quyền nhập liệu"
                    extra={<Button size="large" href="/">Về trang chủ</Button>} />
            </div>
        );
    }

    // Modal đổi ngày/ca (dùng ở nhiều chỗ)
    const dateShiftModal = (
        <Modal
            open={dateShiftModalOpen}
            onCancel={() => setDateShiftModalOpen(false)}
            title="Ngày & Ca làm việc"
            centered
            footer={
                <Button type="primary" block size="large" onClick={handleConfirmDateShift}
                    style={{ height: 48, fontSize: 16, fontWeight: 700 }}>
                    Xác nhận
                </Button>
            }
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <Button icon={<LeftOutlined />} size="large"
                    onClick={() => setTempDate(p => p.subtract(1, "day"))} />
                <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: 22, color: "#1677ff" }}>
                        {tempDate.format("DD/MM/YYYY")}
                    </div>
                    <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
                        {["CN","T2","T3","T4","T5","T6","T7"][tempDate.day()]}
                        {tempDate.isSame(dayjs(), "day") && <span style={{ color: "#52c41a", marginLeft: 6 }}>• Hôm nay</span>}
                    </div>
                </div>
                <Button icon={<RightOutlined />} size="large"
                    onClick={() => setTempDate(p => p.add(1, "day"))} />
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

    // ============================
    // CHỌN CÔNG ĐOẠN
    // ============================
    if (!selectedProcessId) {
        return (
            <div style={S.page}>
                <div style={S.header}>
                    <Button type="text" icon={<HomeOutlined />}
                        style={{ color: "#fff", fontSize: 18 }} onClick={() => router.push("/")} />
                    <div style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>Nhập liệu đánh ống</div>
                        <div onClick={() => setDateShiftModalOpen(true)}
                            style={{ fontSize: 13, opacity: 0.9, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {SHIFT_LABEL[selectedShift]} — {selectedDate.format("DD/MM/YYYY")} <span style={{ fontSize: 11, opacity: 0.7 }}>✏️</span>
                        </div>
                    </div>
                    <div style={{ width: 32 }} />
                </div>
                {dateShiftModal}
                <div style={{ padding: 16 }}>
                    <div style={{ textAlign: "center", color: "#888", fontSize: 14, marginBottom: 20, fontWeight: 500 }}>
                        Chọn công đoạn
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {processes.map(p => (
                            <Button key={p.id} size="large" block
                                onClick={() => setSelectedProcessId(p.id)}
                                style={{ height: 60, fontSize: 18, fontWeight: 600, borderRadius: 12, textAlign: "left", paddingLeft: 20 }}>
                                {p.name}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ============================
    // LOADING
    // ============================
    if (loading) {
        return <div style={S.center}><Spin size="large" tip="Đang tải máy..." /></div>;
    }

    // ============================
    // KHÔNG CÓ MÁY ĐÁnh ỐNG
    // ============================
    if (machines.length === 0) {
        return (
            <div style={S.center}>
                <Result status="info" title="Không có máy đánh ống"
                    subTitle="Công đoạn này không có máy chạy nhiều mặt hàng."
                    extra={<Button size="large" onClick={() => { setSelectedProcessId(null); setMachines([]); }}>Chọn lại</Button>} />
            </div>
        );
    }

    // ============================
    // SUCCESS FLASH
    // ============================
    if (showSuccess) {
        return (
            <div style={{ ...S.center, flexDirection: "column", background: "linear-gradient(135deg, #f6ffed, #e6fffb)" }}>
                <CheckCircleOutlined style={{ fontSize: 64, color: "#52c41a" }} />
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 16, color: "#389e0d" }}>
                    Đã lưu: {lastSavedKg} kg
                </div>
                <div style={{ fontSize: 16, color: "#666", marginTop: 8 }}>Chuyển sang máy tiếp...</div>
            </div>
        );
    }

    // ============================
    // MAIN UI
    // ============================
    return (
        <div style={S.page}>
            {/* HEADER */}
            <div style={S.header}>
                <Button icon={<LeftOutlined />} size="small"
                    onClick={() => { setSelectedProcessId(null); setMachines([]); }}
                    style={{ border: "none", background: "transparent", color: "#fff", fontSize: 16 }} />
                <div style={{ flex: 1, textAlign: "center", cursor: "pointer" }}
                    onClick={() => { setTempDate(selectedDate); setTempShift(selectedShift); setDateShiftModalOpen(true); }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Nhập liệu đánh ống</div>
                    <div style={{ fontSize: 12, opacity: 0.9, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {SHIFT_LABEL[selectedShift]} — {selectedDate.format("DD/MM/YYYY")} <span style={{ fontSize: 10, opacity: 0.7 }}>✏️</span>
                    </div>
                </div>
                <Button type="text" icon={<HomeOutlined />}
                    style={{ color: "#fff", fontSize: 18 }} onClick={() => router.push("/")} />
            </div>

            {/* MACHINE BAR */}
            <div style={S.machineBar}>
                <div ref={machineBarRef} style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 12px", WebkitOverflowScrolling: "touch" as any }}>
                    {machines.map((m, idx) => {
                        const isSaved = machineSaved[m.id];
                        const isActive = idx === currentIdx;
                        return (
                            <Button key={m.id} size="small" onClick={() => goTo(idx)}
                                style={{
                                    minWidth: 56, height: 36, borderRadius: 8, fontSize: 12,
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
                <div style={{ display: "flex", alignItems: "center", padding: "0 12px", marginBottom: 4, gap: 8 }}>
                    <Progress percent={Math.round((savedCount / machines.length) * 100)} size="small"
                        style={{ flex: 1 }} format={() => `${savedCount}/${machines.length}`} />
                    <div style={{ fontSize: 12, color: "#389e0d", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {currentTotalKg} kg
                    </div>
                </div>
            </div>

            {/* TÊN MÁY */}
            <div style={S.machineInfo}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#1677ff" }}>{currentMachine?.name}</div>
                {hasDirty && <Tag color="orange" style={{ marginTop: 4, fontSize: 11 }}>Chưa lưu</Tag>}
                {machineSaved[currentMachine?.id] && <Tag color="green" style={{ marginTop: 4, fontSize: 11 }}>Đã lưu</Tag>}
            </div>

            {/* DANH SÁCH ITEMS */}
            <div style={S.formArea}>
                {currentItems.map(it => (
                    <div key={it._uid} style={{
                        ...S.itemCard,
                        borderColor: (it.outputKg ?? 0) > 0 || it.existingLogId ? "#b7eb8f" : "#e8e8e8",
                        background: (it.outputKg ?? 0) > 0 || it.existingLogId ? "#f6ffed" : "#fff",
                    }}>
                        {/* Tên mặt hàng */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            {it.isExtra && it.itemId === 0 ? (
                                <Select
                                    style={{ flex: 1 }}
                                    placeholder="Chọn mặt hàng..."
                                    showSearch
                                    optionFilterProp="children"
                                    size="middle"
                                    onChange={(v: number) => {
                                        const found = allItems.find(i => i.id === v);
                                        const dup = currentItems.find(x => x.itemId === v && x._uid !== it._uid);
                                        if (dup) { message.warning("Mặt hàng đã có trong máy này"); return; }
                                        updateItem(currentMachine.id, it._uid, {
                                            itemId: v, itemName: found?.name || "",
                                        });
                                    }}
                                >
                                    {allItems.map(i => (
                                        <Select.Option key={i.id} value={i.id}>{i.name}</Select.Option>
                                    ))}
                                </Select>
                            ) : (
                                <Tag color="blue" style={{ fontSize: 14, padding: "3px 10px", margin: 0 }}>
                                    {it.itemName || "(chưa chọn)"}
                                </Tag>
                            )}
                            {it.isExtra && (
                                <Button type="text" danger size="small" icon={<DeleteOutlined />}
                                    style={{ marginLeft: 4, flexShrink: 0 }}
                                    onClick={() => removeExtraItem(currentMachine.id, it._uid)} />
                            )}
                        </div>

                        {/* Lô hàng */}
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Lô hàng</div>
                            <Select
                                style={{ width: "100%" }}
                                placeholder="Chọn lô..."
                                allowClear
                                size="middle"
                                value={it.lotId ?? undefined}
                                onChange={(v: number | undefined) => {
                                    const lot = allLots.find(l => l.id === v);
                                    updateItem(currentMachine.id, it._uid, {
                                        lotId: v ?? null,
                                        lotNumber: lot?.lotNumber ?? null,
                                    });
                                }}
                                showSearch
                                optionFilterProp="children"
                                disabled={it.isExtra && it.itemId === 0}
                            >
                                {getLotsForItem(it.itemId).map(l => (
                                    <Select.Option key={l.id} value={l.id}>{l.lotNumber}</Select.Option>
                                ))}
                            </Select>
                        </div>

                        {/* Sản lượng */}
                        <div>
                            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Sản lượng (kg)</div>
                            <InputNumber
                                style={{ width: "100%", height: 56, fontSize: 24, fontWeight: 700, borderRadius: 10 }}
                                controls={false}
                                min={0}
                                inputMode="decimal"
                                placeholder="Nhập kg..."
                                value={it.outputKg}
                                disabled={it.isExtra && it.itemId === 0}
                                onChange={v => updateItem(currentMachine.id, it._uid, { outputKg: v })}
                                addonAfter="kg"
                            />
                        </div>
                    </div>
                ))}

                {/* THÊM MẶT HÀNG */}
                <Button block type="dashed" icon={<PlusOutlined />}
                    onClick={() => addExtraItem(currentMachine.id)}
                    style={{ height: 48, fontSize: 15, borderRadius: 12, margin: "4px 16px", width: "calc(100% - 32px)" }}>
                    + Thêm mặt hàng giữa ca
                </Button>

                {/* TỔNG KG */}
                <div style={{
                    margin: "12px 16px", padding: "12px 16px", borderRadius: 12,
                    background: "#f0f5ff", textAlign: "center",
                }}>
                    <div style={{ fontSize: 13, color: "#888" }}>Tổng sản lượng</div>
                    <div style={{ fontSize: 36, fontWeight: 800, color: "#1677ff", lineHeight: 1.2 }}>
                        {currentTotalKg} <span style={{ fontSize: 16, fontWeight: 500 }}>kg</span>
                    </div>
                </div>
            </div>

            {/* ACTION BAR */}
            <div style={S.actionBar}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <Button icon={<LeftOutlined />} disabled={currentIdx === 0}
                        onClick={() => goTo(currentIdx - 1)} style={{ ...S.navBtn, flex: 1 }}>
                        Trước
                    </Button>
                    <Button disabled={currentIdx >= machines.length - 1}
                        onClick={() => goTo(currentIdx + 1)} style={{ ...S.navBtn, flex: 1 }}>
                        Sau <RightOutlined />
                    </Button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <Button size="large" icon={<SaveOutlined />}
                        onClick={() => handleSave(false)} loading={saving}
                        style={{ ...S.saveBtn, flex: 1, background: "#fff", color: "#1677ff", border: "2px solid #1677ff" }}>
                        Lưu
                    </Button>
                    <Button type="primary" size="large" icon={<ThunderboltOutlined />}
                        onClick={() => handleSave(true)} loading={saving}
                        style={{ ...S.saveBtn, flex: 2 }}>
                        Lưu & Tiếp →
                    </Button>
                </div>
            </div>

            {dateShiftModal}
        </div>
    );
}

// ============================
// STYLES
// ============================
const S: Record<string, React.CSSProperties> = {
    page: { minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f0f2f5", maxWidth: 480, margin: "0 auto" },
    center: { minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", padding: 20, background: "#f0f2f5" },
    header: { display: "flex", alignItems: "center", padding: "12px 8px", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff" },
    machineBar: { background: "#fff", borderBottom: "1px solid #e8e8e8" },
    machineInfo: { textAlign: "center", padding: "14px 12px 10px", background: "#fff" },
    formArea: { flex: 1, paddingTop: 12, overflowY: "auto" },
    itemCard: { margin: "0 16px 12px", padding: 14, borderRadius: 12, border: "1.5px solid", background: "#fff" },
    actionBar: { padding: "12px 16px 24px", background: "#fff", borderTop: "1px solid #e8e8e8" },
    navBtn: { height: 40, borderRadius: 8, fontSize: 13, fontWeight: 500 },
    saveBtn: { height: 56, borderRadius: 12, fontSize: 18, fontWeight: 700 },
};

// ============================
// EXPORT
// ============================
export default function MobileWindingPage() {
    return (
        <Suspense fallback={<div style={S.center}><Spin size="large" /></div>}>
            <MobileWindingContent />
        </Suspense>
    );
}
