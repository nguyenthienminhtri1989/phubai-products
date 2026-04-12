# PROMPT — Cải thiện trang Năng lực Sản xuất (capacity/page.tsx)

## Bối cảnh

Đọc `BUSINESS_LOGIC_CONTEXT.md` trước. Chỉ sửa file:
`src/app/dashboard/productivity-benchmark/capacity/page.tsx`

Không thay đổi API, không thay đổi schema. Chỉ sửa UI/logic frontend.

## Vấn đề hiện tại

Phần tính "Cần bao nhiêu ngày" đang bị sai logic:

```typescript
// CODE CŨ — SAI:
const daysNeeded =
  needed && results.length > 0
    ? Math.ceil(
        needed / (results[0]?.dailyOutputPerMachine * results[0]?.machineCount),
      )
    : null;
```

2 lỗi:

1. Dùng `results[0]` — lấy mặt hàng đầu tiên, không cho chọn mặt hàng cụ thể
2. `machineCount` lấy tự động từ API — thực tế Giám đốc muốn nhập tay
   số máy bố trí vì 21 máy đánh ống có thể chia cho nhiều mặt hàng khác nhau

## Thiết kế mới — Bộ tính toán nhanh

Xóa toàn bộ Card tính ngày cũ. Thay bằng 2 Card mới đặt SAU bảng kết quả:

---

### Card 1 — Bộ tính toán nhanh

```tsx
// State mới cần thêm:
const [calcItem, setCalcItem] = useState<number | null>(null);
const [calcMachines, setCalcMachines] = useState<number>(1);
const [calcNeeded, setCalcNeeded] = useState<number | null>(null);

// Tính toán realtime (không cần bấm nút):
const selectedResult =
  results.find((r) => r.item.id === calcItem) ?? results[0] ?? null;
const dmPerDay = selectedResult?.dailyOutputPerMachine ?? 0;
const dailyCapacity = dmPerDay * calcMachines;
const daysNeeded =
  calcNeeded && dailyCapacity > 0
    ? Math.ceil(calcNeeded / dailyCapacity)
    : null;

// Đánh giá:
const statusLabel = !daysNeeded
  ? null
  : daysNeeded <= 10
    ? { text: "Rất thoải mái", color: "success" }
    : daysNeeded <= 20
      ? { text: "Khả thi trong tháng", color: "success" }
      : daysNeeded <= 26
        ? { text: "Cần theo dõi", color: "warning" }
        : { text: "Không kịp tháng này", color: "error" };
```

```tsx
<Card
  title="Bộ tính toán nhanh — Cần bao nhiêu ngày?"
  style={{ marginTop: 16 }}
>
  <Row gutter={[16, 16]} align="middle">
    {/* Chọn mặt hàng */}
    <Col xs={24} sm={8}>
      <div
        style={{
          fontSize: 12,
          color: token.colorTextSecondary,
          marginBottom: 6,
        }}
      >
        Mặt hàng cần tính
      </div>
      <Select
        style={{ width: "100%" }}
        value={calcItem ?? results[0]?.item.id}
        onChange={setCalcItem}
        options={results.map((r) => ({
          value: r.item.id,
          label: `${r.item.name} — ĐM: ${r.dailyOutputPerMachine.toLocaleString("vi-VN")} kg/ngày/máy`,
        }))}
      />
    </Col>

    {/* Số máy bố trí */}
    <Col xs={24} sm={7}>
      <div
        style={{
          fontSize: 12,
          color: token.colorTextSecondary,
          marginBottom: 6,
        }}
      >
        Số máy bố trí chạy mặt hàng này
      </div>
      <InputNumber
        style={{ width: "100%" }}
        min={1}
        max={999}
        value={calcMachines}
        onChange={(v) => setCalcMachines(v ?? 1)}
        addonAfter="máy"
      />
      {/* Gợi ý: tổng máy trong công đoạn */}
      {results[0]?.machineCount != null && (
        <div
          style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 4 }}
        >
          Tổng công đoạn có {results[0].machineCount} máy
        </div>
      )}
    </Col>

    {/* Sản lượng cần SX */}
    <Col xs={24} sm={9}>
      <div
        style={{
          fontSize: 12,
          color: token.colorTextSecondary,
          marginBottom: 6,
        }}
      >
        Sản lượng cần sản xuất
      </div>
      <InputNumber
        style={{ width: "100%" }}
        min={0}
        step={1000}
        value={calcNeeded}
        onChange={setCalcNeeded}
        addonAfter="kg"
        placeholder="Nhập số kg..."
      />
    </Col>
  </Row>

  {/* Kết quả */}
  {daysNeeded !== null && (
    <div
      style={{
        marginTop: 16,
        background: token.colorFillSecondary,
        borderRadius: token.borderRadiusLG,
        padding: "14px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
          Số ngày cần thiết
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            marginTop: 4,
          }}
        >
          <span
            style={{ fontSize: 32, fontWeight: 500, color: token.colorPrimary }}
          >
            {daysNeeded}
          </span>
          <span style={{ fontSize: 14, color: token.colorTextSecondary }}>
            ngày
          </span>
          {statusLabel && (
            <Tag color={statusLabel.color}>{statusLabel.text}</Tag>
          )}
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
          Năng lực/ngày với {calcMachines} máy
        </div>
        <div style={{ fontSize: 20, fontWeight: 500, marginTop: 4 }}>
          {dailyCapacity.toLocaleString("vi-VN")}
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
            {" "}
            kg/ngày
          </span>
        </div>
      </div>
    </div>
  )}

  {/* Công thức hiển thị minh bạch */}
  {daysNeeded !== null && (
    <div
      style={{
        marginTop: 8,
        padding: "6px 12px",
        background: token.colorInfoBg,
        borderRadius: token.borderRadiusSM,
        fontSize: 12,
        color: token.colorInfoText,
      }}
    >
      Công thức: {(calcNeeded ?? 0).toLocaleString("vi-VN")} kg ÷ (
      {dmPerDay.toLocaleString("vi-VN")} kg/ngày/máy × {calcMachines} máy) ={" "}
      {((calcNeeded ?? 0) / dailyCapacity).toFixed(2)}→ làm tròn lên{" "}
      <strong>{daysNeeded} ngày</strong>
    </div>
  )}
</Card>
```

