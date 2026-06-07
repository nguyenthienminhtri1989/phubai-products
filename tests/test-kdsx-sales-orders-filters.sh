#!/bin/bash
# Test: KDSX Sales Orders filters
# File: src/app/api/kdsx/sales-orders/route.ts
# Generated: 2026-06-07

BASE_URL="${BASE_URL:-http://localhost:3000}"
# Paste a real logged-in NextAuth cookie before running authenticated tests.
AUTH_COOKIE="${AUTH_COOKIE:-next-auth.session-token=YOUR_SESSION_TOKEN}"

echo "================================"
echo "Testing: GET /api/kdsx/sales-orders filters"
echo "================================"

echo ""
echo "1. No auth - expect 401"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X GET "$BASE_URL/api/kdsx/sales-orders?orderNo=PB"

echo ""
echo "---"

echo ""
echo "2. Filter by orderNo - expect 200 and matching contracts"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X GET "$BASE_URL/api/kdsx/sales-orders?orderNo=PB" \
  -H "Cookie: $AUTH_COOKIE"

echo ""
echo "---"

echo ""
echo "3. Filter by itemName through sales_order_items.item.name - expect 200"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X GET "$BASE_URL/api/kdsx/sales-orders?itemName=OE" \
  -H "Cookie: $AUTH_COOKIE"

echo ""
echo "---"

echo ""
echo "4. Combined filters: factoryId + orderNo + itemName - expect 200"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X GET "$BASE_URL/api/kdsx/sales-orders?factoryId=1&orderNo=PB&itemName=OE" \
  -H "Cookie: $AUTH_COOKIE"

