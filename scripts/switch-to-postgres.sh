#!/usr/bin/env bash
# Ventify POS — Switch from SQLite to PostgreSQL
# Usage: ./scripts/switch-to-postgres.sh <postgresql-url>
# Example: ./scripts/switch-to-postgres.sh postgresql://ventify:secret@localhost:5432/ventify_db

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Ventify POS — PostgreSQL Migration${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"

# Check for PG URL argument
if [ $# -lt 1 ]; then
    echo -e "${RED}Error: PostgreSQL connection URL required${NC}"
    echo "Usage: $0 <postgresql-url>"
    echo "Example: $0 postgresql://ventify:secret@localhost:5432/ventify_db"
    exit 1
fi

PG_URL="$1"

# Validate URL format
if [[ ! "$PG_URL" =~ ^postgresql:// ]]; then
    echo -e "${RED}Error: URL must start with postgresql://${NC}"
    exit 1
fi

# Step 1: Test PostgreSQL connection
echo -e "\n${YELLOW}[1/5] Testing PostgreSQL connection...${NC}"
if command -v pg_isready &>/dev/null; then
    PG_HOST=$(echo "$PG_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@\([^:]*\):\([0-9]*\)/.*|\2|p')
    if pg_isready -h "$PG_HOST" -t 5 &>/dev/null; then
        echo -e "${GREEN}  ✓ PostgreSQL server is reachable${NC}"
    else
        echo -e "${RED}  ✗ PostgreSQL server is not reachable${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}  ⚠ pg_isready not found, skipping connection test${NC}"
fi

# Step 2: Backup current SQLite database
echo -e "\n${YELLOW}[2/5] Backing up SQLite database...${NC}"
SQLITE_DB="$PROJECT_ROOT/db/custom.db"
if [ -f "$SQLITE_DB" ]; then
    BACKUP_FILE="$PROJECT_ROOT/db/custom.db.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$SQLITE_DB" "$BACKUP_FILE"
    echo -e "${GREEN}  ✓ Backup created: db/custom.db.backup.$(date +%Y%m%d_%H%M%S)${NC}"
else
    echo -e "${YELLOW}  ⚠ No SQLite database found (fresh install)${NC}"
fi

# Step 3: Update .env file
echo -e "\n${YELLOW}[3/5] Updating DATABASE_URL in .env...${NC}"
ENV_FILE="$PROJECT_ROOT/.env"
if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "$ENV_FILE.bak"
    if grep -q "^DATABASE_URL=" "$ENV_FILE"; then
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$PG_URL|" "$ENV_FILE"
        echo -e "${GREEN}  ✓ DATABASE_URL updated in .env${NC}"
    else
        echo "DATABASE_URL=$PG_URL" >> "$ENV_FILE"
        echo -e "${GREEN}  ✓ DATABASE_URL added to .env${NC}"
    fi
else
    echo "DATABASE_URL=$PG_URL" > "$ENV_FILE"
    echo -e "${GREEN}  ✓ .env created with DATABASE_URL${NC}"
fi

# Step 4: Copy PostgreSQL schema (replaces SQLite schema)
echo -e "\n${YELLOW}[4/5] Switching Prisma schema to PostgreSQL...${NC}"
SCHEMA_FILE="$PROJECT_ROOT/prisma/schema.prisma"
PG_SCHEMA_FILE="$PROJECT_ROOT/prisma/schema.postgresql.prisma"

if [ ! -f "$PG_SCHEMA_FILE" ]; then
    echo -e "${RED}  ✗ schema.postgresql.prisma not found${NC}"
    exit 1
fi

# Backup current SQLite schema
cp "$SCHEMA_FILE" "$SCHEMA_FILE.bak"
echo -e "  ✓ SQLite schema backed up to schema.prisma.bak"

# Copy PG schema as the active schema
cp "$PG_SCHEMA_FILE" "$SCHEMA_FILE"
echo -e "${GREEN}  ✓ schema.postgresql.prisma → schema.prisma${NC}"

# Step 5: Generate Prisma client and push schema
echo -e "\n${YELLOW}[5/5] Generating Prisma client and pushing schema...${NC}"
cd "$PROJECT_ROOT"

echo -e "  Generating Prisma client..."
bunx prisma generate
echo -e "${GREEN}  ✓ Prisma client generated${NC}"

echo -e "  Pushing schema to database..."
bunx prisma db push --accept-data-loss
echo -e "${GREEN}  ✓ Schema pushed to PostgreSQL${NC}"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Migration complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. Run seed data:  bun run seed"
echo "  2. Start the app:   bun run dev"
echo "  3. Test the setup:  Visit your app and verify functionality"
echo ""
echo "To rollback to SQLite (use ./scripts/switch-to-sqlite.sh):"
echo "  1. Restores schema.prisma.bak → schema.prisma"
echo "  2. Restores .env.bak → .env"
echo "  3. Regenerates Prisma client"
