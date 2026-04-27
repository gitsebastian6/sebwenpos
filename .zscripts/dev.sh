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

# ── Step 4: Build production standalone (if needed) ──
if [ ! -f "$PROJECT_DIR/.next/standalone/server.js" ]; then
  log "Building production standalone..."
  cd "$PROJECT_DIR"
  npx next build 2>&1 | tail -5 >> "$LOG"
  cp -r .next/static .next/standalone/.next/
  cp -r public .next/standalone/
  log "Build complete."
else
  log "Production build already exists, skipping build."
fi

# Ensure DB symlink for standalone server
mkdir -p "$PROJECT_DIR/.next/standalone/db"
ln -sf "$PROJECT_DIR/db/custom.db" "$PROJECT_DIR/.next/standalone/db/custom.db" 2>/dev/null
cp "$PROJECT_DIR/.env" "$PROJECT_DIR/.next/standalone/.env" 2>/dev/null

# ── Step 4b: Fix Prisma client for standalone ──
# Next.js Turbopack externalizes @prisma/client with a hashed name
# (e.g., @prisma/client-2c3a283f134fdcb6) but standalone output only
# includes @prisma/client. We must create the hashed copy.
PRISMA_HASH="client-2c3a283f134fdcb6"
STANDALONE_NM="$PROJECT_DIR/.next/standalone/node_modules"
if [ -d "$STANDALONE_NM/.prisma/client" ] && [ ! -d "$STANDALONE_NM/.prisma/$PRISMA_HASH" ]; then
  log "Creating hashed Prisma client: .prisma/$PRISMA_HASH"
  cp -r "$STANDALONE_NM/.prisma/client" "$STANDALONE_NM/.prisma/$PRISMA_HASH"
fi
if [ -d "$STANDALONE_NM/@prisma/client" ] && [ ! -d "$STANDALONE_NM/@prisma/$PRISMA_HASH" ]; then
  log "Creating hashed Prisma package: @prisma/$PRISMA_HASH"
  cp -r "$STANDALONE_NM/@prisma/client" "$STANDALONE_NM/@prisma/$PRISMA_HASH"
fi

# ── Step 5: Keepalive production server loop ──
# NOTE: This sandbox (Kata Containers) aggressively kills background processes
# that aren't children of the main init tree. The server WILL die periodically.
# The while-true loop ensures it restarts immediately (production starts in ~70ms).
# The `wait $DEV_PID` ensures this script stays alive as long as the server runs,
# preventing the sandbox from killing the entire process tree.
RETRIES=0

while true; do
  log "Starting Next.js production server (attempt $((RETRIES + 1))/$MAX_RETRIES)..."

  # Start production standalone server in FOREGROUND (not background)
  # This is critical: `wait` keeps the bash session alive which prevents
  # the sandbox process reaper from killing the whole tree.
  # NOTE: 4096MB needed because SSR page rendering spikes memory in this sandbox
  NODE_OPTIONS="--max-old-space-size=4096" \
  DATABASE_URL="file:$PROJECT_DIR/db/custom.db" \
  AUTH_SECRET="ventify-auth-secret-key-2025-secure" \
  INTERNAL_SECRET="ventify-internal-secret-2025" \
  NODE_ENV=production \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  node "$PROJECT_DIR/.next/standalone/server.js" >> "$LOG" 2>&1
  EXIT_CODE=$?

  log "Server exited with code $EXIT_CODE"

  # Increment retry counter
  RETRIES=$((RETRIES + 1))
  if [ $RETRIES -ge $MAX_RETRIES ]; then
    log "Max retries ($MAX_RETRIES) reached. Waiting 30s before resetting..."
    sleep 30
    RETRIES=0
  else
    log "Restarting in 1s..."
    sleep 1
  fi
done
