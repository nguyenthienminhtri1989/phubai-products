**File: `src/app/production/mobile-input/page.tsx`**

### 1. Máy multi-item — cho phép tự thêm/xóa/đổi mặt hàng ngay trên form nhập liệu

Trong phần render form multi-item (tìm `{/* === FORM MULTI-ITEM === */}`), thêm nút "Thêm mặt hàng" và nút "Xóa" cho mỗi dòng:

```tsx
// Sau vòng lặp map assignments, thêm nút:
<Button
  type="dashed"
  block
  icon={<PlusOutlined />}
  onClick={() => {
    // Mở modal chọn mặt hàng từ danh sách items
    // Khi chọn xong → thêm vào machineAssignments local + gọi API PUT assignments
    setAddItemModalVisible(true);
  }}
  style={{ height: 48, fontSize: 15, borderRadius: 12, marginTop: 8 }}
>
  + Thêm mặt hàng
</Button>
```

Mỗi ô mặt hàng thêm nút đổi/xóa:

```tsx
<div
  style={{
    fontWeight: 700,
    fontSize: 16,
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  }}
>
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    {a.item?.name}
    {a.fromSpindle != null && (
      <Tag>
        Cọc {a.fromSpindle}–{a.toSpindle}
      </Tag>
    )}
  </div>
  <Space size={4}>
    <Button
      type="text"
      size="small"
      icon={<SwapOutlined />}
      onClick={() => {
        setEditAssignmentItem(a);
        setAddItemModalVisible(true);
      }}
      style={{ color: "#d46b08", fontSize: 11 }}
    />
    <Button
      type="text"
      size="small"
      danger
      icon={<CloseOutlined />}
      onClick={() => handleRemoveAssignment(currentMachine.id, a.itemId)}
      style={{ fontSize: 11 }}
    />
  </Space>
</div>
```

### 2. Thêm state + modal cho thêm/đổi mặt hàng multi-item

```typescript
const [addItemModalVisible, setAddItemModalVisible] = useState(false);
const [editAssignmentItem, setEditAssignmentItem] = useState<any>(null); // null = thêm mới, có giá trị = đổi
```

Modal:

```tsx
<Modal
  open={addItemModalVisible}
  onCancel={() => {
    setAddItemModalVisible(false);
    setEditAssignmentItem(null);
  }}
  title={editAssignmentItem ? "Đổi mặt hàng" : "Thêm mặt hàng"}
  centered
  footer={null}
>
  <Select
    showSearch
    filterOption={(input, opt) =>
      (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())
    }
    style={{ width: "100%", marginBottom: 16 }}
    placeholder="Chọn mặt hàng..."
    options={items.map((i) => ({ label: i.name, value: i.id }))}
    onChange={async (itemId) => {
      if (!currentMachine) return;
      const existingAssignments = machineAssignments[currentMachine.id] ?? [];

      let newAssignments;
      if (editAssignmentItem) {
        // Đổi: thay itemId cũ bằng mới
        newAssignments = existingAssignments.map((a) =>
          a.itemId === editAssignmentItem.itemId
            ? { ...a, itemId, item: items.find((i) => i.id === itemId) }
            : a,
        );
      } else {
        // Thêm mới
        newAssignments = [
          ...existingAssignments,
          {
            itemId,
            item: items.find((i) => i.id === itemId),
            fromSpindle: null,
            toSpindle: null,
            sortOrder: existingAssignments.length,
          },
        ];
      }

      // Cập nhật local
      setMachineAssignments((prev) => ({
        ...prev,
        [currentMachine.id]: newAssignments,
      }));

      // Lưu lên server
      await fetch(`/api/machines/${currentMachine.id}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: newAssignments.map((a, i) => ({
            itemId: a.itemId,
            fromSpindle: a.fromSpindle,
            toSpindle: a.toSpindle,
            sortOrder: i,
          })),
        }),
      });

      setAddItemModalVisible(false);
      setEditAssignmentItem(null);
      message.success(
        editAssignmentItem ? "Đã đổi mặt hàng" : "Đã thêm mặt hàng",
      );
    }}
  />
</Modal>
```

### 3. Hàm xóa assignment

```typescript
const handleRemoveAssignment = async (machineId: number, itemId: number) => {
  const existing = machineAssignments[machineId] ?? [];
  const newAssignments = existing.filter((a) => a.itemId !== itemId);
  setMachineAssignments((prev) => ({ ...prev, [machineId]: newAssignments }));

  // Xóa giá trị đã nhập
  setMultiInputStates((prev) => {
    const ms = { ...prev[machineId] };
    delete ms[itemId];
    return { ...prev, [machineId]: ms };
  });

  // Lưu lên server
  await fetch(`/api/machines/${machineId}/assignments`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assignments: newAssignments.map((a, i) => ({
        itemId: a.itemId,
        fromSpindle: a.fromSpindle,
        toSpindle: a.toSpindle,
        sortOrder: i,
      })),
    }),
  });
};
```

### 4. Máy thường — thêm nút đổi mặt hàng nhanh trên phần machineInfo

Hiện tại chỉ có nút "Đổi hàng giữa ca" (tạo 2 records). Thêm nút **"Đổi mặt hàng"** đơn giản (không chốt chỉ số, chỉ thay `currentItem`):

Trong phần `machineInfo`, sau Tag `currentItem`, thêm:

```tsx
{
  currentMachine.currentItem && !currentMachine.allowMultiItemPerShift && (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginTop: 4,
        justifyContent: "center",
      }}
    >
      <Button
        type="link"
        size="small"
        icon={<EditOutlined />}
        onClick={() => setQuickChangeItemVisible(true)}
        style={{ color: "#1677ff", fontSize: 12 }}
      >
        Đổi mặt hàng
      </Button>
      <Button
        type="link"
        size="small"
        icon={<SwapOutlined />}
        onClick={() => {
          setItemChangeModalVisible(true);
          setItemChangeCutover(null);
          setItemChangeNewId(null);
        }}
        style={{ color: "#d46b08", fontSize: 12 }}
      >
        Đổi hàng giữa ca
      </Button>
    </div>
  );
}
```

Thêm state + modal cho "Đổi mặt hàng nhanh":

```typescript
const [quickChangeItemVisible, setQuickChangeItemVisible] = useState(false);
```

Modal chọn mặt hàng mới → gọi API batch assign → cập nhật `currentItem` local:

```tsx
<Modal
  open={quickChangeItemVisible}
  onCancel={() => setQuickChangeItemVisible(false)}
  title="Đổi mặt hàng cho máy"
  centered
  footer={null}
>
  <Select
    showSearch
    filterOption={(input, opt) =>
      (opt?.label as string)?.toLowerCase().includes(input.toLowerCase())
    }
    style={{ width: "100%" }}
    placeholder="Chọn mặt hàng mới..."
    options={items.map((i) => ({ label: i.name, value: i.id }))}
    onChange={async (itemId) => {
      const item = items.find((i) => i.id === itemId);
      if (!item || !currentMachine) return;
      await fetch("/api/machines/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineIds: [currentMachine.id], itemId }),
      });
      setMachines((prev) =>
        prev.map((m) =>
          m.id === currentMachine.id
            ? { ...m, currentItem: { id: item.id, name: item.name } }
            : m,
        ),
      );
      setQuickChangeItemVisible(false);
      message.success(`Đã đổi sang ${item.name}`);
    }}
  />
</Modal>
```

---

Thêm import `CloseOutlined, EditOutlined` vào đầu file nếu chưa có.
