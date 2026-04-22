#!/bin/bash
cd /home/z/my-project

# Kill any existing
pkill -f "next dev" 2>/dev/null
sleep 1

# Start fresh
npx next dev -p 3000 > dev.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait
for i in $(seq 1 40); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q "200"; then
    echo "Ready after ${i}s"
    break
  fi
  sleep 1
done

# Keep alive - wait 5 min
echo "Server is running. PID=$SERVER_PID. Waiting 300s..."
wait $SERVER_PID 2>/dev/null &
sleep 300
