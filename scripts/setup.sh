#!/usr/bin/env bash
# =============================================================================
# Sebwen POS — Unified Setup Script
# =============================================================================
# Replaces: switch-to-postgres.sh, switch-to-sqlite.sh, git-auto-commit.sh,
#           git-watch-push.sh, auto-git-push.sh, prisma/migrate-to-pg.sh
#
# Usage:
#   bash scripts/setup.sh switch-pg <postgresql-url>  # Switch to PostgreSQL
#   bash scripts/setup.sh switch-sqlite               # Rollback to SQLite
#   bash scripts/setup.sh git-commit                  # Audited auto-commit
#   bash scripts/setup.sh git-push                    # Push unpushed commits
#   bash scripts/setup.sh git-watch                   # Watch & auto-push (background)
#   bash scripts/setup.sh help                        # Show this help
# =============================================================================

set -euo pipefail

PROJECT_DIR="/home/z/my-project"
cd "$PROJECT_DIR"

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[setup]${NC} $*"; }
ok()   { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[setup]${NC} $*"; }
err()  { echo -e "${RED}[setup]${NC} $*"; exit 1; }

# =============================================================================
# Subcommand: switch-pg — Switch from SQLite to PostgreSQL
# =============================================================================
cmd_switch_pg() {
  if [ $# -lt 1 ]; then
    err "PostgreSQL connection URL required. Usage: bash scripts/setup.sh switch-pg <postgresql-url>"
  fi

  local PG_URL="$1"
  [[ ! "$PG_URL" =~ ^postgresql:// ]] && err "URL must start with postgresql://"

  log "PostgreSQL Migration"
  log "====================="

  # Test connection
  log "[1/5] Testing PostgreSQL connection..."
  if command -v pg_isready &>/dev/null; then
    local PG_HOST
    PG_HOST=$(echo "$PG_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@\([^:]*\):.*|\2|p')
    if pg_isready -h "$PG_HOST" -t 5 &>/dev/null; then
      ok "PostgreSQL server is reachable"
    else
      err "PostgreSQL server is not reachable"
    fi
  else
    warn "pg_isready not found, skipping connection test"
  fi

  # Backup SQLite
  log "[2/5] Backing up SQLite database..."
  local SQLITE_DB="$PROJECT_DIR/db/custom.db"
  if [ -f "$SQLITE_DB" ]; then
    cp "$SQLITE_DB" "$PROJECT_DIR/db/custom.db.backup.$(date +%Y%m%d_%H%M%S)"
    ok "SQLite backup created"
  else
    warn "No SQLite database found (fresh install)"
  fi

  # Update .env
  log "[3/5] Updating DATABASE_URL in .env..."
  local ENV_FILE="$PROJECT_DIR/.env"
  if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "$ENV_FILE.bak"
    if grep -q "^DATABASE_URL=" "$ENV_FILE"; then
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$PG_URL|" "$ENV_FILE"
    else
      echo "DATABASE_URL=$PG_URL" >> "$ENV_FILE"
    fi
    ok "DATABASE_URL updated in .env"
  else
    echo "DATABASE_URL=$PG_URL" > "$ENV_FILE"
    ok ".env created with DATABASE_URL"
  fi

  # Switch schema
  log "[4/5] Switching Prisma schema to PostgreSQL..."
  local SCHEMA_FILE="$PROJECT_DIR/prisma/schema.prisma"
  local PG_SCHEMA_FILE="$PROJECT_DIR/prisma/schema.postgresql.prisma"
  [ ! -f "$PG_SCHEMA_FILE" ] && err "schema.postgresql.prisma not found"
  cp "$SCHEMA_FILE" "$SCHEMA_FILE.bak"
  cp "$PG_SCHEMA_FILE" "$SCHEMA_FILE"
  ok "schema.prisma switched to PostgreSQL"

  # Generate & push
  log "[5/5] Generating Prisma client and pushing schema..."
  bunx prisma generate
  bunx prisma db push --accept-data-loss
  ok "Migration complete!"
}

# =============================================================================
# Subcommand: switch-sqlite — Rollback to SQLite
# =============================================================================
cmd_switch_sqlite() {
  log "Rollback to SQLite"
  log "==================="

  local SCHEMA_FILE="$PROJECT_DIR/prisma/schema.prisma"
  local ENV_FILE="$PROJECT_DIR/.env"

  # Restore schema
  log "[1/3] Restoring SQLite schema..."
  if [ -f "$SCHEMA_FILE.bak" ]; then
    cp "$SCHEMA_FILE.bak" "$SCHEMA_FILE"
    ok "schema.prisma restored from backup"
  else
    err "schema.prisma.bak not found — run switch-pg first to create a backup"
  fi

  # Restore .env
  log "[2/3] Restoring .env..."
  if [ -f "$ENV_FILE.bak" ]; then
    cp "$ENV_FILE.bak" "$ENV_FILE"
    ok ".env restored from backup"
  else
    if [ -f "$ENV_FILE" ]; then
      sed -i 's|^DATABASE_URL=.*|DATABASE_URL=file:/home/z/my-project/db/custom.db|' "$ENV_FILE"
      warn "DATABASE_URL set to SQLite (no .env.bak found)"
    fi
  fi

  # Regenerate
  log "[3/3] Regenerating Prisma client..."
  bunx prisma generate
  bunx prisma db push
  ok "Rollback complete — now using SQLite"
}

# =============================================================================
# Subcommand: git-commit — Audited auto-commit
# =============================================================================
cmd_git_commit() {
  local LOG_FILE="$PROJECT_DIR/.git-commit.log"

  git_log() {
    local ts
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[$ts] $1" | tee -a "$LOG_FILE"
  }

  git_log "Git Auto-Commit — Start"

  # Previous hash
  local PREV_HASH
  PREV_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "none")

  # Detect changes
  git add -A 2>/dev/null
  local CHANGED_FILES
  CHANGED_FILES=$(git diff --cached --name-only 2>/dev/null)
  local FILE_COUNT
  FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c . || true)

  if [ "$FILE_COUNT" -eq 0 ]; then
    git_log "No changes — project is clean"
    exit 0
  fi

  # Categorize
  local API_COUNT=0 COMP_COUNT=0 DB_COUNT=0 OTHER_COUNT=0
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    case "$file" in
      src/app/api/*)     ((API_COUNT++)) || true ;;
      src/components/*)  ((COMP_COUNT++)) || true ;;
      src/*|prisma/*|*.config*|package.json) ((DB_COUNT++)) || true ;;
      *)                 ((OTHER_COUNT++)) || true ;;
    esac
  done <<< "$CHANGED_FILES"

  local PARTS=""
  [ "$API_COUNT" -gt 0 ]  && PARTS="$PARTS APIs:$API_COUNT"
  [ "$COMP_COUNT" -gt 0 ] && PARTS="$PARTS Components:$COMP_COUNT"
  [ "$DB_COUNT" -gt 0 ]   && PARTS="$PARTS DB/Config:$DB_COUNT"
  [ "$OTHER_COUNT" -gt 0 ] && PARTS="$PARTS Others:$OTHER_COUNT"

  # Validation
  local VALIDATION_ERROR=0
  for file in package.json prisma/schema.prisma src/middleware.ts next.config.ts; do
    if echo "$CHANGED_FILES" | grep -q "^${file}$"; then
      if [ ! -s "$file" ]; then
        git_log "ERROR: $file is empty or missing"
        VALIDATION_ERROR=1
      fi
    fi
  done

  # Check for conflict markers
  local CONFLICT_MARKERS
  CONFLICT_MARKERS=$(git diff --cached -U0 2>/dev/null | grep -cE '^[+-]{7}' 2>/dev/null || echo "0")
  if [ "${CONFLICT_MARKERS:-0}" -gt 0 ]; then
    git reset HEAD >/dev/null 2>&1
    git_log "BLOCKED: Conflict markers detected"
    exit 1
  fi

  if [ "$VALIDATION_ERROR" -gt 0 ]; then
    git reset HEAD >/dev/null 2>&1
    git_log "BLOCKED: Validation failed"
    exit 1
  fi

  # Commit
  local DATE_SHORT
  DATE_SHORT=$(date -u +"%Y%m%d-%H%M")
  local COMMIT_MSG="[auto-commit] $DATE_SHORT — Sebwen POS ($FILE_COUNT files) |${PARTS} | prev:$PREV_HASH"

  if git commit -m "$COMMIT_MSG" 2>&1; then
    local NEW_HASH
    NEW_HASH=$(git rev-parse --short HEAD)
    git_log "Commit successful: $NEW_HASH"
  else
    git reset HEAD >/dev/null 2>&1
    git_log "Commit failed"
    exit 1
  fi
}

# =============================================================================
# Subcommand: git-push — One-shot push of unpushed commits
# =============================================================================
cmd_git_push() {
  local UNPUSHED
  UNPUSHED=$(git log --oneline origin/main..main 2>/dev/null | wc -l)

  if [ "$UNPUSHED" -gt 0 ]; then
    log "Found $UNPUSHED unpushed commit(s), pushing..."
    git push origin main 2>&1
    ok "Push completed"
  else
    ok "No unpushed commits"
  fi
}

# =============================================================================
# Subcommand: git-watch — Background watcher that auto-pushes
# =============================================================================
cmd_git_watch() {
  log "Git auto-push watcher started (checking every 30s)..."
  while true; do
    sleep 30
    git fetch origin main 2>/dev/null
    local UNPUSHED
    UNPUSHED=$(git log --oneline origin/main..main 2>/dev/null | wc -l | tr -d ' ')
    if [ "$UNPUSHED" -gt 0 ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Found $UNPUSHED unpushed commit(s), pushing..."
      git push origin main 2>&1
    fi
  done
}

# =============================================================================
# Main dispatch
# =============================================================================
COMMAND="${1:-help}"
shift 2>/dev/null || true

case "$COMMAND" in
  switch-pg|pg)       cmd_switch_pg "$@" ;;
  switch-sqlite|sqlite) cmd_switch_sqlite ;;
  git-commit|commit)  cmd_git_commit ;;
  git-push|push)      cmd_git_push ;;
  git-watch|watch)    cmd_git_watch ;;
  help|--help|-h)
    echo "Sebwen POS — Unified Setup Script"
    echo ""
    echo "Usage: bash scripts/setup.sh [COMMAND] [ARGS]"
    echo ""
    echo "Commands:"
    echo "  switch-pg <url>   Switch from SQLite to PostgreSQL"
    echo "  switch-sqlite     Rollback to SQLite"
    echo "  git-commit        Audited auto-commit"
    echo "  git-push          Push unpushed commits (one-shot)"
    echo "  git-watch         Background watcher (auto-push every 30s)"
    echo "  help              Show this help"
    ;;
  *)
    err "Unknown command: $COMMAND. Use 'help' for usage."
    ;;
esac
