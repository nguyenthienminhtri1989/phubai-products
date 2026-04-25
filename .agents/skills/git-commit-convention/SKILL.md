---
name: git-commit-convention
description: "Generate standardized git commit messages following Conventional Commits format. Use this skill whenever code changes need to be committed, the developer asks for a commit message, or a feature/fix has been completed. Triggers include: 'commit', 'git commit', 'commit message', 'đặt tên commit', 'ghi commit gì', or when wrapping up a coding session and changes need to be saved."
---

# Git Commit Convention

## Purpose
Generate clear, standardized commit messages that make git history easy to read and searchable.

## Format

```
<type>(<scope>): <short description>

<optional body - what and why>
```

## Types

| Type | When to use | Example |
|------|------------|---------|
| `feat` | New feature | `feat(qr-code): add QR code generation for machines` |
| `fix` | Bug fix | `fix(auth): fix session type conversion error` |
| `refactor` | Code restructure (no behavior change) | `refactor(api): extract shared validation logic` |
| `style` | UI/CSS changes only | `style(sidebar): update menu colors` |
| `perf` | Performance improvement | `perf(history): add server-side pagination` |
| `chore` | Config, build, dependencies | `chore: add qrcode.react package` |
| `docs` | Documentation only | `docs: update PROJECT_OVERVIEW.md` |
| `schema` | Database schema changes | `schema: add ProductionLine tables` |

## Scope
Use the module or feature name:
- `auth`, `production`, `energy`, `maintenance`, `machines`, `items`
- `qr-code`, `mobile-input`, `line-setup`, `backup`
- `api`, `ui`, `schema`, `config`

## Rules

1. **Short description**: Max 72 characters, lowercase, no period at end
2. **Imperative mood**: "add feature" not "added feature" or "adds feature"
3. **Body** (optional): Explain WHAT changed and WHY, not HOW
4. **One commit per logical change**: Don't mix unrelated changes
5. **Vietnamese OK in body**: Short description in English, body can be Vietnamese if needed

## Workflow

### Step 1: Analyze Changes
Look at what files were created/modified in the current session:
- New files → likely `feat`
- Modified existing logic → could be `fix`, `refactor`, or `feat`
- Only CSS/layout → `style`
- package.json/config → `chore`
- .prisma schema → `schema`

### Step 2: Group Related Changes
If multiple unrelated things changed, suggest separate commits:

```bash
# Commit 1: New feature
git add src/app/production/mobile-input/
git commit -m "feat(mobile-input): add mobile-optimized production input page"

# Commit 2: Menu update
git add src/components/AdminLayout.tsx
git commit -m "style(sidebar): add mobile-input menu item"

# Commit 3: Schema
git add prisma/schema.prisma
git commit -m "schema: add ProductionLine and ProductionLineLink tables"
```

### Step 3: Suggest Commands
Provide ready-to-copy git commands:

```bash
git add .
git commit -m "feat(qr-code): add QR code management and quick input pages

- QR code generation page for printing machine labels
- Mobile quick input page with auto shift detection
- Save & Next workflow for consecutive machine input"
```

## Multi-file Change Examples

```bash
# Adding a complete new module
"feat(line-setup): add production line routing module

- ProductionLine and ProductionLineLink database tables
- CRUD API for managing production lines
- Line setup page with multi-select machine linking
- SVG diagram page for visualizing production flow
- Auto-suggest machines based on current item assignment"

# Bug fix with specific detail
"fix(daily-input): fix negative output calculation when meter resets

Previously, resetting the meter without toggling isReset flag
would save negative output values to the database."

# Dependency + feature
"feat(qr-code): add QR code scanning for mobile input

- Install qrcode.react for client-side QR generation
- QR codes link to /production/mobile-input?machineId=X
- Support scanning mid-session to jump to specific machine"
```
