#!/usr/bin/env bash
# =============================================================================
# Sebwen POS — Unified Dev Script
# =============================================================================
# Replaces: dev-start.sh, dev.sh, keepalive.sh, keep-server.sh, start-next.sh,
#           start.sh, run-server.sh, start-dev.sh, sandbox-keepalive.sh,
#           ensure-env.sh, fix-prisma-standalone.sh, production-daemon.sh
#
# Usage:
#   bash scripts/dev.sh              # Start production standalone (default)
#   bash scripts/dev.sh dev          # Start dev mode (Turbopack)
#   bash scripts/dev.sh ensure-env   # Ensure .env vars exist
#   bash scripts/dev.sh fix-prisma   # Fix Prisma client hash for standalone
#   bash scripts/dev.sh test         # Run API integration tests
# =============================================================================

set -euo pipefail

PROJECT_DIR="/home/z/my-project"
LOG="$PROJECT_DIR/dev.log"
MAX_RETRIES=5

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[dev]${NC}  $1" | tee -a "$LOG"; }
ok()   { echo -e "${GREEN}[dev]${NC}  $1" | tee -a "$LOG"; }
warn() { echo -e "${YELLOW}[dev]${NC}  $1" | tee -a "$LOG"; }
err()  { echo -e "${RED}[dev]${NC}  $1" | tee -a "$LOG"; }

cd "$PROJECT_DIR"

# =============================================================================
# Subcommand: ensure-env
# =============================================================================
cmd_ensure_env() {
  local ENV_FILE=".env"

  if [ ! -f "$ENV_FILE" ]; then
    touch "$ENV_FILE"
  fi

  ensure_var() {
    local key="$1" default="$2"
    if ! grep -q "^${key}=" "$ENV_FILE"; then
      echo "${key}=${default}" >> "$ENV_FILE"
      log "Added ${key} to ${ENV_FILE}"
    fi
  }

  ensure_secret() {
    local key="$1"
    if ! grep -q "^${key}=" "$ENV_FILE"; then
      local random_value
      if command -v openssl &> /dev/null; then
        random_value=$(openssl rand -hex 32)
      elif [ -f /dev/urandom ]; then
        random_value=$(head -c 32 /dev/urandom | xxd -p -c 64)
      else
        random_value="CHANGE-ME-$(date +%s)-$RANDOM$RANDOM$RANDOM"
      fi
      echo "${key}=${random_value}" >> "$ENV_FILE"
      log "Generated random ${key} in ${ENV_FILE}"
    fi
  }

  ensure_var "DATABASE_URL" "file:./db/custom.db"
  ensure_secret "INTERNAL_SECRET"
  ensure_secret "AUTH_SECRET"
  ensure_var "WOMPI_PUBLIC_KEY" ""
  ensure_var "WOMPI_PRIVATE_KEY" ""
  ensure_var "WOMPI_WEBHOOK_SECRET" ""
  ensure_var "WOMPI_ENV" "sandbox"
  ensure_var "NEXT_PUBLIC_WOMPI_PUBLIC_KEY" ""
  ok "Environment variables verified"
}

