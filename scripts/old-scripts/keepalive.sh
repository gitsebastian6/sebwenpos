#!/bin/bash
cd /home/z/my-project
while true; do
  echo "=== $(date) STARTING bun run dev ===" >> dev.log
  bun run dev >> dev.log 2>&1
  echo "=== $(date) DIED, restarting in 3s ===" >> dev.log
  sleep 3
done
