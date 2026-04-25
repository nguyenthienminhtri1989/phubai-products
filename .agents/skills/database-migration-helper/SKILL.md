---
name: database-migration-helper
description: "Safely manage database schema changes and migrations. Use this skill whenever the developer needs to add/modify database tables, change Prisma schema, run migrations, or anything related to database structure changes. Triggers include: editing schema.prisma, adding new models/fields, 'migrate', 'migration', 'thêm bảng', 'sửa schema', 'thêm cột', 'xóa cột', 'đổi tên', 'cập nhật database', 'prisma migrate'. ALWAYS use this skill before running any prisma migrate command to prevent data loss."
---

# Database Migration Helper

## Purpose
Safely guide database schema changes and migrations, preventing accidental data loss. This skill enforces strict safety rules depending on the environment (localhost vs production server).

## ⛔ ABSOLUTE RULES — NEVER VIOLATE

1. **NEVER suggest `prisma migrate reset` on production** — This deletes ALL data
2. **NEVER suggest `prisma migrate dev` on production** — This can prompt for reset
3. **NEVER suggest `prisma db push --force-reset`** — This drops and recreates all tables
4. **ALWAYS remind to backup before migration on production**
5. **ALWAYS warn when migration contains DROP, DELETE, or ALTER column rename**

## Environment Detection

Before any migration action, determine the environment:

### Localhost (development machine)
- Safe to use `prisma migrate dev`
- Data is test data, can be recreated
- OK to reset if needed
- This is where migrations are CREATED

### Production Server (máy chủ)
- ONLY use `prisma migrate deploy`
- Data is real, irreplaceable
- MUST backup before any migration
- This is where migrations are APPLIED

**Ask the developer if unclear:**
"Bạn đang chạy trên localhost hay máy chủ production?"

## Workflow

### Step 1: Analyze Schema Changes

Before creating a migration, review what changed in `schema.prisma`:

```bash
git diff prisma/schema.prisma
```

Classify changes by risk level:

#### 🟢 SAFE — No data risk
- Adding a new model (new table)
- Adding a new optional field (nullable column)
- Adding a new field with `@default()` value
- Adding new indexes
- Adding new relations (foreign keys to existing data)

#### 🟡 CAUTION — Possible data impact
- Adding a required field WITHOUT default → existing rows will fail
- Changing field type (Int → String, etc.)
- Adding `@unique` constraint → fails if duplicates exist
- Changing relation type (one-to-one ↔ one-to-many)

#### 🔴 DANGEROUS — Will lose data
- Removing a model (DROP TABLE)
- Removing a field (DROP COLUMN)
- Renaming a model or field (Prisma treats as DROP + CREATE)
- Changing `@@map` table name

### Step 2: Handle Dangerous Changes

#### Renaming a field (DO NOT let Prisma auto-handle):
```prisma
// WRONG: Prisma will DROP old column + CREATE new column = DATA LOST
// Before: fieldOld String
// After:  fieldNew String

// CORRECT: Use @map to rename at database level without losing data
model Example {
  fieldNew String @map("field_old")  // Keeps old column, new Prisma name
}
```

#### Renaming a model:
```prisma
// Use @@map to keep old table name
model NewModelName {
  // ... fields
  @@map("old_table_name")
}
```

#### Removing a field that has data:
1. First, create a backup of that column's data
2. Then proceed with migration
3. Verify backup is accessible before deleting

### Step 3: Create Migration (Localhost Only)

```bash
# 1. Review changes first
git diff prisma/schema.prisma

# 2. Create migration with descriptive name
npx prisma migrate dev --name describe_what_changed

# Examples of good migration names:
# --name add_production_line_tables
# --name add_current_ne_to_machine
# --name add_index_on_record_date
```

**If Prisma asks "Do you want to reset the database?":**
- On localhost with test data → OK to say Yes
- If you have important data on localhost → say No, investigate why

### Step 4: Review Generated Migration

After `migrate dev` creates the migration file, ALWAYS review it:

```bash
# Find the latest migration
ls -la prisma/migrations/

# Read the SQL
cat prisma/migrations/[latest_folder]/migration.sql
```

