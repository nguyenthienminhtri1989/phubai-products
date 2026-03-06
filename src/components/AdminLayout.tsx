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
  SafetyCertificateOutlined,
  CloudSyncOutlined,
  ApartmentOutlined,
  BarcodeOutlined,
  PartitionOutlined,
  RobotOutlined,
  ThunderboltOutlined, // Icon tia sét cho Module Điện năng
  QrcodeOutlined,
  NodeIndexOutlined,
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

  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/production/mobile-input"
  ) {
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
        {
          key: "/machines/qr-machines",
          label: "QR Code máy",
          icon: <QrcodeOutlined />
        },
        {
          key: "/production/line-setup",
          label: "Thiết lập line SX",
          icon: <ApartmentOutlined />
        },
        {
          key: "/production/line-diagram",
          label: "Sơ đồ line SX",
          icon: <NodeIndexOutlined />
        },
      ],
    },
  ];

  // ========================================================
  // 3. LOGIC PHÂN QUYỀN HIỂN THỊ MENU ĐIỆN NĂNG
  // ========================================================
  const userRole = session?.user?.role;
  const userProcessIds: number[] = (session?.user as any)?.processIds || [];
  const userProcessId = userProcessIds[0] ?? null;

  // Danh sách ID các Tổ Điện (Nhà máy 1 và Nhà máy 2)
  const ELECTRICAL_PROCESS_IDS = [15, 16];

  const isAdmin = userRole === "ADMIN";

  // Kiểm tra xem user có thuộc một trong các tổ điện không
  const isElectrician = userProcessIds.some(id => ELECTRICAL_PROCESS_IDS.includes(id));

  // Nếu là Admin HOẶC là nhân viên tổ điện -> Thêm menu Quản lý Điện năng
  if (isAdmin || isElectrician) {
    baseMenuItems.push({
      key: "sub-energy",
      icon: <ThunderboltOutlined />,
      label: "Quản lý Điện năng",
      children: [
        { key: "/dashboard/energy/prices", label: "Đơn giá điện" },
        { key: "/dashboard/energy/meters", label: "Trạm & Đồng hồ" },
        { key: "/dashboard/energy/daily-input", label: "Nhập chỉ số điện" },
        { key: "/dashboard/energy/reports", label: "Báo cáo tiêu thụ" },
      ],
    } as any);
  }
  // ========================================================

  // 4. Menu Quản trị hệ thống (Chỉ Admin mới thấy)
  if (isAdmin) {
    baseMenuItems.push({
      key: "sub-admin",
      icon: <SafetyCertificateOutlined />,
      label: "Quản trị hệ thống",
      children: [
        {
          key: "/users",
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
            background: "rgba(255, 255, 255, 0.1)",
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
          defaultOpenKeys={["sub1", "sub2", "sub-admin", "sub-energy"]}
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
            boxShadow: "0 1px 4px rgba(0,21,41,0.08)",
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

          <UserDropdown />
        </Header>

        <Content
          style={{
            margin: "24px 16px",
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            overflow: "initial",
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