#!/bin/bash
while true; do
  if ! ss -tlnp | grep -q ':3000.*LISTEN'; then
    echo "[$(date)] Port 3000 down, restarting..." >> /home/z/my-project/dev.log
    cd /home/z/my-project
    npx next start -p 3000 >> /home/z/my-project/dev.log 2>&1 &
  fi
  sleep 5
done
