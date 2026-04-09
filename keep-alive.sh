#!/bin/bash
cd /home/z/my-project
while true; do
  fuser -k 3000/tcp 2>/dev/null
  sleep 1
  > dev.log
  echo "Starting server at $(date)..."
  bun run dev >> dev.log 2>&1
  echo "Server died at $(date), restarting in 3s..."
  sleep 3
done
