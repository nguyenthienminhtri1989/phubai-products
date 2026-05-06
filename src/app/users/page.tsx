"use client";

import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, Tag, message, Card, Space, Popconfirm } from 'antd';
import {
  EditOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UserAddOutlined,
  LockOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useSession } from 'next-auth/react';
import {
  USER_ROLE_LABELS,
  type UserRole,
} from '@/lib/permissions';
import { useRouter } from 'next/navigation';

interface UserType {
  id: number;
  username: string;
  fullName: string;
  isActive: boolean;
  userRole: string;
  factoryId: number | null;
  factory: { id: number; name: string } | null;
  userProcesses: { processId: number; process: { name: string } }[];
  userFactories: { factoryId: number; factory: { id: number; name: string } }[];
}

interface FactoryOption {
  id: number;
  name: string;
}

// Roles that need factory assignment
const FACTORY_ROLES: UserRole[] = ["FACTORY_MANAGER", "STATISTICIAN", "TEAM_LEAD"];
// Roles that need process assignment
const PROCESS_ROLES: UserRole[] = ["PROCESS_LEAD", "TEAM_LEAD", "STATISTICIAN"];

const ROLE_TAG_COLORS: Record<string, string> = {
  ADMIN: "red",
  DIRECTOR: "purple",
  FACTORY_MANAGER: "blue",
  SALES: "green",
  PROCESS_LEAD: "cyan",
  STATISTICIAN: "orange",
  TEAM_LEAD: "gold",
  VIEWER: "default",
};

