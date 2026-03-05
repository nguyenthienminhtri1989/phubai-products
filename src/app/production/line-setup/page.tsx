"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
    Card, Select, Button, Row, Col, message, Tag, Typography, DatePicker,
    Input, Radio, Table, Modal, Space, Alert, Popconfirm, Tooltip, Tabs,
    Checkbox, Divider
} from "antd";
import {
    PlusOutlined, SaveOutlined, ApartmentOutlined,
    ArrowRightOutlined, DeleteOutlined, EditOutlined,
    BulbOutlined, UnorderedListOutlined, StopOutlined,
    SwapRightOutlined, ClearOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useSession } from "next-auth/react";

const { Title, Text } = Typography;

interface Factory { id: number; name: string; }
interface Process { id: number; name: string; factoryId: number; }
interface Item { id: number; name: string; ne?: number; }
interface Machine {
    id: number; name: string; processId: number;
    process?: { name: string }; currentItem?: { name: string };
}
interface LineLink {
    id?: number;
    fromMachineId: number; toMachineId: number; stepOrder: number;
    fromMachine?: { id: number; name: string; process: { name: string } };
    toMachine?: { id: number; name: string; process: { name: string } };
}
interface ProductionLine {
    id: number; name: string; routeType: number;
    startDate: string; endDate: string | null;
    item: { id: number; name: string };
    factory: { id: number; name: string };
    createdBy?: { fullName: string };
    links: LineLink[];
}

// Thu tu cong doan
const PROCESS_ORDER: Record<string, number> = {
    "chai tho": 1, "chai": 1, "ghep": 2, "cuon": 3, "cuon cui": 3,
    "chai ky": 4, "tho": 5, "soi con": 6, "soi": 6, "danh ong": 7, "ong": 7,
};

function getProcessOrder(name: string): number {
    const lower = name.toLowerCase();
    for (const [key, order] of Object.entries(PROCESS_ORDER)) {
        if (lower.includes(key)) return order;
    }
    return 99;
}

// Mau sac theo cong doan
const PROCESS_COLORS: Record<number, string> = {
    1: "#1677ff", 2: "#52c41a", 3: "#faad14", 4: "#eb2f96",
    5: "#722ed1", 6: "#13c2c2", 7: "#f5222d",
};

function getProcessColor(name: string) {
    return PROCESS_COLORS[getProcessOrder(name)] || "#666";
}

// Lien ket
interface LinkDraft {
    fromMachineId: number; fromMachineName: string; fromProcessName: string;
    toMachineId: number; toMachineName: string; toProcessName: string;
    stepOrder: number;
}

