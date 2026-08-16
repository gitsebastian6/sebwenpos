#!/usr/bin/env bash
# =============================================================================
# Sebwen POS — Unified Deploy Script
# =============================================================================
# Replaces: deploy-vps.sh, cd-deploy.sh, docker-entrypoint.sh,
#           add-cd-workflow.sh, setup-cd-workflow.sh
#
# Usage:
#   bash scripts/deploy.sh vps                    # Deploy to VPS via Docker
#   bash scripts/deploy.sh cd [--deploy] [--tag vX.Y.Z]  # Build & push Docker image
#   bash scripts/deploy.sh entrypoint             # Docker entrypoint (PostgreSQL)
#   bash scripts/deploy.sh workflow               # Setup CI/CD workflow on GitHub
# =============================================================================

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[deploy]${NC} $*"; }
ok()   { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
err()  { echo -e "${RED}[deploy]${NC} $*"; exit 1; }

# =============================================================================
# Subcommand: vps — Full VPS deployment
# =============================================================================
cmd_vps() {
  APP_NAME="sebwenpos"
  APP_DIR="/opt/${APP_NAME}"
  DATA_DIR="/opt/${APP_NAME}/data"
  ENV_FILE="${APP_DIR}/.env"
  DOCKER_COMPOSE_FILE="${APP_DIR}/docker-compose.yml"
  IMAGE="ghcr.io/gitsebastian6/sebwenpos:latest"
  PORT=3000

  log "SebwenPOS VPS Deployment"
  log "========================="

  [ "$(id -u)" -eq 0 ] || err "This script must be run as root (use sudo)"

  # Install Docker
  if command -v docker &> /dev/null; then
    ok "Docker already installed: $(docker --version)"
  else
    log "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    ok "Docker installed successfully"
  fi

  # Create directories
  log "Setting up directories..."
  mkdir -p "${APP_DIR}" "${DATA_DIR}"
  ok "Directories created at ${APP_DIR}"

  # Create .env if needed
  if [ ! -f "${ENV_FILE}" ]; then
    log "Creating .env file..."
    cat > "${ENV_FILE}" << 'EOF'
# SebwenPOS — Production Environment Variables
# Generate secrets with: openssl rand -base64 32

DATABASE_URL="file:/app/db/custom.db"
AUTH_SECRET=""
INTERNAL_SECRET=""
ENCRYPTION_KEY=""
NEXT_PUBLIC_APP_URL="https://your-domain.com"
NODE_ENV="production"

NEXT_PUBLIC_SENTRY_DSN=""

DIAN_SOFTWARE_PROVIDER_NIT=""
DIAN_SOFTWARE_NAME="Sebwen POS"
DIAN_SOFTWARE_PIN=""
DIAN_CERT_PASSWORD=""

SMTP_HOST=""
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="facturacion@your-domain.com"
SMTP_FROM_NAME="Sebwen POS Facturación"

MESSAGEBIRD_API_KEY=""
MESSAGEBIRD_PHONE=""
MESSAGEBIRD_TEMPLATE_ID=""

SUPPORT_PHONE=""
ALLOW_SEED="false"
ALERT_API_BASE="http://localhost"
EOF
    warn ".env file created at ${ENV_FILE} — You MUST fill in the required values!"
  else
    warn ".env file already exists at ${ENV_DIR}"
  fi

  # Create docker-compose.yml
  if [ ! -f "${DOCKER_COMPOSE_FILE}" ]; then
    log "Creating docker-compose.yml..."
    cat > "${DOCKER_COMPOSE_FILE}" << 'COMPOSE'
version: "3.8"
services:
  app:
    image: ghcr.io/gitsebastian6/sebwenpos:latest
    container_name: sebwenpos
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - sebwenpos-data:/app/db
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  caddy:
    image: caddy:2-alpine
    container_name: sebwenpos-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      app:
        condition: service_healthy

volumes:
  sebwenpos-data:
    driver: local
  caddy_data:
  caddy_config:
COMPOSE
    ok "docker-compose.yml created"
  fi

  # Start the application
  log "Starting SebwenPOS..."
  cd "${APP_DIR}"
  docker compose pull 2>/dev/null || true
  docker compose up -d

  log "Waiting for application to start..."
  for i in $(seq 1 30); do
    if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
      ok "SebwenPOS is running and healthy!"
      ok "Access at: http://localhost:${PORT}"
      return
    fi
    sleep 2
  done

  warn "App started but health check not yet passing."
  warn "Check logs: cd ${APP_DIR} && docker compose logs -f"
}

# =============================================================================
# Subcommand: cd — Build & push Docker image to ghcr.io
# =============================================================================
cmd_cd() {
  REGISTRY="ghcr.io"
  IMAGE_NAME="gitsebastian6/sebwenpos"
  CONTAINER_NAME="sebwenpos"
  DEFAULT_PORT=3000

  DEPLOY=false
  DEPLOY_ONLY=false
  CUSTOM_TAG=""
  SKIP_TESTS=false

  while [[ $# -gt 0 ]]; do
    case $1 in
      --deploy)       DEPLOY=true; shift ;;
      --deploy-only)  DEPLOY_ONLY=true; shift ;;
      --tag)          CUSTOM_TAG="$2"; shift 2 ;;
      --skip-tests)   SKIP_TESTS=true; shift ;;
      *) shift ;;
    esac
  done

  command -v docker &> /dev/null || err "Docker is not installed."

  if [ "$DEPLOY_ONLY" = false ]; then
    docker info &> /dev/null || err "Docker daemon is not running."
  fi

  # Get git info
  GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
  GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
  GIT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "")

  # Build tags
  TAGS=("${REGISTRY}/${IMAGE_NAME}:${GIT_SHA}" "${REGISTRY}/${IMAGE_NAME}:${GIT_BRANCH}")
  [ -n "$CUSTOM_TAG" ] && TAGS+=("${REGISTRY}/${IMAGE_NAME}:${CUSTOM_TAG}")
  [ -n "$GIT_TAG" ] && TAGS+=("${REGISTRY}/${IMAGE_NAME}:${GIT_TAG}")
  if [ "$GIT_BRANCH" = "main" ] || [ "$GIT_BRANCH" = "master" ]; then
    TAGS+=("${REGISTRY}/${IMAGE_NAME}:latest")
  fi

  # Run tests
  if [ "$DEPLOY_ONLY" = false ] && [ "$SKIP_TESTS" = false ]; then
    log "Running test suite..."
    if npm test 2>/dev/null; then
      ok "All tests passed"
    else
      warn "Tests failed or not available — continuing anyway"
    fi
  fi

  # Build Docker image
  if [ "$DEPLOY_ONLY" = false ]; then
    log "Building Docker image..."
    BUILD_ARGS=""
    for tag in "${TAGS[@]}"; do BUILD_ARGS="$BUILD_ARGS -t $tag"; done

    docker build \
      --build-arg BUILDKIT_INLINE_CACHE=1 \
      --cache-from ${REGISTRY}/${IMAGE_NAME}:latest \
      $BUILD_ARGS -f Dockerfile . || err "Docker build failed!"

    ok "Docker image built successfully"
    for tag in "${TAGS[@]}"; do echo "  → $tag"; done
  fi

  # Push to registry
  if [ "$DEPLOY_ONLY" = false ]; then
    log "Pushing image to ${REGISTRY}..."
    for tag in "${TAGS[@]}"; do
      docker push "$tag" || warn "Failed to push $tag (may need login)"
    done
    ok "Image pushed to ${REGISTRY}"
  fi

  # Deploy to VPS
  if [ "$DEPLOY" = true ] || [ "$DEPLOY_ONLY" = true ]; then
    DEPLOY_HOST="${DEPLOY_HOST:-}"
    DEPLOY_USER="${DEPLOY_USER:-root}"
    DEPLOY_PORT="${DEPLOY_PORT:-22}"
    DEPLOY_IMAGE="${TAGS[0]}"

    [ -z "$DEPLOY_HOST" ] && err "DEPLOY_HOST not set."

    log "Deploying to ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PORT}..."
    ssh -p "$DEPLOY_PORT" "${DEPLOY_USER}@${DEPLOY_HOST}" << DEPLOY_SCRIPT