# =============================================================================
# Subcommand: fix-prisma
# =============================================================================
cmd_fix_prisma() {
  local STANDALONE_DIR="${1:-.next/standalone}"
  local NM="$STANDALONE_DIR/node_modules"

  if [ ! -d "$NM/.prisma" ]; then
    log "No .prisma directory found in $NM — nothing to fix"
    return 0
  fi

  # Check if hashed copy already exists
  local EXISTING_HASHES
  EXISTING_HASHES=$(ls -d "$NM/.prisma/"client-* 2>/dev/null || true)
  if [ -n "$EXISTING_HASHES" ]; then
    ok "Hashed Prisma client already exists: $(basename $EXISTING_HASHES | head -1)"
    return 0
  fi

  # Strategy 1: Search standalone server JS for the hashed import pattern
  local HASHED_NAME=""
  if [ -d "$STANDALONE_DIR/.next/server" ]; then
    HASHED_NAME=$(grep -roh '@prisma/client-[a-f0-9]\+' "$STANDALONE_DIR/.next/server/" 2>/dev/null | head -1 | sed 's/@prisma\///')
  fi

  # Strategy 2: Check the chunk files
  if [ -z "$HASHED_NAME" ] && [ -d "$STANDALONE_DIR/.next/static" ]; then
    HASHED_NAME=$(grep -roh '@prisma/client-[a-f0-9]\+' "$STANDALONE_DIR/.next/static/" 2>/dev/null | head -1 | sed 's/@prisma\///')
  fi

  # Strategy 3: Check the main server.js
  if [ -z "$HASHED_NAME" ] && [ -f "$STANDALONE_DIR/server.js" ]; then
    HASHED_NAME=$(grep -oh '@prisma/client-[a-f0-9]\+' "$STANDALONE_DIR/server.js" 2>/dev/null | head -1 | sed 's/@prisma\///')
  fi

  if [ -z "$HASHED_NAME" ]; then
    log "No hashed Prisma client import found — standalone may work without fix"
    return 0
  fi

  log "Detected hashed Prisma import: @prisma/$HASHED_NAME"

  # Create the hashed copy in .prisma/
  if [ -d "$NM/.prisma/client" ] && [ ! -d "$NM/.prisma/$HASHED_NAME" ]; then
    log "Copying .prisma/client → .prisma/$HASHED_NAME"
    cp -r "$NM/.prisma/client" "$NM/.prisma/$HASHED_NAME"
  fi

  # Create the hashed copy in @prisma/
  if [ -d "$NM/@prisma/client" ] && [ ! -d "$NM/@prisma/$HASHED_NAME" ]; then
    log "Copying @prisma/client → @prisma/$HASHED_NAME"
    cp -r "$NM/@prisma/client" "$NM/@prisma/$HASHED_NAME"
  fi

  ok "Prisma standalone fix applied successfully"
}

# =============================================================================
# Subcommand: dev (Turbopack dev mode)
# =============================================================================
cmd_dev() {
  log "Cleaning up zombie processes..."

  # Kill any existing dev server on port 3000
  local DEV_PID
  DEV_PID=$(lsof -t -i:3000 2>/dev/null || true)
  if [ -n "$DEV_PID" ]; then
    log "Killing existing dev server (PID: $DEV_PID)"
    kill -9 $DEV_PID 2>/dev/null || true
    sleep 1
  fi

  # Kill zombie Prisma Studio processes
  local PRISMA_PIDS
  PRISMA_PIDS=$(ps aux 2>/dev/null | grep "prisma studio" | grep -v grep | awk '{print $2}' || true)
  if [ -n "$PRISMA_PIDS" ]; then
    log "Killing zombie Prisma Studio processes"
    echo "$PRISMA_PIDS" | xargs kill -9 2>/dev/null || true
  fi

  sleep 1

  # Clean Turbopack cache if bloated (>100MB)
  local CACHE_SIZE
  CACHE_SIZE=$(du -sm .next 2>/dev/null | awk '{print $1}' || echo "0")
  if [ "$CACHE_SIZE" -gt 100 ]; then
    log ".next cache is ${CACHE_SIZE}MB, cleaning..."
    rm -rf .next/cache
  fi

  cmd_ensure_env

  log "Starting Turbopack dev server..."
  NODE_OPTIONS="--max-old-space-size=1536" \
    npx next dev -p 3000 --turbopack 2>&1 | tee "$LOG"
}

