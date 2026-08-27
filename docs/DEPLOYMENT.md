# Despliegue y escalado — SEBWEN POS

> Última revisión: 2026-08-27.

## Topología actual

| Pieza | Dónde |
|---|---|
| Base de datos | **Neon** (Postgres gestionado) hoy → Postgres self-hosted en VPS más adelante. `pg_dump`/`pg_restore` para migrar; sin lock-in. |
| App (Next.js standalone) | **Un solo contenedor** (`node server.js`), stateless. Sin volumen — todo el estado persistente vive en Postgres. |
| Migraciones | `prisma migrate deploy` contra `DIRECT_URL`, fuera de banda antes de arrancar la nueva imagen (la imagen runtime no lleva el CLI de Prisma). |
| Mini-servicios | `subscription-cron`, `tables-sync` — contenedores aparte (ver `docker-compose.yml`). |
| Variables | `DATABASE_URL` (pooled) + `DIRECT_URL` (directo), `AUTH_SECRET`, `INTERNAL_SECRET`, `ENCRYPTION_KEY`, … en el `.env` del host / secrets de CI. |

Neon con *scale-to-zero* añade ~500 ms de cold start tras inactividad. Mitigación:
desactivarlo en el plan pago, o dejar que `subscription-cron` (pega cada 30 s a
`/api/health`, que hace `SELECT 1`) mantenga la conexión caliente.

## ⚠️ Restricción: NO escalar a más de una instancia de la app todavía

Tres piezas de estado viven **en memoria del proceso**, no en un store
compartido. Con **una** instancia funcionan bien; con **dos o más** se rompen
en silencio:

| Módulo | Qué guarda | Qué pasa con >1 instancia |
|---|---|---|
| `src/lib/rate-limiter.ts` | contadores de rate limit por IP/ruta | el límite efectivo se multiplica por Nº de instancias; un atacante balanceado obtiene N× intentos |
| `src/lib/subscription-cache.ts` | estado de suscripción por tienda (TTL 5 min) | la instancia que no calentó la caché **falla abierto** → una tienda EXPIRED/CANCELLED sigue operando hasta pegarle a la instancia correcta |
| `src/lib/auth-helpers.ts` (`revokedTokens`) | JTIs de tokens revocados (sync desde BD cada 60 s) | un token revocado sigue siendo válido en las instancias que aún no sincronizaron (hasta 60 s de ventana) |

**Antes de correr réplicas** hay que mover las tres a un store compartido:
Redis / Upstash, o tablas Postgres con TTL. Hasta entonces, mantener
`replicas: 1` / un solo `docker run`.

El gate de suscripción es *best-effort* incluso con una instancia (fail-open en
cache miss); las rutas de dinero críticas (`orders`, `invoices`) hacen además un
chequeo autoritativo contra la BD, independiente de esta caché.

## Checklist de despliegue

1. `prisma migrate deploy` contra `DIRECT_URL` (Neon/VPS).
2. `docker pull` de la imagen nueva (tag = sha).
3. Parar/quitar el contenedor viejo, arrancar el nuevo con `--env-file`.
4. `curl -sf http://localhost:3000/api/health`.
5. `docker image prune` de imágenes viejas.
