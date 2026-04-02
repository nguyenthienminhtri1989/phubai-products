# STANDING INSTRUCTION — Update BUSINESS_LOGIC_CONTEXT.md after every feature

After completing ANY feature, API route, schema change, or UI page,
you MUST append a summary to the bottom of `BUSINESS_LOGIC_CONTEXT.md`
using EXACTLY this format:

---

## [MODULE NAME] — [Feature name]

**Status:** ✅ Completed [YYYY-MM-DD]

### What was built

[1–3 sentences describing what was actually implemented]

### Files created/modified

```
src/app/api/[path]/route.ts        — [what it does]
src/app/(erp)/[path]/page.tsx      — [what it shows]
src/components/[name].tsx          — [what it does]
prisma/migrations/[name]/          — [schema changes if any]
```

### Key business logic implemented

- [Most important rule or formula coded — e.g. "FixedCostEntry validates planId XOR actualId"]
- [Any edge case handled — e.g. "DOANH_THU_HDTC is added not subtracted from profit"]
- [Any constraint enforced — e.g. "APPROVED plans cannot be deleted"]

### API endpoints

| Method | Path     | Description |
| ------ | -------- | ----------- |
| GET    | /api/... | ...         |
| POST   | /api/... | ...         |

### Known limitations / not yet implemented

- [Anything explicitly left out or deferred]

### Data notes

- [Any seed data created, default values, or important field formats]

---

This update is MANDATORY. Do not skip it even for small changes.
The goal: when Claude.ai reads this file, it knows exactly what code exists
and can write accurate prompts for the next feature without guessing.

# CLAUDE.md — Phu Bai ERP

Đọc file này TRƯỚC KHI làm bất cứ điều gì.
Sau đó đọc `BUSINESS_LOGIC_CONTEXT.md` để hiểu nghiệp vụ chi tiết.

---

## 1. Thông tin dự án

- **Tên:** Phần mềm quản lý sản xuất ERP Sợi Phú Bài
- **Stack:** Next.js (App Router), PostgreSQL + Prisma ORM, Ant Design, NextAuth.js v5
- **Thư mục nguồn:** `src/`
- **Database:** xem `prisma/schema.prisma`

---

## 2. Nguyên tắc bất biến (KHÔNG được vi phạm)

1. **Strictly additive** — không xóa, không đổi tên field/model/table đã có. Chỉ thêm mới.
2. **Backend là nguồn chân lý** — mọi tính toán logic đặt ở API route, không để frontend tự tính rồi gửi lên.
3. **Không hard-code nghiệp vụ** — công thức phụ thuộc config (`formulaType`, `spindleCount`...), không fix cứng cho từng tên máy.
4. **Unique constraint `production_logs`** hiện tại là `(machineId, recordDate, shift, itemId)` — không được thay đổi.
5. **Không tự suy diễn nghiệp vụ** — nếu không chắc, hỏi lại hoặc đọc `BUSINESS_LOGIC_CONTEXT.md`.

---

## 3. Conventions code

- **Auth:** dùng `auth()` từ NextAuth ở đầu mọi API route
- **Error response:** `NextResponse.json({ error: '...' }, { status: 4xx })`
- **Prisma:** import từ `@/lib/prisma`
- **Số tiền:** lưu VNĐ (Float), hiển thị format `tỷ đồng` với 3 chữ số thập phân
- **yearMonth:** luôn là String `"YYYY-MM"`, validate bằng `/^\d{4}-\d{2}$/`
- **Ngày tháng:** dùng `@db.Date` cho các trường chỉ cần ngày, không dùng DateTime

---

## 4. Phân quyền

- `ADMIN` — toàn quyền, không bị giới hạn dữ liệu
- `USER` (Manager/Operator) — chỉ truy cập data trong `processId` của mình
- Mọi API route phải kiểm tra session và role trước khi xử lý

---

## 5. Sau khi hoàn thành mỗi tính năng — BẮT BUỘC

Sau khi hoàn thành BẤT KỲ tính năng nào (API, UI, schema, fix bug),
append ngay vào cuối `BUSINESS_LOGIC_CONTEXT.md` theo đúng format sau:

```
---

## [TÊN MODULE] — [Tên tính năng]

**Status:** ✅ Completed [YYYY-MM-DD]

### What was built
[1–3 câu mô tả những gì đã implement thực tế]

### Files created/modified
src/app/api/[path]/route.ts        — [làm gì]
src/app/(erp)/[path]/page.tsx      — [hiển thị gì]
src/components/[name].tsx          — [làm gì]
prisma/migrations/[name]/          — [thay đổi schema nếu có]

### Key business logic implemented
- [Quy tắc quan trọng nhất đã code — VD: "FixedCostEntry validate planId XOR actualId"]
- [Edge case đã xử lý]
- [Constraint đã enforce]

### API endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/... | ... |
| POST   | /api/... | ... |

### Known limitations
- [Những gì chưa làm hoặc để lại]
```

**Lý do:** Claude.ai (người viết prompt) đọc file này để hiểu đúng hiện trạng
code trước khi viết prompt cho tính năng tiếp theo. Nếu không cập nhật,
Claude.ai sẽ viết prompt trùng lặp hoặc sai với những gì đã implement.

---

## 6. Khi nhận prompt từ Claude.ai

Prompt từ Claude.ai thường có cấu trúc:

1. Bối cảnh & models liên quan
2. Nghiệp vụ cần hiểu
3. Schema/API cần tạo
4. UI cần xây dựng
5. Checklist trước khi code

Đọc **toàn bộ prompt** trước khi bắt đầu code. Không bỏ qua phần checklist.
