# SEBWEN POS

Punto de venta (POS) multi-tienda para Colombia — Next.js 16 (App Router, Turbopack),
Prisma + PostgreSQL, TanStack Query, Zustand, Tailwind.

## Arranque rápido

```bash
npm ci                       # instala deps + genera el cliente Prisma (postinstall)
cp .env.example .env         # completa los secretos (AUTH_SECRET, DATABASE_URL, …)
docker compose up -d postgres   # o tu propio Postgres local
npm run db:migrate           # aplica migraciones (prisma migrate dev)
npm run dev                  # http://localhost:3000
```

> En Windows: corre los scripts (`verify`, `clean`, `build`) desde **Git Bash** o
> WSL — usan sintaxis POSIX (`rm -rf`, `cp -r`).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Turbopack). |
| `npm run dev:clean` | Borra `.next`/`.turbo` y arranca dev (usar ante caché stale). |
| `npm run verify` | **Gate local completo**: typecheck + lint + tests + `next build` + smoke. Córrelo antes de hacer push. |
| `npm run typecheck` | `tsc --noEmit` + `tsc -p tsconfig.strict.json`. |
| `npm run lint` | ESLint. `lint:strict` = falla ante cualquier warning. |
| `npm test` | Vitest (unit + hooks). `test:watch`, `test:coverage`. |
| `npm run build:check` | Solo `next build` (sin el copiado de standalone). |
| `npm run smoke` | Arranca la app compilada y hace GET a las rutas reales. |
| `npm run db:migrate` | Crea + aplica una migración en dev. Commitea la carpeta en `prisma/migrations/`. |
| `npm run db:migrate:deploy` | Aplica migraciones pendientes (prod / CI, out-of-band). |
| `npm run db:migrate:local` | Aplica migraciones pendientes a la BD **local del host** (`localhost:5432`). Córrelo tras un `git pull` que traiga migraciones si trabajas con `npm run dev`. |
| `npm run docker:dev` | Dev en Docker (recomendado): `postgres` + `migrate deploy` + `next dev` con hot-reload por `compose watch`. **No reconstruye la imagen** en cada arranque. |
| `npm run docker:dev:build` | Igual pero forzando `--build` (primer arranque, o tras cambiar el `Dockerfile`). |

## Gates de calidad

- **pre-commit** (Husky + lint-staged): `eslint --fix` sobre los archivos en stage. Rápido (segundos).
- **pre-push** (Husky): `npm run verify` — incluye `next build` + smoke. Tarda unos minutos. Emergencias: `git push --no-verify`.
- **CI** (`.github/workflows/ci.yml`): en cada push y PR de cualquier rama — Prisma validate/generate/migrate, `tsc` (x2), ESLint, `next build`, smoke, tests, y chequeo de árbol limpio + migraciones commiteadas. Debe estar verde antes de mergear a `main`.

Ver [`CONTRIBUTING.md`](CONTRIBUTING.md) para el flujo de ramas y de migraciones.

## Solución de problemas

**`next build` / dev dice `Export X doesn't exist in target module` (o `Module not found`) y el código se ve bien.**
Es caché stale de Turbopack en `.next`. Arréglalo con:

```bash
npm run dev:clean      # = npm run clean && npm run dev
```

`npm run clean` borra `.next`, `.turbo`, `.next-snapshot` y `*.tsbuildinfo`. Si el
error persiste tras un `clean`, entonces sí es un import realmente roto — `npm run lint`
(regla `import/no-unresolved`) y `npm run build:check` te dicen dónde.

**El cliente Prisma quedó desactualizado tras `git pull`.**
`npm install` lo regenera (hook `postinstall`); si no, `npm run db:generate`.

**Login (u otra ruta) devuelve 500 con `column ... does not exist` tras `git pull`.**
El pull trajo migraciones nuevas en `prisma/migrations/` que tu BD local todavía
no tiene. Aplícalas:

- Trabajas con **Docker** (`npm run docker:dev`): ya se aplican solas en cada
  arranque del contenedor. Solo reinícialo.
- Trabajas con **`npm run dev`** en el host: `npm run db:migrate:local`.

> El CLI de Prisma (`db:migrate*`) lee `.env` (`@postgres:5432`, hostname de
> Docker); `db:migrate:local` usa la URL de `.env.local` (`localhost:5432`).

## Despliegue

Imagen Docker publicada en `ghcr.io` por CI; deploy al VPS vía SSH. Topología,
regla de instancia única y checklist en [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