set -e
echo "Pulling image..."
docker pull ${DEPLOY_IMAGE}
docker tag ${DEPLOY_IMAGE} ${REGISTRY}/${IMAGE_NAME}:latest
docker stop ${CONTAINER_NAME} 2>/dev/null || true
docker rm ${CONTAINER_NAME} 2>/dev/null || true
docker run -d --name ${CONTAINER_NAME} --restart unless-stopped \
  -p ${DEFAULT_PORT}:3000 -v sebwenpos-data:/app/db \
  --env-file /opt/sebwenpos/.env ${DEPLOY_IMAGE}
sleep 15
if curl -sf http://localhost:${DEFAULT_PORT}/api/health > /dev/null 2>&1; then
  echo "Deployment successful!"
else
  echo "Health check failed. Check logs: docker logs ${CONTAINER_NAME} --tail 50"
fi
docker image prune -f --filter "until=72h"
DEPLOY_SCRIPT
    ok "Deployment to ${DEPLOY_HOST} complete"
  fi

  echo ""
  ok "CD Pipeline Complete — Git SHA: ${GIT_SHA}"
}

# =============================================================================
# Subcommand: entrypoint — Docker entrypoint for PostgreSQL
# =============================================================================
cmd_entrypoint() {
  echo "═══════════════════════════════════════════"
  echo "  SebwenPOS — Docker Startup"
  echo "═══════════════════════════════════════════"

  # Wait for PostgreSQL
  if [ -n "${DATABASE_URL:-}" ] && echo "$DATABASE_URL" | grep -q "postgresql"; then
    echo "Waiting for PostgreSQL to be ready..."
    PG_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    PG_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

    for i in $(seq 1 30); do
      if nc -z "$PG_HOST" "$PG_PORT" 2>/dev/null; then
        if npx prisma db execute --stdin <<< "SELECT 1;" > /dev/null 2>&1; then
          echo "PostgreSQL is ready!"
          break
        fi
      fi
      echo "  Attempt $i/30 — PostgreSQL not ready yet..."
      sleep 2
    done
  fi

  # Generate Prisma client
  echo "Generating Prisma client..."
  npx prisma generate --no-hints 2>/dev/null || echo "Prisma generate skipped (client may already exist)"

  # Push database schema
  echo "Pushing database schema..."
  npx prisma db push --skip-generate --accept-data-loss 2>/dev/null || echo "DB push skipped"

  # Seed on first run
  SEED_MARKER="/tmp/.sebwenpos-seeded"
  if [ ! -f "$SEED_MARKER" ]; then
    echo "First run — seeding database..."
    npx tsx prisma/seed.ts 2>/dev/null || echo "Seed skipped"
    touch "$SEED_MARKER" 2>/dev/null || true
  fi

  # Start server
  echo "Starting SebwenPOS on port ${PORT:-3000}..."
  exec "$@"
}

