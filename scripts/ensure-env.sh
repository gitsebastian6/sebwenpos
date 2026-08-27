#!/bin/bash
# ---------------------------------------------------------------------------
# Sebwen POS — Ensure .env has required secrets for development
# ---------------------------------------------------------------------------
# This script runs before `bun run dev` to guarantee the app can start.
# It only adds MISSING keys — never overwrites existing values.
# In production, use proper secret management (not this script).
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
NEEDS_WRITE=false

# Create .env if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
  touch "$ENV_FILE"
  echo "[ensure-env] Created .env file"
fi

# Ensure DATABASE_URL / DIRECT_URL — local Postgres from docker-compose
# (`docker compose up -d postgres`). Both point at the same local container.
LOCAL_PG_URL='postgresql://sebwenpos:sebwenpos_secret_2025@localhost:5432/sebwenpos?schema=public'
if ! grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  echo "DATABASE_URL=\"$LOCAL_PG_URL\"" >> "$ENV_FILE"
  echo "[ensure-env] Added DATABASE_URL (local Postgres)"
  NEEDS_WRITE=true
fi
if ! grep -q '^DIRECT_URL=' "$ENV_FILE"; then
  echo "DIRECT_URL=\"$LOCAL_PG_URL\"" >> "$ENV_FILE"
  echo "[ensure-env] Added DIRECT_URL (local Postgres)"
  NEEDS_WRITE=true
fi

# Ensure INTERNAL_SECRET (required by middleware for internal routes)
if ! grep -q '^INTERNAL_SECRET=' "$ENV_FILE"; then
  echo "INTERNAL_SECRET=sebwen-internal-secret-2025" >> "$ENV_FILE"
  echo "[ensure-env] Added INTERNAL_SECRET"
  NEEDS_WRITE=true
fi

# Ensure AUTH_SECRET (required for HMAC token signing)
if ! grep -q '^AUTH_SECRET=' "$ENV_FILE"; then
  echo "AUTH_SECRET=sebwen-auth-secret-key-2025-secure" >> "$ENV_FILE"
  echo "[ensure-env] Added AUTH_SECRET"
  NEEDS_WRITE=true
fi

# Ensure AI_CHAT_MODEL (GLM model for chat — defaults to free model)
if ! grep -q '^AI_CHAT_MODEL=' "$ENV_FILE"; then
  echo "AI_CHAT_MODEL=glm-4.7-flash" >> "$ENV_FILE"
  echo "[ensure-env] Added AI_CHAT_MODEL (free tier)"
  NEEDS_WRITE=true
fi

if [ "$NEEDS_WRITE" = false ]; then
  echo "[ensure-env] All secrets present — ready to start"
fi
