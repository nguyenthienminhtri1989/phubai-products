#!/bin/bash
# Test: Source process revenue workflow
# Files:
# - src/app/api/processes/source-options/route.ts
# - src/app/api/machines/[id]/route.ts
# - src/app/api/production/daily-input/route.ts
# Generated: 2026-06-17

BASE_URL="${BASE_URL:-http://localhost:3000}"
# Thay cookie session thuc te vao day:
AUTH_COOKIE="${AUTH_COOKIE:-next-auth.session-token=YOUR_SESSION_TOKEN}"

MACHINE_ID="${MACHINE_ID:-1}"
SOURCE_PROCESS_ID="${SOURCE_PROCESS_ID:-15}"
ITEM_ID="${ITEM_ID:-1}"
RECORD_DATE="${RECORD_DATE:-2026-06-17}"
SHIFT="${SHIFT:-1}"

echo "================================"
echo "Testing: Source process revenue"
echo "================================"

echo ""
echo "1. GET source options - expect 200 with configured processes"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X GET "$BASE_URL/api/processes/source-options" \
  -H "Cookie: $AUTH_COOKIE"

echo ""
echo "---"
echo "2. GET source options without auth - expect 401"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X GET "$BASE_URL/api/processes/source-options"

echo ""
echo "---"
echo "3. Partial update machine source - expect 200"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X PUT "$BASE_URL/api/machines/$MACHINE_ID" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d "{\"currentSourceProcessId\":$SOURCE_PROCESS_ID}"

echo ""
echo "---"
echo "4. Invalid source process - expect 400"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X PUT "$BASE_URL/api/machines/$MACHINE_ID" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d '{"currentSourceProcessId":999999}'

echo ""
echo "---"
echo "5. Save production log after source change - expect 200 and server snapshots sourceProcessId"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X POST "$BASE_URL/api/production/daily-input" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d "{
    \"machineId\": $MACHINE_ID,
    \"recordDate\": \"$RECORD_DATE\",
    \"shift\": $SHIFT,
    \"itemId\": $ITEM_ID,
    \"startIndex\": 0,
    \"endIndex\": 0,
    \"inputNE\": null,
    \"finalOutput\": 1,
    \"efficiency\": null,
    \"note\": \"source process smoke test\",
    \"lotId\": null
  }"

echo ""
echo "---"
echo "Test Summary:"
echo "- Happy path: GET source options, PUT machine source, POST daily-input"
echo "- Auth: source options without cookie"
echo "- Validation: invalid currentSourceProcessId"
echo ""
echo "How to run:"
echo "1. Start app: npm run dev"
echo "2. Login and copy session cookie into AUTH_COOKIE"
echo "3. Ensure SOURCE_PROCESS_ID has revenueFactoryId configured"
echo "4. Run: AUTH_COOKIE='...' MACHINE_ID=... SOURCE_PROCESS_ID=... ITEM_ID=... bash tests/test-source-process-revenue.sh"
