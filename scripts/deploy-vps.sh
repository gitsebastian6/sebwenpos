#!/bin/bash
# ---------------------------------------------------------------------------
# VentifyPOS — VPS Deployment Script
# ---------------------------------------------------------------------------
# Sets up a fresh VPS for VentifyPOS production deployment.
# Run this once on the server to install Docker, configure the environment,
# and start the application.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/gitsebastian6/ventifypos/main/scripts/deploy-vps.sh | bash
#
# Or clone and run:
#   bash scripts/deploy-vps.sh
# ---------------------------------------------------------------------------
# Prerequisites:
#   - Ubuntu 20.04+ or Debian 11+ VPS
#   - Root or sudo access
#   - At least 2GB RAM, 10GB disk
# ---------------------------------------------------------------------------

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────
APP_NAME="ventifypos"
APP_DIR="/opt/${APP_NAME}"
DATA_DIR="/opt/${APP_NAME}/data"
ENV_FILE="${APP_DIR}/.env"
DOCKER_COMPOSE_FILE="${APP_DIR}/docker-compose.yml"
IMAGE="ghcr.io/gitsebastian6/ventifypos:latest"
PORT=3000

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Pre-flight checks ─────────────────────────────────────────────────────
log "VentifyPOS VPS Deployment"
log "========================="

[ "$(id -u)" -eq 0 ] || err "This script must be run as root (use sudo)"

# ── 1. Install Docker ─────────────────────────────────────────────────────
install_docker() {
    if command -v docker &> /dev/null; then
        ok "Docker already installed: $(docker --version)"
        return
    fi

    log "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    ok "Docker installed successfully"
}

# ── 2. Create app directory ───────────────────────────────────────────────
setup_directories() {
    log "Setting up directories..."
    mkdir -p "${APP_DIR}"
    mkdir -p "${DATA_DIR}"
    ok "Directories created at ${APP_DIR}"
}

# ── 3. Create .env file ──────────────────────────────────────────────────
setup_env() {
    if [ -f "${ENV_FILE}" ]; then
        warn ".env file already exists at ${ENV_FILE}"
        warn "Review and update manually if needed"
        return
    fi

    log "Creating .env file..."
    cat > "${ENV_FILE}" << 'EOF'
# =============================================================================
# VentifyPOS — Production Environment Variables
# =============================================================================
# IMPORTANT: Update ALL values below before starting the application.
# Generate secrets with: openssl rand -base64 32
# =============================================================================

# ─── Core ──────────────────────────────────────────────────────────────────
DATABASE_URL="file:/app/db/custom.db"
AUTH_SECRET=""
INTERNAL_SECRET=""
ENCRYPTION_KEY=""
NEXT_PUBLIC_APP_URL="https://your-domain.com"
NODE_ENV="production"

# ─── Sentry ────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=""

# ─── DIAN ──────────────────────────────────────────────────────────────────
DIAN_SOFTWARE_PROVIDER_NIT=""
DIAN_SOFTWARE_NAME="Ventify POS"
DIAN_SOFTWARE_PIN=""
DIAN_CERT_PASSWORD=""

# ─── SMTP ──────────────────────────────────────────────────────────────────
SMTP_HOST=""
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="facturacion@your-domain.com"
SMTP_FROM_NAME="Ventify POS Facturación"

# ─── MessageBird ──────────────────────────────────────────────────────────
MESSAGEBIRD_API_KEY=""
MESSAGEBIRD_PHONE=""
MESSAGEBIRD_TEMPLATE_ID=""

# ─── Support ──────────────────────────────────────────────────────────────
SUPPORT_PHONE=""

# ─── Super Admin ──────────────────────────────────────────────────────────
ALLOW_SEED="false"

# ─── Deployment ───────────────────────────────────────────────────────────
ALERT_API_BASE="http://localhost"
EOF

    warn "⚠️  .env file created at ${ENV_FILE}"
    warn "⚠️  You MUST fill in the required values before starting!"
    echo ""
    echo "  Required values to set:"
    echo "    - AUTH_SECRET       (generate: openssl rand -base64 32)"
    echo "    - INTERNAL_SECRET   (generate: openssl rand -base64 32)"
    echo "    - NEXT_PUBLIC_APP_URL (your domain, e.g., https://pos.yourdomain.com)"
    echo "    - SMTP_FROM         (sender email for invoices)"
    echo ""
}

