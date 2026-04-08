# 📘 BUSINESS LOGIC — Phu Bai ERP

---

## MODULE 1: SẢN LƯỢNG (Production)

### Định nghĩa ca làm việc

| Ca   | Giờ thực tế           | Thuộc ngày                                        |
| ---- | --------------------- | ------------------------------------------------- |
| Ca 1 | 06:00 – 14:00         | Ngày hiện tại                                     |
| Ca 2 | 14:00 – 22:00         | Ngày hiện tại                                     |
| Ca 3 | 22:00 – 06:00 hôm sau | **Luôn thuộc ngày hôm nay** (không phải ngày mai) |

### Smart Date — Tự động gợi ý ca/ngày (cho phép chốt sớm 1 tiếng)

| Giờ hiện tại  | Gợi ý          |
| ------------- | -------------- |
| 13:00 – 20:59 | Ca 1, ngày T   |
| 21:00 – 23:59 | Ca 2, ngày T   |
| 00:00 – 04:59 | Ca 2, ngày T-1 |
| 05:00 – 12:59 | Ca 3, ngày T-1 |

### 4 loại công thức tính sản lượng (`formulaType` trên Machine)

| Type | Tên            | Công thức                                                                 |
| ---- | -------------- | ------------------------------------------------------------------------- |
| 1    | Nhập trực tiếp | `output = endIndex`                                                       |
| 2    | Trừ lùi        | `output = endIndex - startIndex`                                          |
| 3    | Có số cọc & NE | `output = ((endIndex - startIndex) × spindleCount) / (NE × 1000 × 1.693)` |
| 4    | Chia NE        | `output = (endIndex - startIndex) / NE`                                   |

### Traceability — Tự động tìm "Chỉ số trước"

Backend tự tìm bản ghi gần nhất của cùng máy:

```
WHERE machineId = X
  AND (recordDate < today OR (recordDate = today AND shift < currentShift))
ORDER BY recordDate DESC, shift DESC
LIMIT 1
```

→ Lấy `endIndex` của bản ghi đó làm `startIndex` của ca hiện tại.
Nếu không tìm thấy (máy mới) → cho phép nhập tay lần đầu.

### Xử lý ngoại lệ

| Tình huống                              | Xử lý                                                               |
| --------------------------------------- | ------------------------------------------------------------------- |
| Máy dừng/nghỉ                           | **Vẫn phải lưu** (output=0, endIndex=startIndex) để không đứt chuỗi |
| Đồng hồ reset/thay mới                  | Checkbox "Reset", mở khóa startIndex, `output = endIndex`           |
| endIndex < startIndex (không có Reset)  | ❌ Lỗi đỏ, **khóa nút Lưu**                                         |
| Output > 1000kg (có thể nhập thừa số 0) | ⚠️ Cảnh báo vàng, vẫn cho lưu                                       |

---

## MODULE 2: ĐIỆN NĂNG (Energy)

- **3 dải giá:** Bình thường 1,833đ/kWh · Cao điểm 3,398đ/kWh · Thấp điểm 1,190đ/kWh
- **Đồng hồ hạ thế:** `kWh = (endIndex - startIndex) × TU × TY`
- **Đồng hồ trung thế:** 3 chỉ số riêng (Bình thường / Cao điểm / Thấp điểm)
- **Chốt hàng ngày lúc 8:00 sáng**, ghi nhận cho ngày hôm trước
- Áp dụng cùng logic Reset như module Sản lượng

---

## MODULE 3: BẢO DƯỠNG (Maintenance)

- `NextDueDate = LastPerformedDate + intervalMonths`
- Màu cảnh báo: 🔴 Quá hạn · 🟠 Sắp đến hạn · 🟢 An toàn
- Cron job quét tự động + gửi email theo `leadTimeDays`

---

## MODULE 4: DỪNG MÁY (Machine Stop)

### Severity

| Giá trị    | Nhãn         | Màu    |
| ---------- | ------------ | ------ |
| `low`      | Nhẹ          | Xanh   |
| `medium`   | Trung bình   | Cam    |
| `high`     | Nặng         | Đỏ     |
| `critical` | Nghiêm trọng | Đỏ đậm |

### Rules

- `durationMinutes` **chỉ tính server-side** = `(endTime - startTime) / 60`
- `shift` tự detect từ `startTime` nếu không truyền
- `endTime = null` → máy vẫn đang dừng
- `startTime` không được trong tương lai
- 8 danh mục mặc định (`isDefault=true`) → không xóa, không tắt

---

## MODULE 5: KD-SX (Kế hoạch Kinh doanh - Sản xuất)

