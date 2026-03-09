---
name: deploy-checklist
description: "Run a pre-deployment checklist before pushing code to the production server. Use this skill whenever the developer is about to deploy, push to production, or update the server. Triggers include: 'deploy', 'đẩy lên server', 'cập nhật máy chủ', 'push production', 'lên server', 'build production', 'pm2 restart', or when the developer mentions updating the live application."
---

# Deploy Checklist

## Purpose
Verify everything is ready before deploying to the production server. Prevent common deployment failures and data loss.

## Pre-Deploy Checklist

Run through this checklist and report status for each item:

### 1. Code Quality ✅/❌
```bash
# Check for TypeScript errors
npx tsc --noEmit
```
- [ ] No TypeScript compilation errors
- [ ] No `console.log` debug statements left in code
- [ ] No hardcoded `localhost` URLs (should use relative paths or env vars)
- [ ] No commented-out code blocks that should be removed

### 2. Environment Variables ✅/❌
Check `.env` or `.env.example` for any NEW variables added:
- [ ] All new env vars documented
- [ ] Server `.env` file has all required variables
- [ ] `NEXTAUTH_URL` matches production domain
- [ ] `AUTH_TRUST_HOST=true` is set (required for Cloudflare Tunnel)
- [ ] `DATABASE_URL` points to correct database

### 3. Database Schema ✅/❌
```bash
# Check for pending migrations
npx prisma migrate status
```
- [ ] All schema changes have migrations created (`npx prisma migrate dev`)
- [ ] Migration files are committed to git
- [ ] No destructive changes without data backup (dropping tables/columns)
- [ ] New models have proper relations and indexes
- [ ] Seed data updated if needed

### 4. Dependencies ✅/❌
```bash
# Check for new packages
git diff HEAD~1 package.json
```
- [ ] New packages are in `dependencies` (not just `devDependencies`) if needed at runtime
- [ ] `package-lock.json` is committed
- [ ] No packages with known security vulnerabilities (`npm audit`)

### 5. Build Test ✅/❌
```bash
npm run build
```
- [ ] Build completes without errors
- [ ] No "Dynamic server usage" warnings for pages that should be static
- [ ] Build size is reasonable (no accidentally bundled large files)

### 6. Git Status ✅/❌
```bash
git status
git log --oneline -5
```
- [ ] All changes committed
- [ ] Commit messages are clear and follow convention
- [ ] No untracked files that should be committed
- [ ] `.gitignore` includes: `node_modules`, `.env`, `ecosystem.config.js`, `.next`

## Deploy Commands
After all checks pass, provide the exact commands for the server:

```powershell
# On the production server (PowerShell):

# 1. Pull latest code
cd D:\PHUBAI-ERP\phubai-products
git pull

# 2. Install new dependencies (if any)
npm install

# 3. Run database migrations (if schema changed)
npx prisma migrate deploy

# 4. Build
npm run build

# 5. Restart application
pm2 restart phubai-erp

# 6. Verify
pm2 list
# Check: status = "online", no restart loops

# 7. Quick smoke test
# Open https://phubaierp.site in browser
# Login and test the new feature
```

## Post-Deploy Verification
- [ ] Application is running (`pm2 list` shows "online")
- [ ] Website is accessible via `https://phubaierp.site`
- [ ] Login works
- [ ] New feature works as expected
- [ ] Existing features not broken (quick test of daily-input, history)
- [ ] Cloudflare Tunnel status is "Healthy"

## Rollback Plan
If something goes wrong:
```powershell
# Revert to previous commit
git log --oneline -5    # Find the commit to revert to
git checkout <commit-hash> -- .
npm run build
pm2 restart phubai-erp

# If database migration caused issues
# Restore from latest backup (check /admin/backup page)
```

## Output Format
Report as a checklist:

```
🚀 Deploy Checklist for [feature name]:

✅ Code Quality — No errors found
✅ Environment — No new env vars needed
⚠️ Database — 1 new migration needs to run
✅ Dependencies — 1 new package (qrcode.react)
✅ Build — Successful
✅ Git — All committed, ready to push

📋 Server commands:
git pull → npm install → npx prisma migrate deploy → npm run build → pm2 restart phubai-erp
```
