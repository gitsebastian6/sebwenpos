#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting production server..."
  NODE_OPTIONS="--max-old-space-size=512" npx next start -p 3000 2>&1 | tee -a /home/z/my-project/dev.log
  EXIT_CODE=$?
  echo "[$(date)] Exited with code $EXIT_CODE, restarting in 2s..."
  sleep 2
done
