# PROMPT — Thêm Định mức Thực nghiệm (Empirical Benchmark)

## Bối cảnh

Đọc `BUSINESS_LOGIC_CONTEXT.md` trước. Module Định mức Năng suất đã có
sẵn với định mức lý thuyết (THEORY) tính từ công thức vật lý.

Yêu cầu: thêm loại định mức thứ 2 là **Thực nghiệm (EMPIRICAL)** — người
dùng tự nhập 1 con số kg/ngày dựa trên kinh nghiệm vận hành thực tế,
không cần nhập thông số kỹ thuật. Song song với định mức lý thuyết đang có,
không thay thế.

**Mục đích nghiệp vụ:** Phòng kinh doanh dùng để ước tính năng lực sản xuất
thực tế của nhà máy khi đàm phán sản lượng với khách hàng — con số thực
nghiệm gần với thực tế hơn con số lý thuyết.

**Nguyên tắc:** Strictly additive — không xóa, không sửa logic cũ.
`calcTheoreticalOutput()` giữ nguyên hoàn toàn.

---

## Nghiệp vụ cần hiểu

### 2 loại định mức song song

|                   | Lý thuyết (THEORY)                      | Thực nghiệm (EMPIRICAL)                |
| ----------------- | --------------------------------------- | -------------------------------------- |
| Nguồn gốc         | Tính từ công thức vật lý                | Người dùng tự nhập từ kinh nghiệm      |
| Đơn vị lưu        | kg/ca/máy                               | kg/ngày/loại máy                       |
| Thông số cần nhập | Nm, Ne, twist, speed, hiệu suất, số cọc | Chỉ cần: loại máy + mặt hàng + kg/ngày |
| Dùng để           | Đánh giá máy có đúng thiết kế không     | Lập kế hoạch và đàm phán với khách     |
| Liên kết máy      | processId + machineModel                | processId + machineModel (phương án A) |

### Phương án A — Định mức theo loại máy (machineModel)

Ví dụ: tất cả máy G32 trong công đoạn Sợi con chạy 30/1 COCD
được khoảng 850 kg/ngày → nhập 1 dòng áp dụng cho toàn bộ máy G32.

Không cần liên kết đến từng machineId cụ thể — đơn giản, phòng KD
dễ nhập và đủ để ước tính năng lực.

### Công tắc chọn loại định mức

Không cần tạo cơ chế phức tạp. Chỉ cần:

- API capacity và comparison nhận thêm query param `benchmarkType`
- UI có Segmented/Radio để chọn `THEORY` hoặc `EMPIRICAL`
- Khi chọn EMPIRICAL: dùng `empiricalOutputPerDay` thay vì `stdOutputPerShift`

---

## TASK 1 — Schema Migration

Thêm 2 fields vào model `ProductivityBenchmark` (strictly additive):

```prisma
model ProductivityBenchmark {
  // ... tất cả fields cũ giữ nguyên ...

  // Thêm mới — không ảnh hưởng dữ liệu cũ:
  benchmarkType         BenchmarkType  @default(THEORY)
  empiricalOutputPerDay Float?         // kg/ngày — chỉ dùng khi EMPIRICAL
  empiricalNote         String?        // ghi chú nguồn số liệu
}

enum BenchmarkType {
  THEORY    // định mức lý thuyết — tính từ công thức
  EMPIRICAL // định mức thực nghiệm — nhập tay
}
```

Chạy: `npx prisma migrate dev --name add_empirical_benchmark`

**Lưu ý migration:** Rows cũ sẽ có `benchmarkType = 'THEORY'` do @default —
không cần update thủ công, dữ liệu cũ vẫn hoạt động bình thường.

---

## TASK 2 — Cập nhật API

### POST `/api/productivity-benchmark/benchmarks` — thêm xử lý EMPIRICAL

```typescript
// Body khi tạo định mức EMPIRICAL:
{
  versionId,
  itemId,
  processId,
  machineModel,
  benchmarkType: 'EMPIRICAL',
  empiricalOutputPerDay: 850,  // kg/ngày — bắt buộc khi EMPIRICAL
  empiricalNote: 'Trung bình 3 tháng Q4/2025',  // optional
  // Các thông số kỹ thuật (nm, ne, twist...) KHÔNG bắt buộc với EMPIRICAL
}

// Validation thay đổi theo benchmarkType:
if (body.benchmarkType === 'EMPIRICAL') {
  if (!body.empiricalOutputPerDay || body.empiricalOutputPerDay <= 0) {
    return NextResponse.json({ error: 'Sản lượng thực nghiệm phải > 0' }, { status: 400 })
  }
  // Không validate nm, ne, twist, speed... — để null là được
  // theoreticalOutput = 0, stdOutputPerShift = 0 (không dùng)
} else {
  // THEORY — validation cũ giữ nguyên, gọi calcTheoreticalOutput() như cũ
}
```

