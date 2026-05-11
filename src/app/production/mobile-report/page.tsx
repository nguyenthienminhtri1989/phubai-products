"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
    Button, Select, Tag, Spin, Card, Statistic, DatePicker,
    Segmented, message, Space, Collapse, Typography, Badge,
} from "antd";
import {
    SearchOutlined, HomeOutlined, CalendarOutlined,
    RobotOutlined, BarChartOutlined, AppstoreOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const { RangePicker } = DatePicker;

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Log {
    id: number;
    recordDate: string;
    shift: number;
    finalOutput: number;
    machine: { id: number; name: string; processId: number };
    item: { id: number; name: string } | null;
}

interface Machine {
    id: number;
    name: string;
    processId: number;
}

interface Process {
    id: number;
    name: string;
    factoryId: number;
    factory?: { id: number; name: string };
}

// ─── Date preset helpers ────────────────────────────────────────────────────────
const DATE_PRESETS = [
    { label: "Hôm nay", value: "today" },
    { label: "Hôm qua", value: "yesterday" },
    { label: "7 ngày", value: "7days" },
    { label: "30 ngày", value: "30days" },
    { label: "Tháng này", value: "month" },
];

function getPresetRange(preset: string): [dayjs.Dayjs, dayjs.Dayjs] {
    const today = dayjs();
    switch (preset) {
        case "today":     return [today, today];
        case "yesterday": return [today.subtract(1, "day"), today.subtract(1, "day")];
        case "7days":     return [today.subtract(6, "day"), today];
        case "30days":    return [today.subtract(29, "day"), today];
        case "month":     return [today.startOf("month"), today];
        default:          return [today.subtract(6, "day"), today];
    }
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function MobileReportPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    // Redirect if unauthenticated
    useEffect(() => {
        if (status === "unauthenticated") router.push("/login");
    }, [status, router]);

    const isAdmin = session?.user?.role === "ADMIN";
    const userRole: string = (session?.user as any)?.userRole || "";
    const userProcessIds: number[] = (session?.user as any)?.processIds || [];
    const userFactoryIds: number[] = (session?.user as any)?.factoryIds || [];
    // FACTORY_MANAGER và DIRECTOR quản lý theo factoryId, không theo processId
    const isFactoryWideRole = isAdmin || userRole === "FACTORY_MANAGER" || userRole === "DIRECTOR";

    // ─── State ─────────────────────────────────────────────────────────────
    const [machines, setMachines] = useState<Machine[]>([]);
    const [processes, setProcesses] = useState<Process[]>([]);
    const [selectedProcesses, setSelectedProcesses] = useState<number[]>([]);
    const [selectedMachines, setSelectedMachines] = useState<number[]>([]);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(getPresetRange("7days"));
    const [activePreset, setActivePreset] = useState("7days");
    const [viewMode, setViewMode] = useState<"shift" | "product">("shift");
    const [logs, setLogs] = useState<Log[]>([]);
    const [totalOutput, setTotalOutput] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const [truncated, setTruncated] = useState(false);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    // ─── Load machines on mount (after session ready) ──────────────────────
    useEffect(() => {
        if (status !== "authenticated") return;
        fetch("/api/machines")
            .then((r) => r.json())
            .then((data: Machine[]) => {
                if (isAdmin) {
                    // ADMIN xem tất cả máy
                    setMachines(data);
                } else if (userRole === "FACTORY_MANAGER" || userRole === "DIRECTOR") {
                    // FACTORY_MANAGER / DIRECTOR: quản lý theo nhà máy (factoryId)
                    // Lọc máy theo process.factoryId nếu có factoryIds, nếu không thì xem tất cả
                    if (userFactoryIds.length > 0) {
                        setMachines(data.filter((m: any) =>
                            userFactoryIds.includes(m.process?.factoryId)
                        ));
                    } else {
                        // Không có factoryIds → cho xem tất cả (backward compat)
                        setMachines(data);
                    }
                } else {
                    // PROCESS_LEAD, TEAM_LEAD, STATISTICIAN: lọc theo processId
                    setMachines(data.filter((m) => userProcessIds.includes(m.processId)));
                }
            })
            .catch(() => message.error("Lỗi tải danh sách máy"));

        fetch("/api/processes")
            .then((r) => r.json())
            .then((data: Process[]) => {
                if (isAdmin) {
                    setProcesses(data);
                } else if (userRole === "FACTORY_MANAGER" || userRole === "DIRECTOR") {
                    if (userFactoryIds.length > 0) {
                        setProcesses(data.filter((p) => userFactoryIds.includes(p.factoryId)));
                    } else {
                        setProcesses(data);
                    }
                } else {
                    setProcesses(data.filter((p) => userProcessIds.includes(p.id)));
                }
            })
            .catch(() => message.error("Lỗi tải danh sách công đoạn"));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, isAdmin, userRole]);

    // ─── Filtered machines by selected processes ───────────────────────────
    const filteredMachines = useMemo(() => {
        if (selectedProcesses.length === 0) return machines;
        return machines.filter((m) => selectedProcesses.includes(m.processId));
    }, [machines, selectedProcesses]);

    // Khi đổi công đoạn → loại bỏ máy đã chọn không còn thuộc phạm vi
    useEffect(() => {
        if (selectedProcesses.length === 0) return;
        setSelectedMachines((prev) =>
            prev.filter((mid) => {
                const m = machines.find((x) => x.id === mid);
                return m && selectedProcesses.includes(m.processId);
            })
        );
    }, [selectedProcesses, machines]);

    // ─── Date preset handler ────────────────────────────────────────────────
    const handlePreset = (preset: string) => {
        setActivePreset(preset);
        setDateRange(getPresetRange(preset));
    };

    // ─── Search ─────────────────────────────────────────────────────────────
    const PAGE_SIZE = 1000;

    const handleSearch = async () => {
        setLoading(true);
        setSearched(true);
        try {
            const payload: Record<string, unknown> = {
                fromDate: dateRange[0].format("YYYY-MM-DD"),
                toDate: dateRange[1].format("YYYY-MM-DD"),
                page: 1,
                pageSize: PAGE_SIZE,
            };

            if (selectedMachines.length > 0) {
                payload.machineIds = selectedMachines;
            } else if (selectedProcesses.length > 0) {
                // Có chọn công đoạn → giới hạn theo công đoạn đã chọn
                payload.processIds = selectedProcesses;
            } else if (!isAdmin && userProcessIds.length > 0) {
                // Non-admin: limit to own process when no machine selected
                payload.processIds = userProcessIds;
            }

            const res = await fetch("/api/production/history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setLogs(data.data);
            setTotalOutput(data.stats.totalOutput ?? 0);
            setTotalCount(data.pagination.total ?? 0);
            setTruncated(data.pagination.total > PAGE_SIZE);
        } catch {
            message.error("Lỗi tải dữ liệu");
        } finally {
            setLoading(false);
        }
    };

    // ─── Grouped: By Shift ──────────────────────────────────────────────────
    // Result: sorted array of [isoDate, { displayDate, dayTotal, shifts }]
    const groupedByShift = useMemo(() => {
        const map: Record<
            string,
            {
                displayDate: string;
                dayTotal: number;
                shifts: Record<number, { machineName: string; itemName: string; output: number }[]>;
            }
        > = {};

        logs.forEach((log) => {
            const iso = dayjs(log.recordDate).format("YYYY-MM-DD");
            if (!map[iso]) {
                map[iso] = {
                    displayDate: dayjs(log.recordDate).format("DD/MM/YYYY"),
                    dayTotal: 0,
                    shifts: {},
                };
            }
            map[iso].dayTotal += log.finalOutput;
            if (!map[iso].shifts[log.shift]) map[iso].shifts[log.shift] = [];
            map[iso].shifts[log.shift].push({
                machineName: log.machine?.name ?? "?",
                itemName: log.item?.name ?? "—",
                output: log.finalOutput,
            });
        });

        return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
    }, [logs]);

    // ─── Grouped: By Product ────────────────────────────────────────────────
    const groupedByProduct = useMemo(() => {
        const map: Record<
            string,
            {
                total: number;
                records: { isoDate: string; displayDate: string; shift: number; machineName: string; output: number }[];
            }
        > = {};

        logs.forEach((log) => {
            const itemName = log.item?.name ?? "Không xác định";
            if (!map[itemName]) map[itemName] = { total: 0, records: [] };
            map[itemName].total += log.finalOutput;
            map[itemName].records.push({
                isoDate: dayjs(log.recordDate).format("YYYY-MM-DD"),
                displayDate: dayjs(log.recordDate).format("DD/MM"),
                shift: log.shift,
                machineName: log.machine?.name ?? "?",
                output: log.finalOutput,
            });
        });

        // Sort records within each product: newest first
        Object.values(map).forEach((v) => {
            v.records.sort((a, b) => b.isoDate.localeCompare(a.isoDate) || b.shift - a.shift);
        });

        return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
    }, [logs]);

    // ─── Loading screen ─────────────────────────────────────────────────────
    if (status === "loading") {
        return (
            <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
                <Spin size="large" />
            </div>
        );
    }

    // ─── Render ─────────────────────────────────────────────────────────────
    return (
        <div style={{ paddingBottom: 32 }}>
            {/* ── Sticky Header ── */}
            <div
                style={{
                    background: "#1677ff",
                    color: "white",
                    padding: "12px 16px",
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                }}
            >
                <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>
                        <BarChartOutlined style={{ marginRight: 8 }} />
                        Báo cáo sản lượng
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                        {(session?.user as any)?.fullName ?? session?.user?.name ?? ""}
                    </div>
                </div>
                <Button
                    type="text"
                    icon={<HomeOutlined />}
                    style={{ color: "white", fontSize: 18 }}
                    onClick={() => router.push("/")}
                />
            </div>

            {/* ── Filter Section ── */}
            <div style={{ padding: "14px 16px 0" }}>
                <Card size="small" style={{ marginBottom: 12 }}>
                    {/* Date Presets */}
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 6 }}>
                            <CalendarOutlined style={{ marginRight: 4 }} />
                            KHOẢNG THỜI GIAN
                        </div>
                        <Space wrap size={6} style={{ marginBottom: 8 }}>
                            {DATE_PRESETS.map((p) => (
                                <Button
                                    key={p.value}
                                    size="small"
                                    type={activePreset === p.value ? "primary" : "default"}
                                    onClick={() => handlePreset(p.value)}
                                >
                                    {p.label}
                                </Button>
                            ))}
                        </Space>
                        <RangePicker
                            value={dateRange}
                            onChange={(vals) => {
                                if (vals && vals[0] && vals[1]) {
                                    setDateRange([vals[0], vals[1]]);
                                    setActivePreset("");
                                }
                            }}
                            format="DD/MM/YYYY"
                            style={{ width: "100%" }}
                            size="middle"
                        />
                    </div>

                    {/* Process Multiselect */}
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 6 }}>
                            <AppstoreOutlined style={{ marginRight: 4 }} />
                            CÔNG ĐOẠN
                        </div>
                        <Select
                            mode="multiple"
                            allowClear
                            style={{ width: "100%" }}
                            placeholder="Tất cả công đoạn"
                            options={processes.map((p) => ({
                                label: p.factory ? `${p.name} (${p.factory.name})` : p.name,
                                value: p.id,
                            }))}
                            value={selectedProcesses}
                            onChange={setSelectedProcesses}
                            maxTagCount="responsive"
                            showSearch
                            optionFilterProp="label"
                        />
                    </div>

                    {/* Machine Multiselect */}
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 6 }}>
                            <RobotOutlined style={{ marginRight: 4 }} />
                            MÁY MÓC
                        </div>
                        <Select
                            mode="multiple"
                            allowClear
                            style={{ width: "100%" }}
                            placeholder="Tất cả (để trống = chọn tất cả máy)"
                            options={filteredMachines.map((m) => ({ label: m.name, value: m.id }))}
                            value={selectedMachines}
                            onChange={setSelectedMachines}
                            maxTagCount="responsive"
                            showSearch
                            optionFilterProp="label"
                            notFoundContent={
                                <div style={{ textAlign: "center", padding: 8, color: "#aaa" }}>
                                    Không có máy
                                </div>
                            }
                        />
                    </div>

                    {/* View Mode */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 6 }}>
                            <AppstoreOutlined style={{ marginRight: 4 }} />
                            XEM THEO
                        </div>
                        <Segmented
                            block
                            options={[
                                { label: "Theo ca làm việc", value: "shift" },
                                { label: "Theo mặt hàng", value: "product" },
                            ]}
                            value={viewMode}
                            onChange={(v) => setViewMode(v as "shift" | "product")}
                        />
                    </div>

                    {/* Search Button */}
                    <Button
                        type="primary"
                        block
                        size="large"
                        icon={<SearchOutlined />}
                        onClick={handleSearch}
                        loading={loading}
                    >
                        Xem báo cáo
                    </Button>
                </Card>
            </div>

            {/* ── Results ── */}
            {loading && (
                <div style={{ textAlign: "center", padding: 48 }}>
                    <Spin size="large" tip="Đang tải dữ liệu..." />
                </div>
            )}

            {!loading && searched && (
                <div style={{ padding: "0 16px" }}>
                    {/* Stats Card */}
                    <Card
                        size="small"
                        style={{
                            marginBottom: 12,
                            background: "linear-gradient(135deg, #f6ffed, #fff)",
                            borderColor: "#b7eb8f",
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <Statistic
                                title="Tổng sản lượng"
                                value={totalOutput}
                                precision={2}
                                suffix="kg"
                                styles={{ content: { color: "#389e0d", fontWeight: "bold", fontSize: 26 } }}
                            />
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: "#1677ff" }}>
                                    {logs.length.toLocaleString()}
                                </div>
                                <div style={{ fontSize: 12, color: "#888" }}>bản ghi</div>
                            </div>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, color: "#888" }}>
                            {dateRange[0].format("DD/MM/YYYY")} — {dateRange[1].format("DD/MM/YYYY")}
                            {truncated && (
                                <Tag color="orange" style={{ marginLeft: 8 }}>
                                    Chỉ hiển thị {PAGE_SIZE}/{totalCount} bản ghi
                                </Tag>
                            )}
                        </div>
                    </Card>

                    {/* Empty State */}
                    {logs.length === 0 && (
                        <div
                            style={{
                                textAlign: "center",
                                color: "#aaa",
                                padding: "48px 16px",
                                background: "white",
                                borderRadius: 8,
                            }}
                        >
                            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                            <div style={{ fontSize: 15 }}>Không có dữ liệu trong khoảng thời gian đã chọn</div>
                        </div>
                    )}

                    {/* ── VIEW: BY SHIFT ── */}
                    {viewMode === "shift" && logs.length > 0 && (
                        <Collapse
                            defaultActiveKey={groupedByShift.slice(0, 3).map(([iso]) => iso)}
                            style={{ background: "transparent", border: "none" }}
                            items={groupedByShift.map(([iso, { displayDate, dayTotal, shifts }]) => ({
                                key: iso,
                                style: { marginBottom: 8, borderRadius: 8, overflow: "hidden", background: "white" },
                                label: (
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ fontWeight: 700, fontSize: 15 }}>{displayDate}</span>
                                        <Tag color="green" style={{ fontWeight: 700, fontSize: 13 }}>
                                            {dayTotal.toLocaleString()} kg
                                        </Tag>
                                    </div>
                                ),
                                children: (
                                    <div>
                                        {[1, 2, 3]
                                            .filter((s) => !!shifts[s])
                                            .map((shift, idx, arr) => {
                                                const records = shifts[shift];
                                                const shiftTotal = records.reduce((sum, r) => sum + r.output, 0);
                                                return (
                                                    <div key={shift}>
                                                        {/* Shift header */}
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                justifyContent: "space-between",
                                                                alignItems: "center",
                                                                padding: "4px 0 6px",
                                                            }}
                                                        >
                                                            <Tag color="blue" style={{ fontWeight: 600 }}>
                                                                Ca {shift}
                                                            </Tag>
                                                            <span style={{ color: "#1677ff", fontWeight: 600, fontSize: 13 }}>
                                                                {shiftTotal.toLocaleString()} kg
                                                            </span>
                                                        </div>
                                                        {/* Machine rows */}
                                                        {records.map((r, i) => (
                                                            <div
                                                                key={i}
                                                                style={{
                                                                    display: "flex",
                                                                    justifyContent: "space-between",
                                                                    alignItems: "center",
                                                                    padding: "5px 10px",
                                                                    background: i % 2 === 0 ? "#fafafa" : "#fff",
                                                                    borderRadius: 4,
                                                                    marginBottom: 3,
                                                                    fontSize: 13,
                                                                }}
                                                            >
                                                                <span>
                                                                    <b style={{ color: "#333" }}>{r.machineName}</b>
                                                                    <span style={{ color: "#888", marginLeft: 6 }}>
                                                                        {r.itemName}
                                                                    </span>
                                                                </span>
                                                                <span style={{ color: "#389e0d", fontWeight: 600 }}>
                                                                    {r.output.toLocaleString()} kg
                                                                </span>
                                                            </div>
                                                        ))}
                                                        {idx < arr.length - 1 && (
                                                            <div
                                                                style={{
                                                                    borderTop: "1px solid #f0f0f0",
                                                                    margin: "8px 0",
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                ),
                            }))}
                        />
                    )}

                    {/* ── VIEW: BY PRODUCT ── */}
                    {viewMode === "product" && logs.length > 0 && (
                        <Collapse
                            defaultActiveKey={groupedByProduct.slice(0, 5).map(([name]) => name)}
                            style={{ background: "transparent", border: "none" }}
                            items={groupedByProduct.map(([itemName, { total, records }]) => ({
                                key: itemName,
                                style: { marginBottom: 8, borderRadius: 8, overflow: "hidden", background: "white" },
                                label: (
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ fontWeight: 700, fontSize: 15 }}>{itemName}</span>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <Badge count={records.length} color="#1677ff" />
                                            <Tag color="green" style={{ fontWeight: 700, fontSize: 13 }}>
                                                {total.toLocaleString()} kg
                                            </Tag>
                                        </div>
                                    </div>
                                ),
                                children: (
                                    <div>
                                        {records.map((r, i) => (
                                            <div
                                                key={i}
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                    padding: "5px 10px",
                                                    background: i % 2 === 0 ? "#fafafa" : "#fff",
                                                    borderRadius: 4,
                                                    marginBottom: 3,
                                                    fontSize: 13,
                                                }}
                                            >
                                                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <span style={{ color: "#888", minWidth: 40 }}>{r.displayDate}</span>
                                                    <Tag color="blue" style={{ fontSize: 11, padding: "0 4px", margin: 0 }}>
                                                        Ca {r.shift}
                                                    </Tag>
                                                    <b style={{ color: "#333" }}>{r.machineName}</b>
                                                </span>
                                                <span style={{ color: "#389e0d", fontWeight: 600 }}>
                                                    {r.output.toLocaleString()} kg
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ),
                            }))}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
