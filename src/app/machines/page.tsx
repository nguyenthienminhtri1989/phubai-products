"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, message, Space, Card, Select, Tag, InputNumber, Switch, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, FilterOutlined, SettingOutlined } from '@ant-design/icons';

// --- ĐỊNH NGHĨA KIỂU DỮ LIỆU ---
interface Factory { id: number; name: string; }
interface Process { id: number; name: string; factoryId: number; factory?: Factory; }
interface Item { id: number; name: string; } // Mặt hàng
interface Machine {
  id: number;
  name: string;
  isActive: boolean;
  processId: number;
  process?: Process;
  formulaType: number; // 1, 2, 3, 4
  spindleCount?: number;
  currentItemId?: number;
  currentItem?: Item;
  currentNE?: number;
}

// --- HẰNG SỐ ---
const FORMULA_TYPES = [
  { value: 1, label: 'Loại 1: Nhập trực tiếp (Kg)' },
  { value: 2, label: 'Loại 2: Counter (Cuối - Đầu)' },
  { value: 3, label: 'Loại 3: Counter x Số cọc / (NE x Hệ số)' },
  { value: 4, label: 'Loại 4: Counter / NE' },
];

export default function MachinePage() {
  // --- STATE DỮ LIỆU ---
  const [machines, setMachines] = useState<Machine[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [loading, setLoading] = useState(false);

  // --- STATE BỘ LỌC (TOOLBAR) ---
  const [filterFactoryId, setFilterFactoryId] = useState<number | null>(null);
  const [filterProcessId, setFilterProcessId] = useState<number | null>(null);

  // --- STATE FORM & MODAL ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [form] = Form.useForm();

  // Theo dõi giá trị form để hiển thị điều kiện (Ví dụ: Chọn Loại 3 mới hiện ô nhập Số cọc)
  const watchFormulaType = Form.useWatch('formulaType', form);
  const watchModalFactoryId = Form.useWatch('factoryId_temp', form); // Biến tạm để lọc dropdown trong modal

  // --- 1. FETCH ALL DATA ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const [resMac, resFac, resPro, resItem] = await Promise.all([
        fetch('/api/machines'),
        fetch('/api/factories'),
        fetch('/api/processes'),
        fetch('/api/items'),
      ]);

      setMachines(await resMac.json());
      setFactories(await resFac.json());
      setProcesses(await resPro.json());
      setItems(await resItem.json());
    } catch (error) {
      message.error("Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // --- 2. LOGIC LỌC DỮ LIỆU BẢNG ---
  const filteredMachines = useMemo(() => {
    return machines.filter(m => {
      // Lọc theo Nhà máy (thông qua Process)
      if (filterFactoryId && m.process?.factoryId !== filterFactoryId) return false;
      // Lọc theo Công đoạn
      if (filterProcessId && m.processId !== filterProcessId) return false;
      return true;
    });
  }, [machines, filterFactoryId, filterProcessId]);

  // Danh sách công đoạn hiển thị trên Toolbar (phụ thuộc vào Nhà máy đang chọn)
  const toolbarProcesses = useMemo(() => {
    if (!filterFactoryId) return [];
    return processes.filter(p => p.factoryId === filterFactoryId);
  }, [processes, filterFactoryId]);

  // --- 3. XỬ LÝ LƯU (CREATE/UPDATE) ---
  const handleSave = async (values: any) => {
    try {
      const payload = { ...values };
      // Xóa trường tạm (factoryId_temp) trước khi gửi lên server
      delete payload.factoryId_temp;

      let res;
      if (editingMachine) {
        res = await fetch(`/api/machines/${editingMachine.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/machines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) throw new Error("Lỗi lưu dữ liệu");

      message.success("Thành công");
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      message.error("Có lỗi xảy ra");
    }
  };

  // --- 4. XỬ LÝ XÓA ---
  const handleDelete = (id: number) => {
    Modal.confirm({
      title: 'Xóa máy này?',
      content: 'Dữ liệu sản xuất cũ vẫn giữ nguyên, nhưng máy sẽ biến mất khỏi danh sách.',
      onOk: async () => {
        const res = await fetch(`/api/machines/${id}`, { method: 'DELETE' });
        if (res.ok) {
          message.success('Đã xóa');
          fetchData();
        } else {
          message.error('Không thể xóa (Có thể do ràng buộc)');
        }
      }
    });
  };

  // --- 5. CHUẨN BỊ MODAL ---
  const openModal = (record: Machine | null) => {
    setEditingMachine(record);
    if (record) {
      // EDIT: Điền dữ liệu cũ
      form.setFieldsValue({
        ...record,
        // Cần điền thêm factoryId_temp để dropdown công đoạn hiển thị đúng
        factoryId_temp: record.process?.factoryId
      });
    } else {
      // ADD NEW: Reset
      form.resetFields();
      form.setFieldsValue({
        isActive: true,
        formulaType: 1,
        // Nếu trên Toolbar đang lọc Nhà máy/Công đoạn nào thì điền sẵn luôn (UX)
        factoryId_temp: filterFactoryId,
        processId: filterProcessId
      });
    }
    setIsModalOpen(true);
  };

  // Danh sách công đoạn TRONG MODAL (phụ thuộc vào Nhà máy được chọn trong Modal)
  const modalProcesses = useMemo(() => {
    if (!watchModalFactoryId) return [];
    return processes.filter(p => p.factoryId === watchModalFactoryId);
  }, [processes, watchModalFactoryId]);


  // --- 6. CẤU HÌNH CỘT ---
  const columns = [
    { title: 'Tên Máy', dataIndex: 'name', width: 150, fixed: 'left' as const, render: (t: string) => <b>{t}</b> },
    {
      title: 'Vị trí',
      render: (_: any, r: Machine) => (
        <Space direction="vertical" size={0}>
          <Tag color="blue">{r.process?.name}</Tag>
          <small style={{ color: '#888' }}>{r.process?.factory?.name}</small>
        </Space>
      )
    },
    {
      title: 'Công thức',
      dataIndex: 'formulaType',
      render: (type: number) => {
        const f = FORMULA_TYPES.find(x => x.value === type);
        return <Tag color={type === 1 ? 'green' : 'orange'}>{f?.label.split(':')[0]}</Tag>
      }
    },
    {
      title: 'Trạng thái hiện tại',
      render: (_: any, r: Machine) => (
        <div style={{ fontSize: 12 }}>
          <div>Mặt Hàng: <b>{r.currentItem?.name || '-'}</b></div>
          {(r.formulaType === 3 || r.formulaType === 4) &&
            <div>Chi số: <b>{r.currentNE || '-'}</b></div>
          }
        </div>
      )
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      render: (active: boolean) => active ? <Tag color="success">Đang chạy</Tag> : <Tag color="error">Ngưng</Tag>
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 100,
      fixed: 'right' as const,
      render: (_: any, record: Machine) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => openModal(record)} />
          <Button icon={<DeleteOutlined />} danger size="small" onClick={() => handleDelete(record.id)} />
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: 20 }}>
      <Card title="Quản lý Danh mục Máy Móc"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>Thêm Máy</Button>}
      >
        {/* TOOLBAR LỌC */}
        <Space style={{ marginBottom: 16 }} wrap>
          <FilterOutlined />
          <Select
            style={{ width: 200 }}
            placeholder="Chọn Nhà máy..."
            allowClear
            value={filterFactoryId}
            onChange={(val) => {
              setFilterFactoryId(val);
              setFilterProcessId(null); // Reset công đoạn khi đổi nhà máy
            }}
            options={factories.map(f => ({ label: f.name, value: f.id }))}
          />
          <Select
            style={{ width: 200 }}
            placeholder="Chọn Công đoạn..."
            allowClear
            value={filterProcessId}
            onChange={setFilterProcessId}
            options={toolbarProcesses.map(p => ({ label: p.name, value: p.id }))}
            disabled={!filterFactoryId} // Chỉ cho chọn khi đã chọn nhà máy
          />
        </Space>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredMachines}
          loading={loading}
          bordered
          scroll={{ x: 1000 }} // Cho phép cuộn ngang nếu bảng quá rộng
        />
      </Card>

      {/* MODAL FORM */}
      <Modal
        title={editingMachine ? `Sửa ${editingMachine.name}` : "Thêm Máy Mới"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <div style={{ display: 'flex', gap: 16 }}>
            {/* Cột 1: Thông tin chung */}
            <div style={{ flex: 1 }}>
              <Divider orientation={"left" as any} style={{ marginTop: 0 }}>Vị trí & Tên</Divider>
              {/* Chọn Nhà máy (Chỉ dùng để lọc dropdown dưới, ko lưu vào bảng Machine) */}
              <Form.Item name="factoryId_temp" label="Nhà máy">
                <Select
                  placeholder="Chọn nhà máy"
                  onChange={() => form.setFieldValue('processId', null)}
                  options={factories.map(f => ({ label: f.name, value: f.id }))}
                />
              </Form.Item>

              <Form.Item name="processId" label="Công đoạn" rules={[{ required: true }]}>
                <Select
                  placeholder="Chọn công đoạn"
                  options={modalProcesses.map(p => ({ label: p.name, value: p.id }))}
                  disabled={!watchModalFactoryId}
                />
              </Form.Item>

              <Form.Item name="name" label="Tên Máy" rules={[{ required: true }]}>
                <Input placeholder="Ví dụ: Máy 01" />
              </Form.Item>

              <Form.Item name="isActive" label="Trạng thái" valuePropName="checked">
                <Switch checkedChildren="Hoạt động" unCheckedChildren="Ngưng" />
              </Form.Item>
            </div>

            {/* Cột 2: Cấu hình kỹ thuật */}
            <div style={{ flex: 1, background: '#f5f5f5', padding: 15, borderRadius: 8 }}>
              <Divider orientation={"left" as any} style={{ marginTop: 0 }}>Cấu hình tính toán</Divider>

              <Form.Item name="formulaType" label="Công thức tính sản lượng" rules={[{ required: true }]}>
                <Select options={FORMULA_TYPES} />
              </Form.Item>

              {/* Chỉ hiện khi chọn Loại 3 */}
              {watchFormulaType === 3 && (
                <Form.Item name="spindleCount" label="Số cọc (Spindles)" rules={[{ required: true }]}>
                  <InputNumber style={{ width: '100%' }} placeholder="Nhập số cọc cố định" />
                </Form.Item>
              )}

              <Divider orientation={"left" as any}>Trạng thái hiện tại</Divider>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
                Dùng để tự điền khi nhập liệu hàng ngày.
              </div>

              <Form.Item name="currentItemId" label="Đang chạy mặt hàng">
                <Select
                  showSearch
                  allowClear
                  placeholder="Chọn mặt hàng..."
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={items.map(i => ({ label: i.name, value: i.id }))}
                />
              </Form.Item>

              {/* Chỉ hiện khi chọn Loại 3 hoặc 4 */}
              {(watchFormulaType === 3 || watchFormulaType === 4) && (
                <Form.Item name="currentNE" label="Chi số hiện tại (NE)">
                  <InputNumber style={{ width: '100%' }} step={0.1} />
                </Form.Item>
              )}
            </div>
          </div>

          <div style={{ textAlign: 'right', marginTop: 20 }}>
            <Space>
              <Button onClick={() => setIsModalOpen(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit" icon={<SettingOutlined />}>Lưu Cấu Hình</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
}