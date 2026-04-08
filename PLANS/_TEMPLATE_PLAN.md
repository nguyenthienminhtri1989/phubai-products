# PLAN: [Tên tính năng]

> **Dành cho AI thực thi** — Đọc `AGENT_CONTEXT/00_QUICK_START.md` trước, sau đó làm đúng theo PLAN này.
> Không tự suy diễn thêm ngoài những gì được mô tả.

---

## 1. Mục tiêu nghiệp vụ

[Mô tả ngắn gọn: tính năng này giải quyết vấn đề gì cho ai]

---

## 2. Phạm vi thay đổi

### Schema Prisma (nếu có)

```prisma
// Chỉ ADD, không sửa/xóa

model NewModel {
  id        Int      @id @default(autoincrement())
  // ...
  @@map("new_model_table")
}

// Thêm vào model cũ (optional fields only)
// model ExistingModel {
//   newField  String?
// }
```

Migration file: `prisma/migrations/YYYYMMDDHHMMSS_description/migration.sql`

### Files cần TẠO MỚI

```
src/app/api/[module]/route.ts
src/app/[page]/page.tsx
src/components/[Component].tsx
src/lib/[helper].ts
```

### Files cần CHỈNH SỬA (chỉ thêm, không xóa logic cũ)

```
src/components/AdminLayout.tsx   — Thêm menu item
```

### Files KHÔNG ĐƯỢC đụng vào

```
src/app/api/production/daily-input/route.ts  — [lý do]
prisma/schema.prisma (các model X, Y, Z)     — [lý do]
```

---

## 3. API Routes cần tạo

### GET `/api/[module]`

- **Auth:** Cần session. User chỉ thấy data trong processId của mình, Admin thấy tất cả.
- **Query params:** `factoryId?`, `yearMonth?`, ...
- **Response:** `{ data: [...] }`
- **Logic:**
  1. ...
  2. ...

### POST `/api/[module]`

- **Auth:** Cần session + kiểm tra permission
- **Body:** `{ field1: string, field2: number, ... }`
- **Validation:**
  - `field1` không được rỗng
  - `field2` phải > 0
- **Response:** `{ data: newRecord }` (status 201)
- **Logic:**
  1. ...
  2. ...

---

## 4. Business Logic cần implement

```typescript
// Pseudocode — AI chuyển thành TypeScript thực tế

function calculateXxx(input: InputType): OutputType {
  // Bước 1: ...
  // Bước 2: ...
  // Bước 3: Gọi refreshSummarySnapshot() nếu liên quan KD-SX
}
```

**Lưu ý quan trọng:**

- [ ] Tính toán phải ở backend
- [ ] Gọi `refreshSummarySnapshot()` sau khi thay đổi KH/TH (nếu có)
- [ ] `runAllocation()` phải non-blocking (nếu liên quan đến ProductionLog)

---

## 5. UI Page (nếu có)

**Route:** `/path/to/page`
**Layout:** Có sidebar (AdminLayout) / Layout riêng (mobile)

### Các thành phần UI:

- Bảng hiển thị: cột A, cột B, cột C
- Form nhập liệu: field X, field Y
- Nút hành động: [Tạo mới], [Sửa], [Xóa] (Admin only)

### State & API calls:

```typescript
// Fetch khi load trang
GET /api/[module]?factoryId=xxx

// Khi submit form
POST /api/[module]
body: { ... }
```

---

## 6. Sidebar Menu (nếu thêm page mới)

```typescript
// Thêm vào src/components/AdminLayout.tsx
// Nhóm: [Tên nhóm menu]
{
  key: '/path/to/page',
  icon: <IconName />,
  label: 'Tên hiển thị',
}
```

---

## 7. Những gì KHÔNG làm trong task này

- Không sửa module A, B, C
- Không thay đổi unique constraint của ProductionLog
- Không thêm field bắt buộc (NOT NULL, no default) vào bảng đang có data
- [Thêm constraint cụ thể khác nếu cần]

---

## 8. Definition of Done

- [ ] Migration chạy được với `prisma migrate deploy`
- [ ] API trả về đúng format `{ data }` / `{ error }`
- [ ] Có `auth()` check ở mọi route handler
- [ ] UI hiển thị đúng, không có lỗi TypeScript
- [ ] Sidebar menu đã cập nhật (nếu có page mới)
- [ ] Không có logic cũ nào bị phá vỡ
- [ ] **Đã append vào `BUSINESS_LOGIC_CONTEXT.md`** theo đúng format trong CLAUDE.md (BẮT BUỘC)

---

## 9. Sau khi hoàn thành — Append vào BUSINESS_LOGIC_CONTEXT.md

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