### Công thức tính toán

```
Doanh thu (VNĐ)   = qty × unitPriceUsd × exchangeRate
CP Cotton         = qty × cottonRate × avgCottonPriceUsd × exchangeRate
CP PE             = qty × peRate × peBenmaPriceUsd × exchangeRate  [chỉ sợi CVCM]
CP GC xe đôi      = [chỉ sợi /2: 30/2, 40/2...]
Phế thu hồi       = giá trị DƯƠNG → trừ vào tổng chi phí
Lợi nhuận gộp     = DT - CP NVL - CP Bán hàng - CP GC + Phế thu hồi
Lợi nhuận ròng    = LN gộp - Tổng CP cố định + DOANH_THU_HDTC
```

> ⚠️ `DOANH_THU_HDTC` là khoản **THU**, **cộng vào** lợi nhuận, **không tính vào chi phí**.

### Workflow phê duyệt

```
DRAFT → SUBMITTED (khóa chỉnh sửa) → APPROVED
                ↑_________revert_________|
         APPROVED → SUBMITTED (unapprove) → DRAFT
```

### Snapshot pattern — QUAN TRỌNG

`PlanLineItem` và `ActualLineItem` **lưu sẵn giá trị tính toán** tại thời điểm tạo.
**KHÔNG tính lại on-the-fly** vì giá NVL/tỷ giá thay đổi hàng tháng.
Sau mọi thay đổi KH/TH → gọi `refreshSummarySnapshot(factoryId, yearMonth, type)`.

### FixedCostEntry — Validate bắt buộc

```typescript
// Phải có đúng 1 trong 2, không được cả hai null hoặc cả hai có giá trị
if (!monthlyPlanId && !monthlyActualId) throw Error("Phải thuộc KH hoặc TH");
if (monthlyPlanId && monthlyActualId)
  throw Error("Không thể thuộc cả KH và TH");
```

### 14 loại chi phí cố định (FixedCostType enum)

`TIEN_LUONG · TRICH_TRUOC_LUONG · TIEN_AN_CA · BHXH_YT_TN_KPCD · TIEN_DIEN · KHAU_HAO · ONG_CONE_BAO_PP · CHI_PHI_VAT_LIEU · CHI_PHI_QUAN_LY · LAI_VAY_VCD · LAI_VAY_VLD · LO_CHENH_LECH_TY_GIA · DOANH_THU_HDTC · KHAC`

### Dòng Dự phòng (DP)

- `isDP = true` → `salesOrderItemId = null` (không gắn HĐ)
- Nhận diện bằng `salesOrderItemId IS NULL`, không có field riêng trong DB

---

## MODULE 6: ORDER TRACKING (Theo dõi Đơn hàng)

### Allocation Engine — Waterfall theo deadline

```
Mỗi lần công nhân nhập sản lượng → runAllocation(factoryId, date) tự gọi (non-blocking)

Thứ tự ưu tiên phân bổ:
1. Deadline sớm nhất trước
2. Cùng deadline: ưu tiên HĐ còn ít qty hơn (dễ hoàn thành trước)
```

**Idempotent:** Trước khi phân bổ lại ngày D → undo hết allocations cũ của ngày D.

### Auto status

| Điều kiện                              | Status chuyển thành                      |
| -------------------------------------- | ---------------------------------------- |
| Tất cả items ≥ plannedQty              | `DONE` + `completedDate = now()`         |
| `deliveryDate < now()` + status ACTIVE | `OVERDUE`                                |
| Cancel                                 | Không xóa OrderAllocation (giữ để audit) |

### isAtRisk logic

```typescript
isAtRisk = estimatedDoneDate !== null && estimatedDoneDate > deliveryDate;
// null estimatedDoneDate (thiếu benchmark) → false (không flag nhầm)
```

---

## MODULE 7: PRODUCTIVITY BENCHMARK

### 2 loại công thức (`speedUnit`)

| speedUnit | Dùng cho        | Công thức                                               |
| --------- | --------------- | ------------------------------------------------------- |
| `rpm`     | Máy sợi con/thô | `NS = speed × 480 / (twist × Nm × 1000) × spindleCount` |
| `mpm`     | Máy ghép/ống    | `NS = speed × 480 / (Nm × 1000) × headCount`            |

`stdOutputPerShift = theoreticalOutput × efficiency` — **backend tự tính**, không tin số frontend.

### Version management

- Phiên bản `isActive=true` → không sửa/xóa benchmark, phải `clone` trước
- Activate mới → dùng `$transaction` để deactivate tất cả phiên bản cũ cùng nhà máy (atomic)