# ── 4. Create docker-compose.yml ──────────────────────────────────────────
setup_docker_compose() {
    log "Creating docker-compose.yml..."
    cat > "${DOCKER_COMPOSE_FILE}" << 'COMPOSE'
# VentifyPOS — Production Docker Compose
version: "3.8"

services:
  app:
    image: ghcr.io/gitsebastian6/ventifypos:latest
    container_name: ventifypos
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ventifypos-data:/app/db
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Caddy reverse proxy (optional — for SSL/TLS)
  caddy:
    image: caddy:2-alpine
    container_name: ventifypos-caddy
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
  ventifypos-data:
    driver: local
  caddy_data:
  caddy_config:
COMPOSE

    # Create production Caddyfile
    if [ ! -f "${APP_DIR}/Caddyfile" ]; then
        cat > "${APP_DIR}/Caddyfile" << 'CADDY'
# VentifyPOS — Production Caddyfile
# Replace your-domain.com with your actual domain
your-domain.com {
    reverse_proxy app:3000 {
        header_up Host {host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }

    # Security headers
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    # Compress responses
    encode gzip
}
CADDY
    fi

    ok "docker-compose.yml created"
}

# ── 5. Login to GitHub Container Registry ─────────────────────────────────
login_ghcr() {
    log "GitHub Container Registry login..."
    log "If the image is private, you need to authenticate."
    log "Create a PAT with 'read:packages' scope at:"
    log "  https://github.com/settings/tokens"
    echo ""
    read -rp "Do you need to authenticate with ghcr.io? (y/N): " auth_choice
    if [[ "$auth_choice" =~ ^[Yy]$ ]]; then
        read -rp "Enter your GitHub username: " gh_user
        read -rp "Enter your GitHub PAT (read:packages): " gh_pat
        echo "$gh_pat" | docker login ghcr.io -u "$gh_user" --password-stdin
        ok "Logged in to ghcr.io"
    else
        log "Skipping ghcr.io login (public image)"
    fi
}

# ── 6. Start the application ──────────────────────────────────────────────
start_app() {
    log "Starting VentifyPOS..."

    cd "${APP_DIR}"

    # Pull the latest image
    docker compose pull

    # Start the services
    docker compose up -d

    # Wait for health check
    log "Waiting for application to start..."
    for i in $(seq 1 30); do
        if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
            ok "VentifyPOS is running and healthy!"
            ok "Access at: http://localhost:${PORT}"
            return
        fi
        sleep 2
    done

    warn "App started but health check not yet passing."
    warn "Check logs: cd ${APP_DIR} && docker compose logs -f"
}

# ── 7. Display summary ───────────────────────────────────────────────────
show_summary() {
    echo ""
    echo "═══════════════════════════════════════════"
    echo -e "  ${GREEN}✅ VentifyPOS Deployment Setup Complete${NC}"
    echo "═══════════════════════════════════════════"
    echo ""
    echo "  📁 App directory:  ${APP_DIR}"
    echo "  📄 Environment:    ${ENV_FILE}"
    echo "  🐳 Docker Compose: ${DOCKER_COMPOSE_FILE}"
    echo "  🌐 Port:           ${PORT}"
    echo ""
    echo "  Next steps:"
    echo "    1. Edit ${ENV_FILE} with your production values"
    echo "    2. Edit ${APP_DIR}/Caddyfile with your domain"
    echo "    3. Run: cd ${APP_DIR} && docker compose up -d"
    echo "    4. Check: curl http://localhost:${PORT}/api/health"
    echo ""
    echo "  Useful commands:"
    echo "    docker compose logs -f          # View logs"
    echo "    docker compose restart          # Restart app"
    echo "    docker compose pull && docker compose up -d  # Update"
    echo "    docker compose down             # Stop app"
    echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────
main() {
    install_docker
    setup_directories
    setup_env
    setup_docker_compose
    login_ghcr
    start_app
    show_summary
}

main "$@"
