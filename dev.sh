#!/bin/bash
# ─── Ventify POS — Safe Dev Startup ─────────────────────────────────────────
# Kills zombie processes, cleans ports, and starts dev server with memory limits
# ──────────────────────────────────────────────────────────────────────────────

set -e
cd "$(dirname "$0")"

echo "🧹 Cleaning up zombie processes..."

# Kill any existing dev server on port 3000
DEV_PID=$(lsof -t -i:3000 2>/dev/null || true)
if [ -n "$DEV_PID" ]; then
  echo "  Killing existing dev server (PID: $DEV_PID)"
  kill -9 $DEV_PID 2>/dev/null || true
  sleep 1
fi

# Kill zombie Prisma Studio processes (they eat ~177MB each)
PRISMA_PIDS=$(ps aux 2>/dev/null | grep "prisma studio" | grep -v grep | awk '{print $2}' || true)
if [ -n "$PRISMA_PIDS" ]; then
  echo "  Killing zombie Prisma Studio processes"
  echo "$PRISMA_PIDS" | xargs kill -9 2>/dev/null || true
fi

# Kill zombie npm/node processes from prisma exec
NPM_PRISMA_PIDS=$(ps aux 2>/dev/null | grep "npm exec prisma" | grep -v grep | awk '{print $2}' || true)
if [ -n "$NPM_PRISMA_PIDS" ]; then
  echo "  Killing zombie npm prisma processes"
  echo "$NPM_PRISMA_PIDS" | xargs kill -9 2>/dev/null || true
fi

# Wait for ports to be freed
sleep 1

# Verify port 3000 is free
if lsof -i:3000 2>/dev/null; then
  echo "⚠ Port 3000 still in use, waiting..."
  sleep 2
fi

# Clean Turbopack cache if it's bloated (>100MB)
CACHE_SIZE=$(du -sm .next 2>/dev/null | awk '{print $1}' || echo "0")
if [ "$CACHE_SIZE" -gt 100 ]; then
  echo "🗑 .next cache is ${CACHE_SIZE}MB, cleaning..."
  rm -rf .next/cache
fi

echo "🚀 Starting dev server..."
NODE_OPTIONS="--max-old-space-size=1536" \
  npx next dev -p 3000 --turbopack 2>&1 | tee dev.log
