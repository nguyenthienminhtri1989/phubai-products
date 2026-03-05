"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
    Card, Select, Row, Col, message, Tag, Typography, DatePicker, Empty,
    Spin, Button, Space, Descriptions, Divider
} from "antd";
import {
    ApartmentOutlined, CalendarOutlined, ReloadOutlined,
    NodeIndexOutlined, HistoryOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";

const { Title, Text } = Typography;

interface Factory { id: number; name: string; }

interface LineLink {
    id: number;
    fromMachineId: number;
    toMachineId: number;
    stepOrder: number;
    fromMachine: { id: number; name: string; process: { name: string } };
    toMachine: { id: number; name: string; process: { name: string } };
}

interface ProductionLine {
    id: number;
    name: string;
    routeType: number;
    startDate: string;
    endDate: string | null;
    item: { id: number; name: string; ne?: number };
    factory: { id: number; name: string };
    createdBy?: { fullName: string };
    links: LineLink[];
}

// Thu tu cong doan
const PROCESS_ORDER: Record<string, number> = {
    "chai tho": 1, "chai": 1, "ghep": 2, "cuon": 3, "cuon cui": 3,
    "chai ky": 4, "tho": 5, "soi con": 6, "soi": 6, "danh ong": 7, "ong": 7,
};

function normalizeStr(str: string): string {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[đĐ]/g, "d")
        .toLowerCase();
}

function getProcessOrder(name: string): number {
    const normalized = normalizeStr(name);
    for (const [key, order] of Object.entries(PROCESS_ORDER)) {
        if (normalized.includes(key)) return order;
    }
    return 99;
}

