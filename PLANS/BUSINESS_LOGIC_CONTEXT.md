# BUSINESS_LOGIC_CONTEXT — Phú Bái ERP

## Module: Năng lực Sản xuất (`/dashboard/productivity-benchmark/capacity`)

### Bộ tính toán nhanh (cập nhật 2026-04-12)

**Vị trí**: `src/app/dashboard/productivity-benchmark/capacity/page.tsx`

Trang này cho phép tính năng lực sản xuất theo 2 loại định mức:
- **Lý thuyết (THEORY)**: Dựa trên thông số kỹ thuật lý thuyết — dùng để đánh giá máy có đúng thiết kế không
- **Thực nghiệm (EMPIRICAL)**: Dựa trên số liệu thực tế vận hành — phù hợp để lập kế hoạch và đàm phán với khách hàng

### Công thức tính ngày (Bộ tính toán nhanh)

```
Số ngày cần = ROUNDUP(Sản lượng cần SX (kg) / (ĐM kg/ngày/máy × Số máy bố trí))
```

**Quy tắc thiết kế quan trọng:**
- `Số máy bố trí` do Giám đốc **nhập tay** — không lấy từ `machineCount` của API.
  - Lý do: 21 máy đánh ống có thể chia cho nhiều mặt hàng khác nhau, Giám đốc quyết định bố trí bao nhiêu máy cho mặt hàng cụ thể.
- `Mặt hàng cần tính` do người dùng chọn — không mặc định `results[0]`.
- Kết quả tính **realtime** khi thay đổi bất kỳ input nào (không cần bấm nút).
- `results[0].machineCount` chỉ dùng để hiển thị gợi ý "Tổng công đoạn có X máy".

### Đánh giá số ngày

| Số ngày | Đánh giá | Màu |
|---------|----------|-----|
| ≤ 10 | Rất thoải mái | success (xanh) |
| ≤ 20 | Khả thi trong tháng | success (xanh) |
| ≤ 26 | Cần theo dõi | warning (vàng) |
| > 26 | Không kịp tháng này | error (đỏ) |

### Bảng so sánh phương án bố trí máy

- Chỉ hiện khi người dùng đã nhập `calcNeeded > 0`
- Tính sẵn cho các mức: `[1, 2, 3, 5, 8, 10, 15, 20]` máy
- Chỉ hiển thị hàng có số máy `<= results[0].machineCount` (tổng máy công đoạn)
- Hàng "Đang chọn" được highlight bằng `ant-table-row-selected`
- Nút "Chọn" trong bảng cập nhật `calcMachines` trong bộ tính toán

### State quan trọng

```typescript
const [calcItem, setCalcItem] = useState<number | null>(null);      // ID mặt hàng đang chọn
const [calcMachines, setCalcMachines] = useState<number>(1);         // Số máy bố trí (nhập tay)
const [calcNeeded, setCalcNeeded] = useState<number | null>(null);   // Sản lượng cần SX (kg)
```

---

## Module: Định mức Năng suất (`/dashboard/productivity-benchmark`)

### Hai loại benchmark

- **THEORY (Lý thuyết)**: `stdOutputPerShift` — kg/ca/máy từ thông số kỹ thuật
- **EMPIRICAL (Thực nghiệm)**: `empiricalOutputPerDay` — kg/ngày thực tế vận hành

### Công thức tính năng lực tháng

```
capacityKg = dailyOutputPerMachine × machineCount × daysInMonth
capacityTon = capacityKg / 1000
```

---

## Quy tắc chung

- Không thay đổi API hoặc Prisma schema trừ khi có yêu cầu rõ ràng
- Mọi thay đổi chỉ sửa UI/logic frontend trừ khi có chỉ định khác
- Tất cả số liệu hiển thị định dạng `vi-VN` locale
