# FIX: Trang Kế hoạch Sản xuất tháng — 2 thay đổi UI

## Thay đổi 1: Hiển thị kg thay vì tấn

File: `src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx`

### 1a. Các ô trong grid (cột ngày)

Tìm chỗ render giá trị trong ô ngày, hiện đang hiển thị dạng tấn:

```tsx
// CŨ:
{
  (seg.kgPerDay / 1000).toFixed(1);
}
t;

// MỚI:
{
  seg.kgPerDay.toLocaleString();
}
kg;
```

### 1b. Cột TỔNG bên phải (tổng kg của máy)

```tsx
// CŨ:
{
  machineTotalKg > 0 ? `${(machineTotalKg / 1000).toFixed(1)}t` : "—";
}

// MỚI:
{
  machineTotalKg > 0 ? `${machineTotalKg.toLocaleString()} kg` : "—";
}
```

### 1c. Hàng TỔNG/NGÀY ở cuối bảng

```tsx
// CŨ:
{
  isHoliday ? "—" : kg > 0 ? `${(kg / 1000).toFixed(1)}t` : "·";
}

// MỚI:
{
  isHoliday ? "—" : kg > 0 ? `${kg.toLocaleString()} kg` : "·";
}
```

### 1d. Ô tổng góc dưới phải

```tsx
// CŨ:
{
  (grandTotal / 1000).toFixed(1);
}
t;

// MỚI:
{
  grandTotal.toLocaleString();
}
kg;
```

### 1e. Summary Cards ở đầu trang

Giữ nguyên hiển thị tấn trong summary cards (vì tấn dễ đọc hơn ở level tổng hợp).
Chỉ đổi trong bảng grid.

---

## Thay đổi 2: Cho phép chọn nhiều máy trong Modal Thêm Segment

File: `src/components/kdsx/ScheduleSegmentModal.tsx`

### 2a. Đổi Select máy thành multi-select

```tsx
// CŨ: Select 1 máy
<Select
  placeholder="Chọn máy"
  value={form.machineId}
  onChange={v => setForm(prev => ({ ...prev, machineId: v }))}
>
  {machines.map(m => <Option key={m.id} value={m.id}>{m.name}</Option>)}
</Select>

// MỚI: Select nhiều máy
<Select
  mode="multiple"
  placeholder="Chọn 1 hoặc nhiều máy"
  value={form.machineIds}  // đổi thành array
  onChange={v => setForm(prev => ({ ...prev, machineIds: v }))}
  showSearch
  optionFilterProp="children"
  maxTagCount="responsive"
>
  {machines.map(m => (
    <Option key={m.id} value={m.id}>
      {m.name}{m.model ? ` (${m.model})` : ""}
    </Option>
  ))}
</Select>
```

### 2b. Đổi form state từ `machineId` sang `machineIds`

```tsx
// CŨ:
const [form, setForm] = useState({
  machineId: defaultMachineId || null,
  ...
});

// MỚI:
const [form, setForm] = useState({
  machineIds: defaultMachineId ? [defaultMachineId] : [],
  ...
});
```

### 2c. Đổi validation

```tsx
// CŨ:
const isValid = form.machineId && form.itemId && ...

// MỚI:
const isValid = form.machineIds.length > 0 && form.itemId && ...
```

### 2d. Đổi logic submit — tạo nhiều segments (1 per máy)

```tsx
// CŨ: submit 1 segment
const handleSubmit = () => {
  onSave({ machineId: form.machineId, ... });
};

// MỚI: submit nhiều segments, 1 API call per máy
const handleSubmit = async () => {
  for (const machineId of form.machineIds) {
    await onSave({ machineId, itemId: form.itemId, fromDay: form.fromDay, toDay: form.toDay, kgPerDay: form.kgPerDay });
  }
};
```

### 2e. Preview cập nhật

Khi chọn nhiều máy, preview hiển thị:

```tsx
{
  form.machineIds.length > 0 && form.kgPerDay && (
    <div>
      {form.machineIds.length} máy × {form.kgPerDay.toLocaleString()} kg/ngày ×{" "}
      {daysCount} ngày ={" "}
      <strong>
        {(form.machineIds.length * form.kgPerDay * daysCount).toLocaleString()}{" "}
        kg
      </strong>
    </div>
  );
}
```

### 2f. Khi click ô trống trong grid để thêm segment

Máy được pre-select từ `defaultMachineId` — vẫn hoạt động vì
`machineIds = [defaultMachineId]` (array 1 phần tử).

---

## Lưu ý

- Khi edit segment (sửa segment đã có) → chỉ cho chọn 1 máy (disable multi-select
  hoặc chỉ hiện 1 máy của segment đó). Multi-select chỉ áp dụng khi TẠO MỚI.
- `onSave` được gọi nhiều lần (1 per máy) — đảm bảo hàm này handle async đúng,
  không bị race condition. Có thể dùng `Promise.all` hoặc sequential await.
- Sau khi save xong tất cả → gọi `refresh()` 1 lần duy nhất, không gọi mỗi iteration.