// Mau sac theo cong doan
const PROCESS_COLORS: Record<number, { bg: string; border: string; text: string; header: string; headerText: string }> = {
    1: { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af", header: "#3b82f6", headerText: "#ffffff" },   // Chai Tho - xanh duong
    2: { bg: "#dcfce7", border: "#22c55e", text: "#166534", header: "#22c55e", headerText: "#ffffff" },   // Ghep - xanh la
    3: { bg: "#fef9c3", border: "#ca8a04", text: "#713f12", header: "#eab308", headerText: "#ffffff" },   // Cuon Cui - vang
    4: { bg: "#fce7f3", border: "#ec4899", text: "#831843", header: "#ec4899", headerText: "#ffffff" },   // Chai Ky - hong
    5: { bg: "#ede9fe", border: "#8b5cf6", text: "#4c1d95", header: "#8b5cf6", headerText: "#ffffff" },   // Tho - tim
    6: { bg: "#ccfbf1", border: "#14b8a6", text: "#134e4a", header: "#14b8a6", headerText: "#ffffff" },   // Soi Con - teal
    7: { bg: "#fee2e2", border: "#ef4444", text: "#7f1d1d", header: "#ef4444", headerText: "#ffffff" },   // Danh Ong - do
};

function getColor(processName: string) {
    const order = getProcessOrder(processName);
    return PROCESS_COLORS[order] || { bg: "#f3f4f6", border: "#9ca3af", text: "#374151", header: "#6b7280", headerText: "#ffffff" };
}

// ============================
// COMPONENT VE SO DO SVG
// ============================
function LineDiagramSVG({ line }: { line: ProductionLine }) {
    const diagramData = useMemo(() => {
        if (!line.links || line.links.length === 0) return null;

        // 1. Thu thap tat ca may va nhom theo cong doan
        const processMap: Record<string, { order: number; machines: Set<string> }> = {};

        line.links.forEach(link => {
            const fromProc = link.fromMachine.process.name;
            const toProc = link.toMachine.process.name;

            if (!processMap[fromProc]) {
                processMap[fromProc] = { order: getProcessOrder(fromProc), machines: new Set() };
            }
            if (!processMap[toProc]) {
                processMap[toProc] = { order: getProcessOrder(toProc), machines: new Set() };
            }

            processMap[fromProc].machines.add(JSON.stringify({ id: link.fromMachineId, name: link.fromMachine.name }));
            processMap[toProc].machines.add(JSON.stringify({ id: link.toMachineId, name: link.toMachine.name }));
        });

        // 2. Sap xep cong doan theo thu tu
        const columns = Object.entries(processMap)
            .map(([name, data]) => ({
                name,
                order: data.order,
                machines: Array.from(data.machines).map(s => JSON.parse(s)),
            }))
            .sort((a, b) => a.order - b.order);

        // 3. Tinh kich thuoc
        const colWidth = 150;
        const colGap = 100;
        const nodeHeight = 36;
        const nodeGap = 10;
        const headerHeight = 40;
        const paddingX = 30;
        const paddingY = 20;

        const maxMachines = Math.max(...columns.map(c => c.machines.length));
        const svgWidth = paddingX * 2 + columns.length * colWidth + (columns.length - 1) * colGap;
        const svgHeight = paddingY * 2 + headerHeight + maxMachines * (nodeHeight + nodeGap) + 20;

        // 4. Tinh vi tri tung node
        const nodePositions: Record<number, { x: number; y: number; col: number }> = {};

        columns.forEach((col, colIndex) => {
            const x = paddingX + colIndex * (colWidth + colGap);
            col.machines.forEach((m, mIndex) => {
                const y = paddingY + headerHeight + mIndex * (nodeHeight + nodeGap);
                nodePositions[m.id] = { x, y, col: colIndex };
            });
        });

        return { columns, nodePositions, svgWidth, svgHeight, colWidth, nodeHeight, paddingX, paddingY, headerHeight };
    }, [line]);

    if (!diagramData) return <Empty description="Khong co du lieu lien ket" />;

    const { columns, nodePositions, svgWidth, svgHeight, colWidth, nodeHeight, paddingX, paddingY, headerHeight } = diagramData;

    return (
        <div style={{ overflowX: "auto", padding: "10px 0" }}>
            <svg width={svgWidth} height={svgHeight} style={{ minWidth: svgWidth }}>
                {/* Defs cho arrow marker */}
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#1677ff" />
                    </marker>
                </defs>

                {/* Ve cot cong doan (header) */}
                {columns.map((col, colIndex) => {
                    const x = paddingX + colIndex * (colWidth + 100);
                    const color = getColor(col.name);
                    return (
                        <g key={col.name}>
                            {/* Header cong doan */}
                            <rect x={x - 5} y={paddingY - 5} width={colWidth + 10} height={30}
                                rx={6} fill={color.header} stroke={color.header} strokeWidth={1.5} />
                            <text x={x + colWidth / 2} y={paddingY + 14} textAnchor="middle"
                                fontSize={12} fontWeight="bold" fill={color.headerText}>
                                {col.name}
                            </text>

                            {/* Cac node may */}
                            {col.machines.map((m) => {
                                const pos = nodePositions[m.id];
                                if (!pos) return null;
                                return (
                                    <g key={m.id}>
                                        <rect x={pos.x} y={pos.y} width={colWidth} height={nodeHeight}
                                            rx={6} fill={color.bg} stroke={color.border} strokeWidth={1.5}
                                            style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))" }} />
                                        <text x={pos.x + colWidth / 2} y={pos.y + nodeHeight / 2 + 4}
                                            textAnchor="middle" fontSize={13} fontWeight="500" fill={color.text}>
                                            {m.name}
                                        </text>
                                    </g>
                                );
                            })}
                        </g>
                    );
                })}

                {/* Ve duong noi (links) */}
                {line.links.map((link) => {
                    const from = nodePositions[link.fromMachineId];
                    const to = nodePositions[link.toMachineId];
                    if (!from || !to) return null;

                    const x1 = from.x + colWidth;
                    const y1 = from.y + nodeHeight / 2;
                    const x2 = to.x;
                    const y2 = to.y + nodeHeight / 2;

                    // Duong cong bezier
                    const midX = (x1 + x2) / 2;

                    return (
                        <path
                            key={link.id}
                            d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                            fill="none"
                            stroke="#1677ff"
                            strokeWidth={1.5}
                            strokeOpacity={0.6}
                            markerEnd="url(#arrowhead)"
                        />
                    );
                })}
            </svg>
        </div>
    );
}

