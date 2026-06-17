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

---

## 11. Gotcha đã gặp — KHÔNG được lặp lại

### ⚠️ Ant Design InputNumber: formatter PHẢI đi kèm parser

**Lỗi:** Gõ số lớn (VD: `40000`) → InputNumber nhảy về `4`.

**Nguyên nhân:** `formatter` format `40000` thành `"40,000"`. Khi gõ thêm `0` → chuỗi thành
`"40,0000"`. Ant Design parse ngược lại bằng `parseInt("40,0000")` = `40`. Nếu không có
`parser`, component không biết cách đọc chuỗi đã format.

**Rule bất biến:** Mọi `InputNumber` có `formatter` BẮT BUỘC phải có `parser` đi kèm.

```tsx
// ✅ ĐÚNG
<InputNumber
  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
  parser={(v) => Number(v?.replace(/,/g, "") || 0) as any}
/>

// ❌ SAI — parser thiếu → gõ số lớn bị nhảy về số nhỏ
<InputNumber
  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
/>
```

**Note TypeScript:** TS đôi khi infer `InputNumber<0>` từ `min={0}` → parser bị ép kiểu trả về
`0`. Fix: thêm `as any` vào cuối parser return value.

**Files đã fix (2026-05-26):**
- `src/app/kdsx/monthly-quotas/page.tsx` — 2 InputNumber quota
- `src/components/kdsx/ScheduleSegmentModal.tsx` — InputNumber kgPerDay

### ⚠️ Shadow DB hỏng → KHÔNG dùng được `prisma migrate dev`

**Lỗi:** `prisma migrate dev` báo P3006 — migration cũ `20260520000002_fix_fixed_cost_not_null`
fail trên shadow database (`column fce.factoryId does not exist`). Shadow DB build lại
TẤT CẢ migration từ đầu nên 1 migration cũ lỗi là chặn toàn bộ.

**Cách xử lý (đã dùng 2026-05-30):**
1. Sửa `schema.prisma` như bình thường.
2. Tạo thủ công folder `prisma/migrations/<timestamp>_<name>/migration.sql` (timestamp > migration mới nhất).
3. Viết SQL bằng tay (dùng `IF EXISTS`/`IF NOT EXISTS` cho an toàn).
4. `npx prisma migrate deploy` (KHÔNG dùng shadow DB → chạy được) rồi `npx prisma generate`.

**Lưu ý:** `npx prisma db execute --file x.sql` chỉ chạy lệnh, KHÔNG in kết quả SELECT.

### Revenue source process cho may danh ong (2026-06-17)

Khi can tach doanh thu danh ong theo nguon soi:
- `Process.revenueFactoryId` la factory doanh thu quy uoc cua nguon soi.
- `Machine.currentSourceProcessId` la cau hinh hien tai/sticky tren may danh ong.
- `ProductionLog.sourceProcessId` la snapshot khi TAO log moi. Khi doi `Machine.currentSourceProcessId`, KHONG backfill va KHONG ghi de log cu.
- Revenue v2 group theo `sourceProcess.revenueFactoryId`; log cu `sourceProcessId=null` fallback theo `machine.process.factoryId`.

### ⚠️ Partial unique index — Prisma chưa hỗ trợ trong schema

Khi cần unique có điều kiện (VD: unique theo lô CHỈ KHI lotId IS NOT NULL), KHÔNG khai báo
`@@unique` trong schema (Prisma không có partial index). Thay vào đó:
- Bỏ `@@unique` khỏi model (để comment giải thích).
- Tạo `CREATE UNIQUE INDEX ... WHERE ...` thủ công trong migration.sql.
- API KHÔNG dùng được `upsert` (composite key không còn) → đổi sang `findFirst` + `update/create`.

ProductionLog & MachineItemAssignment đã chuyển sang pattern này (migration
`20260530000001_shift_item_change_multi_lot`).
