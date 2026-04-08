"use client";

import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, Tag, message, Card, Space, Checkbox } from 'antd';
import { EditOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, UserAddOutlined } from '@ant-design/icons';
import { useSession } from 'next-auth/react';
import {
  DEPARTMENT_LABELS,
  MODULE_LABELS,
  getAvailableExtraModules,
  type Department,
  type ModuleKey,
} from '@/lib/permissions';

interface UserType {
    id: number;
    username: string;
    fullName: string;
    isActive: boolean;
    role: string;
    accessLevel: string;
    department: string;
    extraModules: string[];
    userProcesses: { processId: number; process: { name: string } }[];
}

export default function UserManagementPage() {
    const { data: session } = useSession();
    const [users, setUsers] = useState<UserType[]>([]);
    const [processes, setProcesses] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState("");
    // department đang chọn trong form (dùng để tính available extra modules)
    const [selectedDepartment, setSelectedDepartment] = useState<Department>("FACTORY");

    const filteredUsers = users.filter(user => 
        user.fullName.toLowerCase().includes(searchText.toLowerCase())
    );

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserType | null>(null);
    const [form] = Form.useForm();

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
                message.error("Không tải được dữ liệu");
            }
        } catch (error) {
            message.error("Lỗi kết nối");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (session?.user?.role === 'ADMIN') fetchData();
    }, [session]);

    // --- LOGIC LƯU (TẠO MỚI / CẬP NHẬT) ---
    const handleSave = async (values: any) => {
        try {
            const method = editingUser ? 'PUT' : 'POST';

            // Nếu Sửa: Cần ID. Nếu Tạo: password lấy từ newPassword
            const payload = editingUser
                ? { ...values, id: editingUser.id }
                : { ...values, password: values.newPassword };
            // Đảm bảo processIds luôn là mảng
            if (!payload.processIds) payload.processIds = [];

            const res = await fetch('/api/users', {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Có lỗi xảy ra");

            message.success(editingUser ? "Đã cập nhật!" : "Đã tạo tài khoản!");
            setIsModalOpen(false);
            setEditingUser(null);
            fetchData();
        } catch (error: any) {
            message.error(error.message);
        }
    };

    // --- Mở Modal Tạo Mới ---
    const openCreateModal = () => {
        setEditingUser(null);
        form.resetFields();
        setSelectedDepartment("FACTORY");
        form.setFieldsValue({
            isActive: true,
            role: 'USER',
            accessLevel: 'READ_ONLY',
            department: 'FACTORY',
            extraModules: [],
        });
        setIsModalOpen(true);
    };

    // --- Mở Modal Sửa ---
    const openEditModal = (user: UserType) => {
        setEditingUser(user);
        form.resetFields();
        setSelectedDepartment((user.department as Department) || "FACTORY");
        form.setFieldsValue({
            username: user.username,
            fullName: user.fullName,
            isActive: user.isActive,
            role: user.role,
            accessLevel: user.accessLevel,
            department: user.department || "FACTORY",
            extraModules: user.extraModules || [],
            processIds: user.userProcesses.map(up => up.processId),
            newPassword: ''
        });
        setIsModalOpen(true);
    };

    const columns = [
        {
            title: 'Nhân viên',
            render: (_: any, r: UserType) => (
                <div>
                    <div style={{ fontWeight: 'bold' }}>{r.fullName}</div>
                    <div style={{ color: '#888', fontSize: 12 }}>@{r.username}</div>
                </div>
            )
        },
        {
            title: 'Bộ phận',
            dataIndex: 'userProcesses',
            render: (ups: UserType['userProcesses']) =>
                ups && ups.length > 0
                    ? ups.map(up => <Tag key={up.processId} color="blue">{up.process.name}</Tag>)
                    : <Tag>Văn phòng</Tag>
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
                const map: any = { 'MANAGER': 'gold', 'OPERATOR': 'cyan', 'READ_ONLY': 'default' };
                return <Tag color={map[level]}>{level}</Tag>
            }
        },
        {
            title: 'Trạng thái',
            dataIndex: 'isActive',
            align: 'center' as const,
            render: (active: boolean) => active
                ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
                : <CloseCircleOutlined style={{ color: 'red', fontSize: 18 }} />
        },
        {
            title: 'Hành động',
            key: 'action',
            render: (_: any, r: UserType) => (
                <Button type="primary" ghost size="small" icon={<EditOutlined />} onClick={() => openEditModal(r)}>
                    Sửa
                </Button>
            )
        }
    ];

    if (session?.user?.role !== 'ADMIN') return <div className="p-10 text-center">Không có quyền truy cập</div>;

    return (
        <div style={{ padding: 20 }}>
            <Card
                title="Quản trị Người dùng"
                extra={
                    <Space>
                        <Input.Search 
                            placeholder="Tìm kiếm theo tên..." 
                            allowClear
                            onChange={(e) => setSearchText(e.target.value)}
                            style={{ width: 250 }}
                        />
                        <Button type="primary" icon={<UserAddOutlined />} onClick={openCreateModal}>
                            Thêm tài khoản
                        </Button>
                        <Button icon={<ReloadOutlined />} onClick={fetchData}>
                            Làm mới
                        </Button>
                    </Space>
                }
            >
                <Table rowKey="id" columns={columns} dataSource={filteredUsers} loading={loading} bordered pagination={{ pageSize: 8 }} />
            </Card>

            <Modal
                title={editingUser ? `Cập nhật: ${editingUser.fullName}` : "Thêm nhân viên mới"}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    {/* Status Switch */}
                    <Form.Item name="isActive" valuePropName="checked">
                        <Switch checkedChildren="ĐANG HOẠT ĐỘNG" unCheckedChildren="ĐANG KHÓA" />
                    </Form.Item>

                    {/* FIELD: USERNAME (Đã sửa) */}
                    <Form.Item
                        name="username"
                        label="Tên đăng nhập (Username)"
                        rules={[
                            { required: true, message: 'Vui lòng nhập tên đăng nhập' },
                            { pattern: /^[a-zA-Z0-9_]+$/, message: 'Không được chứa dấu hoặc ký tự đặc biệt' }
                        ]}
                    >
                        {/* Khi sửa thì không cho đổi username để tránh lỗi hệ thống */}
                        <Input disabled={!!editingUser} placeholder="vd: nguyenvan_a" />
                    </Form.Item>

                    <Form.Item name="fullName" label="Họ tên hiển thị" rules={[{ required: true }]}>
                        <Input placeholder="Nguyễn Văn A" />
                    </Form.Item>

                    <div className="grid grid-cols-2 gap-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item name="role" label="Vai trò">
                            <Select>
                                <Select.Option value="USER">User</Select.Option>
                                <Select.Option value="ADMIN">Admin</Select.Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="accessLevel" label="Quyền hạn">
                            <Select>
                                <Select.Option value="READ_ONLY">Chỉ xem</Select.Option>
                                <Select.Option value="OPERATOR">Nhập liệu</Select.Option>
                                <Select.Option value="MANAGER">Quản lý</Select.Option>
                            </Select>
                        </Form.Item>
                    </div>

                    <Form.Item name="processIds" label="Thuộc công đoạn (Có thể chọn nhiều)">
                        <Select mode="multiple" allowClear placeholder="Chọn công đoạn...">
                            {processes.map((p: any) => (
                                <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    {/* FIELD: DEPARTMENT */}
                    <Form.Item name="department" label="Bộ phận" rules={[{ required: true, message: 'Vui lòng chọn bộ phận' }]}>
                        <Select
                            onChange={(val: Department) => {
                                setSelectedDepartment(val);
                                // Reset extraModules khi đổi department
                                form.setFieldValue('extraModules', []);
                            }}
                        >
                            {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((dep) => (
                                <Select.Option key={dep} value={dep}>{DEPARTMENT_LABELS[dep]}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    {/* FIELD: EXTRA MODULES */}
                    {(() => {
                        const availableExtras = getAvailableExtraModules(selectedDepartment);
                        if (availableExtras.length === 0) return null;
                        return (
                            <Form.Item name="extraModules" label="Cho phép xem thêm">
                                <Checkbox.Group
                                    options={availableExtras.map((m: ModuleKey) => ({
                                        label: MODULE_LABELS[m],
                                        value: m,
                                    }))}
                                />
                            </Form.Item>
                        );
                    })()}

                    <Form.Item
                        name="newPassword"
                        label={editingUser ? "Đổi mật khẩu (Bỏ trống nếu không đổi)" : "Mật khẩu khởi tạo"}
                        rules={[{ required: !editingUser, message: "Bắt buộc nhập mật khẩu khi tạo mới" }]}
                    >
                        <Input.Password placeholder="******" />
                    </Form.Item>

                    <div style={{ textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setIsModalOpen(false)}>Hủy</Button>
                            <Button type="primary" htmlType="submit">Lưu</Button>
                        </Space>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}