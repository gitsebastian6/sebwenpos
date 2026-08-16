# ---------------------------------------------------------------------------
# SebwenPOS — Subscription Cron Service
# ---------------------------------------------------------------------------
# Periodically triggers the app's own Prisma-based subscription transition
# and alert endpoints. Needs the real Bun runtime for Bun.serve().
# ---------------------------------------------------------------------------
FROM oven/bun:1-slim

WORKDIR /app

COPY mini-services/subscription-cron/package.json ./
RUN bun install --production

COPY mini-services/subscription-cron/index.ts ./

RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -sf http://localhost:3010/health || exit 1

CMD ["bun", "run", "index.ts"]
