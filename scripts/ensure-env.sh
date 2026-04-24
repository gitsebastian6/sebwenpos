#!/usr/bin/env bash
# ensure-env.sh — Guarantees required env vars exist in .env before starting the app.
# If a variable is missing, it appends the safe dev-default so the server never 500s.

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

ensure_var "DATABASE_URL" "file:./db/custom.db"
ensure_var "INTERNAL_SECRET" "ventify-internal-secret-2025"
ensure_var "AUTH_SECRET" "ventify-auth-secret-key-2025-secure"
