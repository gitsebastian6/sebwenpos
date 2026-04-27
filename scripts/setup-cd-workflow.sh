#!/bin/bash
# ---------------------------------------------------------------------------
# VentifyPOS — Setup CD Workflow on GitHub
# ---------------------------------------------------------------------------
# This script adds the CD workflow file (cd.yml) to the GitHub repository.
#
# IMPORTANT: The default PAT doesn't have 'workflow' scope, which is required
# to create or modify files in the .github/workflows/ directory.
#
# To use this script, you need a GitHub Personal Access Token with:
#   - repo scope (full control of private repositories)
#   - workflow scope (update GitHub Action workflows)
#
# Create one at: https://github.com/settings/tokens/new
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO="gitsebastian6/ventifypos"
WORKFLOW_FILE=".github/workflows/cd.yml"
TEMPLATE_FILE="$REPO_ROOT/.github/cd.yml.template"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[SETUP]${NC} $*"; }
ok()   { echo -e "${GREEN}[SETUP]${NC} $*"; }
err()  { echo -e "${RED}[SETUP]${NC} $*"; exit 1; }

# ── Check if cd.yml already exists on GitHub ──────────────────────────────
log "Checking if CD workflow already exists on GitHub..."

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

# Check if the file already exists
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: token $PAT" \
    "https://api.github.com/repos/$REPO/contents/$WORKFLOW_FILE?ref=main")

if [ "$HTTP_CODE" = "200" ]; then
    ok "CD workflow already exists on GitHub! ✅"
    exit 0
fi

# ── Add the workflow file ─────────────────────────────────────────────────
if [ ! -f "$TEMPLATE_FILE" ]; then
    err "Template file not found: $TEMPLATE_FILE"
fi

log "Adding CD workflow to GitHub..."

# Read and encode the template file
CONTENT=$(base64 -w 0 "$TEMPLATE_FILE")

# Create the file via GitHub API
RESPONSE=$(curl -s -X PUT \
    -H "Authorization: token $PAT" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$REPO/contents/$WORKFLOW_FILE" \
    -d "{
        \"message\": \"feat: add CD workflow (Phase 4B — Continuous Deployment)\",
        \"content\": \"${CONTENT}\",
        \"branch\": \"main\"
    }")

# Check the response
if echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if 'content' in d else 1)" 2>/dev/null; then
    ok "CD workflow added successfully! ✅"
    ok "The CD pipeline will now run automatically after CI passes on main."
    echo ""
    echo "  Pipeline flow:"
    echo "    Push to main → CI (build + test) → CD (Docker build + push to ghcr.io)"
    echo ""
    echo "  Docker image: ghcr.io/$REPO"
    echo "  Manual trigger: https://github.com/$REPO/actions/workflows/cd.yml"
else
    ERROR_MSG=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('message','Unknown error'))" 2>/dev/null || echo "Unknown error")
    err "Failed to add CD workflow: $ERROR_MSG"
fi
