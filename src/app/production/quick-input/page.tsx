"use client";

import React, { useEffect, useState, useMemo, useRef, Suspense } from "react";
import {
    Card, Button, Form, InputNumber, Switch, message, Tag, Spin, Result, Space, Typography, Row, Col, Modal
} from "antd";
import {
    SaveOutlined, ArrowRightOutlined, QrcodeOutlined,
    CheckCircleOutlined, WarningOutlined, StopOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

const { Title, Text } = Typography;

interface Machine {
    id: number;
    name: string;
    formulaType: number;
    processId: number;
    spindleCount?: number;
    currentItem?: { id: number; name: string };
    currentNE?: number;
    todayLog?: { id: number; finalOutput: number };
}

// Component chinh (tach ra de dung useSearchParams trong Suspense)
function QuickInputContent() {
    const { data: session, status } = useSession();
    const searchParams = useSearchParams();
    const machineId = searchParams.get("machineId");

    const [machine, setMachine] = useState<Machine | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const [form] = Form.useForm();
    const inputRef = useRef<any>(null);

    // Auto-detect Ca & Ngay (copy logic tu daily-input)
    const now = dayjs();
    const hour = now.hour();
    let autoShift = 1;
    let autoDate = now;

    if (hour >= 13 && hour < 21) {
        autoShift = 1; autoDate = now;
    } else if (hour >= 21) {
        autoShift = 2; autoDate = now;
    } else if (hour >= 0 && hour < 5) {
        autoShift = 2; autoDate = now.subtract(1, "day");
    } else if (hour >= 5 && hour < 13) {
        autoShift = 3; autoDate = now.subtract(1, "day");
    }

    const shiftLabels: Record<number, string> = { 1: "Ca 1 (06-14h)", 2: "Ca 2 (14-22h)", 3: "Ca 3 (22-06h)" };

    // Watch form values
    const watchEndIndex = Form.useWatch("endIndex", form);
    const watchStartIndex = Form.useWatch("startIndex", form);
    const watchIsReset = Form.useWatch("isReset", form);
    const watchIsStopped = Form.useWatch("isStopped", form);
    const watchInputNE = Form.useWatch("inputNE", form);

    // Fetch machine data
    useEffect(() => {
        if (!machineId) { setError("Thiếu Id máy"); setLoading(false); return; }
        if (status === "loading") return;
        if (status === "unauthenticated") { setError("LOGIN_REQUIRED"); setLoading(false); return; }

        const fetchMachine = async () => {
            try {
                const dateStr = autoDate.format("YYYY-MM-DD");
                // Lay thong tin may tu daily-status API
                const res = await fetch(`/api/production/daily-status?processId=ALL&date=${dateStr}&shift=${autoShift}&machineId=${machineId}`);

                if (!res.ok) {
                    // Fallback: Goi truc tiep API machines
                    const mRes = await fetch(`/api/machines?id=${machineId}`);
                    if (!mRes.ok) throw new Error("Không tìm thấy máy");
                    const machines = await mRes.json();
                    const found = machines.find((m: any) => m.id === Number(machineId));
                    if (!found) throw new Error("Máy không tồn tại");
                    setMachine(found);
                } else {
                    const machines = await res.json();
                    const found = machines.find((m: any) => m.id === Number(machineId));
                    if (found) {
                        setMachine(found);
                    } else {
                        // Machine khong thuoc process nay, thu lay thong tin co ban
                        const mRes = await fetch(`/api/machines`);
                        const allMachines = await mRes.json();
                        const m = allMachines.find((x: any) => x.id === Number(machineId));
                        if (!m) throw new Error("Máy không tồn tại");
                        setMachine(m);
                    }
                }

                // Lay chi so cu
                const lastRes = await fetch(`/api/production/last-log?machineId=${machineId}&date=${dateStr}&shift=${autoShift}`);
                const lastLog = await lastRes.json();

                const initValues: any = {
                    isReset: false,
                    isStopped: false,
                    startIndex: 0,
                    endIndex: null,
                };

                if (lastLog && lastLog.endIndex !== undefined) {
                    initValues.startIndex = lastLog.endIndex;
                }

                form.setFieldsValue(initValues);
                setTimeout(() => inputRef.current?.focus(), 300);

            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };

        fetchMachine();
    }, [machineId, status]);

    // Set NE khi co machine data
    useEffect(() => {
        if (machine) {
            form.setFieldsValue({ inputNE: machine.currentNE || 30 });
        }
    }, [machine]);

    // Tinh san luong (copy logic tu daily-input)
    const calculatedOutput = useMemo(() => {
        if (!machine || watchIsStopped) return 0;
        const start = Number(watchStartIndex) || 0;
        const end = Number(watchEndIndex);
        if (watchEndIndex === null || watchEndIndex === undefined) return 0;

        const delta = watchIsReset ? end : end - start;
        const type = machine.formulaType;
        let result = 0;

        if (type === 1) result = end;
        else if (type === 2) result = delta;
        else if (type === 3) {
            const ne = Number(watchInputNE) || 1;
            const spindles = machine.spindleCount || 1;
            const denominator = ne * 1000 * 1.693;
            if (denominator !== 0) result = (delta * spindles) / denominator;
        } else if (type === 4) {
            const ne = Number(watchInputNE) || 1;
            if (ne !== 0) result = delta / ne;
        }
        return Math.round(result);
    }, [watchEndIndex, watchStartIndex, watchIsReset, watchIsStopped, watchInputNE, machine]);

    // Luu du lieu
    const handleSave = async () => {
        if (!machine) return;
        try {
            const values = await form.validateFields();

            if (calculatedOutput < 0 && !values.isReset && !values.isStopped) {
                Modal.error({
                    title: "Lỗi số liệu!",
                    content: 'Sản lượng bị âm. Nếu đồng hồ đã về 0, hãy bật "Đã Reset".',
                });
                return;
            }

            const payload = {
                recordDate: autoDate.format("YYYY-MM-DD"),
                shift: autoShift,
                machineId: machine.id,
                itemId: machine.currentItem?.id,
                startIndex: values.startIndex,
                endIndex: values.endIndex,
                inputNE: values.inputNE,
                finalOutput: calculatedOutput,
                note: values.isStopped ? "Máy dừng" : values.isReset ? "Reset đồng hồ" : "",
            };

            const res = await fetch("/api/production/daily-input", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Lỗi lưu dữ liệu");
            }

            setSaved(true);
            message.success("Đã lưu thành công!");
        } catch (e: any) {
            message.error(e.message || "Có lỗi xảy ra");
        }
    };

    // === RENDER ===

    // Loading
    if (loading) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#f5f5f5" }}>
                <Spin size="large" tip="Đang tải thông tin máy..." />
            </div>
        );
    }

    // Chua dang nhap
    if (error === "LOGIN_REQUIRED") {
        return (
            <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#f5f5f5", padding: 20 }}>
                <Result
                    status="warning"
                    title="Bạn chưa đăng nhập"
                    subTitle="Vui lòng đăng nhập để nhập sản lượng"
                    extra={<Button type="primary" size="large" href="/login">Đăng nhập</Button>}
                />
            </div>
        );
    }

    // Loi
    if (error || !machine) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#f5f5f5", padding: 20 }}>
                <Result status="error" title="Không tìm thấy máy" subTitle={error || "Mã QR không hợp lệ"} />
            </div>
        );
    }

    // Da luu thanh cong
    if (saved) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "linear-gradient(135deg, #f6ffed 0%, #e6fffb 100%)", padding: 20 }}>
                <Result
                    icon={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
                    title="Lưu thành công!"
                    subTitle={
                        <div style={{ fontSize: 16 }}>
                            <b>{machine.name}</b> — {shiftLabels[autoShift]} — Ngày {autoDate.format("DD/MM/YYYY")}
                            <div style={{ marginTop: 10, fontSize: 28, fontWeight: "bold", color: "#389e0d" }}>
                                {calculatedOutput} kg
                            </div>
                        </div>
                    }
                    extra={[
                        <Button key="back" size="large" onClick={() => setSaved(false)}>
                            Nhập lại
                        </Button>,
                        <Button key="close" type="primary" size="large" onClick={() => window.close()}>
                            Đóng
                        </Button>,
                    ]}
                />
            </div>
        );
    }

    // Chua gan mat hang
    if (!machine.currentItem) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#f5f5f5", padding: 20 }}>
                <Result
                    status="warning"
                    title={`${machine.name} Chưa gán mặt hàng`}
                    subTitle="Vui lòng báo Quản lý để gán mặt hàng trước khi nhập liệu"
                />
            </div>
        );
    }

    // Form nhap lieu chinh
    return (
        <div style={{
            minHeight: "100vh",
            background: "linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%)",
            padding: "16px",
        }}>
            {/* HEADER */}
            <div style={{
                textAlign: "center",
                marginBottom: 16,
                background: "#fff",
                borderRadius: 12,
                padding: "16px 20px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
                    <QrcodeOutlined style={{ fontSize: 20, color: "#1677ff" }} />
                    <Title level={4} style={{ margin: 0 }}>{machine.name}</Title>
                </div>
                <Space size={8} wrap style={{ justifyContent: "center" }}>
                    <Tag color="blue">{machine.currentItem.name}</Tag>
                    <Tag color="orange">{shiftLabels[autoShift]}</Tag>
                    <Tag>{autoDate.format("DD/MM/YYYY")}</Tag>
                </Space>
                <div style={{ marginTop: 6, fontSize: 12, color: "#999" }}>
                    Công thức loại {machine.formulaType}
                    {machine.spindleCount ? ` | ${machine.spindleCount} cọc` : ""}
                </div>
            </div>

            {/* FORM */}
            <Card
                style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
                bodyStyle={{ padding: "20px 16px" }}
            >
                <Form form={form} layout="vertical" size="large">
                    {/* Switches */}
                    <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 20,
                        background: "#fafafa",
                        padding: "12px 16px",
                        borderRadius: 8,
                    }}>
                        <Form.Item name="isStopped" valuePropName="checked" noStyle>
                            <Switch
                                checkedChildren={<><StopOutlined /> Máy dừng</>}
                                unCheckedChildren="Đang chạy"
                            />
                        </Form.Item>
                        <Form.Item name="isReset" valuePropName="checked" noStyle>
                            <Switch
                                checkedChildren={<><WarningOutlined /> Đã Reset</>}
                                unCheckedChildren="Bình thường"
                                disabled={watchIsStopped}
                                style={{ background: watchIsReset ? "#faad14" : undefined }}
                            />
                        </Form.Item>
                    </div>

                    {/* Chi so */}
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="startIndex" label="Chỉ số TRƯỚC">
                                <InputNumber
                                    style={{ width: "100%", height: 50, fontSize: 18 }}
                                    readOnly={!watchIsReset}
                                    variant="filled"
                                    disabled={watchIsStopped}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="endIndex"
                                label="Chỉ số SAU"
                                rules={[{ required: !watchIsStopped, message: "Nhập chỉ số!" }]}
                            >
                                <InputNumber
                                    ref={inputRef}
                                    style={{ width: "100%", height: 50, fontSize: 18, fontWeight: "bold" }}
                                    disabled={watchIsStopped}
                                    inputMode="decimal"
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* NE (Chi hien voi formula 3, 4) */}
                    {(machine.formulaType === 3 || machine.formulaType === 4) && (
                        <Form.Item name="inputNE" label="Chi so (NE)">
                            <InputNumber
                                style={{ width: "100%", height: 50, fontSize: 18 }}
                                disabled={watchIsStopped}
                                inputMode="decimal"
                            />
                        </Form.Item>
                    )}

                    {/* Ket qua */}
                    <div style={{
                        textAlign: "center",
                        padding: 20,
                        background: calculatedOutput < 0 ? "#fff1f0" : "#f6ffed",
                        marginBottom: 20,
                        borderRadius: 12,
                        border: calculatedOutput < 0 ? "2px solid #ffccc7" : "2px solid #b7eb8f",
                    }}>
                        <div style={{ color: "#666", fontSize: 14 }}>Sản lượng</div>
                        <div style={{
                            fontSize: 40,
                            fontWeight: "bold",
                            color: calculatedOutput < 0 ? "red" : "#389e0d",
                            lineHeight: 1.2,
                        }}>
                            {calculatedOutput} <span style={{ fontSize: 18 }}>kg</span>
                        </div>
                    </div>

                    {/* Nut Luu */}
                    <Button
                        type="primary"
                        size="large"
                        block
                        icon={<SaveOutlined />}
                        onClick={handleSave}
                        disabled={!watchIsStopped && calculatedOutput < 0}
                        style={{ height: 56, fontSize: 18, borderRadius: 12 }}
                    >
                        Lưu sản lượng
                    </Button>
                </Form>
            </Card>

            {/* Footer */}
            <div style={{ textAlign: "center", marginTop: 16, color: "#999", fontSize: 12 }}>
                Phu Bai ERP | Nhập liệu nhanh bằng QR Code
            </div>
        </div>
    );
}

// Page wrapper voi Suspense (bat buoc cho useSearchParams)
export default function QuickInputPage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
                <Spin size="large" />
            </div>
        }>
            <QuickInputContent />
        </Suspense>
    );
}
