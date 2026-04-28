#!/bin/bash
cd /home/z/my-project

# Build if needed
if [ ! -f .next/standalone/server.js ]; then
  echo "Building production..."
  npx next build
  cp -r .next/static .next/standalone/.next/
  cp -r public .next/standalone/
fi

# Ensure DB symlink
mkdir -p .next/standalone/db
ln -sf /home/z/my-project/db/custom.db .next/standalone/db/custom.db 2>/dev/null

# Ensure secrets exist (generates random values if missing)
bash scripts/ensure-env.sh

# Source .env for the variables
set -a
source .env
set +a

# Validate that secrets are set (fail fast if not)
if [ -z "$AUTH_SECRET" ]; then
  echo "FATAL: AUTH_SECRET is not set. Check your .env file."
  exit 1
fi
if [ -z "$INTERNAL_SECRET" ]; then
  echo "FATAL: INTERNAL_SECRET is not set. Check your .env file."
  exit 1
fi

# Start production server with auto-restart
while true; do
  echo "[$(date)] Starting production server..."
  NODE_OPTIONS="--max-old-space-size=4096" \
  DATABASE_URL="file:/home/z/my-project/db/custom.db" \
  NODE_ENV=production \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  node .next/standalone/server.js >> dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 2s..."
  sleep 2
done
