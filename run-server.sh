#!/bin/bash
cd /home/z/my-project
pkill -f "next dev" 2>/dev/null
pkill -f "keep-server" 2>/dev/null
sleep 1

npx next dev -p 3000 > dev.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

for i in $(seq 1 40); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q "200"; then
    echo "Ready after ${i}s"
    break
  fi
  sleep 1
done

echo ""
echo "=== Testing APIs ==="
curl -s -o /dev/null -w "Root: %{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "Login: %{http_code}\n" -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"phone":"3001234567","password":"1234"}'
curl -s -o /dev/null -w "Comanda: %{http_code}\n" http://localhost:3000/api/tables/sessions/1/comanda
curl -s -o /dev/null -w "Tables: %{http_code}\n" "http://localhost:3000/api/tables?storeId=1"

echo ""
echo "=== Server running on PID $SERVER_PID ==="
echo "=== Keeping alive for 5 minutes ==="

# Keep the script running so the server stays alive
sleep 300
