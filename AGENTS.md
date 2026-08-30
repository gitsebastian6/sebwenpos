# Notas para agentes de IA

## Verificación — no te quedes en `tsc` + `vitest`

`tsc --noEmit` y `vitest run` **no empaquetan la app**. Un import roto dentro de un
client component, un módulo que no resuelve, o un error de render pasan esos dos
gates y solo revientan en `next build` / al cargar la ruta.

**Antes de dar una tarea por terminada, corre `npm run verify`** (typecheck + lint +
tests + `next build` + smoke). Es el gate real y es lo que corre CI.

Atajos válidos si `verify` completo es demasiado lento para iterar:
- `npm run build:check` — solo `next build` (atrapa imports/módulos rotos).
- `npm run smoke` — arranca la app compilada y hace GET a `/`, `/dian-redirect`, `/tienda/...`, `/api/health`.

## Caché stale de Turbopack

Si `next build` o el dev server dicen `Export X doesn't exist in target module` /
`Module not found` **y el código fuente se ve correcto** (el export existe, la ruta
es válida), es la caché de `.next`:

```bash
npm run dev:clean      # borra .next/.turbo/.next-snapshot y arranca dev
# o solo:  npm run clean
```

Confírmalo: `npm run lint` (regla `import/no-unresolved`) y `npm run build:check`
señalan un import realmente roto; si ambos pasan tras `clean`, era la caché.

## Git

- **No commitees a `main`.** Usa una rama feature y PR (ver `CONTRIBUTING.md`).
- Si tocas `prisma/schema.prisma`, genera la migración (`npm run db:migrate`) y
  **commitea la carpeta** en `prisma/migrations/`; CI falla si falta.
- No agregues `.next/`, `.next-snapshot/`, `.turbo/`, `*.tsbuildinfo` ni `.env*` al commit.

## Prisma

`npm install` regenera el cliente (hook `postinstall`). Si los tipos de `@prisma/client`
se ven desincronizados, corre `npm run db:generate`.
