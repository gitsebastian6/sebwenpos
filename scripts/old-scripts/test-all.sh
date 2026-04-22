#!/bin/bash
# Comprehensive test script - starts server and tests ALL flows
cd /home/z/my-project

# Kill any existing server
pkill -f "next dev" 2>/dev/null || true
sleep 1

# Start server
npx next dev -p 3000 > dev.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server to start
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q "200"; then
    echo "Server ready after ${i}s"
    break
  fi
  sleep 1
done

PASS=0
FAIL=0

test_endpoint() {
  local name="$1"
  local expected_code="$2"
  local actual="$3"
  local response="$4"
  
  local code=$(echo "$actual" | tail -1)
  if echo "$code" | grep -q "$expected_code"; then
    echo "✅ $name → $code"
    PASS=$((PASS + 1))
  else
    echo "❌ $name → Expected $expected_code, got: $code"
    echo "   Response: $response"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "========== 1. AUTH =========="

LOGIN=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"phone":"3001234567","password":"1234"}')
test_endpoint "LOGIN (correct credentials)" "200" "$LOGIN" "$LOGIN"

LOGIN_BAD=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"phone":"3001234567","password":"wrong"}')
test_endpoint "LOGIN (wrong password)" "401" "$LOGIN_BAD" "$LOGIN_BAD"

echo ""
echo "========== 2. STORE VALIDATION =========="

STORE=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/stores/1)
test_endpoint "GET /api/stores/1" "200" "$STORE" "$STORE"

STORE_404=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/stores/999)
test_endpoint "GET /api/stores/999 (not found)" "404" "$STORE_404" "$STORE_404"

echo ""
echo "========== 3. TABLES =========="

TABLES=$(curl -s -w "\n%{http_code}" "http://localhost:3000/api/tables?storeId=1")
test_endpoint "GET /api/tables?storeId=1" "200" "$TABLES" "$TABLES"

echo ""
echo "========== 4. SESSIONS =========="

SESSIONS=$(curl -s -w "\n%{http_code}" "http://localhost:3000/api/tables/sessions?storeId=1&status=OPEN")
test_endpoint "GET sessions (OPEN)" "200" "$SESSIONS" "$SESSIONS"

SESSION_DETAIL=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/tables/sessions/1)
test_endpoint "GET session detail (id=1)" "200" "$SESSION_DETAIL" "$SESSION_DETAIL"

echo ""
echo "========== 5. COMANDA (THE BUG FIX) =========="

COMANDA_GET=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/tables/sessions/1/comanda)
test_endpoint "GET comanda session 1" "200" "$COMANDA_GET" "$COMANDA_GET"

COMANDA_GET2=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/tables/sessions/2/comanda)
test_endpoint "GET comanda session 2" "200" "$COMANDA_GET2" "$COMANDA_GET2"

# POST new comanda items
COMANDA_POST=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/tables/sessions/2/comanda -H 'Content-Type: application/json' -d '{"storeId":1,"items":[{"productId":1,"quantity":3}]}')
test_endpoint "POST comanda add items to session 2" "201" "$COMANDA_POST" "$COMANDA_POST"

# Verify items were added
COMANDA_GET2_AFTER=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/tables/sessions/2/comanda)
test_endpoint "GET comanda session 2 (after POST)" "200" "$COMANDA_GET2_AFTER" "$COMANDA_GET2_AFTER"

# POST with invalid product
COMANDA_BAD=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/tables/sessions/2/comanda -H 'Content-Type: application/json' -d '{"storeId":1,"items":[{"productId":9999,"quantity":1}]}')
test_endpoint "POST comanda with invalid product" "400" "$COMANDA_BAD" "$COMANDA_BAD"

# POST with wrong storeId
COMANDA_WRONG_STORE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/tables/sessions/2/comanda -H 'Content-Type: application/json' -d '{"storeId":99,"items":[{"productId":1,"quantity":1}]}')
test_endpoint "POST comanda with wrong storeId" "400" "$COMANDA_WRONG_STORE" "$COMANDA_WRONG_STORE"

echo ""
echo "========== 6. PAYMENT =========="

# Get comanda items from session 1 to get item IDs for payment
SESSION1_ITEMS=$(curl -s http://localhost:3000/api/tables/sessions/1/comanda)
echo "Session 1 items (for payment test): $SESSION1_ITEMS"

# Try to pay for the pending nachos item from session 1
# From seed: item with productName 'Nachos con Guacamole' should be PENDING
PAY_CASH=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/tables/sessions/1/pay -H 'Content-Type: application/json' -d '{"storeId":1,"itemIds":[3],"paymentMethod":"CASH"}')
test_endpoint "POST pay session 1 (CASH)" "201" "$PAY_CASH" "$PAY_CASH"

# Pay with DAVIPLATA
PAY_DAVI=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/tables/sessions/1/pay -H 'Content-Type: application/json' -d '{"storeId":1,"itemIds":[1],"paymentMethod":"DAVIPLATA"}')
test_endpoint "POST pay session 1 (DAVIPLATA)" "201" "$PAY_DAVI" "$PAY_DAVI"

# Pay with NEQUI
PAY_NEQUI=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/tables/sessions/1/pay -H 'Content-Type: application/json' -d '{"storeId":1,"itemIds":[2],"paymentMethod":"NEQUI"}')
test_endpoint "POST pay session 1 (NEQUI)" "201" "$PAY_NEQUI" "$PAY_NEQUI"

echo ""
echo "========== 7. PRODUCTS =========="

PRODUCTS=$(curl -s -w "\n%{http_code}" "http://localhost:3000/api/products?storeId=1")
test_endpoint "GET products" "200" "$PRODUCTS" "$PRODUCTS"

echo ""
echo "========== 8. CUSTOMERS =========="

CUSTOMERS=$(curl -s -w "\n%{http_code}" "http://localhost:3000/api/customers?storeId=1")
test_endpoint "GET customers" "200" "$CUSTOMERS" "$CUSTOMERS"

echo ""
echo "========== 9. ORDERS =========="

ORDERS=$(curl -s -w "\n%{http_code}" "http://localhost:3000/api/orders?storeId=1")
test_endpoint "GET orders" "200" "$ORDERS" "$ORDERS"

echo ""
echo "========== RESULTS =========="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Total:  $((PASS + FAIL))"

echo ""
echo "========== DEV LOG (last 40 lines) =========="
tail -40 dev.log

# Kill server
kill $SERVER_PID 2>/dev/null
