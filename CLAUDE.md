# STANDING INSTRUCTION — Update BUSINESS_LOGIC_CONTEXT.md after every feature

## Context Files

Đọc AGENT*CONTEXT/00_QUICK_START.md trước khi bắt đầu bất kỳ task nào.
Đọc PLANS/PLAN*[feature].md cho task cụ thể đang được giao.

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
- Luôn bổ sung thêm trang vừa được tạo mới vào trang phân quyền src\app\admin\permissions\page.tsx

## 4.1 Phân quyền theo Department (bổ sung)

- `department`: FACTORY | MANAGEMENT | SALES | ACCOUNTING | WAREHOUSE
- `extraModules`: String[] — module được xem thêm ngoài quyền mặc định
- Logic check: xem `src/lib/permissions.ts` → hàm `canViewModule()`
- ADMIN bypass tất cả, không cần check department

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

## 7. Quy trình Migration an toàn

1. `npx prisma migrate status` — kiểm tra trước
2. Nếu có drift → DỪNG, báo người dùng, không tự xử lý
3. `npx prisma migrate dev --name xxx --create-only` — tạo file
4. Nếu hỏi "reset? All data will be lost" → gõ N ngay, báo người dùng
5. `npx prisma migrate deploy` — apply
6. `npx prisma generate` — regenerate client

## 8. Context Files — Đọc trước khi code

- `AGENT_CONTEXT/00_QUICK_START.md` — tổng quan nhanh
- `AGENT_CONTEXT/01_BUSINESS_LOGIC.md` — nghiệp vụ chi tiết
- `AGENT_CONTEXT/02_ARCHITECTURE.md` — schema, API patterns
- `AGENT_CONTEXT/03_CODING_RULES.md` — anti-patterns, checklist
- `PLANS/PLAN_[feature].md` — task đang được giao

Đọc **toàn bộ prompt** trước khi bắt đầu code. Không bỏ qua phần checklist.

## Xem thêm

Đọc `AI_RULES.md` để biết toàn bộ conventions, phân quyền và quy trình migration.

---

## 9. Duy trì bộ nhớ dài hạn — BẮT BUỘC

Dự án này dùng Claude.ai (chat) để thiết kế spec và Claude Code để thực thi.
Để Claude.ai không phải hỏi lại từ đầu mỗi session, sau khi hoàn thành
BẤT KỲ task nào, Claude Code PHẢI cập nhật đủ 3 file sau:

### File 1: BUSINESS_LOGIC_CONTEXT.md

Append theo format đã có ở mục 5. Bắt buộc, không skip.

### File 2: PROJECT_PASSPORT.md

Cập nhật các mục sau nếu có thay đổi:

- "Modules đã hoàn thành" — thêm tính năng mới
- Schema chính — thêm model/field mới
- "File quan trọng trong project" — thêm file mới tạo
- "Còn thiếu / Chưa implement" — xóa item đã làm xong
- "Known Limitations" — thêm giới hạn mới nếu có

### File 3: CLAUDE.md (chính file này)

Cập nhật nếu có:

- Convention mới phát sinh
- Gotcha / lỗi đã gặp cần tránh lặp lại
- Pattern mới được thiết lập

### Thứ tự đọc khi bắt đầu session mới:

1. CLAUDE.md (file này) — conventions & rules
2. PROJECT_PASSPORT.md — hiện trạng tổng thể dự án
3. PLANS/PLAN\_[feature].md — task cụ thể đang được giao
4. Các file source liên quan đến task

---

## 10. Workflow phối hợp Claude.ai ↔ Claude Code

- **Claude.ai (chat):** nhận mô tả nghiệp vụ → thiết kế spec → tạo file PLANS/PLAN\_[feature].md
- **Claude Code:** đọc PLAN file → đọc source thực tế → thực thi → cập nhật 3 file bộ nhớ

Claude Code KHÔNG tự thiết kế lại spec đã có trong PLAN file.
Claude Code KHÔNG bỏ qua bước cập nhật bộ nhớ dù task nhỏ hay lớn.
