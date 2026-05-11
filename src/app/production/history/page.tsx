"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Card, DatePicker, Select, Button, Table, Tag, Row, Col, Statistic, Space, message, Divider, Modal, Form, InputNumber, Input, Popconfirm } from "antd";
import { SearchOutlined, FileExcelOutlined, ReloadOutlined, FilterOutlined, BarChartOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { useSession } from "next-auth/react";
import { getItemColor } from "@/utils/itemColors";
// Thư viện biểu đồ
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';

const { RangePicker } = DatePicker;

export default function ProductionHistoryPage() {
    const { data: session } = useSession();
    const isAdmin = (session?.user as any)?.userRole === "ADMIN";

    // --- 1. STATE DỮ LIỆU ---
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // --- STATE SỬA/XÓA (ADMIN) ---
    const [editingLog, setEditingLog] = useState<any | null>(null);
    const [editForm] = Form.useForm();
    const [savingEdit, setSavingEdit] = useState(false);

    // State Phân trang & Thống kê Server trả về
    const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
    const [serverStats, setServerStats] = useState<{ totalOutput: number; avgEfficiency: number | null }>({ totalOutput: 0, avgEfficiency: null });
    const [sortConfig, setSortConfig] = useState<{ field: any, order: string } | null>(null);

    // --- 2. STATE DANH MỤC (Để đổ vào ô lọc) ---
    const [factories, setFactories] = useState<any[]>([]);
    const [processes, setProcesses] = useState<any[]>([]);
    const [machines, setMachines] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);

    // --- 3. STATE BỘ LỌC ---
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().subtract(7, 'day'), dayjs()]);
    const [selectedFactories, setSelectedFactories] = useState<number[]>([]);
    const [selectedProcesses, setSelectedProcesses] = useState<number[]>([]);
    const [selectedMachines, setSelectedMachines] = useState<number[]>([]);
    const [selectedShifts, setSelectedShifts] = useState<number[]>([]);
    const [selectedItems, setSelectedItems] = useState<number[]>([]);

    // --- 4. LOAD DANH MỤC LÚC ĐẦU ---
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [f, p, m, i] = await Promise.all([
                    fetch("/api/factories").then(r => r.json()),
                    fetch("/api/processes").then(r => r.json()),
                    // Tạm dùng endpoint backup để lấy list máy, hoặc bạn có thể tạo endpoint /api/machines riêng
                    fetch("/api/machines").then(r => r.json()),
                    fetch("/api/items").then(r => r.json())
                ]);
                setFactories(f); setProcesses(p); setMachines(m); setItems(i);
            } catch (e) { console.error(e); }
        };
        fetchData();
        // Load dữ liệu mặc định trang 1
        handleSearch(1);
    }, []);

    // --- 5. HÀM TÌM KIẾM (GỌI API) ---
    const handleSearch = async (pageIndex = 1, currentSort = sortConfig) => {
        setLoading(true);
        try {
            const payload = {
                fromDate: dateRange[0].format("YYYY-MM-DD"),
                toDate: dateRange[1].format("YYYY-MM-DD"),
                factoryIds: selectedFactories,
                processIds: selectedProcesses,
                machineIds: selectedMachines,
                shifts: selectedShifts,
                itemIds: selectedItems,
                page: pageIndex,
                pageSize: pagination.pageSize,
                sortField: currentSort?.field,
                sortOrder: currentSort?.order
            };

            const res = await fetch("/api/production/history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const responseData = await res.json();

            if (responseData.error) throw new Error(responseData.error);

            // Cập nhật State
            setLogs(responseData.data);
            setPagination({
                current: responseData.pagination.current,
                pageSize: responseData.pagination.pageSize,
                total: responseData.pagination.total
            });
            setServerStats({
                totalOutput: responseData.stats.totalOutput,
                avgEfficiency: responseData.stats.avgEfficiency ?? null,
            });

        } catch (error) {
            message.error("Lỗi tải dữ liệu");
        } finally {
            setLoading(false);
        }
    };

    // --- 6. XỬ LÝ CHUYỂN TRANG ---
    const handleTableChange = (newPagination: any, filters?: any, sorter?: any) => {
        let newSort = sortConfig;
        if (sorter && sorter.field) {
            newSort = sorter.order ? { field: sorter.field, order: sorter.order } : null;
        } else if (Array.isArray(sorter) && sorter.length > 0) {
            newSort = sorter[0].order ? { field: sorter[0].field, order: sorter[0].order } : null;
        } else if (sorter && !sorter.order) {
            newSort = null; // Removed sorting
        }
        setSortConfig(newSort);
        handleSearch(newPagination.current, newSort);
    };

    // --- 7. TÍNH TOÁN BIỂU ĐỒ (Dựa trên dữ liệu trang hiện tại) ---
    // Lưu ý: Để biểu đồ chính xác tuyệt đối cho toàn bộ dữ liệu lớn, cần API riêng. 
    // Ở đây ta vẽ biểu đồ dựa trên 20-50 dòng dữ liệu đang hiển thị để user có cái nhìn nhanh.
    const chartData = useMemo(() => {
        const map: any = {};
        logs.forEach(log => {
            const name = log.machine?.process?.name || "Khác";
            map[name] = (map[name] || 0) + log.finalOutput;
        });
        return Object.keys(map).map(name => ({ name, output: map[name] }));
    }, [logs]);

    // --- 8. XUẤT EXCEL ---
    const exportToExcel = () => {
        const dataToExport = logs.map(log => ({
            "Ngày": dayjs(log.recordDate).format("DD/MM/YYYY"),
            "Ca": log.shift,
            "Nhà máy": log.machine?.process?.factory?.name,
            "Công đoạn": log.machine?.process?.name,
            "Máy": log.machine?.name,
            "Mặt hàng": log.item?.name,
            "Chỉ số đầu": log.startIndex,
            "Chỉ số cuối": log.endIndex,
            "Sản lượng (kg)": log.finalOutput,
            "Ghi chú": log.note,
            "Người nhập": log.createdBy?.fullName
        }));
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "BaoCao");
        XLSX.writeFile(wb, `SanLuong_${dayjs().format("DDMM_HHmm")}.xlsx`);
    };

    // --- HANDLER: Sửa / Xóa (ADMIN) ---
    const openEdit = (log: any) => {
        setEditingLog(log);
        editForm.setFieldsValue({
            itemId: log.item?.id ?? log.itemId,
            startIndex: log.startIndex,
            endIndex: log.endIndex,
            finalOutput: log.finalOutput,
            efficiency: log.efficiency,
            note: log.note,
        });
    };

    const handleSaveEdit = async () => {
        if (!editingLog) return;
        try {
            const values = await editForm.validateFields();
            setSavingEdit(true);
            const res = await fetch(`/api/production/history/${editingLog.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
            if (!res.ok) {
                const err = await res.json();
                message.error(err.error || "Lỗi cập nhật");
                return;
            }
            message.success("Đã cập nhật bản ghi");
            setEditingLog(null);
            handleSearch(pagination.current);
        } finally {
            setSavingEdit(false);
        }
    };

    const handleDeleteLog = async (logId: number) => {
        const res = await fetch(`/api/production/history/${logId}`, { method: "DELETE" });
        if (!res.ok) {
            const err = await res.json();
            message.error(err.error || "Không thể xóa");
            return;
        }
        message.success("Đã xóa bản ghi");
        handleSearch(pagination.current);
    };

    const columns = [
        { title: "Ngày", dataIndex: "recordDate", sorter: true, render: (d: string) => dayjs(d).format("DD/MM/YYYY") },
        { title: "Ca", dataIndex: "shift", width: 60, align: 'center' as const, sorter: true, render: (s: number) => <Tag color="blue">{s}</Tag> },
        { title: "Công đoạn", dataIndex: ["machine", "process", "name"], sorter: true, responsive: ['lg'] as any }, // Ẩn trên mobile
        { title: "Máy", dataIndex: ["machine", "name"], width: 100, sorter: true, render: (t: string) => <b>{t}</b> },
        { title: "Mặt hàng", dataIndex: ["item", "name"], sorter: true, render: (t: string) => <Tag color={getItemColor(t)} style={{ fontWeight: 600 }}>{t}</Tag> },
        {
            title: "Sản lượng",
            dataIndex: "finalOutput",
            align: 'right' as const,
            sorter: true,
            render: (n: number) => <b style={{ color: '#389e0d' }}>{n?.toLocaleString()} kg</b>
        },
        {
            title: "Hiệu suất",
            dataIndex: "efficiency",
            align: 'center' as const,
            width: 100,
            sorter: true,
            render: (n: number | null) => n != null
                ? <Tag color={n >= 95 ? 'green' : n >= 85 ? 'orange' : 'red'}>{n.toFixed(1)}%</Tag>
                : <span style={{ color: '#ccc' }}>—</span>,
        },
        { title: "Đầu", dataIndex: "startIndex", align: 'right' as const, width: 90, sorter: true, responsive: ['md'] as any },
        { title: "Cuối", dataIndex: "endIndex", align: 'right' as const, width: 90, sorter: true, responsive: ['md'] as any },
        { title: "Người nhập", dataIndex: ["createdBy", "fullName"], width: 150, ellipsis: true, sorter: true, responsive: ['lg'] as any },
        ...(isAdmin ? [{
            title: "Thao tác",
            key: "action",
            width: 110,
            align: 'center' as const,
            render: (_: unknown, row: unknown) => {
                const r = row as { id: number; recordDate: string; shift: number; machine?: { name?: string }; item?: { name?: string } };
                return (
                <Space size={4}>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
                    <Popconfirm
                        title="Xóa bản ghi này?"
                        description={`${dayjs(r.recordDate).format("DD/MM/YYYY")} — Ca ${r.shift} — ${r.machine?.name} — ${r.item?.name}`}
                        onConfirm={() => handleDeleteLog(r.id)}
                        okText="Xóa"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                    >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
                );
            },
        }] : []),
    ];

    return (
        <div style={{ padding: 20 }}>
            {/* --- PHẦN 1: BỘ LỌC DỮ LIỆU --- */}
            <Card title={<span><FilterOutlined /> Bộ lọc & Tìm kiếm</span>} style={{ marginBottom: 20 }} size="small">
                <Row gutter={[16, 16]}>
                    {/* 1. Khoảng thời gian */}
                    <Col xs={24} sm={12} md={6}>
                        <div style={{ marginBottom: 4, fontWeight: 500 }}>Khoảng thời gian:</div>
                        <RangePicker value={dateRange} onChange={(vals) => setDateRange(vals as any)} style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Col>

                    {/* 2. Nhà máy */}
                    <Col xs={24} sm={12} md={6}>
                        <div style={{ marginBottom: 4, fontWeight: 500 }}>Nhà máy:</div>
                        <Select
                            mode="multiple" allowClear style={{ width: '100%' }} placeholder="Tất cả"
                            options={factories.map(f => ({ label: f.name, value: f.id }))}
                            onChange={setSelectedFactories} maxTagCount="responsive"
                        />
                    </Col>

                    {/* 3. Công đoạn */}
                    <Col xs={24} sm={12} md={6}>
                        <div style={{ marginBottom: 4, fontWeight: 500 }}>Công đoạn:</div>
                        <Select
                            mode="multiple" allowClear style={{ width: '100%' }} placeholder="Tất cả"
                            // Lọc công đoạn theo nhà máy đã chọn
                            options={processes
                                .filter(p => selectedFactories.length === 0 || selectedFactories.includes(p.factoryId))
                                .map(p => ({ label: p.name, value: p.id }))}
                            onChange={setSelectedProcesses} maxTagCount="responsive"
                        />
                    </Col>

                    {/* 4. Máy móc */}
                    <Col xs={24} sm={12} md={6}>
                        <div style={{ marginBottom: 4, fontWeight: 500 }}>Máy móc:</div>
                        <Select
                            mode="multiple" allowClear style={{ width: '100%' }} placeholder="Tất cả"
                            // Lọc máy theo công đoạn đã chọn
                            options={machines
                                .filter(m => selectedProcesses.length === 0 || selectedProcesses.includes(m.processId))
                                .map(m => ({ label: m.name, value: m.id }))}
                            onChange={setSelectedMachines} maxTagCount="responsive"
                        />
                    </Col>

                    {/* 5. Ca làm việc */}
                    <Col xs={12} md={6}>
                        <div style={{ marginBottom: 4, fontWeight: 500 }}>Ca:</div>
                        <Select
                            mode="multiple" style={{ width: '100%' }} placeholder="Tất cả"
                            options={[{ label: 'Ca 1', value: 1 }, { label: 'Ca 2', value: 2 }, { label: 'Ca 3', value: 3 }]}
                            onChange={setSelectedShifts}
                        />
                    </Col>

                    {/* 6. Mặt hàng */}
                    <Col xs={12} md={6}>
                        <div style={{ marginBottom: 4, fontWeight: 500 }}>Mặt hàng:</div>
                        <Select
                            mode="multiple" allowClear style={{ width: '100%' }} placeholder="Tất cả"
                            options={items.map(i => ({ label: i.name, value: i.id }))}
                            onChange={setSelectedItems} maxTagCount="responsive"
                        />
                    </Col>

                    {/* Nút thao tác */}
                    <Col xs={24} md={12} style={{ textAlign: 'right', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={() => setLogs([])}>Reset</Button>
                            <Button type="primary" icon={<SearchOutlined />} onClick={() => handleSearch(1)} loading={loading}>Xem báo cáo</Button>
                            <Button icon={<FileExcelOutlined />} onClick={exportToExcel} disabled={logs.length === 0} style={{ color: 'green', borderColor: 'green' }}>Xuất Excel</Button>
                        </Space>
                    </Col>
                </Row>
            </Card>

            {/* --- PHẦN 2: DASHBOARD (Biểu đồ & Thống kê) --- */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                {/* Thẻ Thống kê Tổng */}
                <Col xs={24} md={8}>
                    <Card variant="borderless" style={{ height: '100%', background: 'linear-gradient(to right, #f6ffed, #ffffff)' }}>
                        <Statistic
                            title="TỔNG SẢN LƯỢNG (Toàn bộ kết quả lọc)"
                            value={serverStats.totalOutput}
                            precision={2}
                            suffix="kg"
                            styles={{ content: { color: '#389e0d', fontWeight: 'bold', fontSize: 28 } }}
                        />
                        <Divider style={{ margin: '12px 0' }} />
                        <Statistic title="Số dòng dữ liệu tìm thấy" value={pagination.total} />
                        {serverStats.avgEfficiency != null && (
                            <>
                                <Divider style={{ margin: '12px 0' }} />
                                <Statistic
                                    title="Hiệu suất TB (trọng số sản lượng)"
                                    value={serverStats.avgEfficiency}
                                    precision={1}
                                    suffix="%"
                                    styles={{ content: { color: serverStats.avgEfficiency >= 95 ? '#389e0d' : serverStats.avgEfficiency >= 85 ? '#d48806' : '#cf1322', fontWeight: 'bold' } }}
                                />
                            </>
                        )}
                    </Card>
                </Col>

                {/* Biểu đồ phân bố */}
                <Col xs={24} md={16}>
                    <Card size="small" title={<span><BarChartOutlined /> Biểu đồ Sản lượng (Trang hiện tại)</span>} style={{ height: '100%' }}>
                        {logs.length > 0 ? (
                            <div style={{ width: '100%', height: 200 }}>
                                <ResponsiveContainer>
                                    <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" />
                                        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                                        <RechartsTooltip formatter={(value) => [`${Number(value).toLocaleString()} kg`, 'Sản lượng']} />
                                        <Bar dataKey="output" fill="#1890ff" barSize={20} radius={[0, 4, 4, 0]}>
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#1890ff' : '#40a9ff'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>
                                Chưa có dữ liệu để vẽ biểu đồ
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* --- PHẦN 3: BẢNG DỮ LIỆU --- */}
            <Card title="Chi tiết nhật ký sản xuất" size="small" bodyStyle={{ padding: 0 }}>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={logs}
                    loading={loading}
                    bordered
                    size="middle"
                    // CẤU HÌNH PHÂN TRANG SERVER SIDE
                    pagination={{
                        current: pagination.current,
                        pageSize: pagination.pageSize,
                        total: pagination.total,
                        showSizeChanger: true,
                        pageSizeOptions: ['20', '50', '100', '200'],
                        showTotal: (total) => `Tổng cộng ${total} dòng`
                    }}
                    onChange={handleTableChange}
                    scroll={{ x: 1000 }} // Cho phép cuộn ngang trên mobile
                />
            </Card>

            {/* --- MODAL SỬA BẢN GHI (ADMIN) --- */}
            <Modal
                title={editingLog ? `Sửa bản ghi — ${dayjs(editingLog.recordDate).format("DD/MM/YYYY")} — Ca ${editingLog.shift} — ${editingLog.machine?.name}` : "Sửa bản ghi"}
                open={!!editingLog}
                onOk={handleSaveEdit}
                onCancel={() => setEditingLog(null)}
                confirmLoading={savingEdit}
                okText="Lưu"
                cancelText="Hủy"
                width={560}
                destroyOnClose
            >
                <Form form={editForm} layout="vertical">
                    <Form.Item name="itemId" label="Mặt hàng" rules={[{ required: true, message: "Chọn mặt hàng" }]}>
                        <Select
                            showSearch
                            optionFilterProp="label"
                            options={items.map(i => ({ label: i.name, value: i.id }))}
                            placeholder="Chọn mặt hàng"
                        />
                    </Form.Item>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="startIndex" label="Chỉ số đầu">
                                <InputNumber style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="endIndex" label="Chỉ số cuối">
                                <InputNumber style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="finalOutput" label="Sản lượng (kg)" rules={[{ required: true, message: "Nhập sản lượng" }]}>
                                <InputNumber style={{ width: "100%" }} min={0} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="efficiency" label="Hiệu suất (%)">
                                <InputNumber style={{ width: "100%" }} min={0} max={200} step={0.1} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="note" label="Ghi chú">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}