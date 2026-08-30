# SEBWEN POS — Roadmap de lo que falta

> Última revisión: 2026-08-29. La auditoría funcional/seguridad (hallazgos #1–#6
> + gaps residuales) está **cerrada** — ver el historial `feat(rbac)` /
> `fix(subscription)` / `fix(security)` en `git log`.
>
> Este documento lista lo que queda. No hay fechas de calendario (no hay fecha
> de lanzamiento fija); cada item tiene un **disparador**: cuándo conviene
> hacerlo.

---

## Leyenda

| Esfuerzo | Significa |
|---|---|
| **S** | < 1 h |
| **M** | 1 h – 1 día |
| **L** | 1 – 3 días |
| **XL** | > 3 días / refactor |

---

## 0. Operativo — al desplegar lo ya hecho

| Item | Esfuerzo | Disparador |
|---|---|---|
| Correr `npm run db:backfill:plan-features` contra la BD real | S | Justo después del primer deploy que incluya `feat(plan-features)`. En la BD de dev ya está hecho. Sin esto, los planes existentes no tienen las keys `onlineStore`/`customRoles` → un cliente Pro pierde esos módulos. |
| Re-guardar cada plan en super-admin (alternativa al backfill) | S | Solo si preferís no correr el script. |
| Verificar GitHub Secrets `AUTH_SECRET` / `INTERNAL_SECRET` (≥16 chars, sin `change_me`) | S | Antes del próximo push a `main` — el guard de `instrumentation.ts` los valida en el smoke de CI. |

---

## 1. Antes de exponer a un cliente real

| Item | Esfuerzo | Disparador | Notas |
|---|---|---|---|
| **QA manual del RBAC / features / suscripción** | M | Antes de darle acceso al primer cliente pagando | Se metieron gates en ~60 handlers; los tests cubren la lógica pero ningún flujo se probó end-to-end. Checklist abajo (§6). |
| `AI_CHAT_MODEL` (glm-4.7-flash, ZhipuAI) vs única key `GEMINI_API_KEY` (Google) | S | Si el chat IA es una feature visible del producto | Hoy el chat cae siempre al fallback. Alinear modelo+key o desactivar el módulo. |
| Warnings de `next build`: `themeColor` / `viewport` en metadata de `/tienda/[storeId]` | S | Oportunista | Mover a `export const viewport`. Cosmético, no rompe nada. |

---

## 2. Monetización — cuando el foco sea vender planes

| Item | Esfuerzo | Disparador | Notas |
|---|---|---|---|
| Feature **`commissions`** (comisión por venta) | M | Cuando tengas clientes con vendedores a comisión | `Employee.commissionRate` ya existe; falta el cálculo/reporte + el gate `requireFeature('commissions')`. |
| Feature **`maxMonthlyInvoices`** (tope de facturas DIAN/mes) | L | Cuando el volumen de facturación sea un diferenciador de precio real (competencia CO: Siigo, Alegra lo usan) | Necesita columna nueva en `Plan` + contador mensual + reset por cron + gate en `POST /api/invoices`. |
| Enforcement de **`customBranding`** | M | Cuando exista subida de logo / branding en tirilla | Hoy es metadata. |
| **`trial` / `gracia` por plan** (hoy 7d / 3d fijos en `constants.ts`) | M | Cuando quieras vender trials de distinta duración | Columnas `trialDays` / `graceDays` en `Plan` + migración. |
| Features metadata restantes (`api`, `multiCurrency`, `support`, `priority`) | — | Solo si construís la funcionalidad real | Documentadas como "no son gates" en `constants.ts`. `multiCurrency` requiere que la app deje de ser COP-only. |

---

## 3. Escalabilidad — cuando haya tráfico real

> Regla vigente en `docs/DEPLOYMENT.md`: **no correr más de 1 instancia de la app**
> hasta migrar el estado en memoria.

| Item | Esfuerzo | Disparador | Notas |
|---|---|---|---|
| Capa `SharedStore` (interfaz + impl in-memory) | L | Antes de necesitar una 2ª instancia | Deja Redis-ready sin migrar aún. En dev sin `REDIS_URL` funciona igual. |
| Migrar `rate-limiter` / `subscription-cache` / `revokedTokens` a Redis (o Postgres-TTL) | M (sobre la capa) | Al pasar a **2+ instancias** (VPS con réplicas, PaaS con autoescalado, k8s) | Redis gestionado (Upstash free, Redis Cloud free) — no obliga a VPS propio. |
| Neon: desactivar scale-to-zero o mantener caliente | S | Al tener tráfico constante | Ya lo hace `subscription-cron` pegándole a `/api/health` cada 30 s. |
| `docker-build-push` / `deploy-vps` en CI detrás de `workflow_dispatch` | S | Ya, si no tenés VPS | Hoy cada push a `main` gasta minutos de CI construyendo una imagen que no se usa. |

