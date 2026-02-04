"use client";

import React, { useState, useEffect } from "react";
import { Layout, Menu, Button, theme, Avatar, Dropdown, Space, Spin } from "antd";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  AppstoreOutlined,
  UserOutlined,
  HistoryOutlined,
  LogoutOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useRouter, usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

const { Header, Sider, Content, Footer } = Layout;

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const { data: session, status } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const router = useRouter();
  const pathname = usePathname();

  // Bảo vệ route
  useEffect(() => {
    if (status === "unauthenticated" && pathname !== "/login" && pathname !== "/register") {
      router.push("/login");
    }
  }, [status, pathname, router]);

  if (pathname === "/login" || pathname === "/register") {
    return <>{children}</>;
  }

  if (status === "loading") {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  // Cấu hình Menu
  const menuItems = [
    {
      key: "/",
      icon: <DashboardOutlined />,
      label: "Tổng quan (Dashboard)",
    },
    {
      key: "sub1",
      icon: <DatabaseOutlined />,
      label: "Danh mục dữ liệu",
      children: [
        { key: "/factories", label: "Nhà máy" },
        { key: "/processes", label: "Công đoạn" },
        { key: "/items", label: "Mặt hàng" },
        { key: "/machines", label: "Máy móc" },
      ],
    },
    {
      key: "sub2",
      icon: <AppstoreOutlined />,
      label: "Quản lý Sản xuất",
      children: [
        { key: "/production/assign", label: "Điều phối (Gán mặt hàng)" },
        { key: "/production/daily-input", label: "Nhập sản lượng" },
        {
          key: "/production/history",
          label: "Lịch sử & Báo cáo",
          icon: <HistoryOutlined />,
        },
      ],
    },
    {
      key: "/settings",
      icon: <SettingOutlined />,
      label: "Cấu hình hệ thống",
    },
  ];

  if (session?.user?.role === "ADMIN") {
    menuItems.splice(3, 0, {
      key: "/users",
      icon: <UserOutlined />,
      label: "Quản lý Tài khoản",
    } as any);
  }

  const userMenu = {
    items: [
      {
        key: "0",
        label: (
          <div style={{ padding: '4px 0', cursor: 'default' }}>
            <div style={{ fontWeight: 'bold' }}>{session?.user?.fullName}</div>
            <div style={{ fontSize: 12, color: '#888' }}>
              {session?.user?.role} - {session?.user?.accessLevel}
            </div>
          </div>
        ),
      },
      { type: 'divider' },
      {
        key: "2",
        label: "Đăng xuất",
        icon: <LogoutOutlined />,
        danger: true,
        onClick: () => { signOut({ callbackUrl: "/login" }); },
      },
    ],
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {/* 1. SIDER: Đổi lại theme="dark" */}
      <Sider trigger={null} collapsible collapsed={collapsed} width={250} theme="dark">
        <div
          style={{
            height: 64,
            margin: 16,
            // Đổi lại màu nền logo cho nổi bật trên nền đen
            background: "rgba(255, 255, 255, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white", // Chữ màu trắng
            fontWeight: "bold",
            fontSize: collapsed ? 16 : 20,
            borderRadius: 6,
          }}
        >
          {collapsed ? "PB" : "PHU BAI ERP"}
        </div>

        <Menu
          theme="dark" // 2. MENU: Đổi lại theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          defaultOpenKeys={["sub1", "sub2"]}
          items={menuItems}
          onClick={({ key }) => {
            if (key.startsWith("/")) {
              router.push(key);
            }
          }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            padding: 0,
            background: colorBgContainer,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingRight: 24,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: "16px",
              width: 64,
              height: 64,
            }}
          />

          <Space>
            <span style={{ marginRight: 8 }}>
              Xin chào, <b>{session?.user?.fullName || "User"}</b>
            </span>
            <Dropdown menu={userMenu} trigger={['click']}>
              <Avatar
                style={{ backgroundColor: "#1890ff", cursor: "pointer" }}
                icon={<UserOutlined />}
                src={`https://ui-avatars.com/api/?name=${session?.user?.fullName}&background=random`}
              />
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            margin: "24px 16px",
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            overflow: "auto",
          }}
        >
          {children}
        </Content>

        <Footer style={{ textAlign: "center", color: "#888" }}>
          Phu Bai Factory ©{new Date().getFullYear()} - Nguyễn Thiện Minh Trí
        </Footer>
      </Layout>
    </Layout>
  );
};

export default AdminLayout;