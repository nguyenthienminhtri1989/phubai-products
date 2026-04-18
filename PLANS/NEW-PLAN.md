# FIX: Modal Thêm Segment — Auto-fill kgPerDay từ benchmark, không bắt buộc nhập tay

## Vấn đề

Hiện tại ô "Kg/ngày" đang `required` nên không cho lưu nếu trống.
Nhưng nếu máy + mặt hàng đã có định mức EMPIRICAL thì phải tự động fill,
user không cần nhập tay.

## File cần sửa

`src/components/kdsx/ScheduleSegmentModal.tsx`

---

## Thay đổi 1: Gọi API benchmark-lookup khi chọn máy + mặt hàng

Khi user chọn máy (hoặc mặt hàng), tự động gọi:

```
GET /api/kdsx/production-schedule/benchmark-lookup
  ?machineId=X&itemId=Y&yearMonth=YYYY-MM
```

Nếu API trả về `kgPerDay` → tự động điền vào ô, set `isManualKg = false`.
Nếu API trả về `notFound: true` → để trống ô, cho user nhập tay.

```tsx
const fetchBenchmark = async (machineId: number, itemId: number) => {
  if (!machineId || !itemId) return;
  try {
    const res = await fetch(
      `/api/kdsx/production-schedule/benchmark-lookup?machineId=${machineId}&itemId=${itemId}&yearMonth=${yearMonth}`,
    );
    const data = await res.json();
    if (data.kgPerDay) {
      setForm((prev) => ({
        ...prev,
        kgPerDay: data.kgPerDay,
        isManualKg: false,
        benchmarkInfo: `Định mức: ${data.kgPerDay.toLocaleString()} kg/ngày (${data.versionName})`,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        benchmarkInfo: null, // không có định mức → user tự nhập
      }));
    }
  } catch {}
};

// Gọi khi đổi máy hoặc mặt hàng
useEffect(() => {
  if (form.machineIds?.length === 1 && form.itemId) {
    fetchBenchmark(form.machineIds[0], form.itemId);
  }
}, [form.machineIds, form.itemId]);
```

---

## Thay đổi 2: Bỏ `required` khỏi ô kgPerDay

```tsx
// CŨ:
rules={[{ required: true, message: "Nhập kg/ngày" }]}

// MỚI: Không required, chỉ validate > 0 nếu có nhập
rules={[{
  validator: (_, value) => {
    if (value && value <= 0) return Promise.reject("Phải > 0");
    return Promise.resolve();
  }
}]}
```

---

## Thay đổi 3: Hiển thị thông tin benchmark bên cạnh ô

```tsx
<Form.Item label="Kg/ngày">
  <InputNumber
    value={form.kgPerDay}
    onChange={(v) =>
      setForm((prev) => ({ ...prev, kgPerDay: v, isManualKg: true }))
    }
    placeholder="Tự động từ định mức hoặc nhập tay"
    style={{ width: "100%" }}
    min={0}
  />
  {form.benchmarkInfo && (
    <div style={{ fontSize: 12, color: "#52c41a", marginTop: 4 }}>
      ✓ {form.benchmarkInfo}
    </div>
  )}
  {!form.benchmarkInfo && form.machineIds?.length === 1 && form.itemId && (
    <div style={{ fontSize: 12, color: "#faad14", marginTop: 4 }}>
      ⚠ Chưa có định mức cho máy này. Nhập thủ công.
    </div>
  )}
</Form.Item>
```

---

## Thay đổi 4: Validation khi submit

```tsx
// Chỉ block submit nếu kgPerDay trống VÀ không có benchmark
const isValid =
  form.machineIds.length > 0 &&
  form.itemId &&
  form.fromDay &&
  form.toDay &&
  form.toDay >= form.fromDay &&
  form.kgPerDay > 0; // kgPerDay phải có — hoặc từ benchmark hoặc nhập tay
```

Nếu `kgPerDay` vẫn trống sau khi chọn máy + mặt hàng (không có benchmark,
chưa nhập tay) → disable nút Lưu và hiện tooltip:

```tsx
<Tooltip
  title={
    !form.kgPerDay ? "Chưa có định mức tự động. Vui lòng nhập kg/ngày." : ""
  }
>
  <Button type="primary" disabled={!isValid} onClick={handleSubmit}>
    Lưu
  </Button>
</Tooltip>
```

---

## Thay đổi 5: Trường hợp chọn nhiều máy

Khi chọn nhiều máy (multi-select), không thể auto-fill vì mỗi máy có thể
có định mức khác nhau. Xử lý như sau:

- Nếu tất cả máy cùng loại `model` → gọi benchmark-lookup với machineId đầu tiên
  → nếu tìm được → fill chung cho tất cả
- Nếu các máy khác model → để trống, hiện warning:
  "Các máy có model khác nhau. Vui lòng nhập kg/ngày chung hoặc tạo từng segment riêng."
- Trong mọi trường hợp chọn nhiều máy: cho phép nhập tay kg/ngày chung

---

## Lưu ý

- `benchmark-lookup` API đã có sẵn, không cần sửa backend
- Chỉ sửa file `ScheduleSegmentModal.tsx`
- Khi edit segment đã có (không phải tạo mới) → hiển thị kgPerDay hiện tại,
  vẫn cho sửa, hiện info benchmark nếu có `benchmarkId`