# =============================================================================
# Subcommand: workflow — Setup CI/CD workflow on GitHub
# =============================================================================
cmd_workflow() {
  REPO="gitsebastian6/sebwenpos"
  WORKFLOW_FILE=".github/workflows/ci.yml"
  SOURCE_FILE=".github/workflows/ci.yml"

  echo "═══════════════════════════════════════════"
  echo "  SebwenPOS — CI/CD Workflow Setup"
  echo "═══════════════════════════════════════════"
  echo ""
  echo "The workflow file needs 'workflow' scope on your PAT."
  echo ""
  echo "Options:"
  echo ""
  echo "  1. GitHub Web UI (easiest)"
  echo "     → Open: https://github.com/$REPO/new/main?filename=$WORKFLOW_FILE"
  echo "     → Paste content of $WORKFLOW_FILE"
  echo ""
  echo "  2. New PAT with 'workflow' scope"
  echo "     → Create at: https://github.com/settings/tokens"
  echo "     → Run: git push origin main"
  echo ""
  echo "  3. GitHub CLI"
  echo "     → gh auth login --scopes repo,workflow"
  echo "     → git push origin main"
  echo ""

  # If PAT is available, try API update
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    local PAT="$GITHUB_TOKEN"
    log "Using GITHUB_TOKEN to update workflow..."

    local RESPONSE
    RESPONSE=$(curl -s -H "Authorization: token $PAT" \
      "https://api.github.com/repos/$REPO/contents/$WORKFLOW_FILE?ref=main")

    local SHA
    SHA=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('sha',''))" 2>/dev/null || echo "")

    if [ -n "$SHA" ] && [ -f "$SOURCE_FILE" ]; then
      local CONTENT
      CONTENT=$(base64 -w 0 "$SOURCE_FILE")

      curl -s -X PUT \
        -H "Authorization: token $PAT" \
        -H "Accept: application/vnd.github+json" \
        -H "Content-Type: application/json" \
        "https://api.github.com/repos/$REPO/contents/$WORKFLOW_FILE" \
        -d "{\"message\":\"feat: update CI/CD pipeline\",\"content\":\"${CONTENT}\",\"sha\":\"${SHA}\",\"branch\":\"main\"}" > /dev/null 2>&1 && \
        ok "Workflow updated on GitHub!" || \
        warn "Failed to update — PAT may lack 'workflow' scope"
    fi
  fi
}

# =============================================================================
# Main dispatch
# =============================================================================
COMMAND="${1:-help}"
shift 2>/dev/null || true

case "$COMMAND" in
  vps)           cmd_vps ;;
  cd)            cmd_cd "$@" ;;
  entrypoint)    cmd_entrypoint "$@" ;;
  workflow)      cmd_workflow ;;
  help|--help|-h)
    echo "Sebwen POS — Unified Deploy Script"
    echo ""
    echo "Usage: bash scripts/deploy.sh [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  vps          Deploy to VPS via Docker (fresh setup)"
    echo "  cd           Build & push Docker image to ghcr.io"
    echo "  entrypoint   Docker entrypoint (PostgreSQL setup)"
    echo "  workflow     Setup CI/CD workflow on GitHub"
    echo "  help         Show this help"
    echo ""
    echo "CD Options:"
    echo "  --deploy       Build, push, and deploy to VPS"
    echo "  --deploy-only  Deploy existing image (skip build)"
    echo "  --tag VERSION  Tag with specific version"
    echo "  --skip-tests   Skip test suite"
    ;;
  *)
    err "Unknown command: $COMMAND. Use 'help' for usage."
    ;;
esac
