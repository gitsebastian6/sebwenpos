#!/usr/bin/env bash
# Ventify POS — Rollback to SQLite (development)
# Usage: ./scripts/switch-to-sqlite.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Ventify POS — Rollback to SQLite${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"

SCHEMA_FILE="$PROJECT_ROOT/prisma/schema.prisma"
ENV_FILE="$PROJECT_ROOT/.env"

# Step 1: Restore SQLite schema from backup
echo -e "\n${YELLOW}[1/3] Restoring SQLite schema...${NC}"
if [ -f "$SCHEMA_FILE.bak" ]; then
    cp "$SCHEMA_FILE.bak" "$SCHEMA_FILE"
    echo -e "${GREEN}  ✓ schema.prisma restored from backup${NC}"
else
    echo -e "${RED}  ✗ schema.prisma.bak not found${NC}"
    echo "  Run the migration script first to create a backup."
    exit 1
fi

# Step 2: Restore .env
echo -e "\n${YELLOW}[2/3] Restoring .env...${NC}"
if [ -f "$ENV_FILE.bak" ]; then
    cp "$ENV_FILE.bak" "$ENV_FILE"
    echo -e "${GREEN}  ✓ .env restored from backup${NC}"
else
    # Fallback: manually set SQLite URL
    if [ -f "$ENV_FILE" ]; then
        sed -i 's|^DATABASE_URL=.*|DATABASE_URL=file:/home/z/my-project/db/custom.db|' "$ENV_FILE"
        echo -e "${YELLOW}  ⚠ DATABASE_URL set to SQLite (no .env.bak found)${NC}"
    fi
fi

# Step 3: Regenerate Prisma client
echo -e "\n${YELLOW}[3/3] Regenerating Prisma client...${NC}"
cd "$PROJECT_ROOT"
bunx prisma generate
echo -e "${GREEN}  ✓ Prisma client generated${NC}"

bunx prisma db push
echo -e "${GREEN}  ✓ Schema pushed to SQLite${NC}"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Rollback complete — now using SQLite${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
