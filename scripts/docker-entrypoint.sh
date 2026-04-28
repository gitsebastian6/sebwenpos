#!/bin/bash
# ---------------------------------------------------------------------------
# VentifyPOS — Docker Entrypoint Script (PostgreSQL)
# ---------------------------------------------------------------------------
# Runs before the Next.js server starts. Handles:
#   1. Wait for PostgreSQL to be ready
#   2. Prisma client generation
#   3. Database schema push (auto-migrate)
#   4. Database seed (first run only)
# ---------------------------------------------------------------------------

set -e

echo "═══════════════════════════════════════════"
echo "  VentifyPOS — Docker Startup"
echo "═══════════════════════════════════════════"
echo ""

# ── 0. Wait for PostgreSQL ───────────────────────────────────────────────
if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "postgresql"; then
    echo "🐘 Waiting for PostgreSQL to be ready..."

    # Extract host and port from DATABASE_URL
    PG_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    PG_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

    MAX_RETRIES=30
    RETRY_COUNT=0

    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -sf "http://${PG_HOST}:${PG_PORT}" > /dev/null 2>&1 || \
           nc -z "$PG_HOST" "$PG_PORT" 2>/dev/null; then
            # Try a real PostgreSQL connection
            if npx prisma db execute --stdin <<< "SELECT 1;" > /dev/null 2>&1; then
                echo "✅ PostgreSQL is ready!"
                break
            fi
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "   Attempt $RETRY_COUNT/$MAX_RETRIES — PostgreSQL not ready yet..."
        sleep 2
    done

    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo "⚠️  PostgreSQL not ready after $MAX_RETRIES attempts. Continuing anyway..."
    fi
fi

# ── 1. Generate Prisma Client ─────────────────────────────────────────────
echo "📦 Generating Prisma client..."
npx prisma generate --no-hints 2>/dev/null || {
    echo "⚠️  Prisma generate failed, but client may already exist from build"
}

# ── 2. Push database schema ───────────────────────────────────────────────
echo "🗄️  Pushing database schema..."
npx prisma db push --skip-generate --accept-data-loss 2>/dev/null || {
    echo "⚠️  Database push failed. Ensure DATABASE_URL is correct and PostgreSQL is running."
    echo "   Continuing startup — the app may fail if schema is not in sync."
}

# ── 3. Seed database (first run only) ─────────────────────────────────────
SEED_MARKER="/tmp/.ventifypos-seeded"
if [ ! -f "$SEED_MARKER" ]; then
    echo "🌱 First run detected — seeding database..."
    npx tsx prisma/seed.ts 2>/dev/null || {
        echo "⚠️  Seed failed (may not be needed). Continuing startup."
    }
    touch "$SEED_MARKER" 2>/dev/null || true
else
    echo "✅ Database already seeded (marker found)"
fi

# ── 4. Start the server ──────────────────────────────────────────────────
echo ""
echo "🚀 Starting VentifyPOS on port ${PORT:-3000}..."
echo "   Database: $(echo $DATABASE_URL | sed 's/:.*@/:***@/' | sed 's/\?.*//' )"
echo "═══════════════════════════════════════════"

# Execute the CMD (node server.js)
exec "$@"