---

## 4. Deuda técnica — oportunista

| Item | Esfuerzo | Disparador | Notas |
|---|---|---|---|
| Partir god components: `leads-view.tsx` (1540 líneas), `services-view` (995), `staff-view` (985), `store-detail-view` (973), `comanda-panel` (965), `product-form-dialog` (951)… | M c/u | Cuando toques esa vista para algo | No refactorizar por refactorizar. |
| Tests de integración EMPLEADO→403 para más familias de rutas | M | Cuando agregues gates nuevos | Ya hay 2 (`roles/rbac-wiring`, `reports/feature-wiring`); el resto de los tests de ruta mockean OWNER y no ejercitan la rama de denegación. |
| E2E con Playwright de los flujos críticos (venta, factura DIAN, cierre de caja, pedido en línea) | L (setup) | Antes de un release grande / al sumar gente al equipo | El smoke actual solo hace GET a rutas. |
| `lint:strict` (`--max-warnings 0`) | M | Ratchet, cuando bajen los ~640 warnings preexistentes | CI ya corre `eslint .` (permite warnings) con un `TODO(ratchet)`. |
| `strictNullChecks` a todo `src/` (hoy solo `src/lib` + `src/domain` vía `tsconfig.strict.json`) | L | Ratchet | Ir agregando carpetas al `include`. |

---

## 5. Arquitectura — largo plazo, bajo riesgo

| Item | Esfuerzo | Disparador | Notas |
|---|---|---|---|
| Cablear `src/domain/invoicing/invoice-translator.ts` al camino real de `POST /api/invoices` | XL | Solo si el dominio de facturación se vuelve inmanejable como transaction script | Hoy `CONTEXT_MAP.md` lo describe como objetivo; la ruta usa `lib/invoice-utils` + `invoicing/*` directo. |
| Migrar el resto de los contextos DDD (`CONTEXT_MAP.md` §1) de transaction script a agregados | XL | Idem, contexto por contexto | `Sales` (Order) e `Inventory` ya tienen agregados parciales en `src/domain/`. |
| Routing real para la app interna (hoy SPA de una ruta con `switch` de vistas en `app-shell`) | XL | Si necesitás deep-linking real, SSR de vistas, o code-split por ruta | Decisión consciente actual: simplicidad de estado. |

---

## 6. Checklist de QA manual (§1)

Correr con datos de `npm run db:seed` o una tienda real.

### OWNER
- [ ] Login → aterriza en Dashboard, ve TODOS los items del menú.
- [ ] Vender en POS (efectivo + split + fiado) → orden creada, stock baja.
- [ ] Emitir factura electrónica desde el POS → CUFE, PDF.
- [ ] Registrar una compra con import XML → stock sube, CPP recalcula.
- [ ] Abrir Informes → carga (plan con `reports`).
- [ ] Abrir Contabilidad → cierre diario carga (NO depende de la feature `reports`).
- [ ] Crear un rol "Solo Caja" con únicamente `pos` + `dashboard`.

### EMPLEADO con rol "Solo Caja"
- [ ] Login → solo ve Dashboard + Punto de Venta en el menú.
- [ ] Vender en POS → funciona.
- [ ] `GET /api/products` (lo hace el POS) → 200.
- [ ] Navegar por URL a `?view=products` → cae a Dashboard.
- [ ] `curl -X POST /api/products` con su token → **403**.
- [ ] `curl -X POST /api/expenses` con su token → **403**.
- [ ] `curl -X POST /api/roles` con su token → **403**.

### Suscripción
- [ ] Tienda en `TRIAL` → todo normal, badge "Prueba".
- [ ] Forzar `PAST_DUE` (super-admin) → POS/Mesas bloqueados, resto lectura, banner.
- [ ] `POST /api/purchases` en `PAST_DUE` → **403** (middleware).
- [ ] Forzar `EXPIRED` → overlay "Renovar Plan" en toda la app; Settings accesible.
- [ ] `POST /api/orders` en `EXPIRED` → **403** (`requireActiveSubscription`).

### Plan / features
- [ ] Tienda plan **Básico** → NO ve "Informes" ni "Pedidos en línea" en el menú.
- [ ] `GET /api/reports/informes` con token de Básico → **403 `upgradeRequired`**.
- [ ] `GET /api/inventory/kardex` con token de Básico → **403**.
- [ ] Subir a **Pro** (super-admin) → los 3 aparecen y responden 200.

### Sucursales
- [ ] Crear sucursal desde super-admin (tienda padre plan Pro) → OK.
- [ ] Login en la sucursal → hereda plan Pro (ve Informes, Kardex, límites del padre).
- [ ] Tienda padre plan Básico → crear sucursal → **403** (`multiStore`).
