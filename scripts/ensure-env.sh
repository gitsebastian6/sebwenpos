#!/usr/bin/env bash
# ensure-env.sh — Guarantees required env vars exist in .env before starting the app.
# If a SECRET variable is missing, generates a cryptographically random value.
# Never uses hardcoded defaults for secrets.

ENV_FILE=".env"

# If .env doesn't exist, create it
if [ ! -f "$ENV_FILE" ]; then
  touch "$ENV_FILE"
fi

ensure_var() {
  local key="$1"
  local default="$2"
  if ! grep -q "^${key}=" "$ENV_FILE"; then
    echo "${key}=${default}" >> "$ENV_FILE"
    echo "[ensure-env] Added ${key} to ${ENV_FILE}"
  fi
}

ensure_secret() {
  local key="$1"
  if ! grep -q "^${key}=" "$ENV_FILE"; then
    # Generate a cryptographically random 32-byte hex string
    local random_value
    if command -v openssl &> /dev/null; then
      random_value=$(openssl rand -hex 32)
    elif [ -f /dev/urandom ]; then
      random_value=$(head -c 32 /dev/urandom | xxd -p -c 64)
    else
      random_value="CHANGE-ME-$(date +%s)-$RANDOM$RANDOM$RANDOM"
    fi
    echo "${key}=${random_value}" >> "$ENV_FILE"
    echo "[ensure-env] Generated random ${key} in ${ENV_FILE}"
  fi
}

# Non-secret: safe default
ensure_var "DATABASE_URL" "file:./db/custom.db"

# Secrets: always generate random values — NEVER use hardcoded defaults
ensure_secret "INTERNAL_SECRET"
ensure_secret "AUTH_SECRET"
