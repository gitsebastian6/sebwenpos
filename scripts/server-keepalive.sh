#!/bin/bash
# VivaPOS Server Keepalive
# Restarts the standalone server when it dies (OOM recovery)

cd /home/z/my-project
LOG="/home/z/my-project/dev.log"

while true; do
  echo "[$(date)] Starting VivaPOS standalone server..." >> "$LOG"
  NODE_ENV=production node --max-old-space-size=768 .next/standalone/server.js >> "$LOG" 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE. Restarting in 3s..." >> "$LOG"
  sleep 3
done
