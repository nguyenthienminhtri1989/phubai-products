"use client";
import React, { useState, useEffect } from "react";
import { Form, Input, Button, Card, Tabs, Select, message } from "antd";
import { UserOutlined, LockOutlined, IdcardOutlined } from "@ant-design/icons";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("login");
    const [processes, setProcesses] = useState([]);

    // Load danh sách công đoạn để phục vụ đăng ký
    useEffect(() => {
        fetch("/api/processes").then((res) => res.json()).then(setProcesses);
    }, []);

    const handleLogin = async (values: any) => {
        setLoading(true);
        const res = await signIn("credentials", {
            redirect: false,
            username: values.username,
            password: values.password,
        });
        setLoading(false);

        if (res?.error) {
            message.error(res.error);
        } else {
            message.success("Đăng nhập thành công");
            router.push("/"); // Về trang chủ
        }
    };

    const handleRegister = async (values: any) => {
        setLoading(true);
        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            message.success(data.message);
            setActiveTab("login"); // Chuyển về tab login
        } catch (error: any) {
            message.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#f0f2f5" }}>
            <Card style={{ width: 400, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                    <h2 style={{ color: "#1890ff" }}>PHU BAI PRODUCTION</h2>
                </div>

                <Tabs activeKey={activeTab} onChange={setActiveTab} centered items={[
                    {
                        key: 'login',
                        label: 'Đăng nhập',
                        children: (
                            <Form onFinish={handleLogin} layout="vertical">
                                <Form.Item name="username" rules={[{ required: true, message: "Nhập username" }]}>
                                    <Input prefix={<UserOutlined />} placeholder="Tên đăng nhập" size="large" />
                                </Form.Item>
                                <Form.Item name="password" rules={[{ required: true, message: "Nhập mật khẩu" }]}>
                                    <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu" size="large" />
                                </Form.Item>
                                <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                                    ĐĂNG NHẬP
                                </Button>
                            </Form>
                        )
                    },
                    {
                        key: 'register',
                        label: 'Đăng ký mới',
                        children: (
                            <Form onFinish={handleRegister} layout="vertical">
                                <Form.Item name="fullName" rules={[{ required: true, message: "Nhập họ tên" }]}>
                                    <Input prefix={<IdcardOutlined />} placeholder="Họ và tên" />
                                </Form.Item>
                                <Form.Item name="username" rules={[{ required: true }]}>
                                    <Input prefix={<UserOutlined />} placeholder="Tên đăng nhập muốn tạo" />
                                </Form.Item>
                                <Form.Item name="password" rules={[{ required: true }]}>
                                    <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu" />
                                </Form.Item>
                                <Form.Item name="processId" label="Bạn thuộc bộ phận nào?" rules={[{ required: true }]}>
                                    <Select placeholder="Chọn công đoạn" options={processes.map((p: any) => ({ label: p.name, value: p.id }))} />
                                </Form.Item>
                                <Button type="primary" htmlType="submit" block loading={loading}>
                                    GỬI YÊU CẦU ĐĂNG KÝ
                                </Button>
                                <div style={{ marginTop: 10, fontSize: 12, color: '#888', textAlign: 'center' }}>
                                    Tài khoản cần Admin duyệt mới có thể đăng nhập.
                                </div>
                            </Form>
                        )
                    }
                ]} />
            </Card>
        </div>
    );
}