#!/bin/bash
# ---------------------------------------------------------------------------
# Viva POS — Ensure .env has required secrets for development
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

# Ensure DATABASE_URL — relative path (resolved by Prisma relative to
# prisma/schema.prisma), so it works regardless of where the repo is checked out.
if ! grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  echo 'DATABASE_URL="file:../db/custom.db"' >> "$ENV_FILE"
  echo "[ensure-env] Added DATABASE_URL"
  NEEDS_WRITE=true
fi

# Ensure INTERNAL_SECRET (required by middleware for internal routes)
if ! grep -q '^INTERNAL_SECRET=' "$ENV_FILE"; then
  echo "INTERNAL_SECRET=viva-internal-secret-2025" >> "$ENV_FILE"
  echo "[ensure-env] Added INTERNAL_SECRET"
  NEEDS_WRITE=true
fi

# Ensure AUTH_SECRET (required for HMAC token signing)
if ! grep -q '^AUTH_SECRET=' "$ENV_FILE"; then
  echo "AUTH_SECRET=viva-auth-secret-key-2025-secure" >> "$ENV_FILE"
  echo "[ensure-env] Added AUTH_SECRET"
  NEEDS_WRITE=true
fi

# Ensure AI_CHAT_MODEL (GLM model for chat — defaults to free model)
if ! grep -q '^AI_CHAT_MODEL=' "$ENV_FILE"; then
  echo "AI_CHAT_MODEL=glm-4.7-flash" >> "$ENV_FILE"
  echo "[ensure-env] Added AI_CHAT_MODEL (free tier)"
  NEEDS_WRITE=true
fi

# Ensure db directory exists
mkdir -p "$PROJECT_ROOT/db"

if [ "$NEEDS_WRITE" = false ]; then
  echo "[ensure-env] All secrets present — ready to start"
fi