---

### Card 2 — Bảng so sánh các phương án bố trí máy

Hiển thị tự động khi đã có `calcNeeded > 0` và `selectedResult != null`.
Tính sẵn cho các mức 1, 2, 3, 5, 8, 10 máy để Giám đốc so sánh nhanh:

```tsx
{
  calcNeeded && selectedResult && (
    <Card
      title={`So sánh phương án bố trí máy — ${selectedResult.item.name}, cần ${calcNeeded.toLocaleString("vi-VN")} kg`}
      style={{ marginTop: 12 }}
      size="small"
    >
      <Table
        size="small"
        pagination={false}
        dataSource={[1, 2, 3, 5, 8, 10, 15, 20]
          .filter((m) => m <= (results[0]?.machineCount ?? 99))
          .map((m) => ({
            key: m,
            machines: m,
            dailyCap: dmPerDay * m,
            days: Math.ceil(calcNeeded / (dmPerDay * m)),
          }))}
        rowClassName={(r) =>
          r.machines === calcMachines ? "ant-table-row-selected" : ""
        }
        columns={[
          {
            title: "Số máy bố trí",
            dataIndex: "machines",
            width: 130,
            render: (v) => (
              <span>
                {v} máy
                {v === calcMachines && (
                  <Tag color="blue" style={{ marginLeft: 8 }}>
                    Đang chọn
                  </Tag>
                )}
              </span>
            ),
          },
          {
            title: "Năng lực/ngày",
            dataIndex: "dailyCap",
            render: (v: number) => `${v.toLocaleString("vi-VN")} kg`,
          },
          {
            title: "Số ngày cần",
            dataIndex: "days",
            render: (v: number) => <Text strong>{v} ngày</Text>,
          },
          {
            title: "Đánh giá",
            dataIndex: "days",
            render: (v: number) => {
              if (v <= 10) return <Tag color="success">Rất thoải mái</Tag>;
              if (v <= 20) return <Tag color="success">Khả thi</Tag>;
              if (v <= 26) return <Tag color="warning">Cần theo dõi</Tag>;
              return <Tag color="error">Không kịp tháng</Tag>;
            },
          },
          {
            title: "",
            width: 80,
            render: (_: unknown, r: { machines: number }) => (
              <Button
                size="small"
                type={r.machines === calcMachines ? "primary" : "default"}
                onClick={() => setCalcMachines(r.machines)}
              >
                Chọn
              </Button>
            ),
          },
        ]}
      />
      <div
        style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 8 }}
      >
        Click "Chọn" để điền số máy vào bộ tính toán bên trên
      </div>
    </Card>
  );
}
```

---

## Vị trí đặt 2 Card mới trong trang

```tsx
return (
  <div>
    <Title level={3}>Năng lực Sản xuất</Title>

    {/* Filter bar — giữ nguyên */}
    <Card>...</Card>

    {/* Loading */}
    {loading && <Spin />}

    {results.length > 0 && (
      <>
        {/* KPI cards tổng hợp — giữ nguyên */}
        <Row gutter={16}>...</Row>

        {/* Nút xuất Excel — giữ nguyên */}

        {/* Bảng kết quả — giữ nguyên */}
        <Table ... />

        {/* Card 1: Bộ tính toán nhanh — MỚI */}
        <Card title="Bộ tính toán nhanh...">...</Card>

        {/* Card 2: Bảng so sánh phương án — MỚI, chỉ khi có calcNeeded */}
        {calcNeeded && selectedResult && <Card .../>}
      </>
    )}
  </div>
)
```

---

## Xóa code cũ

Xóa hoàn toàn đoạn này (không dùng nữa):

```typescript
// XÓA:
const daysNeeded =
  needed && results.length > 0
    ? Math.ceil(
        needed / (results[0]?.dailyOutputPerMachine * results[0]?.machineCount),
      )
    : null;

// XÓA state cũ:
const [needed, setNeeded] = useState<number | null>(null);

// XÓA Col "Cần sản xuất" trong KPI row cũ
```

---

## Checklist

- [ ] 3 input mới: chọn mặt hàng, nhập số máy, nhập kg cần SX
- [ ] Kết quả tính realtime khi thay đổi bất kỳ input nào
- [ ] Công thức hiển thị rõ ràng bên dưới kết quả
- [ ] Bảng so sánh chỉ hiện khi đã nhập calcNeeded > 0
- [ ] Hàng "Đang chọn" được highlight trong bảng so sánh
- [ ] Nút "Chọn" trong bảng → cập nhật calcMachines trong bộ tính
- [ ] Gợi ý "Tổng công đoạn có X máy" lấy từ `results[0].machineCount`
- [ ] Không thay đổi gì ở filter bar, bảng kết quả chính, API, schema
- [ ] TypeScript compile clean
- [ ] Cập nhật `BUSINESS_LOGIC_CONTEXT.md` sau khi xong