# =============================================================================
# Subcommand: test (API integration tests)
# =============================================================================
cmd_test() {
  log "Starting API integration tests..."

  # Kill any existing server
  pkill -f "next dev" 2>/dev/null || true
  pkill -f "node.*server.js" 2>/dev/null || true
  sleep 1

  # Start server
  npx next dev -p 3000 > "$LOG" 2>&1 &
  local SERVER_PID=$!
  log "Server PID: $SERVER_PID"

  # Wait for server to start
  for i in $(seq 1 30); do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q "200"; then
      ok "Server ready after ${i}s"
      break
    fi
    sleep 1
  done

  local PASS=0 FAIL=0

  test_endpoint() {
    local name="$1" expected="$2" actual="$3"
    local code=$(echo "$actual" | tail -1)
    if echo "$code" | grep -q "$expected"; then
      echo "  PASS $name → $code"
      PASS=$((PASS + 1))
    else
      echo "  FAIL $name → Expected $expected, got: $code"
      FAIL=$((FAIL + 1))
    fi
  }

  echo ""
  echo "========== 1. AUTH =========="
  LOGIN=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"phone":"3001234567","password":"1234"}')
  test_endpoint "LOGIN (correct)" "200" "$LOGIN"

  LOGIN_BAD=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"phone":"3001234567","password":"wrong"}')
  test_endpoint "LOGIN (wrong)" "401" "$LOGIN_BAD"

  echo ""
  echo "========== 2. STORES =========="
  STORE=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/stores/1)
  test_endpoint "GET /api/stores/1" "200" "$STORE"

  echo ""
  echo "========== 3. PRODUCTS =========="
  PRODUCTS=$(curl -s -w "\n%{http_code}" "http://localhost:3000/api/products?storeId=1")
  test_endpoint "GET products" "200" "$PRODUCTS"

  echo ""
  echo "========== RESULTS =========="
  echo "Passed: $PASS  Failed: $FAIL  Total: $((PASS + FAIL))"

  kill $SERVER_PID 2>/dev/null || true
}

# =============================================================================
# Default subcommand: production standalone
# =============================================================================
cmd_production() {
  # Install dependencies
  log "Installing dependencies..."
  bun install 2>&1 | tail -3 >> "$LOG"

  # Push DB schema
  log "Pushing database schema..."
  bun run db:push 2>&1 | tail -5 >> "$LOG"

  # Ensure env vars
  cmd_ensure_env

  # Source .env for secrets
  set -a
  source "$PROJECT_DIR/.env" 2>/dev/null
  set +a

  # Validate required secrets
  if [ -z "${AUTH_SECRET:-}" ] || [ -z "${INTERNAL_SECRET:-}" ]; then
    err "FATAL: AUTH_SECRET and INTERNAL_SECRET must be set in .env. Cannot start server."
    exit 1
  fi

  # Build if needed
  if [ ! -f "$PROJECT_DIR/.next/standalone/server.js" ]; then
    log "Building production standalone..."
    npx next build 2>&1 | tail -5 >> "$LOG"
    cp -r .next/static .next/standalone/.next/
    cp -r public .next/standalone/
    log "Build complete."
  else
    ok "Production build already exists, skipping build."
  fi

  # Ensure DB symlink for standalone server
  mkdir -p "$PROJECT_DIR/.next/standalone/db"
  ln -sf "$PROJECT_DIR/db/custom.db" "$PROJECT_DIR/.next/standalone/db/custom.db" 2>/dev/null
  cp "$PROJECT_DIR/.env" "$PROJECT_DIR/.next/standalone/.env" 2>/dev/null

  # Fix Prisma client
  cmd_fix_prisma

  # Keepalive production server loop
  local RETRIES=0
  while true; do
    log "Starting Next.js production server (attempt $((RETRIES + 1))/$MAX_RETRIES)..."
    NODE_OPTIONS="--max-old-space-size=4096" \
    DATABASE_URL="file:$PROJECT_DIR/db/custom.db" \
    NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    node "$PROJECT_DIR/.next/standalone/server.js" >> "$LOG" 2>&1
    local EXIT_CODE=$?
    log "Server exited with code $EXIT_CODE"
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
}

# =============================================================================
# Main dispatch
# =============================================================================
COMMAND="${1:-production}"

case "$COMMAND" in
  dev|development)
    cmd_dev
    ;;
  production|prod|start)
    cmd_production
    ;;
  ensure-env|env)
    cmd_ensure_env
    ;;
  fix-prisma|prisma-fix)
    cmd_fix_prisma "${2:-}"
    ;;
  test|test-api)
    cmd_test
    ;;
  help|--help|-h)
    echo "Sebwen POS — Unified Dev Script"
    echo ""
    echo "Usage: bash scripts/dev.sh [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  production   Start production standalone server (default)"
    echo "  dev          Start dev mode (Turbopack)"
    echo "  ensure-env   Ensure .env variables exist"
    echo "  fix-prisma   Fix Prisma client hash for standalone"
    echo "  test         Run API integration tests"
    echo "  help         Show this help"
    ;;
  *)
    err "Unknown command: $COMMAND. Use 'help' for usage."
    exit 1
    ;;
esac
