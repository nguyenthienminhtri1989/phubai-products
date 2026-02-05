"use client";

import React, { useState } from "react";
import { Card, Form, Input, Button, Tabs, message, Tag, Descriptions } from "antd";
import { UserOutlined, LockOutlined, KeyOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
    const { data: session } = useSession();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();

    // Xử lý đổi mật khẩu
    const handleChangePassword = async (values: any) => {
        setLoading(true);
        try {
            const res = await fetch("/api/profile/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Có lỗi xảy ra");
            }

            message.success("Đổi mật khẩu thành công! Vui lòng đăng nhập lại.");
            form.resetFields();

            // Tùy chọn: Đăng xuất user sau khi đổi pass để bắt đăng nhập lại
            // import { signOut } from "next-auth/react";
            // signOut(); 

        } catch (error: any) {
            message.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    // Component hiển thị thông tin chung
    const UserInfo = () => (
        <Descriptions bordered column={1}>
            <Descriptions.Item label="Họ và tên">
                <span className="font-bold text-lg">{session?.user?.name || "Chưa cập nhật"}</span>
            </Descriptions.Item>
            {/* Nếu session bạn có lưu username/email thì hiển thị ở đây */}
            <Descriptions.Item label="Vai trò">
                {session?.user?.role === "ADMIN" ? (
                    <Tag color="red">QUẢN TRỊ VIÊN</Tag>
                ) : (
                    <Tag color="blue">NHÂN VIÊN</Tag>
                )}
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
                <Tag color="green" icon={<SafetyCertificateOutlined />}>Đang hoạt động</Tag>
            </Descriptions.Item>
        </Descriptions>
    );

    // Component Form đổi mật khẩu
    const ChangePasswordForm = () => (
        <Form
            form={form}
            layout="vertical"
            onFinish={handleChangePassword}
            style={{ maxWidth: 500, margin: "0 auto" }}
        >
            <Form.Item
                name="currentPassword"
                label="Mật khẩu hiện tại"
                rules={[{ required: true, message: "Vui lòng nhập mật khẩu cũ" }]}
            >
                <Input.Password prefix={<LockOutlined />} placeholder="Nhập mật khẩu đang dùng" />
            </Form.Item>

            <Form.Item
                name="newPassword"
                label="Mật khẩu mới"
                rules={[
                    { required: true, message: "Vui lòng nhập mật khẩu mới" },
                    { min: 6, message: "Mật khẩu phải có ít nhất 6 ký tự" }
                ]}
                hasFeedback
            >
                <Input.Password prefix={<KeyOutlined />} placeholder="Nhập mật khẩu mới" />
            </Form.Item>

            <Form.Item
                name="confirmPassword"
                label="Xác nhận mật khẩu mới"
                dependencies={['newPassword']}
                hasFeedback
                rules={[
                    { required: true, message: "Vui lòng xác nhận mật khẩu" },
                    ({ getFieldValue }) => ({
                        validator(_, value) {
                            if (!value || getFieldValue('newPassword') === value) {
                                return Promise.resolve();
                            }
                            return Promise.reject(new Error('Hai mật khẩu không khớp!'));
                        },
                    }),
                ]}
            >
                <Input.Password prefix={<KeyOutlined />} placeholder="Nhập lại mật khẩu mới" />
            </Form.Item>

            <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block icon={<SafetyCertificateOutlined />}>
                    Cập nhật mật khẩu
                </Button>
            </Form.Item>
        </Form>
    );

    if (!session) return <div className="p-10 text-center">Vui lòng đăng nhập...</div>;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <Card title={<><UserOutlined /> Hồ sơ cá nhân</>}>
                <Tabs
                    defaultActiveKey="info"
                    items={[
                        {
                            key: "info",
                            label: "Thông tin chung",
                            children: <UserInfo />,
                        },
                        {
                            key: "security",
                            label: "Đổi mật khẩu",
                            children: <ChangePasswordForm />,
                        },
                    ]}
                />
            </Card>
        </div>
    );
}