"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Card, Select, Row, Col, Statistic, Spin, Badge, Space, Progress } from "antd";
import {
    ThunderboltOutlined, DashboardOutlined, CheckCircleOutlined,
    SyncOutlined, NumberOutlined, ApiOutlined
} from "@ant-design/icons";

const { Option } = Select;

interface LiveData {
    timestamp: string;
    totalEnergy: number; // Chỉ số điện (kWh)
    voltage: number;
    current: number;
    power: number;
    pf: number;
}

export default function RealtimeDashboard() {
    // Data nguồn
    const [factories, setFactories] = useState<any[]>([]);
    const [substations, setSubstations] = useState<any[]>([]);
    const [meters, setMeters] = useState<any[]>([]);

    // State bộ lọc
    const [filterFactory, setFilterFactory] = useState<number | null>(null);
    const [filterSubstation, setFilterSubstation] = useState<number | null>(null);
    const [selectedMeter, setSelectedMeter] = useState<number | null>(null);

    // State Live Data
    const [liveData, setLiveData] = useState<LiveData | null>(null);
    const [loading, setLoading] = useState(false);
    const [errorStatus, setErrorStatus] = useState(false);

    // 1. Tải toàn bộ cấu trúc (Nhà máy, Trạm, Đồng hồ) 1 lần khi mở trang
    useEffect(() => {
        Promise.all([
            fetch("/api/factories").then(res => res.json()),
            fetch("/api/energy/substations").then(res => res.json()),
            fetch("/api/energy/meters").then(res => res.json())
        ]).then(([facs, subs, mets]) => {
            setFactories(facs);
            setSubstations(subs);
            // Chỉ lấy các đồng hồ có cấu hình tự động (IoT)
            setMeters(mets.filter((m: any) => m.isAuto && m.gatewayIp));
        });
    }, []);

    // 2. Lọc danh sách đồng hồ dựa trên Nhà máy và Trạm
    const filteredMeters = useMemo(() => {
        return meters.filter(m => {
            if (filterFactory && m.factoryId !== filterFactory) return false;
            if (filterSubstation && m.substationId !== filterSubstation) return false;
            return true;
        });
    }, [meters, filterFactory, filterSubstation]);

    // Reset selected meter khi đổi bộ lọc
    useEffect(() => {
        if (filteredMeters.length > 0 && !filteredMeters.find(m => m.id === selectedMeter)) {
            setSelectedMeter(filteredMeters[0].id);
        } else if (filteredMeters.length === 0) {
            setSelectedMeter(null);
            setLiveData(null); // Xóa data cũ trên màn hình
        }
    }, [filteredMeters]);

    // 3. Vòng lặp lấy dữ liệu (Polling 3s/lần)
    useEffect(() => {
        if (!selectedMeter) return;

        const fetchLive = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/energy/live?meterId=${selectedMeter}`);
                if (!res.ok) throw new Error("Mất kết nối");

                const data = await res.json();
                setLiveData(data);
                setErrorStatus(false);
            } catch (err) {
                setErrorStatus(true);
            } finally {
                setLoading(false);
            }
        };

        fetchLive();
        const intervalId = setInterval(fetchLive, 3000);
        return () => clearInterval(intervalId);
    }, [selectedMeter]);

    // Tìm thông tin đồng hồ đang chọn để hiển thị tên
    const activeMeterInfo = meters.find(m => m.id === selectedMeter);

    return (
        <div style={{ padding: 24, background: "#f0f2f5", minHeight: "100vh" }}>

            {/* ── BỘ LỌC ĐIỀU HƯỚNG ── */}
            <Card size="small" style={{ marginBottom: 16 }}>
                <Row align="middle" justify="space-between" wrap gutter={[16, 16]}>
                    <Col>
                        <Space size="middle" wrap>
                            <span style={{ fontWeight: 600 }}><ApiOutlined /> Điều hướng:</span>
                            <Select
                                placeholder="Chọn Nhà máy"
                                style={{ width: 180 }}
                                allowClear
                                value={filterFactory}
                                onChange={(val) => { setFilterFactory(val); setFilterSubstation(null); }}
                            >
                                {factories.map(f => <Option key={f.id} value={f.id}>{f.name}</Option>)}
                            </Select>

                            <Select
                                placeholder="Chọn Trạm biến áp"
                                style={{ width: 180 }}
                                allowClear
                                disabled={!filterFactory}
                                value={filterSubstation}
                                onChange={setFilterSubstation}
                            >
                                {substations.filter(s => s.factoryId === filterFactory).map(s => (
                                    <Option key={s.id} value={s.id}>{s.name}</Option>
                                ))}
                            </Select>

                            <Select
                                showSearch
                                style={{ width: 280 }}
                                placeholder="Chọn đồng hồ cần giám sát"
                                value={selectedMeter}
                                onChange={setSelectedMeter}
                                optionFilterProp="children"
                                status={filteredMeters.length === 0 ? "error" : ""}
                            >
                                {filteredMeters.map(m => (
                                    <Option key={m.id} value={m.id}>
                                        {m.code} - {m.name}
                                    </Option>
                                ))}
                            </Select>
                        </Space>
                    </Col>
                    <Col>
                        {errorStatus ? (
                            <Badge status="error" text={<span style={{ color: "red", fontWeight: 600 }}>Mất kết nối Gateway</span>} />
                        ) : liveData ? (
                            <Badge status="processing" text={<span style={{ color: "#1677ff" }}>Đang truyền dữ liệu (3s/lần)</span>} />
                        ) : <Badge status="default" text="Đang chờ kết nối..." />}
                    </Col>
                </Row>
            </Card>

            {/* ── MÀN HÌNH HIỂN THỊ (DASHBOARD) ── */}
            {!selectedMeter ? (
                <Card>
                    <div style={{ textAlign: "center", padding: 60, color: "#999", fontSize: 16 }}>
                        Khu vực này không có đồng hồ tự động nào. Vui lòng chọn đồng hồ khác!
                    </div>
                </Card>
            ) : (
                <Spin spinning={loading && !liveData} indicator={<SyncOutlined spin />}>
                    <Row gutter={[16, 16]}>

                        {/* CỘT TRÁI: SỐ CHỮ ĐIỆN VÀ GAUGE CÔNG SUẤT */}
                        <Col xs={24} lg={10}>
                            <Card
                                style={{ height: "100%", textAlign: "center", background: "#fff" }}
                                title={<span style={{ fontSize: 18 }}>{activeMeterInfo?.name || "Đồng hồ đo điện"}</span>}
                            >
                                {/* Số chữ điện (Total kWh) */}
                                <div style={{ marginBottom: 40, padding: 20, background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 8 }}>
                                    <div style={{ fontSize: 14, color: "#52c41a", fontWeight: 600, marginBottom: 8 }}>
                                        SỐ CHỮ ĐIỆN HIỆN TẠI (TOTAL ACTIVE ENERGY)
                                    </div>
                                    <div style={{ fontSize: 48, fontWeight: 700, color: "#389e0d", fontFamily: "monospace" }}>
                                        {liveData?.totalEnergy ? liveData.totalEnergy.toLocaleString('vi-VN') : "0.0"} <span style={{ fontSize: 24, color: "#888" }}>kWh</span>
                                    </div>
                                </div>

                                {/* Đồng hồ tốc độ giả lập (Gauge) cho Công suất */}
                                <div style={{ marginTop: 20 }}>
                                    <Progress
                                        type="dashboard"
                                        steps={8}
                                        percent={liveData ? (liveData.power / 200) * 100 : 0} // Giả sử max là 200kW để thanh Progress chạy, bạn có thể tự chỉnh số này
                                        strokeColor={liveData && liveData.power > 150 ? "#cf1322" : "#1677ff"}
                                        gapDegree={90}
                                        size={250}
                                        format={() => (
                                            <div>
                                                <div style={{ fontSize: 36, color: "#1677ff", fontWeight: 700 }}>{liveData?.power || 0}</div>
                                                <div style={{ fontSize: 16, color: "#888" }}>kW</div>
                                            </div>
                                        )}
                                    />
                                    <div style={{ marginTop: 10, fontSize: 16, fontWeight: 600, color: "#555" }}>
                                        CÔNG SUẤT TỨC THỜI
                                    </div>
                                </div>
                            </Card>
                        </Col>

                        {/* CỘT PHẢI: CÁC THÔNG SỐ CHI TIẾT */}
                        <Col xs={24} lg={14}>
                            <Row gutter={[16, 16]}>

                                {/* Hệ số công suất (Cos Phi) */}
                                <Col xs={24}>
                                    <Card style={{ background: liveData && liveData.pf < 0.9 ? "#fff1f0" : "#f0f5ff", borderColor: liveData && liveData.pf < 0.9 ? "#ffa39e" : "#adc6ff" }}>
                                        <Statistic
                                            title={<span style={{ fontSize: 16, fontWeight: 600 }}>Hệ số công suất (Cos Φ)</span>}
                                            value={liveData?.pf || 0}
                                            precision={2}
                                            valueStyle={{ color: liveData && liveData.pf < 0.9 ? "#cf1322" : "#1d39c4", fontSize: 40, fontWeight: 700 }}
                                            prefix={<CheckCircleOutlined />}
                                        />
                                        {liveData && liveData.pf < 0.9 && (
                                            <div style={{ color: "#cf1322", marginTop: 8, fontWeight: 600 }}>
                                                ⚠️ Cảnh báo: Hệ số quá thấp, nguy cơ bị Điện lực phạt vô công!
                                            </div>
                                        )}
                                    </Card>
                                </Col>

                                {/* Điện áp và Dòng điện */}
                                <Col xs={24} sm={12}>
                                    <Card>
                                        <Statistic
                                            title="Điện áp trung bình (V L-N)"
                                            value={liveData?.voltage || 0}
                                            precision={1}
                                            valueStyle={{ color: "#faad14", fontSize: 32, fontWeight: 600 }}
                                            suffix="V"
                                            prefix={<ThunderboltOutlined />}
                                        />
                                    </Card>
                                </Col>

                                <Col xs={24} sm={12}>
                                    <Card>
                                        <Statistic
                                            title="Dòng điện trung bình (A)"
                                            value={liveData?.current || 0}
                                            precision={1}
                                            valueStyle={{ color: "#722ed1", fontSize: 32, fontWeight: 600 }}
                                            suffix="A"
                                            prefix={<NumberOutlined />}
                                        />
                                    </Card>
                                </Col>

                                {/* Khối hiển thị thời gian chốt */}
                                <Col xs={24}>
                                    <div style={{ textAlign: "right", marginTop: 16, color: "#888", fontSize: 13 }}>
                                        <SyncOutlined spin={loading && !errorStatus} style={{ marginRight: 8 }} />
                                        Dữ liệu cập nhật gần nhất: <b>{liveData ? new Date(liveData.timestamp).toLocaleTimeString('vi-VN') : "---"}</b>
                                    </div>
                                </Col>
                            </Row>
                        </Col>

                    </Row>
                </Spin>
            )}
        </div>
    );
}