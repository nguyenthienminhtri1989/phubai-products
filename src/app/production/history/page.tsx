"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Card, DatePicker, Select, Button, Table, Tag, Row, Col, Statistic, Space, message, Divider } from "antd";
import { SearchOutlined, FileExcelOutlined, ReloadOutlined, FilterOutlined, BarChartOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
// Thư viện biểu đồ
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';

const { RangePicker } = DatePicker;

export default function ProductionHistoryPage() {
    // --- 1. STATE DỮ LIỆU ---
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // State Phân trang & Thống kê Server trả về
    const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
    const [serverStats, setServerStats] = useState({ totalOutput: 0 });

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
                    fetch("/api/admin/backup").then(r => r.json().then(d => d.data.machines || [])),
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
    const handleSearch = async (pageIndex = 1) => {
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
                pageSize: pagination.pageSize
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
            setServerStats({ totalOutput: responseData.stats.totalOutput });

        } catch (error) {
            message.error("Lỗi tải dữ liệu");
        } finally {
            setLoading(false);
        }
    };

    // --- 6. XỬ LÝ CHUYỂN TRANG ---
    const handleTableChange = (newPagination: any) => {
        handleSearch(newPagination.current);
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

    const columns = [
        { title: "Ngày", dataIndex: "recordDate", render: (d: string) => dayjs(d).format("DD/MM/YYYY") },
        { title: "Ca", dataIndex: "shift", width: 60, align: 'center' as const, render: (s: number) => <Tag color="blue">{s}</Tag> },
        { title: "Công đoạn", dataIndex: ["machine", "process", "name"], responsive: ['lg'] as any }, // Ẩn trên mobile
        { title: "Máy", dataIndex: ["machine", "name"], width: 100, render: (t: string) => <b>{t}</b> },
        { title: "Mặt hàng", dataIndex: ["item", "name"] },
        {
            title: "Sản lượng",
            dataIndex: "finalOutput",
            align: 'right' as const,
            render: (n: number) => <b style={{ color: '#389e0d' }}>{n?.toLocaleString()} kg</b>
        },
        { title: "Đầu", dataIndex: "startIndex", align: 'right' as const, width: 90, responsive: ['md'] as any },
        { title: "Cuối", dataIndex: "endIndex", align: 'right' as const, width: 90, responsive: ['md'] as any },
        { title: "Người nhập", dataIndex: ["createdBy", "fullName"], width: 150, ellipsis: true, responsive: ['lg'] as any },
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
                    <Card bordered={false} style={{ height: '100%', background: 'linear-gradient(to right, #f6ffed, #ffffff)' }}>
                        <Statistic
                            title="TỔNG SẢN LƯỢNG (Toàn bộ kết quả lọc)"
                            value={serverStats.totalOutput}
                            precision={2}
                            suffix="kg"
                            valueStyle={{ color: '#389e0d', fontWeight: 'bold', fontSize: 28 }}
                        />
                        <Divider style={{ margin: '12px 0' }} />
                        <Statistic title="Số dòng dữ liệu tìm thấy" value={pagination.total} />
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
        </div>
    );
}