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
  ThunderboltOutlined,
  QrcodeOutlined,
  NodeIndexOutlined,
  MobileOutlined,
  PauseCircleOutlined,
  TagsOutlined,
  ScheduleOutlined,
  ProductOutlined,
  LineChartOutlined,
  UploadOutlined,
  ToolOutlined,
  AlertOutlined,
  CommentOutlined,
  ClockCircleOutlined,
  GroupOutlined,
  BarChartOutlined,
  FileTextOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { canViewModule, type ModuleKey } from "@/lib/permissions";

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
    pathname === "/production/mobile-input" ||
    pathname === "/production/mobile-stops" ||
    pathname === "/production/mobile-report" ||
    pathname === "/production/mobile-maintenance"
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

  // ========================================================
  // PHÂN QUYỀN
  // ========================================================
  const userRole = (session?.user as any)?.role ?? "USER";
  const userDepartment = (session?.user as any)?.department ?? "FACTORY";
  const userExtraModules: string[] = (session?.user as any)?.extraModules ?? [];

  const isAdmin = userRole === "ADMIN";

  const canView = (module: ModuleKey) =>
    canViewModule(userDepartment, userExtraModules, userRole, module);

  // ========================================================
  // CẤU HÌNH MENU — Phân nhóm rõ ràng
  // ========================================================

  // Tự động mở nhóm chứa trang hiện tại
  const findOpenKeys = (items: any[], path: string): string[] => {
    for (const item of items) {
      if (item.children) {
        for (const child of item.children) {
          if (child.key === path) return [item.key];
          if (child.children) {
            const found = findOpenKeys([child], path);
            if (found.length) return [item.key, ...found];
          }
        }
      }
    }
    return [];
  };
  const menuItems: any[] = [
    // ── TỔNG QUAN ──
    {
      key: "/",
      icon: <DashboardOutlined />,
      label: "Tổng quan",
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ▸ SẢN XUẤT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    { type: "divider" },
    { type: "group", label: "SẢN XUẤT", children: [] },

    {
      key: "sub-sx",
      icon: <AppstoreOutlined />,
      label: "Quản lý sản xuất",
      children: [
        { key: "/machines", label: "Máy móc & Điều phối", icon: <RobotOutlined /> },
        { key: "/production/daily-input", label: "Nhập sản lượng", icon: <ProductOutlined /> },
        { key: "/production/line-setup", label: "Thiết lập line SX", icon: <ApartmentOutlined /> },
        { key: "/production/line-diagram", label: "Sơ đồ line SX", icon: <NodeIndexOutlined /> },
        { key: "/machines/qr-machines", label: "QR Code máy", icon: <QrcodeOutlined /> },
      ],
    },
    {
      key: "sub-stops",
      icon: <PauseCircleOutlined />,
      label: "Dừng máy & Bảo dưỡng",
      children: [
        { key: "/production/machine-stops", label: "Ghi nhận dừng máy", icon: <PauseCircleOutlined /> },
        { key: "/production/stop-history", label: "Lịch sử dừng máy", icon: <HistoryOutlined /> },
        { key: "/dashboard/maintenance", label: "Nhật ký bảo dưỡng", icon: <ScheduleOutlined /> },
      ],
    },
    {
      key: "sub-mobile",
      icon: <MobileOutlined />,
      label: "Mobile",
      children: [
        { key: "/production/mobile-input", label: "Nhập liệu Mobile", icon: <MobileOutlined /> },
        { key: "/production/mobile-report", label: "Báo cáo Mobile", icon: <MobileOutlined /> },
        { key: "/production/mobile-stops", label: "Báo sự cố", icon: <AlertOutlined /> },
        { key: "/production/mobile-maintenance", label: "Bảo dưỡng", icon: <ToolOutlined /> },
      ],
    },
  ];

  // Import IoT — chèn ngay sau "Nhập sản lượng" trong Quản lý sản xuất
  if (canView("iot")) {
    const subSx = menuItems.find((item: any) => item.key === "sub-sx");
    if (subSx?.children) {
      subSx.children.splice(2, 0, { key: "/iot-import", label: "Import IoT", icon: <UploadOutlined /> });
    }
  }

  // Định mức Năng suất (nằm trong nhóm SẢN XUẤT)
  if (canView("benchmark")) {
    menuItems.push({
      key: "sub-benchmark",
      icon: <LineChartOutlined />,
      label: "Định mức Năng suất",
      children: [
        { key: "/dashboard/productivity-benchmark", label: "Phiên bản & Chi tiết ĐM", icon: <ScheduleOutlined /> },
        { key: "/dashboard/productivity-benchmark/capacity", label: "Năng lực sản xuất", icon: <BarChartOutlined /> },
        { key: "/dashboard/productivity-benchmark/comparison", label: "So sánh thực tế vs ĐM", icon: <LineChartOutlined /> },
      ],
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ▸ ĐIỆN NĂNG
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (canView("energy")) {
    menuItems.push(
      { type: "divider" },
      { type: "group", label: "ĐIỆN NĂNG", children: [] },
      {
        key: "sub-energy",
        icon: <ThunderboltOutlined />,
        label: "Quản lý Điện năng",
        children: [
          { key: "/dashboard/energy/prices", label: "Đơn giá điện" },
          { key: "/dashboard/energy/daily-input", label: "Nhập chỉ số điện" },
          { key: "/dashboard/energy/reports", label: "Báo cáo tiêu thụ" },
          { key: "/dashboard/energy/live", label: "Giám sát trực tiếp" },
        ],
      }
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ▸ KINH DOANH
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (canView("kdsx")) {
    menuItems.push(
      { type: "divider" },
      { type: "group", label: "KINH DOANH", children: [] },
      {
        key: "sub-kdsx",
        icon: <BarChartOutlined />,
        label: "KH Kinh doanh - SX",
        children: [
          { key: "/kdsx", label: "Dashboard tổng hợp", icon: <DashboardOutlined /> },
          { key: "/kdsx/customers", label: "Khách hàng", icon: <UserOutlined /> },
          { key: "/kdsx/sales-orders", label: "Hợp đồng bán hàng", icon: <FileTextOutlined /> },
          { key: "/kdsx/order-progress", label: "Tiến độ đơn hàng", icon: <BarChartOutlined /> },
          { key: "/kdsx/plans", label: "Kế hoạch tháng", icon: <CalendarOutlined /> },
          { key: "/kdsx/actuals", label: "Thực hiện tháng", icon: <CheckCircleOutlined /> },
          { key: "/sales-orders", label: "Theo dõi đơn hàng", icon: <UnorderedListOutlined /> },
        ],
      }
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ▸ BÁO CÁO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (isAdmin || (session?.user as any)?.accessLevel === "MANAGER") {
    menuItems.push(
      { type: "divider" },
      { type: "group", label: "BÁO CÁO", children: [] },
      {
        key: "sub-reports",
        icon: <LineChartOutlined />,
        label: "Báo cáo sản xuất",
        children: [
          { key: "/production/history", label: "Lịch sử & Báo cáo", icon: <HistoryOutlined /> },
          { key: "/reports/production", label: "Biểu đồ sản lượng", icon: <LineChartOutlined /> },
        ],
      }
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ▸ DANH MỤC DỮ LIỆU
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  menuItems.push(
    { type: "divider" },
    { type: "group", label: "DANH MỤC", children: [] },
    {
      key: "sub-cat-sx",
      icon: <DatabaseOutlined />,
      label: "DM Sản xuất",
      children: [
        { key: "/factories", label: "Nhà máy", icon: <ApartmentOutlined /> },
        { key: "/processes", label: "Công đoạn", icon: <PartitionOutlined /> },
        { key: "/items", label: "Mặt hàng", icon: <BarcodeOutlined /> },
        { key: "/categories/shift", label: "Ca làm việc", icon: <ClockCircleOutlined /> },
        { key: "/dashboard/stop-categories", label: "Nguyên nhân dừng", icon: <TagsOutlined /> },
      ],
    },
    {
      key: "sub-cat-energy",
      icon: <ThunderboltOutlined />,
      label: "DM Điện năng",
      children: [
        { key: "/categories/energy-type", label: "Loại điện năng", icon: <ThunderboltOutlined /> },
        { key: "/categories/meter-group", label: "Nhóm đồng hồ điện", icon: <GroupOutlined /> },
        { key: "/categories/meters", label: "Trạm & Đồng hồ", icon: <DashboardOutlined /> },
      ],
    }
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ▸ HỆ THỐNG
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const systemChildren: any[] = [];



  if (isAdmin) {
    systemChildren.push(
      { key: "/users", icon: <UserOutlined />, label: "Quản lý Tài khoản" },
      { key: "/admin/backup", icon: <CloudSyncOutlined />, label: "Sao lưu & Phục hồi" }
    );
  }

  systemChildren.push(
    { key: "/feedback", icon: <CommentOutlined />, label: "Góp ý & Đề xuất" },
    { key: "/settings", icon: <SettingOutlined />, label: "Cấu hình chung" }
  );

  menuItems.push(
    { type: "divider" },
    { type: "group", label: "HỆ THỐNG", children: [] },
    {
      key: "sub-system",
      icon: <SafetyCertificateOutlined />,
      label: "Quản trị & Cài đặt",
      children: systemChildren,
    }
  );

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
          defaultOpenKeys={findOpenKeys(menuItems, pathname)}
          items={menuItems}
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