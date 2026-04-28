#!/bin/bash
# VentifyPOS Sandbox Keepalive - keeps the production server alive
# Secrets are read from .env — never hardcoded

cd /home/z/my-project

# Source .env for the variables
set -a
source .env 2>/dev/null
set +a

# Validate secrets before starting
if [ -z "$AUTH_SECRET" ] || [ -z "$INTERNAL_SECRET" ]; then
  echo "FATAL: AUTH_SECRET and INTERNAL_SECRET must be set in .env" >&2
  exit 1
fi

# Start the auto-restart daemon in background
(
  while true; do
    NODE_OPTIONS="--max-old-space-size=4096" \
    DATABASE_URL="file:/home/z/my-project/db/custom.db" \
    NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    node .next/standalone/server.js >> /home/z/my-project/dev.log 2>&1
    echo "[$(date)] Server restart" >> /home/z/my-project/dev.log
    sleep 1
  done
) &
DAEMON_PID=$!

# Keep THIS script alive with a foreground wait
# This prevents the sandbox from killing the bash session
# and all its child processes
echo "Keepalive started - daemon PID: $DAEMON_PID"
wait $DAEMON_PID
