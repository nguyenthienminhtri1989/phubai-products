---
name: api-test-generator
description: "Generate test scripts for API routes after creating or modifying them. Use this skill whenever a new API route is created, an existing route is modified, or the developer wants to test endpoints. Triggers include: creating files in src/app/api/, phrases like 'test this API', 'test endpoint', 'tạo test', 'kiểm tra API', 'chạy thử API'. Also trigger when an API route has just been completed and the developer wants to verify it works correctly."
---

# API Test Generator

## Purpose
After creating or modifying an API route, generate practical test scripts to verify the endpoint works correctly, handles errors gracefully, and enforces access control.

## Workflow

### Step 1: Analyze the API Route
Read the route file and extract:
- HTTP methods supported (GET, POST, PUT, DELETE)
- URL path and query parameters
- Request body schema (for POST/PUT)
- Authentication requirements
- Authorization rules (role, processId checks)
- Response format (success and error cases)
- Database operations involved

### Step 2: Generate Test Script
Create a shell script with curl commands organized by test category.

### Test Categories

#### A. Happy Path (chạy đúng)
- Valid request with all required fields
- Valid request with optional fields
- Verify response status code and body structure

#### B. Authentication (chưa đăng nhập)
- Request without auth cookie/token → expect 401
- Request with expired session → expect 401

#### C. Authorization (không đủ quyền)
- Operator trying admin-only action → expect 403
- User accessing another process's data → expect 403

#### D. Validation (dữ liệu sai)
- Missing required fields → expect 400
- Invalid data types (string where number expected) → expect 400
- Out-of-range values → expect 400

#### E. Edge Cases
- Empty body on POST → expect 400
- Non-existent ID on GET/PUT/DELETE → expect 404
- Duplicate unique constraint → expect appropriate error

### Step 3: Output Format

Generate a `.sh` file:

```bash
#!/bin/bash
# Test: [API Route Name]
# File: src/app/api/[path]/route.ts
# Generated: [date]

BASE_URL="http://localhost:3001"
# Thay cookie session thuc te vao day:
AUTH_COOKIE="next-auth.session-token=YOUR_SESSION_TOKEN"

echo "================================"
echo "Testing: [Route Name]"
echo "================================"

# --- Happy Path ---
echo ""
echo "1. [Test description]"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X POST "$BASE_URL/api/path" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d '{"field": "value"}'

echo ""
echo "---"

# --- Auth Test ---
echo ""
echo "2. No auth - expect 401"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X GET "$BASE_URL/api/path"

# ... more tests
```

Also generate a brief summary:

```
📋 Test Summary for [Route]:
- Total tests: X
- Happy path: X tests
- Auth/authz: X tests
- Validation: X tests
- Edge cases: X tests

🔧 How to run:
1. Start the app: npm run dev
2. Login in browser, copy session cookie
3. Paste cookie into the script
4. Run: bash test-[route-name].sh
```

## Rules
- Always test authentication (no cookie → 401)
- Always test authorization if route has role checks
- Test with realistic data matching the project's domain (machine IDs, shift values, dates)
- Use Vietnamese field names/values where the project does
- Include comments explaining what each test verifies
- Keep tests runnable with just curl (no extra dependencies)
- Save test file to `tests/` directory in the project
