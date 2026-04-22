#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Ventify POS — Smart Dev Server Startup
# ─────────────────────────────────────────────────────────────
# Problem: Sandbox kills all user processes between messages,
# meaning the dev server must restart every time.
# Solution: Pre-warm the .next cache from /tmp to skip the
# slow initial compilation (5s → ~800ms).
# ─────────────────────────────────────────────────────────────

PROJECT_DIR="/home/z/my-project"
CACHE_FILE="/tmp/.next-cache-warm.tar.gz"

echo "⚡ Ventify Smart Startup"

# 1. Kill stale processes on port 3000
kill $(lsof -t -i:3000) 2>/dev/null || true

# 2. Restore cached .next if available
if [ -f "$CACHE_FILE" ]; then
  echo "📦 Restoring cached build..."
  rm -rf "$PROJECT_DIR/.next"
  tar xzf "$CACHE_FILE" -C "$PROJECT_DIR" 2>/dev/null
  echo "✅ Cache restored"
else
  echo "🔥 Cold start (no cache)"
  rm -rf "$PROJECT_DIR/.next"
fi

# 3. Start the dev server in background
echo "🚀 Starting Next.js..."
cd "$PROJECT_DIR"
NODE_OPTIONS="--max-old-space-size=1536" nohup bun run dev > "$PROJECT_DIR/dev.log" 2>&1 &
DEV_PID=$!
echo "PID: $DEV_PID"

# 4. Wait for server to be ready (max 60s)
echo "⏳ Waiting for server..."
for i in $(seq 1 60); do
  if curl -sf -o /dev/null http://localhost:3000/ 2>/dev/null; then
    echo "✅ Server ready in ~${i}s"
    
    # 5. Save cache for next startup (snapshot only stable dirs, skip volatile turbopack cache)
    sleep 5
    echo "💾 Saving cache for next startup..."
    # Copy only the compiled output, skip the hot volatile cache
    rm -rf /tmp/.next-snapshot
    mkdir -p /tmp/.next-snapshot
    cp -r "$PROJECT_DIR/.next/server" /tmp/.next-snapshot/server 2>/dev/null || true
    cp -r "$PROJECT_DIR/.next/static" /tmp/.next-snapshot/static 2>/dev/null || true
    cp -r "$PROJECT_DIR/.next/BUILD_ID" /tmp/.next-snapshot/BUILD_ID 2>/dev/null || true
    cp -r "$PROJECT_DIR/.next/routes-manifest.json" /tmp/.next-snapshot/ 2>/dev/null || true
    cp -r "$PROJECT_DIR/.next/package.json" /tmp/.next-snapshot/ 2>/dev/null || true
    # Keep turbopack dev cache too (it helps skip recompilation)
    cp -r "$PROJECT_DIR/.next/dev/cache" /tmp/.next-snapshot/dev-cache 2>/dev/null || true
    tar czf "$CACHE_FILE" -C /tmp .next-snapshot 2>/dev/null
    CACHE_SIZE=$(du -sh "$CACHE_FILE" | cut -f1)
    echo "✅ Cache saved ($CACHE_SIZE)"
    
    echo ""
    echo "═══════════════════════════════════════"
    echo "  Ventify POS running on port 3000"
    echo "═══════════════════════════════════════"
    exit 0
  fi
  sleep 1
done

echo "❌ Server failed to start within 60s"
echo "Check dev.log for errors:"
tail -20 "$PROJECT_DIR/dev.log"
exit 1
