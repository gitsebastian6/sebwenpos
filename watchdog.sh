#!/bin/bash
cd /home/z/my-project
while true; do
  if ! ss -tlnp 2>/dev/null | grep -q ':3000.*LISTEN'; then
    echo "[$(date)] Restarting..." >> /home/z/my-project/dev.log
    NEXT_TELEMETRY_DISABLED=1 nohup npx next start -p 3000 >> /home/z/my-project/dev.log 2>&1 &
  fi
  sleep 5
done
