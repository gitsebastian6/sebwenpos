#!/bin/bash
# ---------------------------------------------------------------------------
# VentifyPOS — Local CD (Continuous Deployment) Script
# ---------------------------------------------------------------------------
# Builds a Docker image, pushes it to GitHub Container Registry (ghcr.io),
# and optionally deploys to a VPS via SSH.
#
# This script can be used:
#   - Locally for manual deployments
#   - From any CI/CD system (not just GitHub Actions)
#   - As a fallback when GitHub Actions CD workflow is unavailable
#
# Prerequisites:
#   - Docker installed and running
#   - Logged into ghcr.io: echo $PAT | docker login ghcr.io -u USER --password-stdin
#   - SSH access to the target server (for VPS deployment)
#
# Usage:
#   ./scripts/cd-deploy.sh                    # Build & push only
#   ./scripts/cd-deploy.sh --deploy           # Build, push, and deploy to VPS
#   ./scripts/cd-deploy.sh --deploy-only      # Deploy existing image to VPS
#   ./scripts/cd-deploy.sh --tag v1.0.0       # Build with specific tag
# ---------------------------------------------------------------------------
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────
REGISTRY="ghcr.io"
IMAGE_NAME="gitsebastian6/ventifypos"
CONTAINER_NAME="ventifypos"
DEFAULT_PORT=3000

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[CD]${NC}   $*"; }
warn() { echo -e "${YELLOW}[CD]${NC}   $*"; }
ok()   { echo -e "${GREEN}[CD]${NC}   $*"; }
err()  { echo -e "${RED}[CD]${NC}   $*"; exit 1; }

# ── Parse arguments ───────────────────────────────────────────────────────
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
        --help|-h)
            echo "Usage: $0 [--deploy] [--deploy-only] [--tag VERSION] [--skip-tests]"
            echo ""
            echo "  --deploy       Build, push, and deploy to VPS"
            echo "  --deploy-only  Deploy existing image to VPS (skip build)"
            echo "  --tag VERSION  Tag the image with a specific version"
            echo "  --skip-tests   Skip test suite before building"
            exit 0
            ;;
        *) err "Unknown option: $1. Use --help for usage." ;;
    esac
done

# ── Pre-flight checks ─────────────────────────────────────────────────────
command -v docker &> /dev/null || err "Docker is not installed. Install it first: https://docs.docker.com/get-docker/"

if [ "$DEPLOY_ONLY" = false ]; then
    # Check Docker daemon
    docker info &> /dev/null || err "Docker daemon is not running. Start it first."

    # Check ghcr.io login
    if ! docker pull ${REGISTRY}/${IMAGE_NAME}:latest &> /dev/null 2>&1; then
        warn "Cannot pull from ghcr.io. You may need to login:"
        warn "  echo \$GITHUB_PAT | docker login ${REGISTRY} -u YOUR_USERNAME --password-stdin"
    fi
fi

# ── Get git info ──────────────────────────────────────────────────────────
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
GIT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "")

# ── Build tags ────────────────────────────────────────────────────────────
TAGS=()
TAGS+=("${REGISTRY}/${IMAGE_NAME}:${GIT_SHA}")
TAGS+=("${REGISTRY}/${IMAGE_NAME}:${GIT_BRANCH}")

if [ -n "$CUSTOM_TAG" ]; then
    TAGS+=("${REGISTRY}/${IMAGE_NAME}:${CUSTOM_TAG}")
fi

if [ -n "$GIT_TAG" ]; then
    TAGS+=("${REGISTRY}/${IMAGE_NAME}:${GIT_TAG}")
fi

if [ "$GIT_BRANCH" = "main" ] || [ "$GIT_BRANCH" = "master" ]; then
    TAGS+=("${REGISTRY}/${IMAGE_NAME}:latest")
fi

# ── Step 1: Run tests (optional) ──────────────────────────────────────────
if [ "$DEPLOY_ONLY" = false ] && [ "$SKIP_TESTS" = false ]; then
    log "Running test suite..."
    if npm test; then
        ok "All tests passed ✓"
    else
        err "Tests failed! Fix them before deploying."
    fi
else
    log "Skipping tests"
fi

