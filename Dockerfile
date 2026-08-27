# ---------------------------------------------------------------------------
# SebwenPOS — Production Docker Image (PostgreSQL)
# ---------------------------------------------------------------------------
# Multi-stage build optimized for Next.js standalone output:
#   Stage 1 (deps):    Install production dependencies only
#   Stage 2 (builder): Build the Next.js app (generates standalone output)
#   Stage 3 (runner):  Minimal runtime image with standalone server
#
# NOTE: Prisma uses PostgreSQL everywhere (dev + prod) — no provider swap.
#
# Usage:
#   docker compose up --build          (with docker-compose.yml)
#   docker build -t sebwenpos .
#   docker run -p 3000:3000 --env-file .env.docker sebwenpos
# ---------------------------------------------------------------------------

# ── Stage 1: Dependencies ──────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps

WORKDIR /app

# Install system dependencies for native modules (sharp, bcryptjs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Copy migration script
COPY scripts/docker-migrate.sh /app/docker-migrate.sh
RUN sed -i 's/\r$//' /app/docker-migrate.sh && chmod +x /app/docker-migrate.sh

# Install ALL dependencies (needed for build step)
RUN npm ci

# Ensure Prisma engine binaries have execute permissions
RUN chmod +x /app/node_modules/@prisma/engines/schema-engine-* 2>/dev/null || true

# Generate Prisma client with PostgreSQL provider
RUN npx prisma generate

# ── Stage 2: Builder ──────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install system dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
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
# PostgreSQL URL for build — Prisma needs a valid URL format to generate client
ENV DATABASE_URL=postgresql://placeholder:placeholder@placeholder:5432/placeholder
ENV DIRECT_URL=postgresql://placeholder:placeholder@placeholder:5432/placeholder

# Generate Prisma client (ensure it's fresh with PostgreSQL provider)
RUN npx prisma generate

# Build Next.js (standalone output mode)
RUN npm run build

# ── Stage 3: Runner ───────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install runtime-only system dependencies (curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
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

# Copy Prisma schema and client (for runtime queries)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy bcryptjs for seed script
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Create uploads directory with proper ownership (before switching to nextjs user)
RUN mkdir -p /app/uploads/receipts && \
    chown -R nextjs:nodejs /app/uploads

# Create the Next.js cache directory with ownership for the non-root user —
# otherwise the image optimizer fails at runtime with
# EACCES: permission denied, mkdir '/app/.next/cache'
RUN mkdir -p /app/.next/cache && \
    chown -R nextjs:nodejs /app/.next

# Copy startup script and ensure LF line endings + executable
COPY scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && \
    chmod +x /app/docker-entrypoint.sh

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
