# AI_RULES.md — Phu Bai ERP

> Đọc file này TRƯỚC KHI làm bất cứ điều gì.
> Sau đó đọc `BUSINESS_LOGIC_CONTEXT.md` để hiểu nghiệp vụ chi tiết.
> Nếu có PLAN được giao → đọc `PLANS/PLAN_[tên].md`.

---

## 1. Dự án là gì?

Phần mềm ERP quản lý sản xuất sợi cho 3 nhà máy (NM1.2, NMG37, NM3).
**Stack:** Next.js App Router · PostgreSQL + Prisma ORM · Ant Design · NextAuth.js v5 · TypeScript strict.
**Thư mục nguồn:** `src/` · **Schema DB:** `prisma/schema.prisma`.

---

## 2. Nguyên tắc bất biến — VI PHẠM LÀ SAI HOÀN TOÀN

1. **Strictly additive** — KHÔNG xóa, KHÔNG đổi tên field/model/table đã có. Chỉ thêm mới.
2. **Backend là nguồn chân lý** — Mọi tính toán logic đặt ở API route. Frontend chỉ gửi raw input và render.
3. **Không hard-code nghiệp vụ** — Công thức phụ thuộc config (`formulaType`, `spindleCount`...), không fix cứng cho từng tên máy.
4. **Unique constraint `production_logs`** = `(machineId, recordDate, shift, itemId)` — KHÔNG thay đổi.
5. **Không tự suy diễn nghiệp vụ** — Nếu không chắc → dừng lại, hỏi người dùng.

---

## 3. Conventions code

| Mục              | Convention                                                    |
| ---------------- | ------------------------------------------------------------- |
| Auth             | `auth()` từ `@/lib/auth` — dùng ở đầu MỌI API route           |
| Error response   | `NextResponse.json({ error: '...' }, { status: 4xx })`        |
| Success response | `NextResponse.json({ data: result }, { status: 200 })`        |
| Prisma import    | `import prisma from '@/lib/prisma'`                           |
| Số tiền          | Lưu VNĐ (Float), hiển thị format tỷ đồng (3 chữ số thập phân) |
| yearMonth        | Luôn là String `"YYYY-MM"`, validate `/^\d{4}-\d{2}$/`        |
| Ngày             | `@db.Date` cho trường chỉ cần ngày                            |
| ID               | `Int @id @default(autoincrement())` — KHÔNG dùng cuid/uuid    |
| TypeScript       | Strict mode — không dùng `any` không có lý do                 |

---

## 4. Phân quyền

### 4.1 Role hệ thống

- `ADMIN` — toàn quyền, bypass mọi check
- `USER` — bị giới hạn theo department và processId

### 4.2 Department (bộ phận)

| Giá trị      | Bộ phận          | Module mặc định được xem                    |
| ------------ | ---------------- | ------------------------------------------- |
| `FACTORY`    | Nhà máy          | production, maintenance, energy, iot, stops |
| `MANAGEMENT` | Ban giám đốc     | Tất cả                                      |
| `SALES`      | Phòng kinh doanh | kdsx                                        |
| `ACCOUNTING` | Phòng kế toán    | kdsx, energy                                |
| `WAREHOUSE`  | Kho              | (chưa có module)                            |

### 4.3 Extra Modules

- `extraModules: String[]` — danh sách module được xem thêm ngoài mặc định của department
- Module keys: `production`, `maintenance`, `energy`, `iot`, `kdsx`, `benchmark`, `stops`
- Logic check tập trung tại `src/lib/permissions.ts` → hàm `canViewModule()`

### 4.4 Phạm vi dữ liệu (FACTORY)

- User FACTORY được gán vào 1+ `Process` qua bảng `UserProcess`
- Chỉ nhập liệu/sửa trong process của mình
- Chỉ xem (read-only) process khác

### 4.5 Pattern check quyền trong API route

```typescript
const session = await auth();
if (!session)
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const { role, department, extraModules } = session.user;
const isAdmin = role === "ADMIN";

// Check department (ví dụ cho module kdsx)
const canAccess =
  isAdmin ||
  ["MANAGEMENT", "SALES", "ACCOUNTING"].includes(department) ||
  extraModules.includes("kdsx");
if (!canAccess)
  return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
```

---

## 5. Quy trình Migration an toàn — ĐỌC KỸ TRƯỚC KHI MIGRATE

### Bước bắt buộc trước tiên

```bash
npx prisma migrate status
```

- `Database schema is up to date` → bình thường, tiếp tục.
- Có cảnh báo drift → **DỪNG NGAY, báo người dùng, không tự xử lý**.

### Tạo migration mới (môi trường bình thường)

```bash
# 1. Tạo file (chưa apply)
npx prisma migrate dev --name ten_migration --create-only

# 2. Kiểm tra file SQL được sinh ra — phải chỉ chứa thay đổi của task này
# 3. Apply
npx prisma migrate deploy

# 4. Regenerate client
npx prisma generate
```

### Nếu gặp drift + cần migrate gấp (chỉ dùng khi được người dùng cho phép)

