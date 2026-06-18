#!/bin/bash
# Test: Assignment-level source process for multi-item winding machines
# Files:
# - src/app/api/machines/[id]/assignments/route.ts
# - src/app/api/production/daily-input/route.ts
# Generated: 2026-06-18

BASE_URL="${BASE_URL:-http://localhost:3001}"
AUTH_COOKIE="${AUTH_COOKIE:-next-auth.session-token=YOUR_SESSION_TOKEN}"

MACHINE_ID="${MACHINE_ID:-1}"
ITEM_ID="${ITEM_ID:-1}"
LOT_ID="${LOT_ID:-}"
SOURCE_PROCESS_ID="${SOURCE_PROCESS_ID:-3}"
INVALID_SOURCE_PROCESS_ID="${INVALID_SOURCE_PROCESS_ID:-999999}"
RECORD_DATE="${RECORD_DATE:-2026-06-18}"
SHIFT="${SHIFT:-1}"

lot_json() {
  if [ -z "$LOT_ID" ]; then
    printf 'null'
  else
    printf '%s' "$LOT_ID"
  fi
}

echo "================================"
echo "Testing assignment source process"
echo "================================"

echo ""
echo "1. No auth - GET assignments should be 401"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  "$BASE_URL/api/machines/$MACHINE_ID/assignments"

echo ""
echo "2. GET assignments with auth - expect 200 and sourceProcess field when configured"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -H "Cookie: $AUTH_COOKIE" \
  "$BASE_URL/api/machines/$MACHINE_ID/assignments"

echo ""
echo "3. PUT assignment sourceProcessId - expect 200"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X PUT "$BASE_URL/api/machines/$MACHINE_ID/assignments" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d "{\"assignments\":[{\"itemId\":$ITEM_ID,\"lotId\":$(lot_json),\"sourceProcessId\":$SOURCE_PROCESS_ID,\"sortOrder\":0}]}"

echo ""
echo "4. PUT invalid sourceProcessId - expect 400"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X PUT "$BASE_URL/api/machines/$MACHINE_ID/assignments" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d "{\"assignments\":[{\"itemId\":$ITEM_ID,\"lotId\":$(lot_json),\"sourceProcessId\":$INVALID_SOURCE_PROCESS_ID,\"sortOrder\":0}]}"

echo ""
echo "5. POST daily-input after assignment source update - expect log snapshots assignment source"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X POST "$BASE_URL/api/production/daily-input" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d "{\"machineId\":$MACHINE_ID,\"recordDate\":\"$RECORD_DATE\",\"shift\":$SHIFT,\"itemId\":$ITEM_ID,\"startIndex\":0,\"endIndex\":0,\"inputNE\":null,\"finalOutput\":123,\"efficiency\":null,\"note\":\"assignment-source smoke test\",\"lotId\":$(lot_json)}"

echo ""
echo "Check DB manually if needed:"
echo "SELECT id, \"machineId\", \"itemId\", \"lotId\", \"sourceProcessId\" FROM production_logs WHERE \"machineId\"=$MACHINE_ID AND \"itemId\"=$ITEM_ID ORDER BY id DESC LIMIT 5;"
