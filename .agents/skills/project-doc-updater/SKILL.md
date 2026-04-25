---
name: project-doc-updater
description: "Automatically update BUSINESS_LOGIC_CONTEXT.md after developing a new feature. Use this skill whenever a new feature, module, or significant change has been completed in the project. Triggers include: finishing code for a new page/module, adding new database tables, creating new API routes, or any time the developer says 'done', 'finished', 'completed', 'xong roi', 'hoan thanh', or asks to update project documentation. Also trigger when the conversation involves wrapping up a feature development session. This skill ensures the project overview stays current and accurate as the codebase evolves."
---

# Project Documentation Updater

## Purpose

After completing development of a new feature or module, automatically update the `BUSINESS_LOGIC_CONTEXT.md` file to keep project documentation in sync with the actual codebase.

## When to Use

- A new feature/module has been coded and tested
- New database tables/models were added
- New API routes were created
- New pages/components were added
- Significant changes to existing features
- Developer indicates work is complete ("done", "xong", "hoàn thành", etc.)

## Workflow

### Step 1: Identify What Changed

Review the current conversation to extract:

- **Feature name**: What was built?
- **New files created**: Pages, API routes, components
- **Database changes**: New models/tables, modified schemas
- **Business logic**: Key rules, formulas, workflows
- **Dependencies**: New packages installed
- **Menu/Navigation changes**: New sidebar items, routes

### Step 2: Read Current BUSINESS_LOGIC_CONTEXT.md

```bash
cat BUSINESS_LOGIC_CONTEXT.md
```

Understand the existing structure and format to maintain consistency.

### Step 3: Determine Update Section

Based on the feature, decide where to add/update in the document:

- **New module** → Add a new section under "## Completed Modules" or equivalent
- **Enhancement to existing module** → Update the relevant existing section
- **Database change** → Update the "Database Schema" section
- **New dependency** → Update the "Tech Stack" or "Dependencies" section
- **Bug fix** → Update "Known Issues" section (remove fixed items)
- **Pending/In-progress** → Update "In Development" section

### Step 4: Write the Update

Format the new entry consistently with existing entries. Include:

```markdown
### [Module Number]. [Feature Name]

**Files:**

- `path/to/page.tsx` — Description
- `path/to/api/route.ts` — Description

**Key Features:**

- Feature point 1
- Feature point 2

**Business Logic:**

- Important rule or formula

**Access Control:** Who can use this feature

**Status:** ✅ Completed / 🔄 In Progress
```

### Step 5: Apply the Update

Use file editing tools to add the new section to BUSINESS_LOGIC_CONTEXT.md at the appropriate location. Do NOT rewrite the entire file — only add/modify the relevant sections.

### Step 6: Confirm with Developer

After updating, briefly summarize what was added:

- "Da cap nhat BUSINESS_LOGIC_CONTEXT.md:"
- List the sections that were added/modified
- Note any sections that may need manual review

## Rules

1. **Never delete existing content** unless explicitly asked
2. **Maintain the existing format** — match headers, indentation, and style
3. **Be concise** — document what was built, not how the conversation went
4. **Include file paths** — always note where new files live
5. **Note access control** — who can use the feature (Admin, Manager, Operator, etc.)
6. **Update status markers** — move items from "Pending" to "Completed" when done
7. **Timestamp** — add or update the "Last Updated" date at the bottom
8. **Vietnamese-friendly** — if the existing doc uses Vietnamese, continue in Vietnamese; if English, continue in English; if mixed, follow the dominant pattern

## Example Update

If a QR Code feature was just completed, the update might look like:

```markdown
### 11. QR Code - Nhập liệu nhanh

**Files:**

- `src/app/machines/qr-machines/page.tsx` — Trang quản lý & in QR Code
- `src/app/production/quick-input/page.tsx` — Trang nhập liệu nhanh (mobile)
- `src/app/production/mobile-input/page.tsx` — Trang nhập liệu mobile đầy đủ

**Key Features:**

- In QR Code hàng loạt cho từng máy, dán lên máy
- Quét QR → nhảy thẳng vào form nhập liệu đúng máy
- Giao diện tối ưu mobile (font lớn, nút to)
- Hỗ trợ "Lưu & Tiếp" chuyển máy tự động
- Tự detect ca/ngày theo giờ hiện tại

**Access Control:** Tất cả user đã đăng nhập
**Status:** ✅ Completed
```