// ============================
// TRANG CHINH
// ============================
export default function LineDiagramPage() {
    const [factories, setFactories] = useState<Factory[]>([]);
    const [lines, setLines] = useState<ProductionLine[]>([]);
    const [loading, setLoading] = useState(false);

    // Filters
    const [selectedFactoryId, setSelectedFactoryId] = useState<number | null>(null);
    const [selectedDate, setSelectedDate] = useState(dayjs());
    const [selectedLineId, setSelectedLineId] = useState<number | null>(null);

    // Fetch factories
    useEffect(() => {
        fetch("/api/factories").then(r => r.json()).then(setFactories).catch(console.error);
    }, []);

    // Fetch lines
    const fetchLines = async () => {
        if (!selectedFactoryId) return;
        setLoading(true);
        try {
            const dateStr = selectedDate.format("YYYY-MM-DD");
            const res = await fetch(`/api/production/lines?factoryId=${selectedFactoryId}&date=${dateStr}`);
            if (res.ok) {
                const data = await res.json();
                setLines(data);
                if (data.length > 0 && !selectedLineId) {
                    setSelectedLineId(data[0].id);
                }
            }
        } catch (e) { message.error("Loi tai du lieu line"); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchLines(); }, [selectedFactoryId, selectedDate]);

    // Line dang chon
    const currentLine = lines.find(l => l.id === selectedLineId);

    return (
        <div style={{ padding: 20 }}>
            <Title level={3}><NodeIndexOutlined /> So do Line San xuat</Title>

            {/* BO LOC */}
            <Card size="small" style={{ marginBottom: 16 }}>
                <Row gutter={16} align="middle">
                    <Col span={6}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Nha may:</div>
                        <Select
                            style={{ width: "100%" }}
                            placeholder="Chon nha may"
                            options={factories.map(f => ({ label: f.name, value: f.id }))}
                            onChange={val => { setSelectedFactoryId(val); setSelectedLineId(null); setLines([]); }}
                            value={selectedFactoryId}
                        />
                    </Col>
                    <Col span={6}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Ngay (xem lich su):</div>
                        <DatePicker
                            value={selectedDate}
                            onChange={val => val && setSelectedDate(val)}
                            format="DD/MM/YYYY"
                            style={{ width: "100%" }}
                        />
                    </Col>
                    <Col span={8}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Chon Line:</div>
                        <Select
                            style={{ width: "100%" }}
                            placeholder={lines.length === 0 ? "Chua co line nao" : "Chon line de xem so do"}
                            options={lines.map(l => ({
                                label: `${l.name} (${l.item.name})${!l.endDate ? " - Dang hieu luc" : ""}`,
                                value: l.id,
                            }))}
                            onChange={setSelectedLineId}
                            value={selectedLineId}
                            disabled={lines.length === 0}
                        />
                    </Col>
                    <Col span={4} style={{ textAlign: "right", paddingTop: 22 }}>
                        <Button icon={<ReloadOutlined />} onClick={fetchLines} loading={loading}>
                            Tai lai
                        </Button>
                    </Col>
                </Row>
            </Card>

            {/* THONG TIN LINE */}
            {currentLine && (
                <Card size="small" style={{ marginBottom: 16 }}>
                    <Row gutter={16}>
                        <Col span={6}>
                            <Text type="secondary">Mat hang:</Text>
                            <div><Tag color="blue" style={{ fontSize: 14 }}>{currentLine.item.name}</Tag></div>
                        </Col>
                        <Col span={4}>
                            <Text type="secondary">Loai tuyen:</Text>
                            <div>
                                <Tag color={currentLine.routeType === 2 ? "orange" : "green"}>
                                    {currentLine.routeType === 2 ? "Co chai ky" : "Khong chai ky"}
                                </Tag>
                            </div>
                        </Col>
                        <Col span={4}>
                            <Text type="secondary">Bat dau:</Text>
                            <div><b>{dayjs(currentLine.startDate).format("DD/MM/YYYY")}</b></div>
                        </Col>
                        <Col span={4}>
                            <Text type="secondary">Ket thuc:</Text>
                            <div>
                                {currentLine.endDate
                                    ? dayjs(currentLine.endDate).format("DD/MM/YYYY")
                                    : <Tag color="green">Dang hieu luc</Tag>}
                            </div>
                        </Col>
                        <Col span={3}>
                            <Text type="secondary">So lien ket:</Text>
                            <div><b>{currentLine.links.length}</b></div>
                        </Col>
                        <Col span={3}>
                            <Text type="secondary">Nguoi tao:</Text>
                            <div>{currentLine.createdBy?.fullName || "---"}</div>
                        </Col>
                    </Row>
                </Card>
            )}

            {/* SO DO */}
            <Card
                title={
                    currentLine
                        ? <span><ApartmentOutlined /> {currentLine.name}</span>
                        : <span><ApartmentOutlined /> So do duong di san pham</span>
                }
                style={{ minHeight: 300 }}
            >
                {loading ? (
                    <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" tip="Dang tai so do..." /></div>
                ) : !selectedFactoryId ? (
                    <Empty description="Vui long chon Nha may de xem so do" />
                ) : !currentLine ? (
                    <Empty description="Chua co Line san xuat nao trong thoi diem nay. Hay tao moi tai trang Thiet lap Line." />
                ) : (
                    <LineDiagramSVG line={currentLine} />
                )}
            </Card>

            {/* CHU THICH MAU */}
            {currentLine && (
                <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {Object.entries(PROCESS_ORDER)
                        .filter((v, i, a) => a.findIndex(x => x[1] === v[1]) === i) // Unique orders
                        .sort((a, b) => a[1] - b[1])
                        .map(([name, order]) => {
                            const c = PROCESS_COLORS[order];
                            if (!c) return null;
                            return (
                                <div key={order} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <div style={{ width: 14, height: 14, borderRadius: 3, background: c.header }} />
                                    <div style={{ width: 14, height: 14, borderRadius: 3, background: c.bg, border: `2px solid ${c.border}` }} />
                                    <span style={{ fontSize: 12, color: "#555", textTransform: "capitalize" }}>{name}</span>
                                </div>
                            );
                        })}
                </div>
            )}
        </div>
    );
}
