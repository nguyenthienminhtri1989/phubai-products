"use client";

import React, { useEffect, useState, useRef } from "react";
import {
    Card, Table, Button, Select, Row, Col, message, Tag, Space,
    Typography, Checkbox, Divider, Modal
} from "antd";
import {
    QrcodeOutlined, PrinterOutlined, FilterOutlined,
    RobotOutlined, CheckOutlined
} from "@ant-design/icons";
import { useSession } from "next-auth/react";
import type { TableProps } from "antd";

const { Title, Text } = Typography;

interface Factory { id: number; name: string; }
interface Process { id: number; name: string; factoryId: number; }
interface MachineData {
    id: number;
    name: string;
    processId: number;
    process?: { name: string; factory?: { name: string } };
    currentItem?: { name: string };
    formulaType: number;
    isActive: boolean;
}

// Component tạo QR Code bằng API miễn phí (không cần cài thêm package)
const QRImage = ({ url, size = 200 }: { url: string; size?: number }) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&margin=8`;
    return <img src={qrUrl} alt="QR Code" width={size} height={size} style={{ display: 'block' }} />;
};

export default function QRMachinesPage() {
    const { data: session } = useSession();
    const printRef = useRef<HTMLDivElement>(null);

    // Data
    const [machines, setMachines] = useState<MachineData[]>([]);
    const [factories, setFactories] = useState<Factory[]>([]);
    const [processes, setProcesses] = useState<Process[]>([]);
    const [loading, setLoading] = useState(false);

    // Filters
    const [filterFactory, setFilterFactory] = useState<number | null>(null);
    const [filterProcess, setFilterProcess] = useState<number | null>(null);

    // QR Selection
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [showPrintPreview, setShowPrintPreview] = useState(false);

    // Base URL cho QR
    const baseUrl = typeof window !== "undefined"
        ? `${window.location.protocol}//${window.location.host}`
        : "https://phubaierp.site";

    // Fetch Data
    const fetchData = async () => {
        setLoading(true);
        try {
            const [fRes, pRes, mRes] = await Promise.all([
                fetch("/api/factories"),
                fetch("/api/processes"),
                fetch("/api/machines"),
            ]);
            if (fRes.ok) setFactories(await fRes.json());
            if (pRes.ok) setProcesses(await pRes.json());
            if (mRes.ok) {
                const data = await mRes.json();
                setMachines(data.filter((m: MachineData) => m.isActive));
            }
        } catch (e) {
            message.error("Lỗi tải dữ liệu");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Filtered machines
    const filteredMachines = machines.filter(m => {
        if (filterFactory && m.process?.factory?.name) {
            const proc = processes.find(p => p.id === m.processId);
            if (proc && proc.factoryId !== filterFactory) return false;
        }
        if (filterProcess && m.processId !== filterProcess) return false;
        return true;
    });

    // Select all visible
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(filteredMachines.map(m => m.id));
        } else {
            setSelectedIds([]);
        }
    };

    // In QR
    const handlePrint = () => {
        if (selectedIds.length === 0) {
            message.warning("Vui lòng chọn máy để in QR Code");
            return;
        }
        setShowPrintPreview(true);
    };

    const executePrint = () => {
        const printContent = printRef.current;
        if (!printContent) return;

        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
            <head>
                <title>In QR Code - Phu Bai ERP</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; }
                    .qr-grid {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 12px;
                        padding: 16px;
                    }
                    .qr-card {
                        border: 2px solid #333;
                        border-radius: 8px;
                        padding: 12px;
                        text-align: center;
                        page-break-inside: avoid;
                    }
                    .qr-card img { margin: 8px auto; }
                    .machine-name {
                        font-size: 18px;
                        font-weight: bold;
                        margin-bottom: 4px;
                    }
                    .machine-process {
                        font-size: 11px;
                        color: #666;
                    }
                    .machine-hint {
                        font-size: 10px;
                        color: #999;
                        margin-top: 6px;
                        border-top: 1px dashed #ddd;
                        padding-top: 4px;
                    }
                    @media print {
                        .qr-grid { padding: 8px; gap: 8px; }
                        .qr-card { border-width: 1.5px; }
                    }
                </style>
            </head>
            <body>
                ${printContent.innerHTML}
                <script>window.onload = function() { window.print(); window.close(); }<\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    // Table columns
    const columns: TableProps<MachineData>["columns"] = [
        {
            title: "Máy",
            dataIndex: "name",
            render: (text: string) => <b>{text}</b>,
        },
        {
            title: "Công đoạn",
            dataIndex: ["process", "name"],
            render: (t: string, r: MachineData) => (
                <div>
                    <div style={{ fontSize: 11, color: "#888" }}>{r.process?.factory?.name}</div>
                    <div>{t}</div>
                </div>
            ),
        },
        {
            title: "Mặt hàng đang chạy",
            key: "item",
            render: (_: any, r: MachineData) =>
                r.currentItem ? <Tag color="blue">{r.currentItem.name}</Tag> : <Tag>Chưa gán</Tag>,
        },
        {
            title: "QR Link",
            key: "qr",
            width: 280,
            render: (_: any, r: MachineData) => (
                <Text copyable={{ text: `${baseUrl}/production/quick-input?machineId=${r.id}` }}
                    style={{ fontSize: 12, color: "#1677ff" }}>
                    /quick-input?machineId={r.id}
                </Text>
            ),
        },
        {
            title: "Xem trước",
            key: "preview",
            width: 80,
            align: "center" as const,
            render: (_: any, r: MachineData) => (
                <Button
                    size="small"
                    icon={<QrcodeOutlined />}
                    onClick={() => {
                        Modal.info({
                            title: `QR Code - ${r.name}`,
                            content: (
                                <div style={{ textAlign: "center", padding: 20 }}>
                                    <QRImage url={`${baseUrl}/production/quick-input?machineId=${r.id}`} size={250} />
                                    <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
                                        Quét mã này để nhập sản lượng cho <b>{r.name}</b>
                                    </div>
                                </div>
                            ),
                            width: 400,
                        });
                    }}
                />
            ),
        },
    ];

    // Get selected machines data
    const selectedMachines = machines.filter(m => selectedIds.includes(m.id));

    return (
        <div style={{ padding: 20 }}>
            <Card
                title={<span><QrcodeOutlined /> QR Code - Nhập liệu nhanh bằng điện thoại</span>}
                extra={
                    <Space>
                        <Button
                            icon={<PrinterOutlined />}
                            type="primary"
                            onClick={handlePrint}
                            disabled={selectedIds.length === 0}
                        >
                            In {selectedIds.length > 0 ? `${selectedIds.length} QR` : "QR Code"}
                        </Button>
                    </Space>
                }
            >
                {/* Huong dan */}
                <div style={{
                    background: "#f0f5ff",
                    border: "1px solid #adc6ff",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 20,
                }}>
                    <Title level={5} style={{ margin: 0, color: "#1d39c4" }}>Hướng dẫn sử dụng</Title>
                    <div style={{ marginTop: 8, color: "#444", lineHeight: 1.8 }}>
                        1. Chọn máy cần in QR Code (tick chọn ở bảng bên dưới)<br />
                        2. Bấm nút <b>In QR Code</b> để in ra giấy dán<br />
                        3. Dán QR lên từng máy tương ứng<br />
                        4. Công nhân dùng điện thoại quét QR → Tự động nhảy vào form nhập liệu của máy đó
                    </div>
                </div>

                {/* Bo loc */}
                <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col span={8}>
                        <Select
                            style={{ width: "100%" }}
                            placeholder="Lọc theo Nhà máy"
                            allowClear
                            options={factories.map(f => ({ label: f.name, value: f.id }))}
                            onChange={val => { setFilterFactory(val || null); setFilterProcess(null); }}
                        />
                    </Col>
                    <Col span={8}>
                        <Select
                            style={{ width: "100%" }}
                            placeholder="Lọc theo Công đoạn"
                            allowClear
                            options={processes
                                .filter(p => !filterFactory || p.factoryId === filterFactory)
                                .map(p => ({ label: p.name, value: p.id }))}
                            onChange={val => setFilterProcess(val || null)}
                        />
                    </Col>
                    <Col span={8} style={{ textAlign: "right" }}>
                        <Checkbox
                            onChange={e => handleSelectAll(e.target.checked)}
                            checked={selectedIds.length === filteredMachines.length && filteredMachines.length > 0}
                            indeterminate={selectedIds.length > 0 && selectedIds.length < filteredMachines.length}
                        >
                            Chọn tất cả ({filteredMachines.length} máy)
                        </Checkbox>
                    </Col>
                </Row>

                {/* Bang */}
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={filteredMachines}
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                    rowSelection={{
                        selectedRowKeys: selectedIds,
                        onChange: (keys) => setSelectedIds(keys as number[]),
                    }}
                    size="middle"
                />
            </Card>

            {/* Modal xem truoc & In */}
            <Modal
                title={<span><PrinterOutlined /> Xem trước bản in - {selectedIds.length} QR Code</span>}
                open={showPrintPreview}
                onCancel={() => setShowPrintPreview(false)}
                width={900}
                footer={[
                    <Button key="cancel" onClick={() => setShowPrintPreview(false)}>Dong</Button>,
                    <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={executePrint}>
                        In ngay
                    </Button>,
                ]}
            >
                <div ref={printRef}>
                    <div className="qr-grid" style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 12,
                        padding: 8,
                    }}>
                        {selectedMachines.map(m => (
                            <div key={m.id} style={{
                                border: "2px solid #333",
                                borderRadius: 8,
                                padding: 12,
                                textAlign: "center",
                            }}>
                                <div style={{ fontSize: 18, fontWeight: "bold" }}>{m.name}</div>
                                <div style={{ fontSize: 11, color: "#666" }}>
                                    {m.process?.factory?.name} - {m.process?.name}
                                </div>
                                <div style={{ margin: "8px 0" }}>
                                    <QRImage
                                        url={`${baseUrl}/production/quick-input?machineId=${m.id}`}
                                        size={150}
                                    />
                                </div>
                                <div style={{
                                    fontSize: 10,
                                    color: "#999",
                                    borderTop: "1px dashed #ddd",
                                    paddingTop: 4,
                                }}>
                                    Quét để nhập sản lượng | phubaierp.site
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>
        </div>
    );
}
