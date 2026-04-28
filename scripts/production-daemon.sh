#!/bin/bash
# VentifyPOS Production Daemon - Auto-restart server
# Secrets are read from .env — never hardcoded
cd /home/z/my-project

# Source .env for the variables
set -a
source .env 2>/dev/null
set +a

# Validate secrets before starting
if [ -z "$AUTH_SECRET" ] || [ -z "$INTERNAL_SECRET" ]; then
  echo "FATAL: AUTH_SECRET and INTERNAL_SECRET must be set in .env"
  exit 1
fi

while true; do
  NODE_OPTIONS="--max-old-space-size=4096" \
  DATABASE_URL="file:/home/z/my-project/db/custom.db" \
  NODE_ENV=production \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  node .next/standalone/server.js >> /home/z/my-project/dev.log 2>&1
  echo "[$(date)] Server restarted" >> /home/z/my-project/dev.log
  sleep 1
done
