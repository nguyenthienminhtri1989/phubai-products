"use client";

import React, { useState, useEffect } from "react";
import {
  Card, Row, Col, Typography, Tag, Space,
  Statistic, Badge, Divider, Skeleton
} from "antd";
import {
  RobotOutlined, ThunderboltOutlined, ToolOutlined,
  HistoryOutlined, AppstoreOutlined, BarcodeOutlined,
  ArrowRightOutlined, CheckCircleOutlined, WarningOutlined,
  ClockCircleOutlined, DashboardOutlined, CalendarOutlined,
  SafetyCertificateOutlined, DatabaseOutlined, ApartmentOutlined,
  MobileOutlined,
} from "@ant-design/icons";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const { Title, Text } = Typography;

// ── Helpers ──────────────────────────────────────────────
function getCurrentShiftInfo() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return { shift: 1, label: "Ca 1 (06:00 – 14:00)", color: "#52c41a" };
  if (hour >= 14 && hour < 22) return { shift: 2, label: "Ca 2 (14:00 – 22:00)", color: "#1677ff" };
  return { shift: 3, label: "Ca 3 (22:00 – 06:00)", color: "#fa8c16" };
}

function formatDateVN(d: Date) {
  const days = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${days[d.getDay()]}, ${dd}/${mm}/${d.getFullYear()}`;
}

function formatTime(d: Date) {
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
// ─────────────────────────────────────────────────────────

export default function Home() {
  const { data: session } = useSession();
  const router = useRouter();

  const [now, setNow] = useState(new Date());
  const [machineCount, setMachineCount] = useState<number | null>(null);
  const [maintenanceCount, setMaintenanceCount] = useState<number | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Cập nhật đồng hồ mỗi phút
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Fetch thống kê nhỏ
  useEffect(() => {
    async function load() {
      try {
        const [mRes, tRes] = await Promise.all([
          fetch("/api/machines"),
          fetch("/api/maintenance/tasks"),
        ]);
        if (mRes.ok) {
          const machines = await mRes.json();
          setMachineCount(
            Array.isArray(machines)
              ? machines.filter((m: { isActive: boolean }) => m.isActive).length
              : 0
          );
        }
        if (tRes.ok) {
          const tasks = await tRes.json();
          if (Array.isArray(tasks)) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            setMaintenanceCount(
              tasks.filter((t: { nextDueDate: string }) => new Date(t.nextDueDate) < today).length
            );
          }
        }
      } catch { /* bỏ qua lỗi mạng */ }
      finally { setStatsLoading(false); }
    }
    load();
  }, []);

  const shiftInfo = getCurrentShiftInfo();
  const isAdmin = session?.user?.role === "ADMIN";
  const accessLevel = session?.user?.accessLevel;
  const processIds: number[] = (session?.user as any)?.processIds || [];
  const isElectrician = processIds.some(id => [15, 16].includes(id));

  const getRoleTag = () => {
    if (isAdmin) return { label: "Quản trị viên", color: "#f5222d" };
    if (accessLevel === "MANAGER") return { label: "Quản lý", color: "#1677ff" };
    if (accessLevel === "OPERATOR") return { label: "Vận hành", color: "#52c41a" };
    return { label: "Xem dữ liệu", color: "#8c8c8c" };
  };
  const roleTag = getRoleTag();

  // ── Danh sách module ──────────────────────────────────
  type Module = {
    key: string;
    title: string;
    desc: string;
    icon: React.ReactNode;
    path: string;
    bg: string;
    border: string;
    badge?: number | null;
  };

  const canInput = isAdmin || accessLevel === "OPERATOR" || accessLevel === "MANAGER";

  const modules: Module[] = [
    {
      key: "input",
      title: "Nhập Sản lượng",
      desc: "Ghi nhận chỉ số sản lượng theo ca, theo máy",
      icon: <AppstoreOutlined style={{ fontSize: 30, color: "#1677ff" }} />,
      path: "/production/daily-input",
      bg: "#e6f4ff", border: "#1677ff",
    },
    ...(canInput ? [{
      key: "mobile-input",
      title: "Nhập liệu Mobile",
      desc: "Giao diện nhập nhanh tối ưu cho điện thoại",
      icon: <MobileOutlined style={{ fontSize: 30, color: "#13c2c2" }} />,
      path: "/production/mobile-input",
      bg: "#e6fffb", border: "#13c2c2",
    }] : []),
    {
      key: "history",
      title: "Lịch sử & Báo cáo",
      desc: "Xem, lọc và xuất báo cáo sản lượng",
      icon: <HistoryOutlined style={{ fontSize: 30, color: "#52c41a" }} />,
      path: "/production/history",
      bg: "#f6ffed", border: "#52c41a",
    },
    {
      key: "maintenance",
      title: "Bảo trì định kỳ",
      desc: "Lịch bảo dưỡng, cảnh báo quá hạn",
      icon: <ToolOutlined style={{ fontSize: 30, color: "#eb2f96" }} />,
      path: "/dashboard/maintenance",
      bg: "#fff0f6", border: "#eb2f96",
      badge: maintenanceCount,
    },
    {
      key: "machines",
      title: "Máy móc & Điều phối",
      desc: "Quản lý, cấu hình, điều phối máy sản xuất",
      icon: <RobotOutlined style={{ fontSize: 30, color: "#722ed1" }} />,
      path: "/machines",
      bg: "#f9f0ff", border: "#722ed1",
    },
    {
      key: "items",
      title: "Mặt hàng",
      desc: "Danh mục sản phẩm, thông số kỹ thuật",
      icon: <BarcodeOutlined style={{ fontSize: 30, color: "#13c2c2" }} />,
      path: "/items",
      bg: "#e6fffb", border: "#13c2c2",
    },
    ...(isAdmin || isElectrician
      ? [{
        key: "energy",
        title: "Điện năng",
        desc: "Nhập chỉ số điện, theo dõi tiêu thụ & chi phí",
        icon: <ThunderboltOutlined style={{ fontSize: 30, color: "#fa8c16" }} />,
        path: "/dashboard/energy/daily-input",
        bg: "#fff7e6", border: "#fa8c16",
      }]
      : []),
  ];

  const adminModules: Module[] = [
    {
      key: "factories",
      title: "Nhà máy & Công đoạn",
      desc: "Quản lý cơ cấu tổ chức nhà máy",
      icon: <ApartmentOutlined style={{ fontSize: 30, color: "#faad14" }} />,
      path: "/factories",
      bg: "#fffbe6", border: "#faad14",
    },
    {
      key: "users",
      title: "Tài khoản & Phân quyền",
      desc: "Duyệt user, phân công vai trò, quản lý quyền hạn",
      icon: <SafetyCertificateOutlined style={{ fontSize: 30, color: "#ff7a45" }} />,
      path: "/users",
      bg: "#fff2e8", border: "#ff7a45",
    },
    {
      key: "backup",
      title: "Sao lưu & Phục hồi",
      desc: "Backup & restore toàn bộ dữ liệu hệ thống",
      icon: <DatabaseOutlined style={{ fontSize: 30, color: "#8c8c8c" }} />,
      path: "/admin/backup",
      bg: "#fafafa", border: "#d9d9d9",
    },
  ];

  // ── Render module card ─────────────────────────────────
  const ModuleCard = ({ mod }: { mod: Module }) => (
    <Card
      hoverable
      variant="borderless"
      style={{
        borderRadius: 12,
        borderLeft: `4px solid ${mod.border}`,
        background: mod.bg,
        boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
        height: "100%",
        transition: "transform 0.2s, box-shadow 0.2s",
      }}
      styles={{ body: { padding: "20px 22px" } }}
      onClick={() => router.push(mod.path)}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.13)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.07)";
      }}
    >
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Badge count={mod.badge ?? 0} overflowCount={99} size="small">
              {mod.icon}
            </Badge>
          </Col>
          <Col>
            <ArrowRightOutlined style={{ color: "#bfbfbf", fontSize: 15 }} />
          </Col>
        </Row>
        <div>
          <Title level={5} style={{ margin: "0 0 4px 0" }}>{mod.title}</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{mod.desc}</Text>
        </div>
      </Space>
    </Card>
  );

  return (
    <div>
      {/* ══════════════ WELCOME BANNER ══════════════ */}
      <div
        style={{
          background: "linear-gradient(135deg, #010345 0%, #0c1a7a 50%, #1677ff 100%)",
          borderRadius: 14,
          padding: "28px 36px",
          marginBottom: 24,
          position: "relative",
          overflow: "hidden",
          color: "white",
        }}
      >
        {/* Decorative blobs */}
        <div style={{
          position: "absolute", top: -50, right: -50,
          width: 220, height: 220, borderRadius: "50%",
          background: "rgba(255,255,255,0.04)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -70, right: 80,
          width: 180, height: 180, borderRadius: "50%",
          background: "rgba(2,167,250,0.12)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: 10, right: 220,
          width: 70, height: 70, borderRadius: "50%",
          background: "rgba(255,255,255,0.04)", pointerEvents: "none",
        }} />

        <Row align="middle" justify="space-between" wrap={false}>
          <Col flex="auto">
            {/* Dòng ngày giờ */}
            <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, display: "block", marginBottom: 6 }}>
              <CalendarOutlined style={{ marginRight: 6 }} />
              {formatDateVN(now)}
              <span style={{ margin: "0 10px", opacity: 0.4 }}>|</span>
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              {formatTime(now)}
            </Text>

            {/* Tiêu đề chào */}
            <Title level={2} style={{ color: "white", margin: "0 0 10px 0", fontSize: 26, lineHeight: 1.3 }}>
              Xin chào,{" "}
              <span style={{ color: "#02A7FA" }}>
                {session?.user?.fullName ?? session?.user?.username ?? "Bạn"}
              </span>{" "}
              👋
            </Title>

            {/* Badges */}
            <Space size={8} wrap>
              <Tag
                style={{
                  background: roleTag.color,
                  color: "white",
                  border: "none",
                  fontSize: 12,
                  padding: "2px 10px",
                  borderRadius: 20,
                }}
              >
                {roleTag.label}
              </Tag>
              <Tag
                style={{
                  background: shiftInfo.color,
                  color: "white",
                  border: "none",
                  fontSize: 12,
                  padding: "2px 10px",
                  borderRadius: 20,
                }}
              >
                <ClockCircleOutlined style={{ marginRight: 4 }} />
                {shiftInfo.label}
              </Tag>
            </Space>
          </Col>

          {/* Icon trang trí — ẩn trên mobile */}
          <Col xs={0} md={0} lg={4} style={{ textAlign: "right", flexShrink: 0 }}>
            <DashboardOutlined style={{ fontSize: 90, color: "rgba(255,255,255,0.07)" }} />
          </Col>
        </Row>
      </div>

      {/* ══════════════ KPI STATS ══════════════ */}
      <Row gutter={[14, 14]} style={{ marginBottom: 28 }}>
        {/* Tổng máy */}
        <Col xs={12} sm={12} md={6}>
          <Card
            variant="borderless"
            style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", height: "100%" }}
            styles={{ body: { padding: "18px 22px" } }}
          >
            {statsLoading ? (
              <Skeleton active paragraph={false} />
            ) : (
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 13 }}>Tổng máy hoạt động</Text>}
                value={machineCount ?? 0}
                prefix={<RobotOutlined style={{ color: "#1677ff" }} />}
                styles={{ content: { color: "#1677ff", fontWeight: 700, fontSize: 28 } }}
              />
            )}
          </Card>
        </Col>

        {/* Ca hiện tại */}
        <Col xs={12} sm={12} md={6}>
          <Card
            variant="borderless"
            style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", height: "100%" }}
            styles={{ body: { padding: "18px 22px" } }}
          >
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 13 }}>Ca đang chạy</Text>}
              value={`Ca ${shiftInfo.shift}`}
              prefix={<ClockCircleOutlined style={{ color: shiftInfo.color }} />}
              styles={{ content: { color: shiftInfo.color, fontWeight: 700, fontSize: 28 } }}
            />
          </Card>
        </Col>

        {/* Bảo trì quá hạn */}
        <Col xs={12} sm={12} md={6}>
          <Card
            variant="borderless"
            style={{
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
              height: "100%",
              ...(maintenanceCount && maintenanceCount > 0
                ? { borderTop: "3px solid #ff4d4f" }
                : { borderTop: "3px solid #52c41a" }),
            }}
            styles={{ body: { padding: "18px 22px" } }}
          >
            {statsLoading ? (
              <Skeleton active paragraph={false} />
            ) : (
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 13 }}>Bảo trì quá hạn</Text>}
                value={maintenanceCount ?? 0}
                prefix={
                  maintenanceCount && maintenanceCount > 0
                    ? <WarningOutlined style={{ color: "#ff4d4f" }} />
                    : <CheckCircleOutlined style={{ color: "#52c41a" }} />
                }
                styles={{ content: {
                  fontWeight: 700, fontSize: 28,
                  color: maintenanceCount && maintenanceCount > 0 ? "#ff4d4f" : "#52c41a",
                } }}
                suffix={maintenanceCount && maintenanceCount > 0
                  ? <Text style={{ fontSize: 13, color: "#ff7875" }}>hạng mục</Text>
                  : undefined
                }
              />
            )}
          </Card>
        </Col>

        {/* Hệ thống */}
        <Col xs={12} sm={12} md={6}>
          <Card
            variant="borderless"
            style={{
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
              height: "100%",
              borderTop: "3px solid #52c41a",
            }}
            styles={{ body: { padding: "18px 22px" } }}
          >
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 13 }}>Trạng thái hệ thống</Text>}
              value="Bình thường"
              prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
              styles={{ content: { color: "#52c41a", fontWeight: 700, fontSize: 22 } }}
            />
          </Card>
        </Col>
      </Row>

      {/* ══════════════ MODULE SHORTCUTS ══════════════ */}
      <Row align="middle" style={{ marginBottom: 14 }}>
        <Title level={5} style={{ margin: 0, color: "#595959" }}>
          <AppstoreOutlined style={{ marginRight: 8, color: "#1677ff" }} />
          Truy cập nhanh
        </Title>
      </Row>

      <Row gutter={[14, 14]} style={{ marginBottom: isAdmin ? 28 : 0 }}>
        {modules.map((mod) => (
          <Col key={mod.key} xs={24} sm={12} md={8}>
            <ModuleCard mod={mod} />
          </Col>
        ))}
      </Row>

      {/* ══════════════ ADMIN SECTION ══════════════ */}
      {isAdmin && (
        <>
          <Divider style={{ margin: "24px 0 20px" }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <SafetyCertificateOutlined style={{ marginRight: 6 }} />
              Quản trị hệ thống
            </Text>
          </Divider>

          <Row gutter={[14, 14]}>
            {adminModules.map((mod) => (
              <Col key={mod.key} xs={24} sm={12} md={8}>
                <ModuleCard mod={mod} />
              </Col>
            ))}
          </Row>
        </>
      )}
    </div>
  );
}
