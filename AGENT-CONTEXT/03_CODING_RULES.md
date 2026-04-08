# ⚠️ CODING RULES — Phu Bai ERP

> Đây là danh sách các lỗi thường gặp và anti-patterns cần tránh tuyệt đối.
> Đọc kỹ trước khi viết bất kỳ dòng code nào.

---

## ❌ TUYỆT ĐỐI KHÔNG làm

### Schema & Database

```
❌ Xóa hoặc đổi tên field/model đã có
❌ Đổi kiểu dữ liệu field đang tồn tại (VD: Int → String)
❌ Thay đổi unique constraint của ProductionLog
❌ Dùng DateTime cho yearMonth (phải là String "YYYY-MM")
❌ Dùng cuid()/uuid() cho ID (phải là Int autoincrement)
❌ DROP COLUMN trong migration
❌ Tạo model mới mà không cần migration file
```

### Business Logic

```
❌ Tính toán sản lượng/chi phí/benchmark ở frontend
❌ Tính durationMinutes ở client (phải tính server-side)
❌ Tính lại PlanLineItem/ActualLineItem on-the-fly (phải dùng snapshot đã lưu)
❌ Để runAllocation() block response của daily-input (phải non-blocking)
❌ Xóa/tắt danh mục dừng máy có isDefault=true
❌ Cho phép APPROVED MonthlyPlan chỉnh sửa line items trực tiếp
❌ Flag isAtRisk=true khi estimatedDoneDate là null
```

### API & Auth

```
❌ Thiếu getServerSession() ở đầu route handler
❌ Cho phép User xóa máy (chỉ Admin)
❌ Cho phép User nhập liệu cho process khác
❌ Trả về toàn bộ object Prisma mà không select (lộ thông tin nhạy cảm)
❌ Throw exception không được catch trong route handler
❌ Dùng axios/fetch phía server (dùng Prisma trực tiếp)
```

### UI

```
❌ Hiển thị progress bar > 100% (phải Math.min(100, pct))
❌ Dùng <form> HTML trong React component (dùng onClick handler)
❌ Import Recharts ở server component (phải next/dynamic)
❌ Hard-code factoryId, processId, machineId
```

---

## ✅ PHẢI làm

### Mỗi khi thêm field optional vào model cũ

```typescript
// Prisma: phải có default hoặc là optional (?)
newField  String?              // nullable
newField  Int     @default(0)  // có default
// → Tạo migration ALTER TABLE ADD COLUMN
```

### Mỗi khi thay đổi KH/TH trong KD-SX

```typescript
// Sau khi tạo/update MonthlyPlan hoặc MonthlyActual
await refreshSummarySnapshot(factoryId, yearMonth, type);
```

### Mỗi khi tạo allocation cho đơn hàng mới

```typescript
// Chạy non-blocking, không await ở daily-input route
runAllocation(factoryId, date).catch(console.error);
```

### Khi validate FixedCostEntry

```typescript
if (!monthlyPlanId && !monthlyActualId)
  throw new Error("Phải thuộc KH hoặc TH");
if (monthlyPlanId && monthlyActualId)
  throw new Error("Không thể thuộc cả KH và TH");
```

### Khi lấy định mức NVL

```typescript
// Luôn dùng effectiveFrom/effectiveTo để lấy đúng tháng
// Không lấy rate mới nhất rồi áp cho mọi thời điểm
```

---

## Checklist trước khi hoàn thành task

- [ ] Không sửa/xóa logic cũ nào không được PLAN đề cập
- [ ] Có migration file nếu thay đổi schema
- [ ] API route có `auth()` (import từ `@/lib/auth`) và kiểm tra permission
- [ ] Tính toán nằm ở backend, không ở frontend
- [ ] Gọi `refreshSummarySnapshot()` nếu thay đổi KH/TH
- [ ] TypeScript không có lỗi (`strict: true`)
- [ ] Không có `any` type không có lý do
- [ ] Response format đúng `{ data: ... }` hoặc `{ error: ... }`
- [ ] Không hard-code giá trị business (factoryId, processId, tỷ giá...)
- [ ] Sidebar menu đã được cập nhật nếu thêm page mới
- [ ] **Đã append vào `BUSINESS_LOGIC_CONTEXT.md`** theo đúng format trong `CLAUDE.md` ← BẮT BUỘC, không bỏ qua

---

## Lỗi hay gặp & cách fix

| Lỗi                        | Nguyên nhân                 | Fix                                                |
| -------------------------- | --------------------------- | -------------------------------------------------- |
| `prisma migrate dev` fails | Môi trường non-interactive  | Dùng `prisma migrate deploy`                       |
| `yearMonth` sai timezone   | Dùng `new Date()` trực tiếp | Dùng string "YYYY-MM" từ input                     |
| Allocation bị chạy 2 lần   | Không có idempotent check   | Undo allocations cũ trước khi phân bổ lại          |
| APPROVED plan bị sửa       | Thiếu kiểm tra status       | Guard: `if (plan.status === 'APPROVED') throw ...` |
| Progress > 100%            | Không cap                   | `Math.min(100, allocatedQty / plannedQty * 100)`   |
| isAtRisk sai               | Flag khi null               | `isAtRisk = est !== null && est > deadline`        |