### GET `/api/productivity-benchmark/capacity` — thêm param benchmarkType

```typescript
// Query params hiện tại: itemId, processId, factoryId, year, month
// Thêm mới: benchmarkType? ('THEORY' | 'EMPIRICAL', default: 'THEORY')

const benchmarkType = searchParams.get("benchmarkType") ?? "THEORY";

// Lấy benchmark theo type:
const benchmark = await prisma.productivityBenchmark.findFirst({
  where: {
    itemId,
    processId,
    version: { isActive: true, factoryId },
    benchmarkType, // filter theo type được chọn
  },
});

// Tính capacity theo type:
let dailyOutputPerMachine: number;

if (benchmarkType === "EMPIRICAL") {
  if (!benchmark?.empiricalOutputPerDay) {
    return NextResponse.json(
      {
        error: "Chưa có định mức thực nghiệm cho mặt hàng này",
      },
      { status: 404 },
    );
  }
  dailyOutputPerMachine = benchmark.empiricalOutputPerDay;
} else {
  // THEORY — logic cũ giữ nguyên
  dailyOutputPerMachine = (benchmark?.stdOutputPerShift ?? 0) * 3;
}

// capacity = dailyOutputPerMachine × machineCount × daysInMonth
// (machineCount và daysInMonth tính như cũ)
```

### GET `/api/productivity-benchmark/comparison` — thêm param benchmarkType

```typescript
// Thêm benchmarkType vào query params

// Khi EMPIRICAL: dùng empiricalOutputPerDay làm chuẩn so sánh
// Khi THEORY: dùng stdOutputPerShift × 3 như cũ

// Response thêm field:
{
  machineModel,
  benchmarkType,           // loại định mức đang dùng
  benchmarkValue,          // kg/ngày — từ THEORY hoặc EMPIRICAL
  avgActualPerDay,         // thực tế trung bình kg/ngày
  efficiencyPct,           // avgActualPerDay / benchmarkValue × 100
  // ... các fields cũ giữ nguyên
}
```

---

## TASK 3 — Cập nhật UI

### Tab "Nhập định mức" — thêm lựa chọn loại định mức

Trong Drawer nhập định mức (trang chính `/dashboard/productivity-benchmark`),
thêm Radio Group ở đầu form:

```tsx
<Form.Item name="benchmarkType" label="Loại định mức" initialValue="THEORY">
  <Radio.Group onChange={(e) => setBenchmarkType(e.target.value)}>
    <Radio.Button value="THEORY">Lý thuyết — tính từ công thức</Radio.Button>
    <Radio.Button value="EMPIRICAL">
      Thực nghiệm — nhập từ kinh nghiệm
    </Radio.Button>
  </Radio.Group>
</Form.Item>
```

**Khi chọn THEORY** → hiển thị form cũ đầy đủ (Nm, Ne, twist, speed, hiệu suất,
số cọc, preview tính toán). Không thay đổi gì so với hiện tại.

**Khi chọn EMPIRICAL** → ẩn toàn bộ thông số kỹ thuật, chỉ hiện:

```tsx
{
  benchmarkType === "EMPIRICAL" && (
    <>
      <Form.Item
        name="empiricalOutputPerDay"
        label="Sản lượng thực nghiệm (kg/ngày)"
        rules={[
          { required: true, message: "Vui lòng nhập sản lượng" },
          { type: "number", min: 1 },
        ]}
        tooltip="Sản lượng trung bình 1 ngày (3 ca) mà loại máy này
               thực tế chạy được cho mặt hàng này"
      >
        <InputNumber
          min={1}
          max={99999}
          formatter={(v) => `${v} kg/ngày`}
          style={{ width: "100%" }}
        />
      </Form.Item>

      <Form.Item name="empiricalNote" label="Ghi chú nguồn số liệu">
        <Input.TextArea
          rows={2}
          placeholder="VD: Trung bình 3 tháng Q4/2025, đo trực tiếp tại xưởng..."
          maxLength={200}
          showCount
        />
      </Form.Item>

      <div
        style={{
          background: "var(--color-background-info)",
          border: "1px solid var(--color-border-info)",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--color-text-info)" }}>
          Số liệu này là kg/ngày (3 ca) cho toàn bộ máy loại{" "}
          {form.getFieldValue("machineModel") || "..."}
          chạy mặt hàng đã chọn. Hệ thống sẽ nhân với số máy thực tế để tính
          năng lực tháng.
        </div>
      </div>
    </>
  );
}
```