export default function UserManagementPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserType[]>([]);
  const [processes, setProcesses] = useState<any[]>([]);
  const [factories, setFactories] = useState<FactoryOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("VIEWER");

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
      const [resUsers, resProcesses, resFactories] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/processes'),
        fetch('/api/factories'),
      ]);
      if (resUsers.ok && resProcesses.ok) {
        setUsers(await resUsers.json());
        setProcesses(await resProcesses.json());
        if (resFactories.ok) {
          setFactories(await resFactories.json());
        }
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
    if ((session?.user as any)?.userRole === 'ADMIN') fetchData();
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
      // Đảm bảo factoryIds luôn là mảng
      if (!payload.factoryIds) payload.factoryIds = [];

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

  // --- XÓA USER ---
  const handleDelete = async (userId: number) => {
    try {
      const res = await fetch(`/api/users?id=${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra');
      message.success('Đã xóa người dùng thành công!');
      fetchData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  // --- Mở Modal Tạo Mới ---
  const openCreateModal = () => {
    setEditingUser(null);
    form.resetFields();
    setSelectedRole("VIEWER");
    form.setFieldsValue({
      isActive: true,
      userRole: 'VIEWER',
      factoryIds: [],
    });
    setIsModalOpen(true);
  };

  // --- Mở Modal Sửa ---
  const openEditModal = (user: UserType) => {
    setEditingUser(user);
    form.resetFields();
    setSelectedRole((user.userRole as UserRole) || "VIEWER");
    // Lấy danh sách factoryIds từ userFactories (mới)
    const fIds = user.userFactories && user.userFactories.length > 0
      ? user.userFactories.map(uf => uf.factoryId)
      : (user.factoryId ? [user.factoryId] : []);
    form.setFieldsValue({
      username: user.username,
      fullName: user.fullName,
      isActive: user.isActive,
      userRole: user.userRole || "VIEWER",
      factoryIds: fIds,
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
      title: 'Vai trò',
      dataIndex: 'userRole',
      render: (role: string) => (
        <Tag color={ROLE_TAG_COLORS[role] || "default"}>
          {USER_ROLE_LABELS[role as UserRole] || role}
        </Tag>
      )
    },
    {
      title: 'Nhà máy',
      render: (_: any, r: UserType) => {
        // Hiển thị nhiều nhà máy từ userFactories (pivot table)
        if (r.userFactories && r.userFactories.length > 0) {
          return r.userFactories.map(uf => (
            <Tag key={uf.factoryId} color="blue">{uf.factory.name}</Tag>
          ));
        }
        // Fallback cho dữ liệu cũ chưa migrate
        if (r.factory) return <Tag color="blue">{r.factory.name}</Tag>;
        return <span style={{ color: '#ccc' }}>—</span>;
      }
    },
    {
      title: 'Công đoạn',
      dataIndex: 'userProcesses',
      render: (ups: UserType['userProcesses']) =>
        ups && ups.length > 0
          ? ups.map(up => <Tag key={up.processId} color="geekblue">{up.process.name}</Tag>)
          : <span style={{ color: '#ccc' }}>—</span>
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
      render: (_: any, r: UserType) => {
        const isCurrentUser = (session?.user as any)?.id === String(r.id);
        return (
          <Space>
            <Button type="primary" ghost size="small" icon={<EditOutlined />} onClick={() => openEditModal(r)}>
              Sửa
            </Button>
            <Button size="small" icon={<LockOutlined />} onClick={() => router.push(`/admin/permissions`)}>
              Quyền
            </Button>
            {!isCurrentUser && (
              <Popconfirm
                title="Xóa người dùng"
                description={`Bạn có chắc chắn muốn xóa tài khoản "${r.fullName}"?`}
                onConfirm={() => handleDelete(r.id)}
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
              >
                <Button danger size="small" icon={<DeleteOutlined />}>
                  Xóa
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      }
    }
  ];

  if ((session?.user as any)?.userRole !== 'ADMIN') return <div className="p-10 text-center">Không có quyền truy cập</div>;

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
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          {/* Status Switch */}
          <Form.Item name="isActive" valuePropName="checked">
            <Switch checkedChildren="ĐANG HOẠT ĐỘNG" unCheckedChildren="ĐANG KHÓA" />
          </Form.Item>

          {/* FIELD: USERNAME */}
          <Form.Item
            name="username"
            label="Tên đăng nhập (Username)"
            rules={[
              { required: true, message: 'Vui lòng nhập tên đăng nhập' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: 'Không được chứa dấu hoặc ký tự đặc biệt' }
            ]}
          >
            <Input disabled={!!editingUser} placeholder="vd: nguyenvan_a" />
          </Form.Item>

          <Form.Item name="fullName" label="Họ tên hiển thị" rules={[{ required: true }]}>
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>

          {/* FIELD: USER ROLE */}
          <Form.Item name="userRole" label="Vai trò" rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}>
            <Select
              onChange={(val: UserRole) => {
                setSelectedRole(val);
                // Reset factory & process khi đổi role
                if (!FACTORY_ROLES.includes(val)) {
                  form.setFieldValue('factoryId', null);
                }
                if (!PROCESS_ROLES.includes(val)) {
                  form.setFieldValue('processIds', []);
                }
              }}
            >
              {(Object.keys(USER_ROLE_LABELS) as UserRole[]).map((role) => (
                <Select.Option key={role} value={role}>
                  <Tag color={ROLE_TAG_COLORS[role]} style={{ margin: 0 }}>
                    {USER_ROLE_LABELS[role]}
                  </Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {/* FIELD: FACTORY — chỉ hiện khi role cần, cho phép chọn nhiều */}
          {FACTORY_ROLES.includes(selectedRole) && (
            <Form.Item name="factoryIds" label="Gán nhà máy (có thể chọn nhiều)">
              <Select mode="multiple" allowClear placeholder="Chọn nhà máy...">
                {factories.map((f) => (
                  <Select.Option key={f.id} value={f.id}>{f.name}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

          {/* FIELD: PROCESSES — chỉ hiện khi role cần */}
          {PROCESS_ROLES.includes(selectedRole) && (
            <Form.Item name="processIds" label="Thuộc công đoạn (Có thể chọn nhiều)">
              <Select mode="multiple" allowClear placeholder="Chọn công đoạn...">
                {processes.map((p: any) => (
                  <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

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