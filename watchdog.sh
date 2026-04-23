#!/bin/bash
cd /home/z/my-project
while true; do
  if ! ss -tlnp 2>/dev/null | grep -q ':3000.*LISTEN'; then
    rm -rf .next
    NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=1024" nohup npx next dev -p 3000 > /home/z/my-project/dev.log 2>&1 &
    sleep 15
  fi
  sleep 3
done
