"use client";

import React, { useEffect, useState } from "react";
import {
  Table,
  Card,
  Button,
  Input,
  Select,
  Tag,
  Space,
  Modal,
  Form,
  message,
  InputNumber,
  Switch,
  Popconfirm,
  Row,
  Col,
  Divider,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  AppstoreAddOutlined,
  MinusCircleOutlined,
} from "@ant-design/icons";
import { useSession } from "next-auth/react";
import { getRoleDefaultPerm, type UserRole } from "@/lib/permissions";

// Định nghĩa kiểu
interface MachineData {
  id: number;
  name: string;
  processId: number;
  process?: { name: string; factory?: { name: string } };
  currentItem?: { name: string; code: string };
  currentLot?: { id: number; lotNumber: string } | null;
  currentLotId?: number | null;
  formulaType: number;
  spindleCount?: number;
  currentNE?: number;
  model?: string;
  isActive: boolean;
  allowMultiItemPerShift?: boolean;
  itemAssignments?: AssignmentData[];
}

interface AssignmentData {
  id?: number;
  itemId: number;
  lotId?: number | null;
  sortOrder?: number;
  item?: { id: number; name: string };
  lot?: { id: number; lotNumber: string } | null;
}

export default function MachinesPage() {
  const { data: session } = useSession();
  const [machines, setMachines] = useState<MachineData[]>([]);
  const [loading, setLoading] = useState(false);

  // Data danh mục
  const [factories, setFactories] = useState<any[]>([]);
  const [processes, setProcesses] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);

  // Filter state
  const [filterFactory, setFilterFactory] = useState<number | null>(null);
  const [filterProcess, setFilterProcess] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");

  // Modal Create/Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<MachineData | null>(
    null,
  );
  const [form] = Form.useForm();

  // Modal Dispatch (Điều phối)
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [dispatchForm] = Form.useForm();

  // Modal Multi-item assignment
  const [isMultiItemModalOpen, setIsMultiItemModalOpen] = useState(false);
  const [multiItemMachine, setMultiItemMachine] = useState<MachineData | null>(
    null,
  );
  const [multiItemLoading, setMultiItemLoading] = useState(false);
  const [multiItemSaving, setMultiItemSaving] = useState(false);
  const [multiItemForm] = Form.useForm();

  // Danh sách lô sợi đang mở (dùng cho form chọn lô — modal edit máy)
  const [yarnLots, setYarnLots] = useState<any[]>([]);

  // Danh sách lô cho modal phân công multi-item
  const [assignmentLots, setAssignmentLots] = useState<any[]>([]);

  const userRole = (session?.user as any)?.userRole as string | undefined;
  const userProcessIds: number[] = (session?.user as any)?.processIds || [];
  const pagePermissions: {
    pageKey: string;
    canView: boolean;
    canEdit: boolean;
  }[] = (session?.user as any)?.pagePermissions || [];

  const isAdmin = userRole === "ADMIN";

  const PAGE_KEY = "sx.machines";
  const PAGE_GROUP = "SẢN XUẤT";
  const pagePerm = pagePermissions.find((p) => p.pageKey === PAGE_KEY);
  const roleDefault = getRoleDefaultPerm(
    (userRole || "VIEWER") as UserRole,
    PAGE_GROUP,
  );
  const canViewPage =
    isAdmin || (pagePerm ? pagePerm.canView : roleDefault.canView);
  const canEditPage =
    isAdmin || (pagePerm ? pagePerm.canEdit : roleDefault.canEdit);

  const canEdit = (m: MachineData) =>
    isAdmin ||
    (canEditPage &&
      (userRole === "FACTORY_MANAGER" || userProcessIds.includes(m.processId)));

  // 1. Load Data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [fRes, pRes, iRes] = await Promise.all([
        fetch("/api/factories"),
        fetch("/api/processes"),
        fetch("/api/items"),
      ]);
      setFactories(await fRes.json());
      setProcesses(await pRes.json());
      setItems(await iRes.json());

      const isManager = userRole === "FACTORY_MANAGER";
      let query = "?";
      if (isAdmin || isManager) {
        if (filterFactory) query += `factoryId=${filterFactory}&`;
        if (filterProcess) query += `processId=${filterProcess}`;
      }

      const mRes = await fetch(`/api/machines${query}`);
      let mData: MachineData[] = await mRes.json();

      if (!isAdmin && !isManager && userProcessIds.length > 0) {
        mData = mData.filter((m) => userProcessIds.includes(m.processId));
      }

      if (searchText) {
        mData = mData.filter((m) =>
          m.name.toLowerCase().includes(searchText.toLowerCase()),
        );
      }
      setMachines(mData);
    } catch (e) {
      message.error("Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterFactory, filterProcess, session]);

  // 2. Xử lý Thêm / Sửa
  const handleSave = async (values: any) => {
    try {
      const url = editingMachine
        ? `/api/machines/${editingMachine.id}`
        : "/api/machines";
      const method = editingMachine ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Lỗi lưu");
      }

      message.success("Thành công!");
      setIsModalOpen(false);
      fetchData();
    } catch (e: any) {
      message.error(e.message || "Lỗi khi lưu");
    }
  };

  // 3. Xử lý Xóa
  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/machines/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      message.success("Đã xóa");
      fetchData();
    } else message.error(data.error);
  };

  // 4. Xử lý ĐIỀU PHỐI (BATCH ASSIGN)
  const handleDispatch = async (values: any) => {
    try {
      const res = await fetch("/api/machines/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineIds: selectedRowKeys,
          itemId: values.itemId,
        }),
      });
      if (!res.ok) throw new Error("Lỗi điều phối");

      message.success(`Đã gán mặt hàng cho ${selectedRowKeys.length} máy!`);
      setIsDispatchModalOpen(false);
      setSelectedRowKeys([]);
      fetchData();
    } catch (e) {
      message.error("Có lỗi xảy ra");
    }
  };

  // 5. Mở modal điều phối chi tiết multi-item
  const openMultiItemModal = async (machine: MachineData) => {
    setMultiItemMachine(machine);
    setIsMultiItemModalOpen(true);
    setMultiItemLoading(true);
    try {
      const [assignRes, lotsRes] = await Promise.all([
        fetch(`/api/machines/${machine.id}/assignments`),
        fetch("/api/lots?lotType=YARN&status=OPEN"),
      ]);
      const data: AssignmentData[] = await assignRes.json();
      const lotsData = await lotsRes.json();
      setAssignmentLots(Array.isArray(lotsData) ? lotsData : []);
      multiItemForm.setFieldsValue({
        assignments: data.map((a) => ({
          itemId: a.itemId,
          lotId: a.lotId ?? undefined,
        })),
      });
    } catch {
      message.error("Không tải được phân công mặt hàng");
    } finally {
      setMultiItemLoading(false);
    }
  };

  // 6. Lưu assignments
  const handleSaveAssignments = async (values: any) => {
    if (!multiItemMachine) return;

    const assignments = values.assignments ?? [];

    // VALIDATE: trùng (itemId, lotId)
    const seen = new Map<string, number>();
    const itemCount = new Map<number, number>();

    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      if (!a.itemId) continue; // Bỏ qua dòng chưa chọn item

      const key = `${a.itemId}:${a.lotId ?? "null"}`;
      if (seen.has(key)) {
        const itemName = items.find((it) => it.id === a.itemId)?.name ?? a.itemId;
        message.error(
          a.lotId == null
            ? `Dòng ${i + 1}: Mặt hàng "${itemName}" bị trùng. Khi gán cùng mặt hàng cho 2 lô khác nhau, cả 2 dòng đều phải chọn lô cụ thể.`
            : `Dòng ${i + 1}: Cặp mặt hàng "${itemName}" + lô đã có ở dòng ${seen.get(key)! + 1}. Mỗi cặp chỉ được 1 dòng.`,
        );
        return;
      }
      seen.set(key, i);
      itemCount.set(a.itemId, (itemCount.get(a.itemId) ?? 0) + 1);
    }

    // VALIDATE: nếu có >1 dòng cùng item, tất cả dòng đó phải có lotId
    for (const [itemId, count] of itemCount) {
      if (count > 1) {
        const sameItem = assignments.filter((a: any) => a.itemId === itemId);
        const missingLot = sameItem.some((a: any) => a.lotId == null);
        if (missingLot) {
          const itemName = items.find((it) => it.id === itemId)?.name ?? itemId;
          message.error(
            `Mặt hàng "${itemName}" có ${count} dòng — tất cả các dòng cùng mặt hàng phải chọn lô cụ thể để phân biệt.`,
          );
          return;
        }
      }
    }

    setMultiItemSaving(true);
    try {
      const res = await fetch(
        `/api/machines/${multiItemMachine.id}/assignments`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignments }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Lỗi lưu");
      }
      message.success("Đã lưu phân công mặt hàng!");
      setIsMultiItemModalOpen(false);
    } catch (e: any) {
      message.error(e.message || "Lỗi lưu");
    } finally {
      setMultiItemSaving(false);
    }
  };

  // Columns
  const columns = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      align: "center" as const,
      width: 70,
      render: (id: number) => (
        <span
          style={{ color: "#8c8c8c", fontSize: 12, fontFamily: "monospace" }}
        >
          #{id}
        </span>
      ),
    },
    {
      title: "Tên máy",
      dataIndex: "name",
      width: 120,
      render: (text: string, r: any) => (
        <b style={{ color: r.isActive ? "#000" : "#ccc" }}>
          {text} {r.isActive ? "" : "(Dừng)"}
          {r.allowMultiItemPerShift && (
            <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>
              Multi-MH
            </Tag>
          )}
        </b>
      ),
    },
    {
      title: "Công đoạn",
      dataIndex: ["process", "name"],
      width: 150,
      render: (t: string, r: any) => (
        <div>
          <div style={{ fontSize: 11, color: "#888" }}>
            {r.process?.factory?.name}
          </div>
          <div>{t}</div>
        </div>
      ),
    },
    {
      title: "Mặt hàng đang chạy",
      key: "item",
      render: (_: any, r: MachineData) => {
        if (r.allowMultiItemPerShift) {
          if (!r.itemAssignments?.length)
            return <Tag color="red">Chưa phân công</Tag>;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {r.itemAssignments.map((a) => (
                <Tag
                  key={a.itemId}
                  color="purple"
                  style={{ fontSize: 11, margin: 0 }}
                >
                  {a.item?.name}
                </Tag>
              ))}
            </div>
          );
        }
        return r.currentItem ? (
          <Tag color="blue">{r.currentItem.name}</Tag>
        ) : (
          <Tag color="red">Chưa gán</Tag>
        );
      },
    },
    {
      title: "Lô đang SX",
      key: "lot",
      width: 140,
      render: (_: any, r: MachineData) => {
        if (r.allowMultiItemPerShift && r.itemAssignments?.length) {
          const lotsWithData = r.itemAssignments.filter((a) => a.lot);
          if (lotsWithData.length === 0) {
            return (
              <span style={{ color: "#bbb", fontSize: 12 }}>Chưa gán lô</span>
            );
          }
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {lotsWithData.map((a) => (
                <Tag
                  key={a.lot!.id}
                  color="orange"
                  style={{ fontSize: 11, margin: 0 }}
                >
                  {a.lot!.lotNumber}
                </Tag>
              ))}
            </div>
          );
        }
        return r.currentLot ? (
          <Tag color="orange" style={{ fontWeight: 600 }}>
            {r.currentLot.lotNumber}
          </Tag>
        ) : (
          <span style={{ color: "#bbb", fontSize: 12 }}>—</span>
        );
      },
    },
    {
      title: "Loại máy",
      dataIndex: "model",
      key: "model",
      width: 140,
      render: (v: string) =>
        v ? (
          <Tag color="geekblue">{v}</Tag>
        ) : (
          <span style={{ color: "#bbb", fontSize: 12 }}>Chưa cấu hình</span>
        ),
    },
    {
      title: "Cấu hình",
      key: "config",
      responsive: ["lg"] as any,
      render: (_: any, r: MachineData) => (
        <div style={{ fontSize: 12, color: "#666" }}>
          <div>Công thức: Loại {r.formulaType}</div>
          {r.spindleCount && <div>Số cọc: {r.spindleCount}</div>}
          {r.currentNE != null && (
            <div>
              Chi số (NE): <b style={{ color: "#1677ff" }}>{r.currentNE}</b>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Hành động",
      key: "action",
      width: 120,
      align: "right" as const,
      render: (_: any, r: MachineData) =>
        canEdit(r) ? (
          <Space>
            {r.allowMultiItemPerShift && (
              <Button
                size="small"
                type="dashed"
                icon={<AppstoreAddOutlined />}
                onClick={() => openMultiItemModal(r)}
                title="Điều phối chi tiết nhiều mặt hàng"
              />
            )}
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditingMachine(r);
                form.setFieldsValue({
                  ...r,
                  currentLotId: r.currentLotId ?? undefined,
                });
                setIsModalOpen(true);
                // Tải danh sách lô sợi đang mở
                fetch("/api/lots?lotType=YARN&status=OPEN")
                  .then((res) => res.json())
                  .then((data) => setYarnLots(Array.isArray(data) ? data : []))
                  .catch(() => {});
              }}
            />
            {isAdmin && (
              <Popconfirm
                title="Xóa máy này?"
                onConfirm={() => handleDelete(r.id)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </Space>
        ) : null,
    },
  ];

  if (!canViewPage)
    return <div className="p-10">Bạn không có quyền truy cập trang này.</div>;

  return (
    <div style={{ padding: 20 }}>
      <Card
        title={
          <span>
            <RobotOutlined /> Quản lý & Điều phối Máy
          </span>
        }
        extra={
          isAdmin ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingMachine(null);
                form.resetFields();
                setIsModalOpen(true);
              }}
            >
              Thêm máy mới
            </Button>
          ) : null
        }
      >
        {/* TOOLBAR */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          {(isAdmin || userRole === "FACTORY_MANAGER") && (
            <>
              <Col span={6}>
                <Select
                  style={{ width: "100%" }}
                  placeholder="Lọc theo Nhà máy"
                  allowClear
                  options={factories.map((f) => ({
                    label: f.name,
                    value: f.id,
                  }))}
                  onChange={setFilterFactory}
                />
              </Col>
              <Col span={6}>
                <Select
                  style={{ width: "100%" }}
                  placeholder="Lọc theo Công đoạn"
                  allowClear
                  options={processes
                    .filter(
                      (p) => !filterFactory || p.factoryId === filterFactory,
                    )
                    .map((p) => ({ label: p.name, value: p.id }))}
                  onChange={setFilterProcess}
                />
              </Col>
            </>
          )}
          <Col span={isAdmin || userRole === "FACTORY_MANAGER" ? 6 : 18}>
            <Input
              placeholder="Tìm tên máy..."
              prefix={<SearchOutlined />}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </Col>
          <Col span={6} style={{ textAlign: "right" }}>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>
              Tải lại
            </Button>
          </Col>
        </Row>

        {/* THANH ĐIỀU PHỐI (Hiện ra khi chọn dòng) */}
        {selectedRowKeys.length > 0 && (
          <div
            style={{
              marginBottom: 16,
              background: "#e6f7ff",
              padding: "10px 20px",
              borderRadius: 6,
              border: "1px solid #91d5ff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ color: "#1890ff" }}>
              <b>Đã chọn {selectedRowKeys.length} máy</b>. Bạn muốn làm gì?
            </span>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={() => setIsDispatchModalOpen(true)}
            >
              Điều phối (Gán mặt hàng loạt)
            </Button>
          </div>
        )}

        <Table
          rowKey="id"
          columns={columns}
          dataSource={machines}
          loading={loading}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
            getCheckboxProps: (record: MachineData) => ({
              disabled: !canEdit(record) || !!record.allowMultiItemPerShift,
              title: record.allowMultiItemPerShift
                ? "Máy nhiều mặt hàng — dùng nút ⊞ để phân công riêng"
                : undefined,
            }),
          }}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      {/* MODAL 1: CREATE / EDIT MACHINE */}
      <Modal
        title={editingMachine ? "Cập nhật máy" : "Thêm máy mới"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Tên máy" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Máy 01" />
          </Form.Item>

          <Form.Item
            name="processId"
            label="Thuộc Công đoạn"
            rules={[{ required: true }]}
          >
            <Select
              disabled={!isAdmin && !!editingMachine}
              options={(isAdmin
                ? processes
                : processes.filter((p) => userProcessIds.includes(p.id))
              ).map((p) => ({
                label: `${p.name} (${p.factory?.name})`,
                value: p.id,
              }))}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="formulaType"
                label="Công thức tính"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { label: "Loại 1: Sản lượng trực tiếp", value: 1 },
                    { label: "Loại 2: Trừ lùi (Cuối - Đầu)", value: 2 },
                    { label: "Loại 3: Sản lượng tính theo mét", value: 3 },
                    { label: "Loại 4: (Cuối - Đầu) / Chi số", value: 4 },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="spindleCount" label="Số cọc (Nếu có)">
                <InputNumber style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="currentNE"
                label="Chi số hiện tại (NE)"
                tooltip="Dùng cho công thức Loại 3 và 4. Giá trị này sẽ được dùng mặc định khi nhập liệu sản lượng."
              >
                <InputNumber
                  style={{ width: "100%" }}
                  min={0}
                  placeholder="Ví dụ: 30"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="model"
                label="Loại máy"
                tooltip="Dùng để tra định mức năng suất tự động. VD: G32, Murata Qpro-EX, Rieter RSB-D50"
              >
                <Input placeholder="VD: G32" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="isActive"
                valuePropName="checked"
                label="Trạng thái"
              >
                <Switch
                  checkedChildren="Hoạt động"
                  unCheckedChildren="Tạm dừng"
                  defaultChecked
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="allowMultiItemPerShift"
                valuePropName="checked"
                label="Chạy nhiều MH/ca"
                tooltip="Cho phép máy này chạy nhiều mặt hàng trong cùng 1 ca (VD: máy ống chia cọc)"
              >
                <Switch checkedChildren="Có" unCheckedChildren="Không" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="currentLotId"
            label="Lô đang SX"
            tooltip="Lô sợi máy này đang chạy. Sản lượng nhập tự động gán vào lô này."
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Chọn lô sợi (không bắt buộc)..."
              options={yarnLots.map((l: any) => ({
                value: l.id,
                label: `${l.lotNumber}${l.item ? " — " + l.item.name : ""}`,
              }))}
            />
          </Form.Item>

          <Button type="primary" htmlType="submit" block>
            Lưu thông tin
          </Button>
        </Form>
      </Modal>

      {/* MODAL 2: DISPATCH (ĐIỀU PHỐI) */}
      <Modal
        title={
          <span>
            <ThunderboltOutlined /> Điều phối sản xuất
          </span>
        }
        open={isDispatchModalOpen}
        onCancel={() => setIsDispatchModalOpen(false)}
        footer={null}
      >
        <div style={{ marginBottom: 16 }}>
          Bạn đang thực hiện đổi mặt hàng cho{" "}
          <b>{selectedRowKeys.length} máy</b> đã chọn.
          <br />
          Chi số (NE) của từng máy sẽ <b>giữ nguyên</b>. Hãy cập nhật thủ công
          trong mục Sửa máy nếu cần.
        </div>
        <Form form={dispatchForm} layout="vertical" onFinish={handleDispatch}>
          <Form.Item
            name="itemId"
            label="Chọn mặt hàng muốn chạy:"
            rules={[{ required: true, message: "Vui lòng chọn hàng" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Tìm tên mặt hàng..."
              options={items.map((i) => ({
                label: `${i.name} (NE: ${i.ne})`,
                value: i.id,
              }))}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large">
            Xác nhận chuyển đổi
          </Button>
        </Form>
      </Modal>

      {/* MODAL 3: MULTI-ITEM ASSIGNMENT (ĐIỀU PHỐI CHI TIẾT) */}
      <Modal
        title={
          <span>
            <AppstoreAddOutlined /> Phân công mặt hàng —{" "}
            {multiItemMachine?.name}
          </span>
        }
        open={isMultiItemModalOpen}
        onCancel={() => setIsMultiItemModalOpen(false)}
        footer={null}
        width={780}
      >
        <div style={{ marginBottom: 12, color: "#666", fontSize: 13 }}>
          Cấu hình danh sách mặt hàng chạy trên máy{" "}
          <b>{multiItemMachine?.name}</b>.
        </div>
        <Divider style={{ margin: "8px 0 16px" }} />
        <Form
          form={multiItemForm}
          layout="vertical"
          onFinish={handleSaveAssignments}
        >
          <Form.List name="assignments">
            {(fields, { add, remove }) => (
              <>
                {/* Header */}
                <Row
                  gutter={8}
                  style={{
                    marginBottom: 6,
                    fontWeight: 600,
                    fontSize: 12,
                    color: "#888",
                  }}
                >
                  <Col flex="1">Mặt hàng</Col>
                  <Col style={{ width: 200 }}>Lô sợi</Col>
                  <Col style={{ width: 36 }}></Col>
                </Row>

                {fields.map(({ key, name, ...restField }) => (
                  <Row
                    key={key}
                    gutter={8}
                    style={{ marginBottom: 8 }}
                    align="middle"
                  >
                    {/* Select mặt hàng */}
                    <Col flex="1">
                      <Form.Item
                        {...restField}
                        name={[name, "itemId"]}
                        rules={[{ required: true, message: "Chọn mặt hàng" }]}
                        style={{ margin: 0 }}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="Chọn mặt hàng..."
                          options={items.map((i) => ({
                            label: i.name,
                            value: i.id,
                          }))}
                          onChange={() => {
                            // Đổi mặt hàng → reset lotId để tránh gán lô sai item
                            const vals =
                              multiItemForm.getFieldValue("assignments");
                            if (vals?.[name]) {
                              vals[name].lotId = undefined;
                              multiItemForm.setFieldsValue({
                                assignments: vals,
                              });
                            }
                          }}
                        />
                      </Form.Item>
                    </Col>
                    {/* Select lô — hiển thị tất cả lô YARN đang OPEN */}
                    <Col style={{ width: 200 }}>
                      <Form.Item noStyle shouldUpdate>
                        {() => {
                          const lotOptions = assignmentLots.map((l: any) => ({
                            value: l.id,
                            label: `${l.lotNumber}${l.item ? " — " + l.item.name : ""}`,
                          }));
                          return (
                            <Form.Item
                              {...restField}
                              name={[name, "lotId"]}
                              style={{ margin: 0 }}
                            >
                              <Select
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                placeholder="Chọn lô..."
                                options={lotOptions}
                              />
                            </Form.Item>
                          );
                        }}
                      </Form.Item>
                    </Col>
                    {/* Nút xóa */}
                    <Col style={{ width: 36, textAlign: "center" }}>
                      <MinusCircleOutlined
                        onClick={() => remove(name)}
                        style={{
                          color: "#ff4d4f",
                          fontSize: 18,
                          cursor: "pointer",
                        }}
                      />
                    </Col>
                  </Row>
                ))}

                <Button
                  type="dashed"
                  onClick={() => add()}
                  block
                  icon={<PlusOutlined />}
                  style={{ marginBottom: 16 }}
                >
                  Thêm mặt hàng
                </Button>
              </>
            )}
          </Form.List>

          <Button
            type="primary"
            htmlType="submit"
            block
            loading={multiItemSaving}
          >
            Lưu cấu hình
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