**Check for:**
- [ ] No unexpected `DROP TABLE` statements
- [ ] No unexpected `DROP COLUMN` statements  
- [ ] `ALTER TABLE ... ADD COLUMN` has correct defaults for required fields
- [ ] Foreign key constraints reference correct tables
- [ ] Indexes are created on frequently queried columns

### Step 5: Deploy to Production Server

**BEFORE running migration on server:**

```
⚠️  PRODUCTION MIGRATION CHECKLIST:

1. □ Backup database (vào /admin/backup hoặc dùng pg_dump)
2. □ Reviewed migration SQL (no DROP/DELETE)
3. □ Tested migration on localhost successfully
4. □ Migration file is committed to git
5. □ Server has pulled latest code (git pull)
```

**Backup commands:**

```bash
# Option 1: Via application (recommended)
# Go to https://phubaierp.site/admin/backup → Export

# Option 2: Via pg_dump (more complete)
pg_dump -U postgres -d phubai_erp -f backup_before_migration.sql

# Option 3: Quick backup of specific table
pg_dump -U postgres -d phubai_erp -t "table_name" -f table_backup.sql
```

**Then apply migration:**

```powershell
# On production server (PowerShell):
cd D:\path\to\project

# ONLY this command — never "migrate dev" on production
npx prisma migrate deploy
```

**If migration fails on production:**
```powershell
# 1. Check error message
# 2. Do NOT run "migrate dev" to fix it
# 3. Fix the issue in localhost first
# 4. Create a new corrective migration
# 5. Push to git, pull on server, try "migrate deploy" again

# If data is corrupted, restore backup:
psql -U postgres -d phubai_erp -f backup_before_migration.sql
```

### Step 6: Verify After Migration

```bash
# Check migration status
npx prisma migrate status

# Verify new tables/columns exist
npx prisma studio
# Or via psql:
# \dt (list tables)
# \d table_name (describe table)
```

### Step 7: Update Related Code

After schema changes, remind to update:
- [ ] Seed data (`prisma/seed.ts`) if new tables need initial data
- [ ] Backup/Restore API if new tables should be included in backups
- [ ] Type definitions if using manual interfaces alongside Prisma types
- [ ] API routes that query the changed models
- [ ] Frontend forms that display the changed fields

## Common Patterns

### Adding a new module (safest)
```prisma
// 1. Add new model
model NewFeature {
  id        Int      @id @default(autoincrement())
  name      String
  createdAt DateTime @default(now())
  
  @@map("new_features")
}

// 2. Add relation to existing model (optional field = safe)
model ExistingModel {
  // ... existing fields
  newFeatureId Int?
  newFeature   NewFeature? @relation(fields: [newFeatureId], references: [id])
}
```

### Adding a required field to existing table
```prisma
// WRONG — will fail if table has existing rows
model Machine {
  newField String  // Required, no default → ERROR
}

// CORRECT — add with default first, then optionally remove default later
model Machine {
  newField String @default("")  // Safe for existing rows
}
```

### Soft delete (instead of removing a model)
```prisma
// Instead of deleting the model entirely:
model OldFeature {
  // ... existing fields
  isArchived Boolean @default(false)  // Soft delete flag
}
```

## Output Format

Before any migration, report:

```
📋 Migration Analysis:

Schema changes detected:
  🟢 ADD TABLE: production_lines (safe)
  🟢 ADD TABLE: production_line_links (safe)
  🟢 ADD FIELD: Machine.linksFrom (relation, safe)
  🟢 ADD FIELD: Machine.linksTo (relation, safe)

Risk level: LOW ✅
No destructive changes detected.

Environment: [localhost / production]

Recommended commands:
  [localhost]  npx prisma migrate dev --name add_production_line_tables
  [production] ⚠️ Backup first! Then: npx prisma migrate deploy
```

For dangerous changes:

```
📋 Migration Analysis:

Schema changes detected:
  🟢 ADD FIELD: Machine.newField (with default, safe)
  🔴 DROP FIELD: Machine.oldField (DATA WILL BE LOST)
  🟡 ADD UNIQUE: Item.code (may fail if duplicates exist)

Risk level: HIGH ⚠️
Destructive changes detected!

⛔ Before proceeding:
1. Backup the 'machines' table data for column 'oldField'
2. Check for duplicate values in 'items.code'
3. Test on localhost first

Do you want to proceed? (backup first!)
```
