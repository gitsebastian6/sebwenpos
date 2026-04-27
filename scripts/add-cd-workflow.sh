#!/bin/bash
# ---------------------------------------------------------------------------
# VentifyPOS — Add CD Workflow to GitHub
# ---------------------------------------------------------------------------
# This script helps you add the CD workflow file (cd.yml) to GitHub.
# Since the PAT doesn't have 'workflow' scope, we need to add the file
# through the GitHub web interface or with a new PAT that has 'workflow' scope.
# ---------------------------------------------------------------------------
set -e

REPO="https://github.com/gitsebastian6/ventifypos"
CD_FILE=".github/workflows/cd.yml"

echo "═══════════════════════════════════════════"
echo "  VentifyPOS — Add CD Workflow"
echo "═══════════════════════════════════════════"
echo ""
echo "The CD workflow file needs to be added to GitHub."
echo "Your PAT doesn't have 'workflow' scope, so it can't be done via API."
echo ""
echo "Choose a method:"
echo ""
echo "  1. GitHub Web UI (easiest)"
echo "     → Open: ${REPO}/new/main?filename=${CD_FILE}"
echo "     → Paste the content of ${CD_FILE}"
echo "     → Click 'Commit changes'"
echo ""
echo "  2. New PAT with 'workflow' scope"
echo "     → Create at: https://github.com/settings/tokens"
echo "     → Select the 'workflow' scope"
echo "     → Run: git push origin main"
echo ""
echo "  3. Use GitHub CLI (if available)"
echo "     → gh auth login --scopes repo,workflow"
echo "     → git push origin main"
echo ""

# Option to open the browser
if [[ "$OSTYPE" == "darwin"* ]]; then
    open_cmd="open"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    open_cmd="xdg-open"
else
    open_cmd=""
fi

if [ -n "$open_cmd" ]; then
    read -rp "Open the GitHub file creation page in your browser? (Y/n): " choice
    if [[ ! "$choice" =~ ^[Nn]$ ]]; then
        $open_cmd "${REPO}/new/main?filename=${CD_FILE}"
    fi
fi
