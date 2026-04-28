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

# ── Step 3: Ensure env vars (generates random secrets if missing) ──
log "Ensuring .env variables (no hardcoded secrets)..."
bash "$PROJECT_DIR/scripts/dev.sh" ensure-env 2>&1 | tee -a "$LOG"

# Source the .env file so secrets are available as shell variables
set -a
source "$PROJECT_DIR/.env" 2>/dev/null
set +a

# ── Step 3b: Validate required secrets ──
if [ -z "$AUTH_SECRET" ] || [ -z "$INTERNAL_SECRET" ]; then
  log "FATAL: AUTH_SECRET and INTERNAL_SECRET must be set in .env. Cannot start server."
  exit 1
fi

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
# but standalone output only includes @prisma/client.
# We detect the hash dynamically instead of hardcoding it.
STANDALONE_NM="$PROJECT_DIR/.next/standalone/node_modules"
if [ -d "$STANDALONE_NM/.prisma" ]; then
  # Find any hashed Prisma client directories that already exist
  EXISTING_HASH=$(ls -d "$STANDALONE_NM/.prisma/"client-* 2>/dev/null | head -1)
  if [ -z "$EXISTING_HASH" ] && [ -d "$STANDALONE_NM/.prisma/client" ]; then
    # No hashed copy exists — create one by detecting what Next.js expects
    # Check the standalone server bundle for the hashed import pattern
    HASHED_NAME=$(grep -oP '@prisma/client-[a-f0-9]+' "$PROJECT_DIR/.next/standalone/.next/server/**/*.js" 2>/dev/null | head -1 | sed 's/@prisma\///')
    if [ -n "$HASHED_NAME" ]; then
      log "Detected Prisma hash: $HASHED_NAME — creating symlink"
      ln -sf "$STANDALONE_NM/.prisma/client" "$STANDALONE_NM/.prisma/$HASHED_NAME"
      ln -sf "$STANDALONE_NM/@prisma/client" "$STANDALONE_NM/@prisma/$HASHED_NAME" 2>/dev/null
    fi
  fi
fi

# ── Step 5: Keepalive production server loop ──
# NOTE: This sandbox (Kata Containers) aggressively kills background processes
# that aren't children of the main init tree. The server WILL die periodically.
# The while-true loop ensures it restarts immediately (production starts in ~70ms).
RETRIES=0

while true; do
  log "Starting Next.js production server (attempt $((RETRIES + 1))/$MAX_RETRIES)..."

  # Start production standalone server in FOREGROUND
  # Secrets come from sourced .env — NEVER hardcoded in this script
  NODE_OPTIONS="--max-old-space-size=4096" \
  DATABASE_URL="file:$PROJECT_DIR/db/custom.db" \
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
