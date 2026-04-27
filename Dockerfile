# ---------------------------------------------------------------------------
# VentifyPOS — Production Docker Image
# ---------------------------------------------------------------------------
# Multi-stage build optimized for Next.js standalone output:
#   Stage 1 (deps):    Install production dependencies only
#   Stage 2 (builder): Build the Next.js app (generates standalone output)
#   Stage 3 (runner):  Minimal runtime image with standalone server
# ---------------------------------------------------------------------------
# Usage:
#   docker build -t ventifypos .
#   docker run -p 3000:3000 --env-file .env ventifypos
# ---------------------------------------------------------------------------

# ── Stage 1: Dependencies ──────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps

WORKDIR /app

# Install system dependencies for native modules (better-sqlite3, sharp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-dev \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install ALL dependencies (needed for build step)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# ── Stage 2: Builder ──────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install system dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-dev \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

# Copy source code
COPY . .

# Build-time environment variables (dummy values for build validation)
# Real values come from the runtime environment (.env or docker env)
ENV AUTH_SECRET=build-placeholder
ENV INTERNAL_SECRET=build-placeholder
ENV NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV SMTP_FROM=build@placeholder.com
ENV ALERT_API_BASE=http://localhost
ENV DATABASE_URL=file:./build.db

# Generate Prisma client (ensure it's fresh)
RUN npx prisma generate

# Build Next.js (standalone output mode)
RUN npm run build

# ── Stage 3: Runner ───────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install runtime-only system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema and migration files (for db push/migrate on startup)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy better-sqlite3 native binding
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# Copy database directory (for SQLite)
RUN mkdir -p /app/db && chown nextjs:nodejs /app/db

# Copy startup script
COPY scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create data volume for SQLite database persistence
VOLUME ["/app/db"]

# Expose port
EXPOSE 3000

# Set hostname
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Use non-root user
USER nextjs

# Start the application
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
