#!/bin/bash
# ---------------------------------------------------------------------------
# VentifyPOS — Setup Unified CI/CD Workflow on GitHub
# ---------------------------------------------------------------------------
# This script updates the CI workflow file (ci.yml) on GitHub with the
# unified CI/CD pipeline that includes Docker build, ghcr.io publish,
# and VPS deployment.
#
# IMPORTANT: The default PAT doesn't have 'workflow' scope, which is required
# to create or modify files in the .github/workflows/ directory.
#
# To use this script, you need a GitHub Personal Access Token with:
#   - repo scope (full control of private repositories)
#   - workflow scope (update GitHub Action workflows)
#
# Create one at: https://github.com/settings/tokens/new?scopes=repo,workflow
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO="gitsebastian6/ventifypos"
WORKFLOW_FILE=".github/workflows/ci.yml"
SOURCE_FILE="$REPO_ROOT/.github/workflows/ci.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[SETUP]${NC} $*"; }
ok()   { echo -e "${GREEN}[SETUP]${NC} $*"; }
warn() { echo -e "${YELLOW}[SETUP]${NC} $*"; }
err()  { echo -e "${RED}[SETUP]${NC} $*"; exit 1; }

# ── Get PAT ──────────────────────────────────────────────────────────────
if [ -n "${GITHUB_TOKEN:-}" ]; then
    PAT="$GITHUB_TOKEN"
else
    echo ""
    echo "Enter a GitHub PAT with 'workflow' scope:"
    echo "  (Create at: https://github.com/settings/tokens/new?scopes=repo,workflow)"
    echo ""
    read -rsp "PAT: " PAT
    echo ""
fi

# ── Check current file on GitHub ─────────────────────────────────────────
log "Checking current CI workflow on GitHub..."

RESPONSE=$(curl -s \
    -H "Authorization: token $PAT" \
    "https://api.github.com/repos/$REPO/contents/$WORKFLOW_FILE?ref=main")

SHA=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('sha',''))" 2>/dev/null || echo "")

if [ -z "$SHA" ]; then
    err "Could not find $WORKFLOW_FILE on GitHub. Make sure the repo and PAT are correct."
fi

# ── Check if local file has CD content ───────────────────────────────────
if [ ! -f "$SOURCE_FILE" ]; then
    err "Local workflow file not found: $SOURCE_FILE"
fi

if ! grep -q "docker-build-push" "$SOURCE_FILE"; then
    err "Local ci.yml doesn't contain CD jobs. Make sure you've merged the CD pipeline."
fi

# ── Update the workflow file on GitHub ───────────────────────────────────
log "Updating CI/CD workflow on GitHub..."

CONTENT=$(base64 -w 0 "$SOURCE_FILE")

RESPONSE=$(curl -s -X PUT \
    -H "Authorization: token $PAT" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$REPO/contents/$WORKFLOW_FILE" \
    -d "{
        \"message\": \"feat: unified CI/CD pipeline — merge CD into ci.yml (Phase 4B)\",
        \"content\": \"${CONTENT}\",
        \"sha\": \"${SHA}\",
        \"branch\": \"main\"
    }")

# Check the response
if echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if 'content' in d else 1)" 2>/dev/null; then
    ok "CI/CD workflow updated successfully! ✅"
    ok "The unified pipeline will now run on every push to main."
    echo ""
    echo "  Pipeline flow:"
    echo "    Push to main → CI (build + test) → CD (Docker build + push to ghcr.io) → Deploy (optional)"
    echo ""
    echo "  Docker image: ghcr.io/$REPO"
    echo "  Manual trigger: https://github.com/$REPO/actions/workflows/ci.yml"
    echo ""
    echo "  Required GitHub Secrets for CD:"
    echo "    DEPLOY_HOST     - VPS hostname/IP"
    echo "    DEPLOY_USER     - SSH user (default: root)"
    echo "    DEPLOY_SSH_KEY  - Private SSH key"
    echo "    DEPLOY_PORT     - SSH port (default: 22)"
    echo ""
    echo "  Add secrets at: https://github.com/$REPO/settings/secrets/actions"
else
    ERROR_MSG=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('message','Unknown error'))" 2>/dev/null || echo "Unknown error")
    if echo "$ERROR_MSG" | grep -qi "workflow"; then
        warn "PAT doesn't have 'workflow' scope. ❌"
        echo ""
        echo "  To fix this, update ci.yml via the GitHub Web UI:"
        echo "  1. Go to: https://github.com/$REPO/edit/main/.github/workflows/ci.yml"
        echo "  2. Replace the entire content with the local file:"
        echo "     $SOURCE_FILE"
        echo "  3. Click 'Commit changes'"
    else
        err "Failed to update workflow: $ERROR_MSG"
    fi
fi
