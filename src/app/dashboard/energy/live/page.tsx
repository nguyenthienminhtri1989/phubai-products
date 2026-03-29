"use client";

import React, { useState, useEffect } from "react";
import { Card, Select, Row, Col, Statistic, Spin, message, Badge } from "antd";
import { ThunderboltOutlined, DashboardOutlined, CheckCircleOutlined, SyncOutlined } from "@ant-design/icons";

const { Option } = Select;

// Định nghĩa kiểu dữ liệu trả về từ API
interface LiveData {
    timestamp: string;
    voltage: number;
    current: number;
    power: number;
    pf: number;
}

export default function RealtimeDashboard() {
    const [meters, setMeters] = useState<any[]>([]);
    const [selectedMeter, setSelectedMeter] = useState<number | null>(null);

    const [liveData, setLiveData] = useState<LiveData | null>(null);
    const [loading, setLoading] = useState(false);
    const [errorStatus, setErrorStatus] = useState(false);

    // 1. Tải danh sách đồng hồ có hỗ trợ IoT
    useEffect(() => {
        fetch("/api/energy/meters")
            .then(res => res.json())
            .then(data => {
                const autoMeters = data.filter((m: any) => m.isAuto && m.gatewayIp);
                setMeters(autoMeters);
                if (autoMeters.length > 0) setSelectedMeter(autoMeters[0].id); // Mặc định chọn cái đầu tiên
            });
    }, []);

    // 2. Vòng lặp lấy dữ liệu (Polling) mỗi 3 giây
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

        // Gọi lần đầu ngay lập tức
        fetchLive();

        // Thiết lập vòng lặp 3 giây
        const intervalId = setInterval(fetchLive, 3000);

        // Dọn dẹp bộ nhớ khi người dùng đóng trang web
        return () => clearInterval(intervalId);
    }, [selectedMeter]);

    return (
        <div style={{ padding: 24, background: "#f0f2f5", minHeight: "100vh" }}>
            <Card
                title={<><DashboardOutlined /> Giám sát thời gian thực (SCADA)</>}
                extra={
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        {errorStatus ? (
                            <Badge status="error" text="Mất kết nối Gateway" />
                        ) : liveData ? (
                            <Badge status="processing" text="Đang truyền dữ liệu (3s/lần)" />
                        ) : null}
                        <Select
                            style={{ width: 250 }}
                            placeholder="Chọn đồng hồ giám sát"
                            value={selectedMeter}
                            onChange={setSelectedMeter}
                        >
                            {meters.map(m => (
                                <Option key={m.id} value={m.id}>
                                    {m.code} - {m.name}
                                </Option>
                            ))}
                        </Select>
                    </div>
                }
            >
                {!selectedMeter ? (
                    <div style={{ textAlign: "center", padding: 50, color: "#999" }}>
                        Vui lòng chọn một đồng hồ để bắt đầu giám sát
                    </div>
                ) : (
                    <Spin spinning={loading && !liveData} indicator={<SyncOutlined spin />}>
                        <Row gutter={[16, 16]}>
                            {/* CÔNG SUẤT TỨC THỜI (kW) - Quan trọng nhất nên để to */}
                            <Col xs={24} md={12}>
                                <Card style={{ background: "#e6f4ff", borderColor: "#91caff" }}>
                                    <Statistic
                                        title={<span style={{ fontSize: 16, fontWeight: 600 }}>Công suất tức thời (Total kW)</span>}
                                        value={liveData?.power || 0}
                                        precision={2}
                                        valueStyle={{ color: "#1677ff", fontSize: 48, fontWeight: 700 }}
                                        suffix="kW"
                                        prefix={<ThunderboltOutlined />}
                                    />
                                </Card>
                            </Col>

                            {/* HỆ SỐ CÔNG SUẤT (Cos Phi) */}
                            <Col xs={24} md={12}>
                                <Card style={{ background: liveData && liveData.pf < 0.9 ? "#fff1f0" : "#f6ffed", borderColor: liveData && liveData.pf < 0.9 ? "#ffa39e" : "#b7eb8f" }}>
                                    <Statistic
                                        title={<span style={{ fontSize: 16, fontWeight: 600 }}>Hệ số công suất (Cos Φ)</span>}
                                        value={liveData?.pf || 0}
                                        precision={2}
                                        valueStyle={{ color: liveData && liveData.pf < 0.9 ? "#cf1322" : "#389e0d", fontSize: 48, fontWeight: 700 }}
                                        prefix={<CheckCircleOutlined />}
                                    />
                                    {liveData && liveData.pf < 0.9 && (
                                        <div style={{ color: "#cf1322", marginTop: 8, fontWeight: 600 }}>
                                            ⚠️ Cảnh báo: Hệ số quá thấp, nguy cơ bị phạt vô công!
                                        </div>
                                    )}
                                </Card>
                            </Col>

                            {/* ĐIỆN ÁP (V) */}
                            <Col xs={24} md={12}>
                                <Card>
                                    <Statistic
                                        title="Điện áp trung bình (V L-N)"
                                        value={liveData?.voltage || 0}
                                        precision={1}
                                        valueStyle={{ color: "#faad14", fontSize: 32 }}
                                        suffix="V"
                                    />
                                </Card>
                            </Col>

                            {/* DÒNG ĐIỆN (A) */}
                            <Col xs={24} md={12}>
                                <Card>
                                    <Statistic
                                        title="Dòng điện trung bình (A)"
                                        value={liveData?.current || 0}
                                        precision={1}
                                        valueStyle={{ color: "#722ed1", fontSize: 32 }}
                                        suffix="A"
                                    />
                                </Card>
                            </Col>
                        </Row>

                        <div style={{ textAlign: "right", marginTop: 16, color: "#888", fontSize: 12 }}>
                            Cập nhật lần cuối: {liveData ? new Date(liveData.timestamp).toLocaleTimeString('vi-VN') : "---"}
                        </div>
                    </Spin>
                )}
            </Card>
        </div>
    );
}