```bash
# 1. Tạo thư mục migration
mkdir prisma/migrations/TIMESTAMP_ten_migration

# 2. Tạo file SQL thủ công (CHỈ chứa thay đổi cần thiết)
# 3. Apply SQL trực tiếp
npx prisma db execute --file prisma/migrations/TIMESTAMP_ten_migration/migration.sql --schema prisma/schema.prisma

# 4. Đánh dấu đã applied
npx prisma migrate resolve --applied "TIMESTAMP_ten_migration"

# 5. Regenerate
npx prisma generate
```

### Quy tắc tuyệt đối

- Nếu `migrate dev` hỏi **"reset? All data will be lost"** → gõ **N ngay**, báo người dùng
- KHÔNG thêm field `NOT NULL` không có `DEFAULT` vào bảng đang có data
- Migration chỉ chứa thay đổi của task hiện tại, không chứa drift cũ

---

## 6. Anti-patterns — KHÔNG làm

```
❌ Xóa/đổi tên field, model, table đã có
❌ Tính toán sản lượng/chi phí/benchmark ở frontend
❌ Tính durationMinutes (dừng máy) ở client
❌ Tính lại PlanLineItem/ActualLineItem on-the-fly (phải dùng snapshot)
❌ Để runAllocation() block response của daily-input
❌ Dùng DateTime cho yearMonth
❌ Dùng cuid/uuid cho ID
❌ Thiếu auth() ở đầu API route
❌ Cho User xóa máy (chỉ Admin)
❌ Progress bar > 100% (phải Math.min(100, pct))
❌ isAtRisk = true khi estimatedDoneDate là null
❌ Tự xử lý drift migration khi không được phép
❌ Dùng <form> HTML trong React (dùng onClick handler)
```

---

## 7. Helpers đã có — KHÔNG tự viết lại

| Helper                     | File                             | Dùng cho                    |
| -------------------------- | -------------------------------- | --------------------------- |
| `canViewModule()`          | `src/lib/permissions.ts`         | Check quyền xem module      |
| `calcTheoreticalOutput()`  | `src/utils/benchmark.ts`         | NS lý thuyết theo rpm/mpm   |
| `calculateLineItem()`      | `src/lib/kdsx/calculator.ts`     | Tính DT, CP NVL, LN         |
| `refreshSummarySnapshot()` | `src/lib/kdsx/calculator.ts`     | Cập nhật cache dashboard    |
| `runAllocation()`          | `src/lib/allocation-engine.ts`   | Phân bổ sản lượng vào HĐ    |
| `recalculateAllocation()`  | `src/lib/allocation-engine.ts`   | Tính lại phân bổ theo ngày  |
| `calcEstimatedDoneDate()`  | `src/lib/estimate-completion.ts` | Ước tính ngày hoàn thành HĐ |

---

## 8. Context files — Đọc khi cần hiểu sâu hơn

| Cần hiểu về                                    | Đọc file                             |
| ---------------------------------------------- | ------------------------------------ |
| Công thức sản lượng, ca làm việc, traceability | `AGENT_CONTEXT/01_BUSINESS_LOGIC.md` |
| Schema Prisma, API patterns, folder structure  | `AGENT_CONTEXT/02_ARCHITECTURE.md`   |
| Anti-patterns, checklist trước khi commit      | `AGENT_CONTEXT/03_CODING_RULES.md`   |
| Task đang được giao                            | `PLANS/PLAN_[tên-task].md`           |
| Toàn bộ lịch sử feature đã implement           | `BUSINESS_LOGIC_CONTEXT.md`          |

---

## 9. Sau khi hoàn thành bất kỳ task nào — BẮT BUỘC

Append vào cuối `BUSINESS_LOGIC_CONTEXT.md` theo đúng format:

```markdown
---

## [TÊN MODULE] — [Tên tính năng]

**Status:** ✅ Completed [YYYY-MM-DD]

### What was built

[1–3 câu mô tả những gì đã implement]

### Files created/modified

src/app/api/[path]/route.ts — [làm gì]
src/app/[path]/page.tsx — [hiển thị gì]
src/components/[name].tsx — [làm gì]
prisma/migrations/[name]/ — [thay đổi schema nếu có]

### Key business logic implemented

- [Quy tắc quan trọng nhất đã code]
- [Edge case đã xử lý]

### API endpoints

| Method | Path     | Description |
| ------ | -------- | ----------- |
| GET    | /api/... | ...         |

### Known limitations / not yet implemented

- [Những gì chưa làm]

### Data notes

- [Seed data, default values, format đặc biệt nếu có]
```

**Lý do bắt buộc:** File này là bộ nhớ duy nhất của hệ thống. AI ở phiên làm việc sau đọc file này để biết chính xác code đang có gì, tránh viết trùng hoặc xung đột.

---

## 10. Khi nhận PLAN từ người dùng

1. Đọc toàn bộ PLAN trước khi bắt đầu code
2. Làm đúng thứ tự trong PLAN, không tự thay đổi thứ tự
3. Gặp vấn đề ngoài PLAN → **dừng lại, mô tả vấn đề cho người dùng**, không tự improvise
4. Hoàn thành → append `BUSINESS_LOGIC_CONTEXT.md`
