"use client";

import UserDropdown from "@/components/UserDropdown";
import React, { useState, useEffect, useMemo } from "react";
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
  EditOutlined,
  LockOutlined,
  ExperimentOutlined,
  TableOutlined,
  DollarOutlined,
} from "@ant-design/icons";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  canViewPage,
  type PermUser,
  type UserRole,
} from "@/lib/permissions";

const { Header, Sider, Content, Footer } = Layout;

interface AdminLayoutProps {
  children: React.ReactNode;
}

// ==========================================
// Cấu trúc trang — tĩnh, dùng cho sidebar
// ==========================================
interface PageDef {
  pageKey: string;
  pageGroup: string;
  path: string;
  label: string;
  icon: React.ReactNode;
}

// Tất cả trang — mapping từ PageRegistry
const ALL_PAGES: PageDef[] = [
  // TỔNG QUAN
  { pageKey: "dashboard.overview", pageGroup: "TỔNG QUAN", path: "/", label: "Tổng quan", icon: <DashboardOutlined /> },
  // SẢN XUẤT
  { pageKey: "sx.machines", pageGroup: "SẢN XUẤT", path: "/machines", label: "Máy móc & Điều phối", icon: <RobotOutlined /> },
  { pageKey: "sx.daily-input", pageGroup: "SẢN XUẤT", path: "/production/daily-input", label: "Nhập sản lượng (Thẻ)", icon: <ProductOutlined /> },
  { pageKey: "sx.daily-input-grid", pageGroup: "SẢN XUẤT", path: "/production/daily-input-grid", label: "Nhập sản lượng (Bảng)", icon: <TableOutlined /> },
  { pageKey: "sx.winding-input", pageGroup: "SẢN XUẤT", path: "/production/winding-input", label: "Nhập liệu đánh ống", icon: <ThunderboltOutlined /> },
  { pageKey: "sx.iot-import", pageGroup: "SẢN XUẤT", path: "/iot-import", label: "Import IoT", icon: <UploadOutlined /> },
  { pageKey: "sx.line-setup", pageGroup: "SẢN XUẤT", path: "/production/line-setup", label: "Thiết lập line SX", icon: <ApartmentOutlined /> },
  { pageKey: "sx.line-diagram", pageGroup: "SẢN XUẤT", path: "/production/line-diagram", label: "Sơ đồ line SX", icon: <NodeIndexOutlined /> },
  { pageKey: "sx.qr-machines", pageGroup: "SẢN XUẤT", path: "/machines/qr-machines", label: "QR Code máy", icon: <QrcodeOutlined /> },
  { pageKey: "sx.machine-stops", pageGroup: "SẢN XUẤT", path: "/production/machine-stops", label: "Ghi nhận dừng máy", icon: <PauseCircleOutlined /> },
  { pageKey: "sx.stop-history", pageGroup: "SẢN XUẤT", path: "/production/stop-history", label: "Lịch sử dừng máy", icon: <HistoryOutlined /> },
  { pageKey: "sx.maintenance", pageGroup: "SẢN XUẤT", path: "/dashboard/maintenance", label: "Nhật ký bảo dưỡng", icon: <ScheduleOutlined /> },
  // ĐỊNH MỨC
  { pageKey: "benchmark.versions", pageGroup: "ĐỊNH MỨC", path: "/dashboard/productivity-benchmark", label: "Phiên bản & Chi tiết ĐM", icon: <ScheduleOutlined /> },
  { pageKey: "benchmark.capacity", pageGroup: "ĐỊNH MỨC", path: "/dashboard/productivity-benchmark/capacity", label: "Năng lực sản xuất", icon: <BarChartOutlined /> },
  { pageKey: "benchmark.comparison", pageGroup: "ĐỊNH MỨC", path: "/dashboard/productivity-benchmark/comparison", label: "So sánh thực tế vs ĐM", icon: <LineChartOutlined /> },
  // ĐIỆN NĂNG
  { pageKey: "energy.prices", pageGroup: "ĐIỆN NĂNG", path: "/dashboard/energy/prices", label: "Đơn giá điện", icon: <ThunderboltOutlined /> },
  { pageKey: "energy.daily-input", pageGroup: "ĐIỆN NĂNG", path: "/dashboard/energy/daily-input", label: "Nhập chỉ số điện", icon: <UploadOutlined /> },
  { pageKey: "energy.reports", pageGroup: "ĐIỆN NĂNG", path: "/dashboard/energy/reports", label: "Báo cáo tiêu thụ", icon: <LineChartOutlined /> },
  { pageKey: "energy.live", pageGroup: "ĐIỆN NĂNG", path: "/dashboard/energy/live", label: "Giám sát trực tiếp", icon: <DashboardOutlined /> },
  // KINH DOANH
  { pageKey: "kdsx.dashboard", pageGroup: "KINH DOANH", path: "/kdsx", label: "Dashboard tổng hợp", icon: <DashboardOutlined /> },
  { pageKey: "kdsx.revenue", pageGroup: "KINH DOANH", path: "/kdsx/revenue", label: "Doanh thu – Lợi nhuận", icon: <DollarOutlined /> },
  { pageKey: "kdsx.production-schedule", pageGroup: "KINH DOANH", path: "/kdsx/production-schedule", label: "Kế hoạch & Thực hiện", icon: <CalendarOutlined /> },
  { pageKey: "kdsx.plans", pageGroup: "KINH DOANH", path: "/kdsx/plans", label: "Kế hoạch tháng (Cũ)", icon: <CalendarOutlined /> },
  { pageKey: "kdsx.customers", pageGroup: "KINH DOANH", path: "/kdsx/customers", label: "Khách hàng", icon: <UserOutlined /> },
  { pageKey: "kdsx.sales-orders", pageGroup: "KINH DOANH", path: "/kdsx/sales-orders", label: "Hợp đồng bán hàng", icon: <FileTextOutlined /> },
  { pageKey: "kdsx.order-progress", pageGroup: "KINH DOANH", path: "/kdsx/order-progress", label: "Tiến độ đơn hàng", icon: <BarChartOutlined /> },
  { pageKey: "kdsx.actuals", pageGroup: "KINH DOANH", path: "/kdsx/actuals", label: "Thực hiện tháng (Cũ)", icon: <CheckCircleOutlined /> },
  { pageKey: "kdsx.sales-tracking", pageGroup: "KINH DOANH", path: "/sales-orders", label: "Theo dõi đơn hàng", icon: <UnorderedListOutlined /> },
  // { pageKey: "kdsx.daily-input", pageGroup: "KINH DOANH", path: "/kd-daily-input", label: "Nhập sản lượng ngày (KD)", icon: <EditOutlined /> },

  // MOBILE
  { pageKey: "mobile.input", pageGroup: "MOBILE", path: "/production/mobile-input", label: "Nhập liệu", icon: <ProductOutlined /> },
  { pageKey: "mobile.winding", pageGroup: "MOBILE", path: "/production/mobile-winding", label: "Nhập liệu đánh ống", icon: <ThunderboltOutlined /> },
  { pageKey: "mobile.report", pageGroup: "MOBILE", path: "/production/mobile-report", label: "Báo cáo sản lượng", icon: <BarChartOutlined /> },
  { pageKey: "mobile.stops", pageGroup: "MOBILE", path: "/production/mobile-stops", label: "Báo sự cố", icon: <AlertOutlined /> },
  { pageKey: "mobile.maintenance", pageGroup: "MOBILE", path: "/production/mobile-maintenance", label: "Bảo dưỡng máy", icon: <ToolOutlined /> },
  // BÁO CÁO
  { pageKey: "report.history", pageGroup: "BÁO CÁO", path: "/production/history", label: "Lịch sử & Báo cáo", icon: <HistoryOutlined /> },
  { pageKey: "report.production", pageGroup: "BÁO CÁO", path: "/reports/production", label: "Biểu đồ sản lượng", icon: <LineChartOutlined /> },
  // DANH MỤC SX
  { pageKey: "catalog.factories", pageGroup: "DANH MỤC", path: "/factories", label: "Nhà máy", icon: <ApartmentOutlined /> },
  { pageKey: "catalog.processes", pageGroup: "DANH MỤC", path: "/processes", label: "Công đoạn", icon: <PartitionOutlined /> },
  { pageKey: "catalog.items", pageGroup: "DANH MỤC", path: "/items", label: "Mặt hàng", icon: <BarcodeOutlined /> },
  { pageKey: "catalog.lots", pageGroup: "DANH MỤC", path: "/lots", label: "Danh mục lô hàng", icon: <TagsOutlined /> },
  { pageKey: "catalog.shifts", pageGroup: "DANH MỤC", path: "/categories/shift", label: "Ca làm việc", icon: <ClockCircleOutlined /> },
  { pageKey: "catalog.stop-cats", pageGroup: "DANH MỤC", path: "/dashboard/stop-categories", label: "Nguyên nhân dừng", icon: <TagsOutlined /> },
  { pageKey: "kdsx.raw-material-rates", pageGroup: "DANH MỤC", path: "/kdsx/raw-material-rates", label: "Định mức NVL", icon: <ExperimentOutlined /> },
  { pageKey: "kdsx.material-types", pageGroup: "DANH MỤC", path: "/kdsx/material-types", label: "Danh mục NVL", icon: <ExperimentOutlined /> },
  { pageKey: "kdsx.material-prices", pageGroup: "DANH MỤC", path: "/kdsx/material-prices", label: "Giá NVL theo tháng", icon: <DollarOutlined /> },
  // DANH MỤC ĐIỆN NĂNG
  { pageKey: "catalog.energy-type", pageGroup: "DANH MỤC", path: "/categories/energy-type", label: "Loại điện năng", icon: <ThunderboltOutlined /> },
  { pageKey: "catalog.meter-group", pageGroup: "DANH MỤC", path: "/categories/meter-group", label: "Nhóm đồng hồ điện", icon: <GroupOutlined /> },
  { pageKey: "catalog.meters", pageGroup: "DANH MỤC", path: "/categories/meters", label: "Trạm & Đồng hồ", icon: <DashboardOutlined /> },
  // HỆ THỐNG
  { pageKey: "system.users", pageGroup: "HỆ THỐNG", path: "/users", label: "Quản lý Tài khoản", icon: <UserOutlined /> },
  { pageKey: "system.permissions", pageGroup: "HỆ THỐNG", path: "/admin/permissions", label: "Phân quyền", icon: <LockOutlined /> },
  { pageKey: "system.page-registry", pageGroup: "HỆ THỐNG", path: "/admin/page-registry", label: "Danh sách Trang", icon: <AppstoreOutlined /> },
  { pageKey: "system.backup", pageGroup: "HỆ THỐNG", path: "/admin/backup", label: "Sao lưu & Phục hồi", icon: <CloudSyncOutlined /> },
  { pageKey: "system.feedback", pageGroup: "HỆ THỐNG", path: "/feedback", label: "Góp ý & Đề xuất", icon: <CommentOutlined /> },
];

