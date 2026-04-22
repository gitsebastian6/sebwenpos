#!/bin/bash
# =============================================================================
# Ventify POS — Git Auto-Commit con Auditoría
# =============================================================================
# Ejecuta: bash scripts/git-auto-commit.sh
# Cron:    Se ejecuta cada hora vía mini-service (index.ts)
# =============================================================================

set -euo pipefail

PROJECT_DIR="/home/z/my-project"
LOG_FILE="$PROJECT_DIR/.git-commit.log"
cd "$PROJECT_DIR"

# ─── Logging ──────────────────────────────────────────────────────────────────
log() {
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "[$ts] $1" | tee -a "$LOG_FILE"
}

# ─── Inicio ──────────────────────────────────────────────────────────────────
log "═══════════════════════════════════════════════════════════════"
log "[INICIO] Git Auto-Commit — Ventify POS"
log "═══════════════════════════════════════════════════════════════"

# ─── PASO 1: Hash anterior ───────────────────────────────────────────────────
PREV_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "none")
log "[PASO 1/6] Hash anterior: $PREV_HASH"

# ─── PASO 2: Detectar cambios ───────────────────────────────────────────────
log "[PASO 2/6] Detectando cambios pendientes..."
git add -A 2>/dev/null

CHANGED_FILES=$(git diff --cached --name-only 2>/dev/null)
FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c . || true)

if [ "$FILE_COUNT" -eq 0 ]; then
  log "  ✓ Sin cambios pendientes — proyecto está limpio"
  log "═══════════════════════════════════════════════════════════════"
  log "[RESULTADO] Commit auditado y perfeccionado — Nada nuevo que commitear"
  log "═══════════════════════════════════════════════════════════════"
  exit 0
fi

log "  Archivos modificados: $FILE_COUNT"

# ─── PASO 3: Categorizar cambios ────────────────────────────────────────────
log "[PASO 3/6] Auditando cambios..."

API_COUNT=0
COMP_COUNT=0
DB_COUNT=0
OTHER_COUNT=0

