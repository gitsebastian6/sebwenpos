#!/bin/bash
# VentifyPOS Process Supervisor
# Restarts the server immediately when it crashes
# Uses exponential backoff to prevent crash loops

cd /home/z/my-project
LOG="/home/z/my-project/dev.log"
MAX_BACKOFF=10
BACKOFF=1
CRASH_COUNT=0
CRASH_WINDOW=60  # Reset crash count after 60 seconds of uptime
LAST_START=0

while true; do
  NOW=$(date +%s)
  
  # Reset crash count if server ran for more than CRASH_WINDOW seconds
  if [ $((NOW - LAST_START)) -gt $CRASH_WINDOW ]; then
    CRASH_COUNT=0
    BACKOFF=1
  fi
  
  LAST_START=$NOW
  echo "[$(date)] Starting server (attempt $((CRASH_COUNT+1)))..." >> "$LOG"
  
  NODE_ENV=production node --max-old-space-size=4096 .next/standalone/server.js >> "$LOG" 2>&1
  EXIT_CODE=$?
  
  CRASH_COUNT=$((CRASH_COUNT + 1))
  echo "[$(date)] Server exited with code $EXIT_CODE. Crash count: $CRASH_COUNT" >> "$LOG"
  
  # Exponential backoff
  sleep $BACKOFF
  BACKOFF=$((BACKOFF * 2))
  if [ $BACKOFF -gt $MAX_BACKOFF ]; then
    BACKOFF=$MAX_BACKOFF
  fi
done
