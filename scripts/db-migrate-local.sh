#!/bin/bash
# ---------------------------------------------------------------------------
# SebwenPOS — Aplica migraciones a la BD de desarrollo LOCAL (host)
# ---------------------------------------------------------------------------
# Por qué existe: el CLI de Prisma (`npm run db:migrate*`) solo lee `.env`, que
# apunta a `@postgres:5432` (hostname interno de Docker). Cuando corres la app
# en el host (`npm run dev`), la BD real está en `localhost:5432` (via
# `.env.local`). Este script pasa esa URL a `prisma migrate deploy`.
#
# Uso:
#   npm run db:migrate:local     # tras un `git pull` que traiga migraciones
#
# Nota: si trabajas 100% en Docker (`npm run docker:dev`), NO necesitas esto —
# el contenedor de dev corre `prisma migrate deploy` en cada arranque.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

DEFAULT_URL="postgresql://sebwenpos:sebwenpos_secret_2025@localhost:5432/sebwenpos?schema=public"

if [ -f .env.local ] && grep -q '^DATABASE_URL=' .env.local; then
  # Toma DATABASE_URL / DIRECT_URL de .env.local (la BD del host).
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
  echo "[db:migrate:local] Usando DATABASE_URL de .env.local"
else
  export DATABASE_URL="$DEFAULT_URL"
  export DIRECT_URL="$DEFAULT_URL"
  echo "[db:migrate:local] .env.local sin DATABASE_URL — usando el default local"
fi

# `prisma migrate` usa directUrl (DIRECT_URL) para conectarse; si falta, cae a DATABASE_URL.
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

echo "[db:migrate:local] Objetivo: ${DATABASE_URL%%\?*}"
npx prisma migrate deploy
npx prisma generate
echo "[db:migrate:local] ✅ Migraciones aplicadas y cliente Prisma regenerado."
