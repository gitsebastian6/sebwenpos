#!/bin/bash
# VentifyPOS Production Daemon - Auto-restart server
cd /home/z/my-project

while true; do
  NODE_OPTIONS="--max-old-space-size=4096" \
  DATABASE_URL="file:/home/z/my-project/db/custom.db" \
  AUTH_SECRET="ventify-auth-secret-key-2025-secure" \
  INTERNAL_SECRET="ventify-internal-secret-2025" \
  NODE_ENV=production \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  node .next/standalone/server.js >> /home/z/my-project/dev.log 2>&1
  echo "[$(date)] Server restarted" >> /home/z/my-project/dev.log
  sleep 1
done
