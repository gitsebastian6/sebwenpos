# Cómo contribuir

## Flujo de ramas

- **No commitees directo a `main`.** `main` es la rama que CI trata como desplegable.
- Rama feature desde `main`: `git switch -c feat/lo-que-sea`.
- Abre PR contra `main`. CI (`build-and-test`) corre en la PR y **debe estar verde**
  antes de mergear.
- Se recomienda activar *branch protection* en GitHub para `main`: requerir la PR y
  el check `build-and-test`. (Es un ajuste del repo en GitHub, no versionable.)

## Antes de hacer push

```bash
npm run verify
```

Corre typecheck + lint + tests + `next build` + smoke — lo mismo que CI. El hook
`pre-push` lo ejecuta automáticamente; `git push --no-verify` lo salta solo para
emergencias reales.

`pre-commit` (automático) corre `eslint --fix` solo sobre lo que está en stage
(rápido). El typecheck completo va en `pre-push` / `npm run verify`.

## Commits

Conventional commits, en español, como el historial actual:
`feat(pos): …`, `fix(api): …`, `refactor(...)`, `docs(...)`, `test: …`, `chore(infra): …`, `ci: …`.
Commits pequeños y enfocados — un cambio lógico por commit.

## Migraciones de base de datos

- Cambias `prisma/schema.prisma` → `npm run db:migrate` (crea la carpeta en
  `prisma/migrations/AAAAMMDDHHMMSS_nombre/` y la aplica en tu DB local).
- **Commitea esa carpeta** en el mismo PR que el cambio de schema. CI falla si hay
  migraciones sin commitear o si `schema.prisma` quedó fuera de sync (`prisma migrate status`).
- En prod las migraciones se aplican **out-of-band** con `prisma migrate deploy`
  contra `DIRECT_URL` *antes* de arrancar la nueva imagen (ver `docs/DEPLOYMENT.md`);
  la imagen de runtime no lleva el CLI de Prisma.
- Nunca uses `prisma db push` contra una DB compartida/prod.

## Qué NO commitear

`.next/`, `.next-snapshot/`, `.turbo/`, `*.tsbuildinfo`, `.env*` (salvo los
`*.example`), `node_modules/`. Ya están en `.gitignore`; si ves uno en `git status`,
algo se agregó a mano — no lo incluyas.