// ==========================================
// Sidebar Group Definitions
// ==========================================
interface SidebarGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  subGroups?: {
    key: string;
    label: string;
    icon: React.ReactNode;
    pageKeys: string[];
  }[];
  pageKeys?: string[];
}

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    key: "group-reports",
    label: "BÁO CÁO",
    icon: <LineChartOutlined style={{ fontSize: 10 }} />,
    pageKeys: ["report.history", "report.production"],
  },
  {
    key: "group-sx",
    label: "SẢN XUẤT",
    icon: <AppstoreOutlined style={{ fontSize: 10 }} />,
    pageKeys: [
      "sx.machines", "sx.daily-input", "sx.daily-input-grid", "sx.winding-input", "sx.iot-import",
      "sx.line-setup", "sx.line-diagram", "sx.qr-machines",
      "sx.machine-stops", "sx.stop-history", "sx.maintenance",
      "benchmark.versions", "benchmark.capacity", "benchmark.comparison",
    ],
  },
  {
    key: "group-kdsx",
    label: "KINH DOANH",
    icon: <BarChartOutlined style={{ fontSize: 10 }} />,
    pageKeys: [
      "kdsx.revenue", "kdsx.customers", "kdsx.sales-orders", "kdsx.production-schedule", "kdsx.order-progress",
      "kdsx.sales-tracking",
      // Trang cũ — ẩn khỏi sidebar, vẫn accessible qua URL:
      // "kdsx.dashboard", "kdsx.plans", "kdsx.actuals", "kdsx.daily-input",
    ],
  },
  {
    key: "group-mobile",
    label: "MOBILE",
    icon: <MobileOutlined style={{ fontSize: 10 }} />,
    pageKeys: ["mobile.input", "mobile.winding", "mobile.report", "mobile.stops", "mobile.maintenance"],
  },
  {
    key: "group-energy",
    label: "ĐIỆN NĂNG",
    icon: <ThunderboltOutlined style={{ fontSize: 10 }} />,
    pageKeys: ["energy.prices", "energy.daily-input", "energy.reports", "energy.live"],
  },
  {
    key: "group-catalog",
    label: "DANH MỤC",
    icon: <DatabaseOutlined style={{ fontSize: 10 }} />,
    pageKeys: [
      "catalog.factories", "catalog.processes", "catalog.items", "catalog.lots", "catalog.shifts", "catalog.stop-cats",
      "kdsx.raw-material-rates", "kdsx.material-types", "kdsx.material-prices",
      "catalog.energy-type", "catalog.meter-group", "catalog.meters",
    ],
  },
  {
    key: "group-system",
    label: "HỆ THỐNG",
    icon: <SafetyCertificateOutlined style={{ fontSize: 10 }} />,
    pageKeys: ["system.users", "system.permissions", "system.page-registry", "system.backup", "system.feedback"],
  },
];

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
    pathname === "/production/mobile-winding" ||
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
  // PHÂN QUYỀN — Dùng permission engine mới
  // ========================================================
  const userRole = ((session?.user as any)?.userRole ?? "VIEWER") as UserRole;
  const isAdmin = userRole === "ADMIN";
  const pagePermsRaw: { pageKey: string; canView: boolean; canEdit: boolean }[] =
    (session?.user as any)?.pagePermissions ?? [];

  const permUser: PermUser = {
    userRole,
    factoryId: (session?.user as any)?.factoryId ?? null,
    processIds: (session?.user as any)?.processIds ?? [],
    pagePermissions: pagePermsRaw,
  };

  // Helper: check if user can see a page
  const canView = (pageKey: string): boolean => {
    const pageDef = ALL_PAGES.find((p) => p.pageKey === pageKey);
    if (!pageDef) return false;
    return canViewPage(permUser, pageKey, pageDef.pageGroup);
  };

  // ========================================================
  // BUILD MENU ITEMS — Lọc theo quyền
  // ========================================================
  const makeGroupLabel = (text: string) => (
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,0.45)" }}>
      {text}
    </span>
  );

  const buildMenuItems = (): any[] => {
    const items: any[] = [];

    // Tổng quan — luôn hiện
    const overviewPage = ALL_PAGES.find((p) => p.pageKey === "dashboard.overview");
    if (overviewPage && canView("dashboard.overview")) {
      items.push({
        key: overviewPage.path,
        icon: overviewPage.icon,
        label: overviewPage.label,
      });
    }

    // Build sidebar groups
    for (const group of SIDEBAR_GROUPS) {
      // Build children for this group
      let groupChildren: any[] = [];

      if (group.subGroups) {
        // Has sub-groups
        for (const sub of group.subGroups) {
          const subChildren = sub.pageKeys
            .filter((pk) => canView(pk))
            .map((pk) => {
              const p = ALL_PAGES.find((pp) => pp.pageKey === pk)!;
              return { key: p.path, label: p.label, icon: p.icon };
            });

          if (subChildren.length > 0) {
            groupChildren.push({
              key: sub.key,
              icon: sub.icon,
              label: sub.label,
              children: subChildren,
            });
          }
        }
      } else if (group.pageKeys && group.pageKeys.length > 0) {
        // Flat page list
        groupChildren = group.pageKeys
          .filter((pk) => canView(pk))
          .map((pk) => {
            const p = ALL_PAGES.find((pp) => pp.pageKey === pk)!;
            return { key: p.path, label: p.label, icon: p.icon };
          });
      }



      // Special: Hệ thống group — filter admin-only items
      if (group.key === "group-system") {
        groupChildren = groupChildren.filter((child) => {
          // Quản lý Tài khoản, Phân quyền, Sao lưu chỉ cho ADMIN
          const adminOnlyPaths = ["/users", "/admin/permissions", "/admin/page-registry", "/admin/backup"];
          if (adminOnlyPaths.includes(child.key) && !isAdmin) return false;
          return true;
        });
      }

      // Only add group if it has visible children
      if (groupChildren.length > 0) {
        items.push({ type: "divider" });
        items.push({
          key: group.key,
          icon: group.icon,
          label: makeGroupLabel(group.label),
          children: groupChildren,
        });
      }
    }

    return items;
  };

  const menuItems = buildMenuItems();

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

  // Tính openKeys mặc định (mở group + submenu chứa trang hiện tại)
  const defaultOpenKeys = (() => {
    const keys: string[] = [];
    const groupKeys = SIDEBAR_GROUPS.map((g) => g.key);
    // Luôn mở tất cả group theo mặc định
    groupKeys.forEach((k) => keys.push(k));
    // Thêm submenu đang active
    const activeSubKeys = findOpenKeys(menuItems, pathname);
    activeSubKeys.forEach((k) => {
      if (!keys.includes(k)) keys.push(k);
    });
    return keys;
  })();

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
          defaultOpenKeys={defaultOpenKeys}
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