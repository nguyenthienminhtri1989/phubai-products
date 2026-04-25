---
name: auto-code-reviewer
description: "Automatically review code after writing or modifying files. Use this skill whenever new code has been written, a file has been created or edited, or the developer asks for a code review. Triggers include: completing a new component/page/API route, fixing a bug, refactoring code, or phrases like 'review this', 'check my code', 'kiểm tra code', 'xem lại code', 'có lỗi gì không'. Also trigger proactively when a significant code block has just been completed in the conversation."
---

# Auto Code Reviewer

## Purpose
Review code for bugs, security issues, performance problems, and best practices after writing or modifying files.

## Checklist

### 1. Security
- [ ] SQL Injection: Are all database queries parameterized? (Prisma handles this, but check raw queries)
- [ ] XSS: Is user input sanitized before rendering?
- [ ] Authentication: Are API routes protected with `auth()` check?
- [ ] Authorization: Are role/processId checks in place for restricted routes?
- [ ] Data exposure: Are sensitive fields excluded from API responses? (passwords, tokens)
- [ ] CSRF: Are state-changing operations using POST/PUT/DELETE (not GET)?

### 2. Error Handling
- [ ] Are all `fetch()` calls wrapped in try-catch?
- [ ] Are API routes returning proper error status codes (400, 401, 403, 404, 500)?
- [ ] Are database operations in try-catch blocks?
- [ ] Are user-facing error messages clear and non-technical?
- [ ] Are errors logged server-side with `console.error`?

### 3. TypeScript & Type Safety
- [ ] Are there any `as any` casts that could be replaced with proper types?
- [ ] Are function parameters typed?
- [ ] Are API response types defined?
- [ ] Are null/undefined cases handled (optional chaining, nullish coalescing)?

### 4. Performance
- [ ] Are database queries efficient? (avoid N+1, use `include` wisely)
- [ ] Are large lists paginated?
- [ ] Are there unnecessary re-renders? (missing useMemo, useCallback)
- [ ] Are API calls deduplicated? (no duplicate fetches in useEffect)

### 5. Business Logic
- [ ] Does the shift detection logic follow the rules? (Ca 1: 06-14, Ca 2: 14-22, Ca 3: 22-06)
- [ ] Are formula calculations correct for all 4 types?
- [ ] Are processId restrictions enforced for non-admin users?
- [ ] Are date/timezone issues handled? (using YYYY-MM-DD strings, not Date objects with timezone)

### 6. Code Quality
- [ ] Are component names descriptive?
- [ ] Are magic numbers replaced with constants?
- [ ] Is duplicated code extracted into shared functions?
- [ ] Are console.log statements removed from production code?
- [ ] Are imports organized and unused imports removed?

## Output Format
After reviewing, report findings grouped by severity:

```
🔴 CRITICAL (must fix before deploy):
- [file:line] Description of critical issue

🟡 WARNING (should fix soon):
- [file:line] Description of warning

🟢 SUGGESTION (nice to have):
- [file:line] Description of improvement

✅ PASSED: No critical issues found
```

## Rules
- Focus on the NEWLY WRITTEN code, not the entire codebase
- Always check security and error handling first
- Be specific: mention file name, line number, and exact issue
- Provide fix suggestions, not just complaints
- If the code is clean, say so briefly — don't invent issues
- Prioritize issues that could cause runtime errors or data loss