### Bảng danh sách định mức — thêm cột loại và badge

Thêm cột "Loại" vào bảng Tab 2:

```tsx
{
  title: 'Loại',
  dataIndex: 'benchmarkType',
  width: 110,
  render: (type) => type === 'EMPIRICAL'
    ? <Tag color="green">Thực nghiệm</Tag>
    : <Tag color="blue">Lý thuyết</Tag>
}
```

Cột "Định mức (kg/ca)" hiện tại — cập nhật để hiển thị đúng theo loại:

```tsx
{
  title: 'Định mức',
  render: (_, r) => r.benchmarkType === 'EMPIRICAL'
    ? <span>{r.empiricalOutputPerDay?.toLocaleString('vi-VN')} kg/ngày</span>
    : <span>{r.stdOutputPerShift?.toFixed(2)} kg/ca</span>
}
```

### Trang Công suất (`/capacity`) — thêm công tắc chọn loại

```tsx
// Thêm vào filter bar:
<Form.Item label="Loại định mức" style={{ marginBottom: 0 }}>
  <Segmented
    options={[
      { label: "Lý thuyết", value: "THEORY" },
      { label: "Thực nghiệm", value: "EMPIRICAL" },
    ]}
    value={benchmarkType}
    onChange={setBenchmarkType}
  />
</Form.Item>

// Khi đổi → refetch với benchmarkType mới
// Khi EMPIRICAL: thêm note "Dựa trên số liệu thực tế vận hành"
// Khi THEORY: thêm note "Dựa trên thông số kỹ thuật lý thuyết"
```

### Trang So sánh (`/comparison`) — thêm công tắc + cột mới

```tsx
// Thêm Segmented chọn benchmarkType vào filter bar (giống trang capacity)

// Bảng so sánh thêm cột:
{
  title: 'Định mức dùng',
  render: (_, r) => (
    <span>
      {r.benchmarkValue.toLocaleString('vi-VN')} kg/ngày
      <Tag style={{ marginLeft: 6 }} color={r.benchmarkType==='EMPIRICAL' ? 'green' : 'blue'}>
        {r.benchmarkType==='EMPIRICAL' ? 'TN' : 'LT'}
      </Tag>
    </span>
  )
}
```

---

## Checklist

- [ ] Migration thêm `benchmarkType` enum + 2 fields optional — rows cũ
      tự nhận `THEORY` qua @default, không cần update
- [ ] POST benchmarks: khi EMPIRICAL không validate thông số kỹ thuật
- [ ] `calcTheoreticalOutput()` trong `benchmark.ts` KHÔNG thay đổi gì
- [ ] API capacity: khi EMPIRICAL dùng `empiricalOutputPerDay` trực tiếp,
      không nhân với 3 ca (vì đã là kg/ngày rồi)
- [ ] API comparison: `benchmarkValue` = `empiricalOutputPerDay` khi EMPIRICAL,
      = `stdOutputPerShift × 3` khi THEORY
- [ ] UI: khi chọn EMPIRICAL ẩn hoàn toàn form thông số kỹ thuật
      (nm, ne, twist, speed, hiệu suất, số cọc, preview)
- [ ] Bảng danh sách định mức hiển thị đúng đơn vị: THEORY = kg/ca,
      EMPIRICAL = kg/ngày
- [ ] Unique constraint cũ `(versionId, itemId, processId, machineModel)`
      vẫn áp dụng cho cả 2 loại — 1 tổ hợp chỉ có 1 dòng
      (không cho tạo cả THEORY lẫn EMPIRICAL cho cùng 1 tổ hợp
      trong cùng 1 version — nếu muốn cả 2 thì cần 2 version riêng)
- [ ] TypeScript compile clean
- [ ] Cập nhật `BUSINESS_LOGIC_CONTEXT.md` sau khi xong
