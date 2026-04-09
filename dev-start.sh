#!/bin/bash
cd /home/z/my-project

# Start production server
while true; do
  echo "[$(date)] Starting production server..."
  NODE_OPTIONS="--max-old-space-size=256" node .next/standalone/server.js >> dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 2s..."
  sleep 2
done
