
"use client";

import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, Tag, message, Card, Space, Tooltip } from 'antd';
import { EditOutlined, ReloadOutlined, SafetyCertificateOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useSession } from 'next-auth/react';

// Định nghĩa kiểu dữ liệu cho User hiển thị
interface UserType {
    id: number;
    username: string;
    fullName: string;
    isActive: boolean;
    role: string;
    accessLevel: string;
    process?: { id: number; name: string };
    processId: number | null;
}

export default function UserManagementPage() {
    const { data: session } = useSession();
    const [users, setUsers] = useState<UserType[]>([]);
    const [processes, setProcesses] = useState<any[]>([]); // List công đoạn cho dropdown
    const [loading, setLoading] = useState(false);

    // State cho Modal Sửa
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserType | null>(null);
    const [form] = Form.useForm();

    // --- 1. Tải dữ liệu ---
    const fetchData = async () => {
        setLoading(true);
        try {
            const [resUsers, resProcesses] = await Promise.all([
                fetch('/api/users'),
                fetch('/api/processes')
            ]);

            if (resUsers.ok && resProcesses.ok) {
                setUsers(await resUsers.json());
                setProcesses(await resProcesses.json());
            } else {
                message.error("Không tải được dữ liệu (Có thể bạn không phải Admin)");
            }
        } catch (error) {
            message.error("Lỗi kết nối");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (session?.user?.role === 'ADMIN') {
            fetchData();
        }
    }, [session]);

    // --- 2. Xử lý Lưu (Cập nhật) ---
    const handleSave = async (values: any) => {
        try {
            if (editingUser) {
                const payload = { ...values, id: editingUser.id };

                const res = await fetch('/api/users', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) throw new Error("Lỗi cập nhật");

                message.success("Đã cập nhật thông tin thành công!");
                setIsModalOpen(false);
                setEditingUser(null);
                fetchData(); // Load lại bảng
            }
        } catch (error) {
            message.error("Có lỗi xảy ra khi lưu");
        }
    };

    // --- 3. Mở Modal ---
    const openEditModal = (user: UserType) => {
        setEditingUser(user);
        form.resetFields();
        // Điền dữ liệu cũ vào form
        form.setFieldsValue({
            fullName: user.fullName,
            isActive: user.isActive,
            role: user.role,
            accessLevel: user.accessLevel,
            processId: user.processId,
            newPassword: '' // Mật khẩu luôn để trống
        });
        setIsModalOpen(true);
    };

    // --- 4. Cấu hình Cột Bảng ---
    const columns = [
        {
            title: 'Nhân viên',
            render: (_: any, r: UserType) => (
                <div>
                    <div style={{ fontWeight: 'bold', fontSize: 15 }}>{r.fullName}</div>
                    <div style={{ color: '#888', fontSize: 12 }}>@{r.username}</div>
                </div>
            )
        },
        {
            title: 'Thuộc Bộ phận',
            dataIndex: 'process',
            render: (p: any) => p ? <Tag color="blue">{p.name}</Tag> : <Tag>Văn phòng / Chưa gán</Tag>
        },
        {
            title: 'Vai trò',
            dataIndex: 'role',
            render: (role: string) => role === 'ADMIN' ? <Tag color="red">ADMIN</Tag> : <Tag color="green">USER</Tag>
        },
        {
            title: 'Quyền hạn',
            dataIndex: 'accessLevel',
            render: (level: string) => {
                let color = 'default';
                let text = 'Chỉ xem';
                if (level === 'MANAGER') { color = 'gold'; text = 'Quản lý'; }
                if (level === 'OPERATOR') { color = 'cyan'; text = 'Nhập liệu'; }
                return <Tag color={color}>{text}</Tag>
            }
        },
        {
            title: 'Trạng thái',
            dataIndex: 'isActive',
            align: 'center' as const,
            render: (isActive: boolean) => isActive
                ? <CheckCircleOutlined style={{ fontSize: 20, color: '#52c41a' }} />
                : <Tooltip title="Chưa kích hoạt"><CloseCircleOutlined style={{ fontSize: 20, color: 'red' }} /></Tooltip>
        },
        {
            title: 'Hành động',
            key: 'action',
            render: (_: any, r: UserType) => (
                <Button type="primary" ghost size="small" icon={<EditOutlined />} onClick={() => openEditModal(r)}>
                    Chi tiết / Duyệt
                </Button>
            )
        }
    ];

    // Bảo vệ Frontend: Nếu không phải Admin thì hiển thị thông báo
    if (session?.user?.role !== 'ADMIN') {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', flexDirection: 'column' }}>
                <SafetyCertificateOutlined style={{ fontSize: 50, color: 'red', marginBottom: 20 }} />
                <h2>Bạn không có quyền truy cập trang này</h2>
                <p>Vui lòng liên hệ quản trị viên.</p>
            </div>
        );
    }

    return (
        <div style={{ padding: 20 }}>
            <Card
                title="Quản trị Người dùng & Phân quyền"
                extra={<Button icon={<ReloadOutlined />} onClick={fetchData}>Làm mới</Button>}
            >
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={users}
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    bordered
                />
            </Card>

            {/* --- MODAL CHỈNH SỬA --- */}
            <Modal
                title={`Cập nhật: ${editingUser?.fullName}`}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
                width={600}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>

                    {/* Khu vực trạng thái kích hoạt (Quan trọng nhất) */}
                    <div style={{ background: '#f6ffed', padding: 15, borderRadius: 8, border: '1px solid #b7eb8f', marginBottom: 20 }}>
                        <Form.Item name="isActive" valuePropName="checked" label="Trạng thái tài khoản" style={{ marginBottom: 0 }}>
                            <Switch
                                checkedChildren="ĐÃ KÍCH HOẠT (Cho phép đăng nhập)"
                                unCheckedChildren="ĐANG KHÓA (Chờ duyệt)"
                                style={{ width: '100%' }}
                            />
                        </Form.Item>
                    </div>

                    <Form.Item name="fullName" label="Họ và tên hiển thị">
                        <Input />
                    </Form.Item>

                    <Space style={{ display: 'flex', width: '100%' }} align="start" size={16}>
                        <Form.Item name="role" label="Vai trò hệ thống" style={{ flex: 1 }}>
                            <Select>
                                <Select.Option value="USER">User (Nhân viên)</Select.Option>
                                <Select.Option value="ADMIN">Admin (Quản trị)</Select.Option>
                            </Select>
                        </Form.Item>

                        <Form.Item name="accessLevel" label="Quyền thao tác dữ liệu" style={{ flex: 1 }}>
                            <Select>
                                <Select.Option value="READ_ONLY">Chỉ xem (Read Only)</Select.Option>
                                <Select.Option value="OPERATOR">Nhập liệu (Operator)</Select.Option>
                                <Select.Option value="MANAGER">Quản lý (Sửa/Xóa)</Select.Option>
                            </Select>
                        </Form.Item>
                    </Space>

                    <Form.Item name="processId" label="Thuộc công đoạn (Phòng ban)">
                        <Select allowClear placeholder="Chọn công đoạn...">
                            {processes.map((p: any) => (
                                <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                            ))}
                        </Select>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                            * User chỉ được phép nhập liệu cho công đoạn này.
                        </div>
                    </Form.Item>

                    <div style={{ borderTop: '1px dashed #d9d9d9', paddingTop: 16, marginTop: 16 }}>
                        <Form.Item name="newPassword" label="Đặt lại mật khẩu (Chỉ nhập nếu nhân viên quên mật khẩu)">
                            <Input.Password placeholder="Nhập mật khẩu mới..." />
                        </Form.Item>
                    </div>

                    <div style={{ textAlign: 'right', marginTop: 20 }}>
                        <Space>
                            <Button onClick={() => setIsModalOpen(false)}>Hủy</Button>
                            <Button type="primary" htmlType="submit" icon={<SafetyCertificateOutlined />}>
                                Lưu Thiết Lập
                            </Button>
                        </Space>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}