# ── Step 2: Build Docker image ────────────────────────────────────────────
if [ "$DEPLOY_ONLY" = false ]; then
    log "Building Docker image..."
    BUILD_ARGS=""
    for tag in "${TAGS[@]}"; do
        BUILD_ARGS="$BUILD_ARGS -t $tag"
    done

    docker build \
        --build-arg BUILDKIT_INLINE_CACHE=1 \
        --cache-from ${REGISTRY}/${IMAGE_NAME}:latest \
        $BUILD_ARGS \
        -f Dockerfile \
        . || err "Docker build failed!"

    ok "Docker image built successfully"
    log "Tags:"
    for tag in "${TAGS[@]}"; do
        echo "  → $tag"
    done
fi

# ── Step 3: Push to registry ──────────────────────────────────────────────
if [ "$DEPLOY_ONLY" = false ]; then
    log "Pushing image to ${REGISTRY}..."
    for tag in "${TAGS[@]}"; do
        docker push "$tag" || warn "Failed to push $tag (may need login)"
    done
    ok "Image pushed to ${REGISTRY}"
fi

# ── Step 4: Deploy to VPS ─────────────────────────────────────────────────
if [ "$DEPLOY" = true ] || [ "$DEPLOY_ONLY" = true ]; then
    DEPLOY_HOST="${DEPLOY_HOST:-}"
    DEPLOY_USER="${DEPLOY_USER:-root}"
    DEPLOY_PORT="${DEPLOY_PORT:-22}"
    DEPLOY_IMAGE="${TAGS[0]}"

    if [ -z "$DEPLOY_HOST" ]; then
        err "DEPLOY_HOST not set. Set it via environment variable or command line."
    fi

    log "Deploying to ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PORT}"
    log "Image: ${DEPLOY_IMAGE}"

    ssh -p "$DEPLOY_PORT" "${DEPLOY_USER}@${DEPLOY_HOST}" << DEPLOY_SCRIPT
set -e

echo "═══════════════════════════════════════════"
echo "  VentifyPOS — VPS Deployment"
echo "═══════════════════════════════════════════"

# Pull the latest image
echo "📥 Pulling image..."
docker pull ${DEPLOY_IMAGE} || {
    echo "❌ Failed to pull image"
    exit 1
}

# Tag as latest
docker tag ${DEPLOY_IMAGE} ${REGISTRY}/${IMAGE_NAME}:latest

# Stop current container
echo "🛑 Stopping current container..."
docker stop ${CONTAINER_NAME} 2>/dev/null || true
docker rm ${CONTAINER_NAME} 2>/dev/null || true

# Start new container
echo "🚀 Starting new container..."
docker run -d \
    --name ${CONTAINER_NAME} \
    --restart unless-stopped \
    -p ${DEFAULT_PORT}:3000 \
    -v ventifypos-data:/app/db \
    --env-file /opt/ventifypos/.env \
    ${DEPLOY_IMAGE}

# Health check
echo "⏳ Waiting for health check..."
sleep 15

if curl -sf http://localhost:${DEFAULT_PORT}/api/health > /dev/null 2>&1; then
    echo "✅ Deployment successful — app is healthy!"
else
    echo "⚠️  Health check failed. Check logs:"
    docker logs ${CONTAINER_NAME} --tail 50
    exit 1
fi

# Cleanup old images
echo "🧹 Cleaning up old images..."
docker image prune -f --filter "until=72h"

echo "═══════════════════════════════════════════"
echo "  ✅ Deployment Complete!"
echo "═══════════════════════════════════════════"
DEPLOY_SCRIPT

    ok "Deployment to ${DEPLOY_HOST} complete"
fi

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo -e "  ${GREEN}✅ CD Pipeline Complete${NC}"
echo "═══════════════════════════════════════════"
echo ""
echo "  Git SHA:    ${GIT_SHA}"
echo "  Branch:     ${GIT_BRANCH}"
echo "  Image:      ${REGISTRY}/${IMAGE_NAME}"
echo "  Tags:"
for tag in "${TAGS[@]}"; do
    echo "    → ${tag##*:}"
done
if [ "$DEPLOY" = true ] || [ "$DEPLOY_ONLY" = true ]; then
    echo "  Deployed:   ${DEPLOY_HOST}"
else
    echo "  Deploy:     Not deployed (use --deploy flag)"
fi
echo ""
