"use client";

import UserDropdown from "@/components/UserDropdown";
import React, { useState, useEffect } from "react";
import { Layout, Menu, Button, theme, Spin } from "antd";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  AppstoreOutlined,
  UserOutlined,
  HistoryOutlined,
  SettingOutlined,
  SafetyCertificateOutlined, // Icon cho quản trị hệ thống
  CloudSyncOutlined,         // Icon cho Backup
  ApartmentOutlined,         // Icon Factory
  BarcodeOutlined,           // Icon Item
  PartitionOutlined,         // Icon Process
  RobotOutlined              // Icon Machine
} from "@ant-design/icons";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

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

  // 1. Bảo vệ route
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

  // 2. Cấu hình Menu Cơ bản (Ai cũng thấy)
  const baseMenuItems = [
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
        { key: "/factories", label: "Nhà máy", icon: <ApartmentOutlined /> },
        { key: "/processes", label: "Công đoạn", icon: <PartitionOutlined /> },
        { key: "/items", label: "Mặt hàng", icon: <BarcodeOutlined /> },

      ],
    },
    {
      key: "sub2",
      icon: <AppstoreOutlined />,
      label: "Quản lý Sản xuất",
      children: [
        { key: "/machines", label: "Máy móc & Điều phối", icon: <RobotOutlined /> },
        { key: "/production/daily-input", label: "Nhập sản lượng" },
        {
          key: "/production/history",
          label: "Lịch sử & Báo cáo",
          icon: <HistoryOutlined />,
        },
        {
          key: "/dashboard/maintenance",
          label: "Nhật ký bảo dưỡng",
          icon: <HistoryOutlined />,
        },
      ],
    },
  ];

  // 3. Cấu hình Menu Admin (Chỉ Admin mới thấy)
  // Gom User và Backup vào nhóm "Quản trị hệ thống"
  if (session?.user?.role === "ADMIN") {
    baseMenuItems.push({
      key: "sub-admin",
      icon: <SafetyCertificateOutlined />,
      label: "Quản trị hệ thống",
      children: [
        {
          key: "/users", // Hoặc /admin/users nếu bạn đã đổi cấu trúc thư mục
          icon: <UserOutlined />,
          label: "Quản lý Tài khoản",
        },
        {
          key: "/admin/backup",
          icon: <CloudSyncOutlined />,
          label: "Sao lưu & Phục hồi",
        },
      ],
    } as any);
  }

  // Thêm mục Cài đặt xuống cuối cùng
  baseMenuItems.push({
    key: "/settings",
    icon: <SettingOutlined />,
    label: "Cấu hình chung",
  } as any);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {/* SIDER */}
      <Sider trigger={null} collapsible collapsed={collapsed} width={260} theme="dark">
        <div
          style={{
            height: 64,
            margin: 16,
            background: "rgba(255, 255, 255, 0.1)", // Chỉnh lại màu nền logo cho nhẹ nhàng hơn
            border: "1px solid rgba(255, 255, 255, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: "bold",
            fontSize: collapsed ? 16 : 20,
            borderRadius: 8,
            overflow: "hidden",
            whiteSpace: "nowrap",
            transition: "all 0.3s"
          }}
        >
          {collapsed ? "PB" : "PHU BAI ERP"}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          // Tự động mở menu con nếu đang ở trang con tương ứng
          defaultOpenKeys={["sub1", "sub2", "sub-admin"]}
          items={baseMenuItems}
          onClick={({ key }) => {
            if (key.startsWith("/")) {
              router.push(key);
            }
          }}
        />
      </Sider>

      {/* MAIN LAYOUT */}
      <Layout>
        <Header
          style={{
            padding: 0,
            background: colorBgContainer,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingRight: 24,
            boxShadow: "0 1px 4px rgba(0,21,41,0.08)", // Thêm bóng đổ nhẹ cho Header tách biệt
            zIndex: 1,
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

          {/* Component UserDropdown bạn đã tách riêng rất gọn */}
          <UserDropdown />
        </Header>

        <Content
          style={{
            margin: "24px 16px",
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            overflow: "initial", // Để nội dung dài vẫn cuộn mượt
          }}
        >
          {children}
        </Content>

        <Footer style={{ textAlign: "center", color: "#888", background: 'transparent' }}>
          Sợi Phú Bài ERP ©{new Date().getFullYear()} - Developed by Minh Trí
        </Footer>
      </Layout>
    </Layout>
  );
};

export default AdminLayout;