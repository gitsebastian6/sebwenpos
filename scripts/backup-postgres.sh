#!/usr/bin/env bash
# ============================================================
# SEBWEN POS — Backup nightly de Postgres (formato custom)
# Retención: 7 diarios + 4 semanales. Verifica integridad con pg_restore --list.
# Uso: ./scripts/backup-postgres.sh  (vía cron del host, ej. 03:00)
# Requiere: docker compose corriendo con servicio "db".
# ============================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
CONTAINER="${DB_CONTAINER:-db}"
PGUSER="${POSTGRES_USER:-sebwen}"
PGDATABASE="${POSTGRES_DB:-sebwen}"
KEEP_DAILY=7
KEEP_WEEKLY=4

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%F)
FILE="$BACKUP_DIR/${PGDATABASE}_${STAMP}.dump"

echo "[backup] Dumping $PGDATABASE → $FILE"
docker compose exec -T "$CONTAINER" pg_dump -U "$PGUSER" -Fc "$PGDATABASE" > "$FILE"

# ── Verificación de integridad ──
if ! docker compose exec -T "$CONTAINER" pg_restore --list < "$FILE" > /dev/null 2>&1; then
  echo "[backup] ERROR: dump corrupto o ilegible: $FILE" >&2
  rm -f "$FILE"
  exit 1
fi
echo "[backup] Dump verificado OK ($(du -h "$FILE" | cut -f1))"

# ── Retención: diarios ──
ls -1t "$BACKUP_DIR"/${PGDATABASE}_*.dump 2>/dev/null | tail -n +$((KEEP_DAILY + 1)) | while read -r old; do
  # Conservar domingos como semanales
  DOW=$(basename "$old" | sed "s/.*\([0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\).*/\1/")
  if [ "$(date -d "$DOW" +%u 2>/dev/null || echo 7)" != "7" ]; then
    rm -f "$old"; echo "[backup] Pruned daily: $(basename "$old")"
  fi
done

# ── Retención: semanales (domingos), conservar últimos KEEP_WEEKLY ──
ls -1t "$BACKUP_DIR"/${PGDATABASE}_*-07.dump "$BACKUP_DIR"/${PGDATABASE}_*-14.dump \
      "$BACKUP_DIR"/${PGDATABASE}_*-21.dump "$BACKUP_DIR"/${PGDATABASE}_*-28.dump 2>/dev/null \
  | tail -n +$((KEEP_WEEKLY + 1)) | while read -r old; do
    rm -f "$old"; echo "[backup] Pruned weekly: $(basename "$old")"
  done

echo "[backup] Done."
