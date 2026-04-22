#!/bin/bash
# Ventify POS — SQLite to PostgreSQL Migration Helper
# Run this script after setting up a PostgreSQL database.

set -e

echo "=== Ventify POS: PostgreSQL Migration ==="
echo ""
echo "Prerequisites:"
echo "  1. PostgreSQL server running"
echo "  2. DATABASE_URL in .env pointing to PostgreSQL"
echo ""
echo "Steps:"
echo "  1. Create database: createdb ventify"
echo "  2. Update .env: DATABASE_URL=postgresql://user:pass@localhost:5432/ventify"
echo "  3. Run: bun run db:push    (creates tables)"
echo "  4. Run: bun run seed-pg    (seeds initial data)"
echo ""
echo "Current DATABASE_URL: ${DATABASE_URL:-not set}"
echo ""
echo "To migrate existing data from SQLite:"
echo "  1. Export SQLite data: sqlite3 db/custom.db '.dump' > sqlite_dump.sql"
echo "  2. Manually convert and import into PostgreSQL"
echo ""
