#!/bin/bash
# ---------------------------------------------------------------------------
# VentifyPOS — Docker Entrypoint Script
# ---------------------------------------------------------------------------
# Runs before the Next.js server starts. Handles:
#   1. Prisma client generation
#   2. Database schema push (auto-migrate)
#   3. Database seed (first run only)
# ---------------------------------------------------------------------------

set -e

echo "═══════════════════════════════════════════"
echo "  VentifyPOS — Docker Startup"
echo "═══════════════════════════════════════════"
echo ""

# ── 1. Generate Prisma Client ─────────────────────────────────────────────
echo "📦 Generating Prisma client..."
npx prisma generate --no-hints 2>/dev/null || {
    echo "⚠️  Prisma generate failed, but client may already exist from build"
}

# ── 2. Push database schema ───────────────────────────────────────────────
echo "🗄️  Pushing database schema..."
npx prisma db push --skip-generate --accept-data-loss 2>/dev/null || {
    echo "⚠️  Database push failed. If using PostgreSQL, ensure DATABASE_URL is correct."
    echo "   Continuing startup — the app may fail if schema is not in sync."
}

# ── 3. Seed database (first run only) ─────────────────────────────────────
SEED_MARKER="/app/db/.seeded"
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
echo "═══════════════════════════════════════════"

# Execute the CMD (node server.js)
exec "$@"
