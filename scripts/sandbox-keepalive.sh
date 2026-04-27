#!/bin/bash
# VentifyPOS Sandbox Keepalive - keeps the production server alive
# by maintaining an active foreground process in the bash session

cd /home/z/my-project

# Start the auto-restart daemon in background
(
  while true; do
    NODE_OPTIONS="--max-old-space-size=4096" \
    DATABASE_URL="file:/home/z/my-project/db/custom.db" \
    AUTH_SECRET="ventify-auth-secret-key-2025-secure" \
    INTERNAL_SECRET="ventify-internal-secret-2025" \
    NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    node .next/standalone/server.js >> /home/z/my-project/dev.log 2>&1
    echo "[$(date)] Server restart" >> /home/z/my-project/dev.log
    sleep 1
  done
) &
DAEMON_PID=$!

# Keep THIS script alive with a foreground sleep
# This prevents the sandbox from killing the bash session
# and all its child processes
echo "Keepalive started - daemon PID: $DAEMON_PID"
wait $DAEMON_PID
