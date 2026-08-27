#!/bin/bash
# ---------------------------------------------------------------------------
# SebwenPOS — Docker Database Migration Script
# ---------------------------------------------------------------------------
# Applies committed migrations from prisma/migrations via `prisma migrate
# deploy` (idempotent, non-destructive — never drops columns/tables).
# Includes retry logic and proper error handling.
# ---------------------------------------------------------------------------

set -e

echo "╔══════════════════════════════════════════════════╗"
echo "║       SebwenPOS — Database Migration            ║"
echo "╚══════════════════════════════════════════════════╝"

# ── 1. Ensure Prisma engine binaries are executable ──
echo "🔧 Ensuring Prisma engine binaries are executable..."
ENGINE_DIR="/app/node_modules/@prisma/engines"
if [ -d "$ENGINE_DIR" ]; then
  chmod +x "$ENGINE_DIR"/schema-engine-* 2>/dev/null || true
  chmod +x "$ENGINE_DIR"/libquery_engine-* 2>/dev/null || true
  echo "✅ Engine permissions set"
else
  echo "⚠️  Engine directory not found at $ENGINE_DIR"
fi

# ── 2. Wait for PostgreSQL to be ready ──
echo "⏳ Waiting for PostgreSQL to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

until node -e "
  const net = require('net');
  const url = new URL(process.env.DATABASE_URL);
  const socket = net.createConnection({ host: url.hostname, port: parseInt(url.port || '5432') }, () => {
    socket.end();
    process.exit(0);
  });
  socket.on('error', () => { process.exit(1); });
  socket.setTimeout(3000, () => { socket.destroy(); process.exit(1); });
" 2>/dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "   Retry $RETRY_COUNT/$MAX_RETRIES..."
  sleep 2
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Could not connect to PostgreSQL after $MAX_RETRIES retries"
    exit 1
  fi
done

echo "✅ PostgreSQL is reachable"

# ── 3. Apply committed migrations with retries ──
echo "🔄 Running prisma migrate deploy..."
DEPLOY_RETRIES=3
DEPLOY_COUNT=0

while [ $DEPLOY_COUNT -lt $DEPLOY_RETRIES ]; do
  DEPLOY_COUNT=$((DEPLOY_COUNT + 1))
  echo "   Attempt $DEPLOY_COUNT/$DEPLOY_RETRIES..."

  if npx prisma migrate deploy --schema=prisma/schema.prisma 2>&1; then
    echo "✅ Database migrations applied successfully"
    exit 0
  fi

  if [ $DEPLOY_COUNT -lt $DEPLOY_RETRIES ]; then
    echo "⚠️  migrate deploy failed, retrying in 5 seconds..."
    sleep 5
  fi
done

echo "❌ Database migrations failed after $DEPLOY_RETRIES attempts"
exit 1
