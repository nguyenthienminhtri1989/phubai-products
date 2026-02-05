"use client";

import React from "react";
import { Avatar, Dropdown, Space, Typography, Tag, MenuProps, theme } from "antd";
import { LogoutOutlined, DownOutlined, ProfileOutlined, UserOutlined } from "@ant-design/icons";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

const { Text } = Typography;

export default function UserDropdown() {
    const { data: session } = useSession();
    const { token } = theme.useToken();

    // Nếu chưa có session thì không hiển thị gì
    if (!session?.user) return null;

    // Lấy dữ liệu từ session (Khớp với field 'fullName' của bạn)
    // TypeScript có thể báo lỗi đỏ ở fullName nếu chưa khai báo type, tạm thời dùng 'as any' hoặc check null
    const user = session.user as any;
    const fullName = user.fullName || user.name || "User";
    const role = user.role || "USER";

    // Tạo Avatar từ UI Avatars như code cũ của bạn (nhìn đẹp hơn chữ cái đơn thuần)
    const avatarUrl = `https://ui-avatars.com/api/?name=${fullName}&background=random&color=fff`;

    const items: MenuProps['items'] = [
        {
            key: 'info',
            label: (
                <div style={{ padding: '4px 0', minWidth: 150 }}>
                    <Text strong>{fullName}</Text>
                    <div style={{ marginTop: 4 }}>
                        {role === "ADMIN" ? <Tag color="red">ADMIN</Tag> : <Tag color="blue">NHÂN VIÊN</Tag>}
                    </div>
                </div>
            ),
            disabled: true,
            style: { cursor: 'default', borderBottom: '1px solid #f0f0f0' }
        },
        {
            key: 'profile',
            icon: <ProfileOutlined />,
            label: <Link href="/profile">Hồ sơ cá nhân</Link>,
            style: { marginTop: 4 }
        },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Đăng xuất',
            danger: true,
            onClick: () => signOut({ callbackUrl: "/login" }),
        },
    ];

    return (
        <Dropdown menu={{ items }} trigger={['click']}>
            <Space style={{ cursor: 'pointer', padding: '0 8px', borderRadius: 6, transition: 'background 0.3s' }} className="hover:bg-gray-100">
                <span style={{ marginRight: 4, display: 'flex', flexDirection: 'column', alignItems: 'end', lineHeight: '1.2' }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{fullName}</span>
                </span>

                <Avatar
                    src={avatarUrl}
                    icon={<UserOutlined />}
                    style={{ border: `1px solid ${token.colorBorder}` }}
                />
            </Space>
        </Dropdown>
    );
}