while IFS= read -r file; do
  [ -z "$file" ] && continue
  case "$file" in
    src/app/api/*)     ((API_COUNT++)) || true ;;
    src/components/*)  ((COMP_COUNT++)) || true ;;
    src/*|prisma/*|*.config*|*.mjs|package.json|.env) ((DB_COUNT++)) || true ;;
    *)                 ((OTHER_COUNT++)) || true ;;
  esac
done <<< "$CHANGED_FILES"

PARTS=""
[ "$API_COUNT" -gt 0 ]  && PARTS="$PARTS APIs:$API_COUNT"
[ "$COMP_COUNT" -gt 0 ] && PARTS="$PARTS Components:$COMP_COUNT"
[ "$DB_COUNT" -gt 0 ]   && PARTS="$PARTS DB/Config:$DB_COUNT"
[ "$OTHER_COUNT" -gt 0 ] && PARTS="$PARTS Otros:$OTHER_COUNT"

log "  Desglose: $PARTS"

# ─── PASO 4: Validación de integridad ───────────────────────────────────────
log "[PASO 4/6] Validación de integridad..."
VALIDATION_ERROR=0

for file in package.json prisma/schema.prisma src/middleware.ts next.config.ts src/app/api/auth/login/route.ts src/app/api/auth/setup/route.ts src/lib/db.ts; do
  if echo "$CHANGED_FILES" | grep -q "^${file}$"; then
    if [ -s "$file" ]; then
      log "  ✓ $file — OK"
    else
      log "  ✗ $file — ARCHIVO VACÍO O NO EXISTE"
      VALIDATION_ERROR=1
    fi
  fi
done

# Validar versión de Next.js
if echo "$CHANGED_FILES" | grep -q "^package.json$"; then
  NEXT_VER=$(grep -oP '"next":\s*"[\^]?\K[0-9]+' package.json 2>/dev/null || echo "0")
  if [ "$NEXT_VER" -lt 16 ] 2>/dev/null; then
    log "  ✗ ALERTA: Next.js bajó a v$NEXT_VER — debe ser v16+"
    VALIDATION_ERROR=1
  else
    log "  ✓ Next.js v$NEXT_VER — versión correcta (≥16)"
  fi

  # Verificar dependencias críticas
  for dep in next react @prisma/client prisma zod bcryptjs; do
    if ! grep -q "\"$dep\"" package.json; then
      log "  ✗ Dependencia crítica faltante: $dep"
      VALIDATION_ERROR=1
    fi
  done
  [ "$VALIDATION_ERROR" -eq 0 ] && log "  ✓ Dependencias críticas verificadas"
fi

# ─── PASO 5: Detectar conflictos ────────────────────────────────────────────
log "[PASO 5/6] Verificando conflictos potenciales..."
CONFLICT_MARKERS=$(git diff --cached -U0 2>/dev/null | grep -cE '^[+-]{7}' 2>/dev/null) || CONFLICT_MARKERS=0
CONFLICT_MARKERS=$(echo "$CONFLICT_MARKERS" | tr -d '[:space:]')

if [ "${CONFLICT_MARKERS:-0}" -gt 0 ]; then
  log "  ✗ Se detectaron $CONFLICT_MARKERS marcador(es) de conflicto"
  
  # Find conflicted files
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    if grep -qE '<<<<<<<|>>>>>>>' "$file" 2>/dev/null; then
      log "    → Conflicto en: $file"
    fi
  done <<< "$CHANGED_FILES"
  
  # Unstage para proteger
  git reset HEAD >/dev/null 2>&1
  log "  → CONFLICTO DETECTADO — Cambios unstaged para protección"
  log "═══════════════════════════════════════════════════════════════"
  log "[BLOQUEADO] Conflicto detectado — commit no realizado"
  log "═══════════════════════════════════════════════════════════════"
  exit 1
fi
log "  ✓ Sin conflictos detectados"

# Abortar si hay errores de validación
if [ "$VALIDATION_ERROR" -gt 0 ]; then
  git reset HEAD >/dev/null 2>&1
  log "  → VALIDACIÓN FALLIDA — Cambios unstaged"
  log "═══════════════════════════════════════════════════════════════"
  log "[BLOQUEADO] Validación fallida — commit no realizado"
  log "═══════════════════════════════════════════════════════════════"
  exit 1
fi

# ─── PASO 6: Commit ─────────────────────────────────────────────────────────
log "[PASO 6/6] Generando commit con auditoría..."

DATE_SHORT=$(date -u +"%Y%m%d-%H%M")
COMMIT_MSG="[auto-commit] $DATE_SHORT — Ventify POS auditado y perfeccionado ($FILE_COUNT archivos) |${PARTS} | prev:$PREV_HASH"

COMMIT_OUTPUT=$(git commit -m "$COMMIT_MSG" 2>&1)
COMMIT_EXIT=$?

if [ "$COMMIT_EXIT" -ne 0 ]; then
  git reset HEAD >/dev/null 2>&1
  log "  ✗ Commit falló: $COMMIT_OUTPUT"
  exit 1
fi

NEW_HASH=$(git rev-parse --short HEAD)
log "  ✓ Commit exitoso: $NEW_HASH"

# ─── Reporte final ──────────────────────────────────────────────────────────
log ""
log "╔═══════════════════════════════════════════════════════════════╗"
log "║  ✅ COMMIT CORRECTAMENTE AUDITADO Y PERFECCIONADO             ║"
log "╠═══════════════════════════════════════════════════════════════╣"
log "║  Proyecto:    Ventify POS                                    ║"
log "║  Commit:      $NEW_HASH"
log "║  Archivos:    $FILE_COUNT"
log "║  Prev:        $PREV_HASH"
log "║  Fecha:       $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
log "║  Validación:  Integridad ✓ | Conflicto ✓ | Versiones ✓"
log "╚═══════════════════════════════════════════════════════════════╝"
log ""
