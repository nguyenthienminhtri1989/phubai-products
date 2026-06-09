#!/bin/bash
# Test: Machines batch assignment and currentNE update
# File: src/app/api/machines/batch/route.ts
# Generated: 2026-06-09

BASE_URL="http://localhost:3001"
# Thay cookie session thuc te vao day:
AUTH_COOKIE="next-auth.session-token=YOUR_SESSION_TOKEN"

echo "================================"
echo "Testing: /api/machines/batch"
echo "================================"

echo ""
echo "1. Update currentNE for one machine - expect 200"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X POST "$BASE_URL/api/machines/batch" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d '{"machineIds":[1],"currentNE":32}'

echo ""
echo "---"

echo ""
echo "2. Update item assignment for one machine - expect 200 if item exists"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X POST "$BASE_URL/api/machines/batch" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d '{"machineIds":[1],"itemId":1}'

echo ""
echo "---"

echo ""
echo "3. Invalid NE - expect 400"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X POST "$BASE_URL/api/machines/batch" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d '{"machineIds":[1],"currentNE":0}'

echo ""
echo "---"

echo ""
echo "4. Missing update field - expect 400"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X POST "$BASE_URL/api/machines/batch" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d '{"machineIds":[1]}'

echo ""
echo "---"

echo ""
echo "5. No auth - expect 401"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X POST "$BASE_URL/api/machines/batch" \
  -H "Content-Type: application/json" \
  -d '{"machineIds":[1],"currentNE":32}'