export default function LineSetupPage() {
    const { data: session } = useSession();

    // Danh muc
    const [factories, setFactories] = useState<Factory[]>([]);
    const [processes, setProcesses] = useState<Process[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    const [allMachines, setAllMachines] = useState<Machine[]>([]);

    // Danh sach line da tao
    const [existingLines, setExistingLines] = useState<ProductionLine[]>([]);
    const [loadingLines, setLoadingLines] = useState(false);

    // Tab
    const [activeTab, setActiveTab] = useState<string>("list");

    // Form state
    const [editingLineId, setEditingLineId] = useState<number | null>(null);
    const [selectedFactoryId, setSelectedFactoryId] = useState<number | null>(null);
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [routeType, setRouteType] = useState<number>(1);
    const [lineName, setLineName] = useState("");
    const [startDate, setStartDate] = useState(dayjs());

    // Lien ket
    const [links, setLinks] = useState<LinkDraft[]>([]);

    // === THEM LIEN KET NHANH ===
    // Che do: "one-to-many" (1 nguon -> nhieu dich) hoac "many-to-one" (nhieu nguon -> 1 dich)
    const [linkMode, setLinkMode] = useState<"one-to-many" | "many-to-one">("one-to-many");
    const [selectedSource, setSelectedSource] = useState<number | null>(null);
    const [selectedTargets, setSelectedTargets] = useState<number[]>([]);

    const [suggestedMachines, setSuggestedMachines] = useState<Machine[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Fetch danh muc
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [fRes, pRes, iRes, mRes] = await Promise.all([
                    fetch("/api/factories"), fetch("/api/processes"),
                    fetch("/api/items"), fetch("/api/machines"),
                ]);
                if (fRes.ok) setFactories(await fRes.json());
                if (pRes.ok) setProcesses(await pRes.json());
                if (iRes.ok) setItems(await iRes.json());
                if (mRes.ok) setAllMachines(await mRes.json());
            } catch (e) { message.error("Loi tai danh muc"); }
        };
        fetchData();
    }, []);

    // Fetch lines
    const fetchExistingLines = async () => {
        setLoadingLines(true);
        try {
            const res = await fetch("/api/production/lines?activeOnly=false");
            if (res.ok) setExistingLines(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoadingLines(false); }
    };
    useEffect(() => { fetchExistingLines(); }, []);

    // Goi y
    useEffect(() => {
        if (!selectedItemId || !selectedFactoryId) { setSuggestedMachines([]); return; }
        const fetchSuggest = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/production/lines/suggest?itemId=${selectedItemId}&factoryId=${selectedFactoryId}`);
                if (res.ok) {
                    const data = await res.json();
                    setSuggestedMachines(data.machines || []);
                }
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        fetchSuggest();
        if (!editingLineId) {
            const item = items.find(i => i.id === selectedItemId);
            const factory = factories.find(f => f.id === selectedFactoryId);
            if (item && factory) setLineName(`Line ${item.name} - ${factory.name}`);
        }
    }, [selectedItemId, selectedFactoryId]);

    // May nhom theo cong doan (goi y)
    const groupedSuggested = useMemo(() => {
        const groups: Record<string, Machine[]> = {};
        suggestedMachines.forEach(m => {
            const pName = m.process?.name || "Khac";
            if (!groups[pName]) groups[pName] = [];
            groups[pName].push(m);
        });
        return Object.entries(groups).sort(([a], [b]) => getProcessOrder(a) - getProcessOrder(b));
    }, [suggestedMachines]);

    // Tat ca may trong nha may, nhom theo cong doan
    const machinesInFactory = useMemo(() => {
        if (!selectedFactoryId) return [];
        return allMachines.filter(m => {
            const proc = processes.find(p => p.id === m.processId);
            return proc && proc.factoryId === selectedFactoryId && m.isActive !== false;
        }).sort((a, b) => {
            const orderA = getProcessOrder(a.process?.name || "");
            const orderB = getProcessOrder(b.process?.name || "");
            return orderA - orderB || a.id - b.id;
        });
    }, [allMachines, selectedFactoryId, processes]);

    const machinesGroupedByProcess = useMemo(() => {
        const groups: Record<string, Machine[]> = {};
        machinesInFactory.forEach(m => {
            const pName = m.process?.name || "Khac";
            if (!groups[pName]) groups[pName] = [];
            groups[pName].push(m);
        });
        return Object.entries(groups).sort(([a], [b]) => getProcessOrder(a) - getProcessOrder(b));
    }, [machinesInFactory]);

    // ===== LINK ACTIONS =====

    // Them nhieu lien ket cung luc
    const handleAddLinks = () => {
        if (!selectedSource || selectedTargets.length === 0) {
            message.warning("Vui long chon may va tick chon may lien ket");
            return;
        }

        const sourceM = allMachines.find(m => m.id === selectedSource);
        if (!sourceM) return;

        const newLinks: LinkDraft[] = [];

        selectedTargets.forEach(targetId => {
            const targetM = allMachines.find(m => m.id === targetId);
            if (!targetM) return;

            const fromId = linkMode === "one-to-many" ? selectedSource : targetId;
            const toId = linkMode === "one-to-many" ? targetId : selectedSource;
            const fromM = linkMode === "one-to-many" ? sourceM : targetM;
            const toM = linkMode === "one-to-many" ? targetM : sourceM;

            // Check trung
            const exists = links.find(l => l.fromMachineId === fromId && l.toMachineId === toId);
            if (exists) return;
            if (fromId === toId) return;

            newLinks.push({
                fromMachineId: fromId,
                toMachineId: toId,
                fromMachineName: fromM.name,
                fromProcessName: fromM.process?.name || "",
                toMachineName: toM.name,
                toProcessName: toM.process?.name || "",
                stepOrder: getProcessOrder(fromM.process?.name || ""),
            });
        });

        if (newLinks.length === 0) {
            message.info("Tat ca lien ket da ton tai");
            return;
        }

        setLinks(prev => [...prev, ...newLinks].sort((a, b) => a.stepOrder - b.stepOrder));
        message.success(`Da them ${newLinks.length} lien ket`);
        setSelectedTargets([]);
    };

    const handleRemoveLink = (fromId: number, toId: number) => {
        setLinks(prev => prev.filter(l => !(l.fromMachineId === fromId && l.toMachineId === toId)));
    };

    const handleClearAllLinks = () => {
        Modal.confirm({
            title: "Xoa tat ca lien ket?",
            content: "Ban co chac muon xoa het cac lien ket da thiet lap?",
            okText: "Xoa het", cancelText: "Huy", okButtonProps: { danger: true },
            onOk: () => setLinks([]),
        });
    };

    // Reset form
    const resetForm = () => {
        setEditingLineId(null); setSelectedFactoryId(null); setSelectedItemId(null);
        setRouteType(1); setLineName(""); setStartDate(dayjs());
        setLinks([]); setSuggestedMachines([]);
        setSelectedSource(null); setSelectedTargets([]);
    };

    // Edit line
    const handleEditLine = (line: ProductionLine) => {
        setEditingLineId(line.id);
        setSelectedFactoryId(line.factory.id);
        setSelectedItemId(line.item.id);
        setRouteType(line.routeType);
        setLineName(line.name);
        setStartDate(dayjs(line.startDate));
        const drafts: LinkDraft[] = line.links.map(l => ({
            fromMachineId: l.fromMachineId,
            fromMachineName: l.fromMachine?.name || `#${l.fromMachineId}`,
            fromProcessName: l.fromMachine?.process?.name || "",
            toMachineId: l.toMachineId,
            toMachineName: l.toMachine?.name || `#${l.toMachineId}`,
            toProcessName: l.toMachine?.process?.name || "",
            stepOrder: l.stepOrder,
        }));
        setLinks(drafts);
        setActiveTab("form");
        setSelectedSource(null); setSelectedTargets([]);
    };

    // Dong line
    const handleCloseLine = async (lineId: number) => {
        try {
            const res = await fetch(`/api/production/lines/${lineId}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ endDate: dayjs().format("YYYY-MM-DD") }),
            });
            if (!res.ok) throw new Error("Loi dong line");
            message.success("Da dong line"); fetchExistingLines();
        } catch (e: any) { message.error(e.message); }
    };

    // Xoa line
    const handleDeleteLine = async (lineId: number) => {
        try {
            const res = await fetch(`/api/production/lines/${lineId}`, { method: "DELETE" });
            if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
            message.success("Da xoa line"); fetchExistingLines();
        } catch (e: any) { message.error(e.message); }
    };

    // Luu
    const handleSave = async () => {
        if (!lineName || links.length === 0) {
            message.error("Dien ten line va them it nhat 1 lien ket"); return;
        }
        const isEditing = !!editingLineId;

        Modal.confirm({
            title: isEditing ? "Xac nhan cap nhat Line" : "Xac nhan tao Line",
            content: isEditing
                ? `Cap nhat "${lineName}" voi ${links.length} lien ket?`
                : `Tao "${lineName}" tu ${startDate.format("DD/MM/YYYY")}? Line cu cung mat hang se tu dong dong.`,
            okText: isEditing ? "Cap nhat" : "Tao moi", cancelText: "Huy",
            onOk: async () => {
                setSaving(true);
                try {
                    const linkData = links.map(l => ({
                        fromMachineId: l.fromMachineId, toMachineId: l.toMachineId, stepOrder: l.stepOrder,
                    }));
                    let res;
                    if (isEditing) {
                        res = await fetch(`/api/production/lines/${editingLineId}`, {
                            method: "PUT", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name: lineName, routeType, links: linkData }),
                        });
                    } else {
                        res = await fetch("/api/production/lines", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                name: lineName, itemId: selectedItemId, factoryId: selectedFactoryId,
                                routeType, startDate: startDate.format("YYYY-MM-DD"), links: linkData,
                            }),
                        });
                    }
                    if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
                    message.success(isEditing ? "Da cap nhat!" : "Da tao Line moi!");
                    resetForm(); fetchExistingLines(); setActiveTab("list");
                } catch (e: any) { message.error(e.message); }
                finally { setSaving(false); }
            },
        });
    };

    // Thong ke lien ket: may nao duoc chon lam nguon/dich bao nhieu lan
    const linkStats = useMemo(() => {
        const stats: Record<number, { asSource: number; asTarget: number }> = {};
        links.forEach(l => {
            if (!stats[l.fromMachineId]) stats[l.fromMachineId] = { asSource: 0, asTarget: 0 };
            if (!stats[l.toMachineId]) stats[l.toMachineId] = { asSource: 0, asTarget: 0 };
            stats[l.fromMachineId].asSource++;
            stats[l.toMachineId].asTarget++;
        });
        return stats;
    }, [links]);

    // ===== RENDER =====

    const lineColumns = [
        {
            title: "Ten Line", dataIndex: "name",
            render: (t: string, r: ProductionLine) => (
                <div><b>{t}</b><div style={{ fontSize: 11, color: "#888" }}>{r.factory.name}</div></div>
            ),
        },
        { title: "Mat hang", key: "item", render: (_: any, r: ProductionLine) => <Tag color="blue">{r.item.name}</Tag> },
        {
            title: "Loai", key: "routeType", width: 120,
            render: (_: any, r: ProductionLine) => (
                <Tag color={r.routeType === 2 ? "orange" : "green"}>
                    {r.routeType === 2 ? "Co chai ky" : "Khong chai ky"}
                </Tag>
            ),
        },
        { title: "Bat dau", key: "start", width: 110, render: (_: any, r: ProductionLine) => dayjs(r.startDate).format("DD/MM/YYYY") },
        {
            title: "Trang thai", key: "status", width: 120,
            render: (_: any, r: ProductionLine) =>
                r.endDate ? <Tag>Dong ({dayjs(r.endDate).format("DD/MM")})</Tag> : <Tag color="green">Hieu luc</Tag>,
        },
        { title: "Lien ket", key: "cnt", width: 70, align: "center" as const, render: (_: any, r: ProductionLine) => <b>{r.links.length}</b> },
        {
            title: "Thao tac", key: "actions", width: 200,
            render: (_: any, r: ProductionLine) => (
                <Space size={4}>
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleEditLine(r)}>Sua</Button>
                    {!r.endDate && (
                        <Popconfirm title="Dong line nay?" onConfirm={() => handleCloseLine(r.id)} okText="Dong" cancelText="Huy">
                            <Button size="small" icon={<StopOutlined />} danger>Dong</Button>
                        </Popconfirm>
                    )}
                    <Popconfirm title="Xoa vinh vien?" onConfirm={() => handleDeleteLine(r.id)} okText="Xoa" cancelText="Huy">
                        <Button size="small" icon={<DeleteOutlined />} danger />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    // Nhom lien ket theo may nguon de hien thi dep hon
    const linksGroupedBySource = useMemo(() => {
        const groups: Record<string, LinkDraft[]> = {};
        links.forEach(l => {
            const key = `${l.fromMachineId}-${l.fromMachineName}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(l);
        });
        return Object.entries(groups).sort(([, a], [, b]) => (a[0]?.stepOrder || 0) - (b[0]?.stepOrder || 0));
    }, [links]);

    return (
        <div style={{ padding: 20 }}>
            <Title level={3}><ApartmentOutlined /> Thiet lap Line San xuat</Title>

            <Tabs activeKey={activeTab}
                onChange={key => { setActiveTab(key); if (key === "list") resetForm(); }}
                items={[
                    {
                        key: "list",
                        label: <span><UnorderedListOutlined /> Danh sach Line</span>,
                        children: (
                            <Card size="small" extra={
                                <Button type="primary" icon={<PlusOutlined />} onClick={() => { resetForm(); setActiveTab("form"); }}>
                                    Tao Line moi
                                </Button>
                            }>
                                <Table rowKey="id" columns={lineColumns} dataSource={existingLines}
                                    loading={loadingLines} pagination={{ pageSize: 10 }} size="small" />
                            </Card>
                        ),
                    },
                    {
                        key: "form",
                        label: <span><EditOutlined /> {editingLineId ? `Sua Line #${editingLineId}` : "Tao Line moi"}</span>,
                        children: (
                            <>
                                {/* THONG TIN CO BAN */}
                                <Card title="Thong tin co ban" size="small" style={{ marginBottom: 16 }}>
                                    <Row gutter={16}>
                                        <Col span={6}>
                                            <div style={{ fontWeight: 500, marginBottom: 4 }}>Nha may:</div>
                                            <Select style={{ width: "100%" }} placeholder="Chon nha may"
                                                options={factories.map(f => ({ label: f.name, value: f.id }))}
                                                onChange={val => { setSelectedFactoryId(val); setSelectedItemId(null); setLinks([]); }}
                                                value={selectedFactoryId} disabled={!!editingLineId} />
                                        </Col>
                                        <Col span={6}>
                                            <div style={{ fontWeight: 500, marginBottom: 4 }}>Mat hang:</div>
                                            <Select style={{ width: "100%" }} placeholder="Chon mat hang" showSearch optionFilterProp="label"
                                                options={items.map(i => ({ label: `${i.name}${i.ne ? ` (NE ${i.ne})` : ""}`, value: i.id }))}
                                                onChange={val => { setSelectedItemId(val); setLinks([]); }}
                                                value={selectedItemId} disabled={!selectedFactoryId || !!editingLineId} />
                                        </Col>
                                        <Col span={4}>
                                            <div style={{ fontWeight: 500, marginBottom: 4 }}>Loai tuyen:</div>
                                            <Radio.Group value={routeType} onChange={e => setRouteType(e.target.value)}>
                                                <Radio value={1}>Khong chai ky</Radio>
                                                <Radio value={2}>Co chai ky</Radio>
                                            </Radio.Group>
                                        </Col>
                                        <Col span={4}>
                                            <div style={{ fontWeight: 500, marginBottom: 4 }}>Ngay bat dau:</div>
                                            <DatePicker value={startDate} onChange={val => val && setStartDate(val)}
                                                format="DD/MM/YYYY" style={{ width: "100%" }} disabled={!!editingLineId} />
                                        </Col>
                                        <Col span={4}>
                                            <div style={{ fontWeight: 500, marginBottom: 4 }}>Ten line:</div>
                                            <Input value={lineName} onChange={e => setLineName(e.target.value)} />
                                        </Col>
                                    </Row>
                                </Card>

                                {/* GOI Y */}
                                {suggestedMachines.length > 0 && (
                                    <Card title={<span><BulbOutlined style={{ color: "#faad14" }} /> May goi y (cung mat hang)</span>}
                                        size="small" style={{ marginBottom: 16, background: "#fffbe6", border: "1px solid #ffe58f" }}>
                                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                                            {groupedSuggested.map(([processName, machines]) => (
                                                <div key={processName} style={{
                                                    background: "#fff", border: "1px solid #d9d9d9", borderRadius: 8, padding: 12, minWidth: 120,
                                                }}>
                                                    <div style={{ fontWeight: 600, marginBottom: 6, color: getProcessColor(processName), fontSize: 13 }}>
                                                        {processName}
                                                    </div>
                                                    {machines.map(m => (
                                                        <Tag key={m.id} style={{ margin: "2px 0", display: "block" }}>{m.name}</Tag>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                )}

                                {/* THEM LIEN KET NHANH */}
                                <Card
                                    title="Them lien ket nhanh"
                                    size="small"
                                    style={{ marginBottom: 16, border: "1px solid #91caff" }}
                                    extra={
                                        <Radio.Group value={linkMode} onChange={e => { setLinkMode(e.target.value); setSelectedSource(null); setSelectedTargets([]); }}
                                            size="small" optionType="button" buttonStyle="solid">
                                            <Radio.Button value="one-to-many">1 Nguon → Nhieu Dich</Radio.Button>
                                            <Radio.Button value="many-to-one">Nhieu Nguon → 1 Dich</Radio.Button>
                                        </Radio.Group>
                                    }
                                >
                                    <Row gutter={16}>
                                        {/* Cot trai: Chon may chinh */}
                                        <Col span={8}>
                                            <div style={{
                                                background: linkMode === "one-to-many" ? "#e6f7ff" : "#f6ffed",
                                                padding: 12, borderRadius: 8, height: "100%",
                                            }}>
                                                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                                                    {linkMode === "one-to-many"
                                                        ? "① Chon 1 MAY NGUON (cap hang):"
                                                        : "① Chon 1 MAY DICH (nhan hang):"}
                                                </div>
                                                <Select
                                                    style={{ width: "100%" }}
                                                    placeholder={linkMode === "one-to-many" ? "Chon may nguon..." : "Chon may dich..."}
                                                    showSearch optionFilterProp="label" size="large"
                                                    value={selectedSource}
                                                    onChange={val => { setSelectedSource(val); setSelectedTargets([]); }}
                                                    options={machinesGroupedByProcess.map(([pName, machines]) => ({
                                                        label: <span style={{ fontWeight: 600, color: getProcessColor(pName) }}>{pName}</span>,
                                                        options: machines.map(m => ({
                                                            label: (
                                                                <span>
                                                                    {m.name}
                                                                    {linkStats[m.id] && (
                                                                        <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>
                                                                            (↗{linkStats[m.id].asSource} ↙{linkStats[m.id].asTarget})
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            ),
                                                            value: m.id,
                                                        })),
                                                    }))}
                                                />
                                                {selectedSource && (
                                                    <div style={{ marginTop: 10 }}>
                                                        {(() => {
                                                            const m = allMachines.find(x => x.id === selectedSource);
                                                            if (!m) return null;
                                                            return (
                                                                <Tag color={linkMode === "one-to-many" ? "blue" : "green"} style={{ fontSize: 14, padding: "4px 12px" }}>
                                                                    {m.name} ({m.process?.name})
                                                                </Tag>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                            </div>
                                        </Col>

                                        {/* Mui ten */}
                                        <Col span={1} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            <SwapRightOutlined style={{ fontSize: 28, color: "#1677ff" }} />
                                        </Col>

                                        {/* Cot phai: Tick chon nhieu may */}
                                        <Col span={15}>
                                            <div style={{
                                                background: linkMode === "one-to-many" ? "#f6ffed" : "#e6f7ff",
                                                padding: 12, borderRadius: 8,
                                            }}>
                                                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                                                    <span>
                                                        {linkMode === "one-to-many"
                                                            ? "② Tick chon cac MAY DICH (nhan hang tu may tren):"
                                                            : "② Tick chon cac MAY NGUON (cap hang cho may tren):"}
                                                    </span>
                                                    {selectedTargets.length > 0 && (
                                                        <Tag color="blue">{selectedTargets.length} may da chon</Tag>
                                                    )}
                                                </div>

                                                {!selectedSource ? (
                                                    <Alert message="Chon may o ben trai truoc" type="info" showIcon />
                                                ) : (
                                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                                                        {machinesGroupedByProcess.map(([pName, machines]) => {
                                                            // Loc bo may da chon lam source
                                                            const filteredM = machines.filter(m => m.id !== selectedSource);
                                                            if (filteredM.length === 0) return null;

                                                            // Check all trong nhom
                                                            const allInGroupSelected = filteredM.every(m => selectedTargets.includes(m.id));
                                                            const someInGroupSelected = filteredM.some(m => selectedTargets.includes(m.id));

                                                            return (
                                                                <div key={pName} style={{
                                                                    background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, padding: "8px 12px", minWidth: 130,
                                                                }}>
                                                                    <Checkbox
                                                                        checked={allInGroupSelected}
                                                                        indeterminate={someInGroupSelected && !allInGroupSelected}
                                                                        onChange={e => {
                                                                            if (e.target.checked) {
                                                                                setSelectedTargets(prev => [...new Set([...prev, ...filteredM.map(m => m.id)])]);
                                                                            } else {
                                                                                setSelectedTargets(prev => prev.filter(id => !filteredM.find(m => m.id === id)));
                                                                            }
                                                                        }}
                                                                        style={{ marginBottom: 6 }}
                                                                    >
                                                                        <span style={{ fontWeight: 600, color: getProcessColor(pName), fontSize: 12 }}>{pName}</span>
                                                                    </Checkbox>
                                                                    <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 24 }}>
                                                                        {filteredM.map(m => (
                                                                            <Checkbox
                                                                                key={m.id}
                                                                                checked={selectedTargets.includes(m.id)}
                                                                                onChange={e => {
                                                                                    if (e.target.checked) {
                                                                                        setSelectedTargets(prev => [...prev, m.id]);
                                                                                    } else {
                                                                                        setSelectedTargets(prev => prev.filter(id => id !== m.id));
                                                                                    }
                                                                                }}
                                                                                style={{ fontSize: 13 }}
                                                                            >
                                                                                {m.name}
                                                                            </Checkbox>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* Nut them */}
                                                {selectedSource && selectedTargets.length > 0 && (
                                                    <div style={{ marginTop: 12, textAlign: "right" }}>
                                                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddLinks}>
                                                            Them {selectedTargets.length} lien ket
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </Col>
                                    </Row>
                                </Card>

                                {/* DANH SACH LIEN KET DA THIET LAP */}
                                <Card
                                    title={`Lien ket da thiet lap (${links.length})`}
                                    size="small"
                                    extra={
                                        <Space>
                                            {links.length > 0 && (
                                                <Button icon={<ClearOutlined />} danger size="small" onClick={handleClearAllLinks}>
                                                    Xoa tat ca
                                                </Button>
                                            )}
                                            <Button onClick={() => { resetForm(); setActiveTab("list"); }}>Huy</Button>
                                            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}
                                                loading={saving} disabled={links.length === 0}>
                                                {editingLineId ? "Cap nhat" : "Luu"} ({links.length} lien ket)
                                            </Button>
                                        </Space>
                                    }
                                >
                                    {links.length === 0 ? (
                                        <Alert message="Chua co lien ket nao. Dung bang o tren de them lien ket." type="info" showIcon />
                                    ) : (
                                        <div>
                                            {linksGroupedBySource.map(([key, groupLinks]) => (
                                                <div key={key} style={{
                                                    marginBottom: 12, padding: 12, background: "#fafafa", borderRadius: 8,
                                                    border: "1px solid #f0f0f0",
                                                }}>
                                                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                                                        {/* May nguon */}
                                                        <Tag color="blue" style={{ fontSize: 13, padding: "2px 10px" }}>
                                                            {groupLinks[0].fromMachineName}
                                                            <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>
                                                                ({groupLinks[0].fromProcessName})
                                                            </span>
                                                        </Tag>

                                                        <ArrowRightOutlined style={{ color: "#1677ff" }} />

                                                        {/* Cac may dich */}
                                                        {groupLinks.map(l => (
                                                            <Tag
                                                                key={`${l.fromMachineId}-${l.toMachineId}`}
                                                                color="green"
                                                                closable
                                                                onClose={() => handleRemoveLink(l.fromMachineId, l.toMachineId)}
                                                                style={{ fontSize: 13, padding: "2px 10px" }}
                                                            >
                                                                {l.toMachineName}
                                                                <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>
                                                                    ({l.toProcessName})
                                                                </span>
                                                            </Tag>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </Card>
                            </>
                        ),
                    },
                ]}
            />
        </div>
    );
}
