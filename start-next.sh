#!/bin/bash
# Lightweight Next.js production server with auto-restart
cd /home/z/my-project
while true; do
  if ! curl -s -o /dev/null -w "" http://localhost:3000/ 2>/dev/null; then
    # Kill stale processes
    pkill -f "next start" 2>/dev/null
    sleep 2
    # Start fresh
    NODE_ENV=production nohup npx next start -p 3000 >> /home/z/my-project/dev.log 2>&1 &
    echo "$(date): Restarted Next.js server (PID: $!)" >> /home/z/my-project/dev.log
  fi
  sleep 30
done
