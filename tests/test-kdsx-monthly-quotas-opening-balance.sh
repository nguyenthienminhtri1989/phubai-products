#!/bin/bash
# Test: KD-SX Monthly Quotas + Contract Opening Balance
# File: src/app/api/kdsx/monthly-quotas/route.ts
# Generated: 2026-06-08

BASE_URL="http://localhost:3000"
# Đăng nhập trên browser rồi copy cookie session thực tế vào đây.
AUTH_COOKIE="next-auth.session-token=YOUR_SESSION_TOKEN"

# Thay các ID này bằng dữ liệu thật trong DB dev/test.
FACTORY_ID=3
PROCESS_ID=1
YEAR_MONTH="2026-06"
SALES_ORDER_ITEM_ID_FIXED=101
SALES_ORDER_ITEM_ID_REMAINDER=102

echo "=============================================="
echo "Testing: /api/kdsx/monthly-quotas"
echo "Quota + ContractOpeningBalance"
echo "=============================================="

echo ""
echo "1. Happy path: save FIXED + REMAINDER quota and opening balance"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X POST "$BASE_URL/api/kdsx/monthly-quotas" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d "{
    \"factoryId\": $FACTORY_ID,
    \"processId\": $PROCESS_ID,
    \"yearMonth\": \"$YEAR_MONTH\",
    \"quotas\": [
      {
        \"salesOrderItemId\": $SALES_ORDER_ITEM_ID_FIXED,
        \"quotaQty\": 17000,
        \"isRemainder\": false,
        \"sortOrder\": 1
      },
      {
        \"salesOrderItemId\": $SALES_ORDER_ITEM_ID_REMAINDER,
        \"quotaQty\": null,
        \"isRemainder\": true,
        \"sortOrder\": 2
      }
    ],
    \"openingBalances\": [
      {
        \"salesOrderItemId\": $SALES_ORDER_ITEM_ID_FIXED,
        \"producedBeforeKg\": 42000,
        \"note\": \"Cutover from Excel before 2026-06\"
      }
    ]
  }"

echo ""
echo "2. GET after save: expect groups[].contracts[].openingBalance"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -H "Cookie: $AUTH_COOKIE" \
  "$BASE_URL/api/kdsx/monthly-quotas?factoryId=$FACTORY_ID&processId=$PROCESS_ID&yearMonth=$YEAR_MONTH&mode=ACTUAL"

echo ""
echo "3. Auth: no cookie should return 401"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  "$BASE_URL/api/kdsx/monthly-quotas?factoryId=$FACTORY_ID&processId=$PROCESS_ID&yearMonth=$YEAR_MONTH&mode=ACTUAL"

echo ""
echo "4. Validation: invalid yearMonth should return 400"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X POST "$BASE_URL/api/kdsx/monthly-quotas" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d "{
    \"factoryId\": $FACTORY_ID,
    \"processId\": $PROCESS_ID,
    \"yearMonth\": \"2026/06\",
    \"quotas\": []
  }"

echo ""
echo "5. Validation: REMAINDER with quotaQty should return 400"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X POST "$BASE_URL/api/kdsx/monthly-quotas" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d "{
    \"factoryId\": $FACTORY_ID,
    \"processId\": $PROCESS_ID,
    \"yearMonth\": \"$YEAR_MONTH\",
    \"quotas\": [
      {
        \"salesOrderItemId\": $SALES_ORDER_ITEM_ID_REMAINDER,
        \"quotaQty\": 1000,
        \"isRemainder\": true,
        \"sortOrder\": 1
      }
    ]
  }"

echo ""
echo "6. Validation: negative opening balance should return 400"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X POST "$BASE_URL/api/kdsx/monthly-quotas" \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH_COOKIE" \
  -d "{
    \"factoryId\": $FACTORY_ID,
    \"processId\": $PROCESS_ID,
    \"yearMonth\": \"$YEAR_MONTH\",
    \"quotas\": [],
    \"openingBalances\": [
      {
        \"salesOrderItemId\": $SALES_ORDER_ITEM_ID_FIXED,
        \"producedBeforeKg\": -1
      }
    ]
  }"

echo ""
echo "Done. Update FACTORY_ID, PROCESS_ID, and SALES_ORDER_ITEM_ID_* before running on your DB."
