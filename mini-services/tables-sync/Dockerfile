# ---------------------------------------------------------------------------
# SebwenPOS — Tables Real-Time Sync Service (Socket.IO)
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim

WORKDIR /app

# Install dependencies
COPY mini-services/tables-sync/package.json ./
RUN npm install --omit=dev

# Copy source
COPY mini-services/tables-sync/index.ts ./

# Install TypeScript runner + curl (for healthcheck)
RUN npm install -g typescript tsx && \
    apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 3005 3006

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -sf http://localhost:3006/health || exit 1

CMD ["npx", "tsx", "index.ts"]
