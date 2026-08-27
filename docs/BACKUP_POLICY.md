# Política de Backups y Recuperación — Postgres

> Alcance: base de datos principal (Docker `postgres:16-alpine`, volumen `pgdata`).
> Última revisión: 2026-08-24.

## Decisiones (y por qué)

- **Un solo nodo, sin replicación** (decisión 2026-08): la escala es PYME
  (un local, pocas cajas). Una streaming replica duplica costo operativo sin
  beneficio real hoy. Camino de crecimiento documentado al final.
- **Backups lógicos nightly con `pg_dump`**: simples, portables,
  verificables. Suficientes para un RPO de ~24 h en datos, complementados
  con WAL archiving cuando se active replicación.
- **RPO objetivo:** ≤ 24 h (nightly) · **RTO objetivo:** ≤ 30 min.

## Mecanismo

`scripts/backup-postgres.sh` (en el host o sidecar):
1. `pg_dump -Fc` (formato custom, comprimido) contra el contenedor.
2. Retención: **7 diarios + 4 semanales** (`prune` por fecha en el nombre).
3. Verificación post-dump: `pg_restore --list` debe exit-0; si falla, el
   script sale con error no-cero para alertar (cron del host puede notificar).

## Restauración (procedimiento probado — ejecutar drill mensual)

```bash
# 1. Detener app para evitar escrituras
docker compose stop app

# 2. Recrear la BD desde el dump
docker compose exec -T db psql -U $POSTGRES_USER -c \
  "DROP DATABASE IF EXISTS ${POSTGRES_DB}_restore;"
docker compose exec -T db createdb -U $POSTGRES_USER ${POSTGRES_DB}_restore
cat backups/sebwen_YYYY-MM-DD.dump | docker compose exec -T db \
  pg_restore -U $POSTGRES_USER -d ${POSTGRES_DB}_restore --no-owner

# 3. Validar conteos críticos (orders, products, customers del último día)
docker compose exec -T db psql -U $POSTGRES_USER -d ${POSTGRES_DB}_restore \
  -c "SELECT count(*) FROM orders WHERE created_at::date = current_date - 1;"

# 4. Swap atómico
docker compose exec -T db psql -U $POSTGRES_USER -c \
  "ALTER DATABASE ${POSTGRES_DB} RENAME TO ${POSTGRES_DB}_old;
   ALTER DATABASE ${POSTGRES_DB}_restore RENAME TO ${POSTGRES_DB};"
docker compose start app
```

## Calendario

| Tarea | Frecuencia | Responsable |
|---|---|---|
| Backup nightly (script vía cron del host, 03:00) | Diaria | Automático |
| Verificación `pg_restore --list` | Con cada backup | Automático |
| Drill de restauración completo (paso 1–4) | Mensual | Dev/Ops |
| Revisión de esta política | Semestral | Equipo |

## Camino a replicación (cuando la escala lo justifique)

1. Activar `wal_level=replica` + `archive_command` (WAL archiving → RPO minutos).
2. Añadir réplica de lectura en segundo contenedor (streaming replication).
3. Migrar backups lógicos a PITR con `recovery_target_time`.
4. Reevaluar managed Postgres (RDS/Cloud SQL) si el equipo de ops no crece.
