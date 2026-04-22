#!/bin/bash
# Ventify POS — Dev Server Keep-Alive
# Starts next dev and auto-restarts if it crashes

cd /home/z/my-project

while true; do
  echo "[$(date)] Starting Next.js dev server on port 3000..."
  bun run dev 2>&1
  EXIT=$?
  echo "[$(date)] Server exited with code $EXIT, restarting in 2s..."
  sleep 2
done
