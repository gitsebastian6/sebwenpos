#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Ventify POS — Custom Dev Script (runs from container /start.sh)
# ─────────────────────────────────────────────────────────────
# This script is executed by /start.sh via: sudo -u z bash .zscripts/dev.sh
# It runs in a background subshell, so a keepalive loop is safe.
# The process inherits ROOT's network namespace → Caddy can reach port 3000.
# ─────────────────────────────────────────────────────────────

set -e

PROJECT_DIR="/home/z/my-project"
LOG="$PROJECT_DIR/dev.log"
MAX_RETRIES=5

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"
}

# ── Step 1: Install dependencies ──
log "Installing dependencies..."
cd "$PROJECT_DIR"
bun install 2>&1 | tail -3 >> "$LOG"

# ── Step 2: Push DB schema ──
log "Pushing database schema..."
bun run db:push 2>&1 | tail -5 >> "$LOG"

# ── Step 3: Ensure env vars ──
log "Ensuring .env variables..."
bash "$PROJECT_DIR/scripts/ensure-env.sh" 2>&1 | tee -a "$LOG"

# ── Step 4: Keepalive dev server loop ──
RETRIES=0

while true; do
  log "Starting Next.js dev server (attempt $((RETRIES + 1))/$MAX_RETRIES)..."

  # Start dev server in background
  NODE_OPTIONS="--max-old-space-size=1536" npx next dev -p 3000 -H 0.0.0.0 >> "$LOG" 2>&1 &
  DEV_PID=$!
  log "Dev server PID: $DEV_PID"

  # Wait for server to be ready (max 90s)
  READY=0
  for i in $(seq 1 90); do
    if ! kill -0 $DEV_PID 2>/dev/null; then
      log "Dev server process died after ${i}s"
      break
    fi
    if python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(2)
try:
    s.connect(('127.0.0.1', 3000))
    s.send(b'GET /api/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
    import time; time.sleep(1)
    data = s.recv(4096)
    s.close()
    if b'200' in data or b'healthy' in data or b'OK' in data:
        print('READY')
    else:
        print('RESPONSE')
except Exception as e:
    print(f'WAIT')
" 2>/dev/null | grep -q "READY"; then
      log "Server is READY after ${i}s"
      READY=1
      break
    fi
    sleep 1
  done

  if [ $READY -eq 1 ]; then
    log "Server running successfully on port 3000"
    RETRIES=0  # Reset retry counter on success

    # Wait for the dev server process to exit
    wait $DEV_PID 2>/dev/null
    EXIT_CODE=$?
    log "Dev server exited with code $EXIT_CODE"
  else
    log "Server failed to start within 90s"
    kill $DEV_PID 2>/dev/null || true
  fi

  # Increment retry counter
  RETRIES=$((RETRIES + 1))
  if [ $RETRIES -ge $MAX_RETRIES ]; then
    log "Max retries ($MAX_RETRIES) reached. Waiting 30s before resetting..."
    sleep 30
    RETRIES=0
  else
    log "Restarting in 3s..."
    sleep 3
  fi
done
