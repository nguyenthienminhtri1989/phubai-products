"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Card,
  Select,
  Table,
  Checkbox,
  Button,
  Space,
  Tag,
  message,
  Spin,
  Tooltip,
  Divider,
  Typography,
  Badge,
} from "antd";
import {
  SaveOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  UserOutlined,
  LockOutlined,
  UnlockOutlined,
  CheckCircleFilled,
  EyeOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { useSession } from "next-auth/react";
import {
  USER_ROLE_LABELS,
  getRoleDefaultPerm,
  type UserRole,
} from "@/lib/permissions";

const { Title, Text } = Typography;

// --- Interface ---
interface PageItem {
  id: number;
  pageKey: string;
  pageName: string;
  pageGroup: string;
  path: string;
  sortOrder: number;
}

interface UserItem {
  id: number;
  username: string;
  fullName: string;
  userRole: string;
  factoryId: number | null;
  factory: { id: number; name: string } | null;
  isActive: boolean;
  userProcesses: { processId: number; process: { name: string } }[];
}

interface PermState {
  [pageId: number]: { canView: boolean; canEdit: boolean };
}

// Color for each page group
const GROUP_COLORS: Record<string, string> = {
  "SẢN XUẤT": "#1677ff",
  "ĐỊNH MỨC": "#722ed1",
  "ĐIỆN NĂNG": "#faad14",
  "KINH DOANH": "#52c41a",
  "BÁO CÁO": "#13c2c2",
  "DANH MỤC": "#8c8c8c",
  "HỆ THỐNG": "#f5222d",
  "TỔNG QUAN": "#2f54eb",
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "red",
  DIRECTOR: "purple",
  FACTORY_MANAGER: "blue",
  SALES: "green",
  PROCESS_LEAD: "cyan",
  STATISTICIAN: "orange",
  TEAM_LEAD: "gold",
  VIEWER: "default",
};

export default function PermissionsPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [permState, setPermState] = useState<PermState>({});
  const [savedPermState, setSavedPermState] = useState<PermState>({}); // To track changes
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingPerms, setLoadingPerms] = useState(false);

  // Fetch users and pages
  const fetchData = async () => {
    setLoading(true);
    try {
      const [resUsers, resPages] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/page-registry"),
      ]);
      if (resUsers.ok && resPages.ok) {
        setUsers(await resUsers.json());
        setPages(await resPages.json());
      } else {
        message.error("Không tải được dữ liệu");
      }
    } catch {
      message.error("Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  };

  // Fetch permissions for selected user
  const fetchUserPerms = async (userId: number) => {
    setLoadingPerms(true);
    try {
      const res = await fetch(`/api/page-permissions?userId=${userId}`);
      if (res.ok) {
        const perms = await res.json(); // Array of { pageId, canView, canEdit, ... }
        const user = users.find((u) => u.id === userId);
        const role = (user?.userRole || "VIEWER") as UserRole;

        // Tạo map pageId -> perm từ DB để tra nhanh
        const permMap = new Map<number, { canView: boolean; canEdit: boolean }>();
        for (const p of perms) {
          permMap.set(p.pageId, { canView: p.canView, canEdit: p.canEdit });
        }

        const state: PermState = {};
        for (const page of pages) {
          if (permMap.has(page.id)) {
            // Có record trong DB (kể cả explicit false) → dùng giá trị DB
            state[page.id] = permMap.get(page.id)!;
          } else {
            // Chưa có record nào → fallback về role default
            const def = getRoleDefaultPerm(role, page.pageGroup);
            state[page.id] = { canView: def.canView, canEdit: def.canEdit };
          }
        }

        setPermState(state);
        setSavedPermState(JSON.parse(JSON.stringify(state)));
      }
    } catch {
      message.error("Lỗi tải quyền");
    } finally {
      setLoadingPerms(false);
    }
  };

  useEffect(() => {
    if ((session?.user as any)?.userRole === "ADMIN") fetchData();
  }, [session]);

  useEffect(() => {
    if (selectedUserId && pages.length > 0) {
      fetchUserPerms(selectedUserId);
    }
  }, [selectedUserId, pages]);

  // Selected user info
  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId),
    [users, selectedUserId]
  );

  // Group pages by pageGroup
  const groupedPages = useMemo(() => {
    const groups: Record<string, PageItem[]> = {};
    for (const p of pages) {
      if (!groups[p.pageGroup]) groups[p.pageGroup] = [];
      groups[p.pageGroup].push(p);
    }
    return groups;
  }, [pages]);

  // Has unsaved changes?
  const hasChanges = useMemo(() => {
    return JSON.stringify(permState) !== JSON.stringify(savedPermState);
  }, [permState, savedPermState]);

  // Toggle VIEW/EDIT
  const togglePerm = (pageId: number, field: "canView" | "canEdit") => {
    setPermState((prev) => {
      const curr = prev[pageId] || { canView: false, canEdit: false };
      const next = { ...curr };
      next[field] = !next[field];
      // If turning off VIEW, also turn off EDIT
      if (field === "canView" && !next.canView) {
        next.canEdit = false;
      }
      // If turning on EDIT, also turn on VIEW
      if (field === "canEdit" && next.canEdit) {
        next.canView = true;
      }
      return { ...prev, [pageId]: next };
    });
  };

  // Apply role defaults
  const applyRoleDefaults = () => {
    if (!selectedUser) return;
    const role = selectedUser.userRole as UserRole;
    const newState: PermState = {};
    for (const page of pages) {
      const def = getRoleDefaultPerm(role, page.pageGroup);
      newState[page.id] = { canView: def.canView, canEdit: def.canEdit };
    }
    setPermState(newState);
    message.info(`Đã đặt lại quyền mặc định cho role "${USER_ROLE_LABELS[role]}"`);
  };

  // Select all VIEW / EDIT for a group
  const selectAllInGroup = (group: string, field: "canView" | "canEdit", value: boolean) => {
    setPermState((prev) => {
      const next = { ...prev };
      for (const page of groupedPages[group] || []) {
        const curr = next[page.id] || { canView: false, canEdit: false };
        if (field === "canView") {
          next[page.id] = { ...curr, canView: value, canEdit: value ? curr.canEdit : false };
        } else {
          next[page.id] = { ...curr, canEdit: value, canView: value ? true : curr.canView };
        }
      }
      return next;
    });
  };

  // Save
  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const permissions = Object.entries(permState).map(([pageId, perm]) => ({
        pageId: parseInt(pageId),
        canView: perm.canView,
        canEdit: perm.canEdit,
      }));

      const res = await fetch("/api/page-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, permissions }),
      });

      if (res.ok) {
        message.success("Đã lưu phân quyền!");
        setSavedPermState(JSON.parse(JSON.stringify(permState)));
      } else {
        const data = await res.json();
        message.error(data.error || "Lỗi lưu");
      }
    } catch {
      message.error("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  };

  if ((session?.user as any)?.userRole !== "ADMIN") {
    return <div style={{ padding: 40, textAlign: "center" }}>Không có quyền truy cập</div>;
  }

  // Check if a perm differs from the role default
  const isOverridden = (pageId: number) => {
    if (!selectedUser) return false;
    const page = pages.find((p) => p.id === pageId);
    if (!page) return false;
    const def = getRoleDefaultPerm(selectedUser.userRole as UserRole, page.pageGroup);
    const curr = permState[pageId];
    if (!curr) return false;
    return curr.canView !== def.canView || curr.canEdit !== def.canEdit;
  };

  return (
    <div style={{ padding: 20 }}>
      <Card
        title={
          <Space>
            <LockOutlined />
            <span>Quản lý Phân quyền theo Trang</span>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>
              Làm mới
            </Button>
          </Space>
        }
      >
        {/* User selector */}
        <div style={{ marginBottom: 24, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 400px" }}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              <UserOutlined /> Chọn người dùng:
            </Text>
            <Select
              showSearch
              style={{ width: "100%" }}
              placeholder="Tìm và chọn người dùng..."
              optionFilterProp="label"
              value={selectedUserId}
              onChange={(val) => setSelectedUserId(val)}
              loading={loading}
              options={users.map((u) => ({
                value: u.id,
                label: `${u.fullName} (@${u.username})`,
              }))}
            />
          </div>

          {selectedUser && (
            <div style={{ flex: "0 0 auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingTop: 28 }}>
              <Tag color={ROLE_COLORS[selectedUser.userRole] || "default"} style={{ fontSize: 13, padding: "2px 10px" }}>
                {USER_ROLE_LABELS[selectedUser.userRole as UserRole] || selectedUser.userRole}
              </Tag>
              {selectedUser.factory && (
                <Tag color="blue">{selectedUser.factory.name}</Tag>
              )}
              {selectedUser.userProcesses?.map((up) => (
                <Tag key={up.processId} color="geekblue">
                  {up.process.name}
                </Tag>
              ))}
              {!selectedUser.isActive && (
                <Tag color="error">Đã khóa</Tag>
              )}
            </div>
          )}
        </div>

        {/* Permission matrix */}
        {selectedUserId && (
          <Spin spinning={loadingPerms}>
            {/* Action buttons */}
            <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <Button
                icon={<ThunderboltOutlined />}
                onClick={applyRoleDefaults}
              >
                Áp dụng mặc định theo Role
              </Button>
              <Space>
                {hasChanges && (
                  <Badge dot color="orange">
                    <Text type="warning" style={{ fontSize: 13 }}>
                      Có thay đổi chưa lưu
                    </Text>
                  </Badge>
                )}
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  disabled={!hasChanges}
                  onClick={handleSave}
                >
                  Lưu phân quyền
                </Button>
              </Space>
            </div>

            {/* Groups */}
            {Object.entries(groupedPages).map(([group, groupPages]) => (
              <div key={group} style={{ marginBottom: 24 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 8,
                    padding: "6px 12px",
                    background: `${GROUP_COLORS[group] || "#1677ff"}10`,
                    borderLeft: `4px solid ${GROUP_COLORS[group] || "#1677ff"}`,
                    borderRadius: 4,
                  }}
                >
                  <Text strong style={{ flex: 1, color: GROUP_COLORS[group] || "#1677ff" }}>
                    {group}
                  </Text>
                  <Space size={16}>
                    <Tooltip title={`Chọn tất cả XEM cho ${group}`}>
                      <Checkbox
                        checked={groupPages.every(
                          (p) => permState[p.id]?.canView
                        )}
                        indeterminate={
                          groupPages.some((p) => permState[p.id]?.canView) &&
                          !groupPages.every((p) => permState[p.id]?.canView)
                        }
                        onChange={(e) =>
                          selectAllInGroup(group, "canView", e.target.checked)
                        }
                      >
                        <EyeOutlined /> Tất cả Xem
                      </Checkbox>
                    </Tooltip>
                    <Tooltip title={`Chọn tất cả SỬA cho ${group}`}>
                      <Checkbox
                        checked={groupPages.every(
                          (p) => permState[p.id]?.canEdit
                        )}
                        indeterminate={
                          groupPages.some((p) => permState[p.id]?.canEdit) &&
                          !groupPages.every((p) => permState[p.id]?.canEdit)
                        }
                        onChange={(e) =>
                          selectAllInGroup(group, "canEdit", e.target.checked)
                        }
                      >
                        <EditOutlined /> Tất cả Sửa
                      </Checkbox>
                    </Tooltip>
                  </Space>
                </div>

                <Table
                  dataSource={groupPages}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  bordered
                  rowClassName={(record) =>
                    isOverridden(record.id)
                      ? "ant-table-row-override"
                      : ""
                  }
                  columns={[
                    {
                      title: "Trang",
                      dataIndex: "pageName",
                      key: "pageName",
                      render: (name: string, record: PageItem) => (
                        <Space>
                          <span>{name}</span>
                          {isOverridden(record.id) && (
                            <Tooltip title="Quyền đã được tùy chỉnh (khác mặc định role)">
                              <Tag color="warning" style={{ fontSize: 10, lineHeight: "16px", padding: "0 4px" }}>
                                Override
                              </Tag>
                            </Tooltip>
                          )}
                        </Space>
                      ),
                    },
                    {
                      title: "Đường dẫn",
                      dataIndex: "path",
                      key: "path",
                      render: (path: string) => (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {path}
                        </Text>
                      ),
                    },
                    {
                      title: (
                        <Space>
                          <EyeOutlined />
                          <span>Xem</span>
                        </Space>
                      ),
                      key: "canView",
                      align: "center" as const,
                      width: 100,
                      render: (_: unknown, record: PageItem) => (
                        <Checkbox
                          checked={permState[record.id]?.canView || false}
                          onChange={() => togglePerm(record.id, "canView")}
                        />
                      ),
                    },
                    {
                      title: (
                        <Space>
                          <EditOutlined />
                          <span>Sửa</span>
                        </Space>
                      ),
                      key: "canEdit",
                      align: "center" as const,
                      width: 100,
                      render: (_: unknown, record: PageItem) => (
                        <Checkbox
                          checked={permState[record.id]?.canEdit || false}
                          onChange={() => togglePerm(record.id, "canEdit")}
                        />
                      ),
                    },
                  ]}
                />
              </div>
            ))}
          </Spin>
        )}

        {!selectedUserId && (
          <div
            style={{
              textAlign: "center",
              padding: 60,
              color: "#aaa",
            }}
          >
            <LockOutlined style={{ fontSize: 48, marginBottom: 16 }} />
            <br />
            <Text type="secondary">Chọn người dùng ở trên để quản lý phân quyền</Text>
          </div>
        )}
      </Card>

      <style jsx global>{`
        .ant-table-row-override {
          background: #fffbe6 !important;
        }
        .ant-table-row-override:hover > td {
          background: #fff7cc !important;
        }
      `}</style>
    </div>
  );
}
