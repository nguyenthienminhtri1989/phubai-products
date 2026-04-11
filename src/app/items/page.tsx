"use client";

import React, { useEffect, useState } from "react";
import {
    Table, Button, Modal, Form, Input, InputNumber, Select,
    message, Card, Space, Popconfirm, Tag, Upload, Alert, AutoComplete,
} from "antd";
import {
    PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
    SearchOutlined, UploadOutlined,
} from "@ant-design/icons";
import { useSession } from "next-auth/react";
import * as XLSX from "xlsx";

interface ItemData {
    id: number;
    name: string;
    code?: string;
    ne?: number;
    composition?: string;
    twist?: number;
    weavingStyle?: string;
    material?: string;
    _count?: { productionLogs: number };
}

interface PreviewData {
    headers: string[];
    rows: any[][];
}

interface ImportResult {
    imported: number;
    skipped: number;
    total: number;
}

export default function ItemsManagementPage() {
    const { data: session } = useSession();
    const [items, setItems] = useState<ItemData[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ItemData | null>(null);
    const [searchText, setSearchText] = useState("");

    // Import state
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<PreviewData>({ headers: [], rows: [] });
    const [validCount, setValidCount] = useState(0);
    const [importLoading, setImportLoading] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);

    const [form] = Form.useForm();

    // --- 1. Load dữ liệu ---
    const fetchItems = async () => {
        setLoading(true);
        try {
            const query = searchText ? `?search=${encodeURIComponent(searchText)}` : "";
            const res = await fetch(`/api/items${query}`);
            if (res.ok) {
                setItems(await res.json());
            } else {
                message.error("Không tải được danh sách");
            }
        } catch (e) {
            message.error("Lỗi kết nối");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    // Lọc client-side: cập nhật bảng ngay khi gõ
    const filteredItems = searchText.trim()
        ? items.filter(item => {
            const q = searchText.toLowerCase();
            return (
                item.name.toLowerCase().startsWith(q) ||
                (item.code && item.code.toLowerCase().startsWith(q)) ||
                (item.composition && item.composition.toLowerCase().startsWith(q)) ||
                (item.material && item.material.toLowerCase().startsWith(q)) ||
                (item.ne !== undefined && item.ne !== null && String(item.ne).startsWith(q))
            );
        })
        : items;

    const autoCompleteOptions = items.map(item => ({
        value: item.name,
        label: item.code ? `${item.name}  [${item.code}]` : item.name,
    }));

    const handleAutoCompleteSelect = (value: string) => {
        setSearchText(value);
    };

    // --- 2. Xử lý Lưu (Thêm/Sửa) ---
    const handleSave = async (values: any) => {
        try {
            const url = editingItem ? `/api/items/${editingItem.id}` : "/api/items";
            const method = editingItem ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Lỗi lưu dữ liệu");

            message.success(editingItem ? "Cập nhật thành công!" : "Tạo mới thành công!");
            setIsModalOpen(false);
            setEditingItem(null);
            form.resetFields();
            fetchItems();
        } catch (error: any) {
            message.error(error.message);
        }
    };

    // --- 3. Xử lý Xóa ---
    const handleDelete = async (id: number) => {
        try {
            const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            message.success("Đã xóa mặt hàng");
            fetchItems();
        } catch (error: any) {
            message.error(error.message);
        }
    };

    // --- 4. Mở Modal ---
    const openModal = (item?: ItemData) => {
        if (item) {
            setEditingItem(item);
            form.setFieldsValue(item);
        } else {
            setEditingItem(null);
            form.resetFields();
        }
        setIsModalOpen(true);
    };

    // --- 5. Import Excel ---
    const handleFileSelect = (file: File): boolean => {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ext || !["xlsx", "xls"].includes(ext)) {
            message.error("Chỉ chấp nhận file .xlsx hoặc .xls");
            return false;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const buffer = e.target?.result as ArrayBuffer;
                const wb = XLSX.read(buffer, { type: "array" });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

                if (rows.length < 2) {
                    message.warning("File trống hoặc không có dữ liệu");
                    return;
                }

                const headers = (rows[0] as any[]).map((h) => String(h ?? "").trim());
                const nameIdx = headers.findIndex((h) => h.toLowerCase() === "name");

                if (nameIdx === -1) {
                    message.error('Không tìm thấy cột "name" trong file');
                    return;
                }

                const dataRows = (rows as any[][]).slice(1).filter((row) => {
                    const v = row[nameIdx];
                    return v !== undefined && v !== null && String(v).trim() !== "";
                });

                setPreviewData({ headers, rows: dataRows.slice(0, 5) });
                setValidCount(dataRows.length);
                setImportFile(file);
                setImportResult(null);
            } catch {
                message.error("Không thể đọc file, vui lòng kiểm tra lại");
            }
        };
        reader.readAsArrayBuffer(file);
        return false; // ngăn auto-upload của Ant Design
    };

    const handleImport = async () => {
        if (!importFile) return;
        setImportLoading(true);
        try {
            const formData = new FormData();
            formData.append("file", importFile);
            const res = await fetch("/api/items/import", { method: "POST", body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Lỗi import");
            setImportResult(data);
            fetchItems();
        } catch (e: any) {
            message.error(e.message);
        } finally {
            setImportLoading(false);
        }
    };

    const resetImport = () => {
        setIsImportOpen(false);
        setImportFile(null);
        setPreviewData({ headers: [], rows: [] });
        setValidCount(0);
        setImportResult(null);
    };

    const canEdit = (session?.user as any)?.role === "ADMIN" ||
        ["OPERATOR", "MANAGER"].includes((session?.user as any)?.accessLevel);

    // --- 6. Cột bảng ---
    const columns = [
        {
            title: "Tên mặt hàng",
            dataIndex: "name",
            key: "name",
            render: (text: string, r: ItemData) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{text}</div>
                    {r.code && <Tag color="blue">{r.code}</Tag>}
                </div>
            )
        },
        {
            title: "Chi số (NE)",
            dataIndex: "ne",
            key: "ne",
            align: 'center' as const,
            render: (ne: number) => ne ? <Tag color="geekblue">{ne}</Tag> : "-"
        },
        {
            title: "Thành phần",
            dataIndex: "composition",
            key: "composition",
        },
        {
            title: "Thông số khác",
            key: "specs",
            render: (_: any, r: ItemData) => (
                <Space direction="vertical" size={0} style={{ fontSize: 12, color: '#666' }}>
                    {r.material && <div>NL: {r.material}</div>}
                    {r.twist && <div>Độ săn: {r.twist}</div>}
                    {r.weavingStyle && <div>Kiểu: {r.weavingStyle}</div>}
                </Space>
            )
        },
        {
            title: "Trạng thái",
            key: "status",
            render: (_: any, r: ItemData) => {
                const count = r._count?.productionLogs || 0;
                return count > 0
                    ? <Tag color="green">Đang sản xuất ({count})</Tag>
                    : <Tag>Chưa dùng</Tag>
            }
        },
        ...(canEdit ? [{
            title: "Hành động",
            key: "action",
            align: 'right' as const,
            render: (_: any, r: ItemData) => (
                <Space>
                    <Button icon={<EditOutlined />} size="small" onClick={() => openModal(r)} />
                    <Popconfirm
                        title="Xóa mặt hàng này?"
                        description="Hành động này không thể hoàn tác."
                        onConfirm={() => handleDelete(r.id)}
                        okText="Xóa"
                        cancelText="Hủy"
                        disabled={(r._count?.productionLogs || 0) > 0}
                    >
                        <Button
                            icon={<DeleteOutlined />}
                            size="small"
                            danger
                            disabled={(r._count?.productionLogs || 0) > 0}
                        />
                    </Popconfirm>
                </Space>
            ),
        }] : []),
    ];

    // --- 7. Preview columns cho import ---
    const previewColumns = previewData.headers.map((h, i) => ({
        title: <span style={{ fontSize: 12, fontWeight: 600 }}>{h}</span>,
        dataIndex: String(i),
        key: i,
        ellipsis: true,
        render: (val: any) =>
            val !== undefined && val !== null && String(val) !== ""
                ? String(val)
                : <span style={{ color: "#ccc" }}>—</span>,
    }));

    const previewTableData = previewData.rows.map((row, ri) => {
        const obj: any = { key: ri };
        previewData.headers.forEach((_, ci) => {
            obj[String(ci)] = row[ci];
        });
        return obj;
    });

    if (!session) return <div className="p-10 text-center">Vui lòng đăng nhập...</div>;

    return (
        <div className="p-6">
            <Card
                title="Danh mục Mặt hàng Sợi"
                extra={
                    <Space>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <SearchOutlined style={{
                                position: 'absolute', left: 11,
                                top: '50%', transform: 'translateY(-50%)',
                                color: '#8c8c8c', zIndex: 1, pointerEvents: 'none'
                            }} />
                            <AutoComplete
                                options={autoCompleteOptions}
                                value={searchText}
                                onChange={(val) => setSearchText(val ?? "")}
                                onSelect={(val: string) => setSearchText(val)}
                                filterOption={(inputValue, option) =>
                                    option?.value?.toLowerCase().startsWith(inputValue.toLowerCase()) ?? false
                                }
                                allowClear
                                onClear={() => setSearchText("")}
                                placeholder="Tìm tên hoặc mã sợi..."
                                style={{ width: 260, paddingLeft: 22 }}
                            />
                        </div>
                        <Button icon={<ReloadOutlined />} onClick={fetchItems}>Tải lại</Button>
                        {canEdit && (
                            <>
                                <Button
                                    icon={<UploadOutlined />}
                                    onClick={() => setIsImportOpen(true)}
                                >
                                    Import Excel
                                </Button>
                                <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
                                    Thêm mới
                                </Button>
                            </>
                        )}
                    </Space>
                }
            >
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={filteredItems}
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    bordered
                />
            </Card>

            {/* MODAL THÊM / SỬA */}
            <Modal
                title={editingItem ? "Cập nhật Mặt hàng" : "Thêm Mặt hàng mới"}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
                width={600}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                        <Form.Item
                            name="name"
                            label="Tên đầy đủ mặt hàng"
                            rules={[{ required: true, message: "Vui lòng nhập tên" }]}
                        >
                            <Input placeholder="Ví dụ: CVC 30 Combed" />
                        </Form.Item>

                        <Form.Item name="code" label="Mã viết tắt">
                            <Input placeholder="CVC30" />
                        </Form.Item>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                        <Form.Item name="ne" label="Chi số (NE)">
                            <InputNumber style={{ width: '100%' }} placeholder="30" min={1} />
                        </Form.Item>

                        <Form.Item name="twist" label="Độ săn (Twist)">
                            <InputNumber style={{ width: '100%' }} placeholder="850" />
                        </Form.Item>

                        <Form.Item name="weavingStyle" label="Kiểu dệt">
                            <Select placeholder="Chọn kiểu dệt" allowClear>
                                <Select.Option value="Dệt kim">Dệt kim</Select.Option>
                                <Select.Option value="Dệt thoi">Dệt thoi</Select.Option>
                            </Select>
                        </Form.Item>
                    </div>

                    <Form.Item name="composition" label="Thành phần">
                        <Input placeholder="Ví dụ: 60% Cotton - 40% Poly" />
                    </Form.Item>

                    <Form.Item name="material" label="Nguyên liệu đầu vào">
                        <Input placeholder="Ví dụ: Bông Mỹ, Xơ Thái..." />
                    </Form.Item>

                    <div style={{ textAlign: "right", marginTop: 16 }}>
                        <Space>
                            <Button onClick={() => setIsModalOpen(false)}>Hủy bỏ</Button>
                            <Button type="primary" htmlType="submit">
                                {editingItem ? "Cập nhật" : "Thêm mới"}
                            </Button>
                        </Space>
                    </div>
                </Form>
            </Modal>

            {/* MODAL IMPORT EXCEL */}
            <Modal
                title="Import Excel - Danh mục Mặt hàng"
                open={isImportOpen}
                onCancel={resetImport}
                width={720}
                footer={
                    importResult ? (
                        <Button onClick={resetImport}>Đóng</Button>
                    ) : (
                        <Space>
                            <Button onClick={resetImport}>Hủy</Button>
                            <Button
                                type="primary"
                                onClick={handleImport}
                                disabled={!importFile || validCount === 0}
                                loading={importLoading}
                            >
                                Xác nhận Import
                            </Button>
                        </Space>
                    )
                }
            >
                {importResult ? (
                    <Alert
                        type="success"
                        showIcon
                        message={`Đã thêm ${importResult.imported} / ${importResult.total} mặt hàng`}
                        description={
                            importResult.skipped > 0
                                ? `${importResult.skipped} dòng bỏ qua do tên đã tồn tại trong hệ thống`
                                : "Tất cả dòng hợp lệ đã được thêm thành công"
                        }
                        style={{ fontSize: 14 }}
                    />
                ) : (
                    <>
                        <Upload.Dragger
                            accept=".xlsx,.xls"
                            maxCount={1}
                            showUploadList={false}
                            beforeUpload={handleFileSelect}
                            style={{ marginBottom: 16 }}
                        >
                            <p style={{ fontSize: 28, color: "#1677ff", margin: "8px 0" }}>
                                <UploadOutlined />
                            </p>
                            <p style={{ fontWeight: 500, margin: "4px 0" }}>
                                {importFile
                                    ? <><span style={{ color: "#1677ff" }}>{importFile.name}</span> — click để chọn file khác</>
                                    : "Click hoặc kéo thả file Excel vào đây"
                                }
                            </p>
                            <p style={{ color: "#999", fontSize: 12, margin: "4px 0 8px" }}>
                                Chấp nhận .xlsx, .xls • Cột bắt buộc: <strong>name</strong>
                            </p>
                        </Upload.Dragger>

                        {importFile && (
                            <>
                                {validCount > 0 ? (
                                    <Alert
                                        type="info"
                                        message={`Tìm thấy ${validCount} dòng hợp lệ${validCount > 5 ? ` — hiển thị 5 dòng đầu` : ""}`}
                                        style={{ marginBottom: 12 }}
                                    />
                                ) : (
                                    <Alert
                                        type="warning"
                                        message='Không tìm thấy dòng hợp lệ nào. Đảm bảo cột "name" có giá trị.'
                                        style={{ marginBottom: 12 }}
                                    />
                                )}

                                {previewData.rows.length > 0 && (
                                    <Table
                                        size="small"
                                        columns={previewColumns}
                                        dataSource={previewTableData}
                                        pagination={false}
                                        scroll={{ x: "max-content" }}
                                        bordered
                                    />
                                )}
                            </>
                        )}
                    </>
                )}
            </Modal>
        </div>
    );
}
