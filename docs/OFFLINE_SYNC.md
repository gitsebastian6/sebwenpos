# Estrategia de Conflictos — Sync Offline

> Fuente de verdad: `src/lib/offline/sync.ts`, `src/lib/offline/db.ts`, `src/app/api/orders/route.ts`.
> Última revisión: 2026-08-24.

## Modelo general

SEBWEN POS usa un modelo **pull-only + cola de escrituras**:

1. **Catálogo (productos, categorías, clientes, servicios, cajas):** el cliente
   *solo lee*. En cada sync se hace `bulkPut` del snapshot del servidor y se
   **purgan** los registros que ya no existen allí (*server-wins* total).
2. **Ventas (órdenes):** el cliente *escribe* cuando está offline en una cola
   IndexedDB (`pendingOrders`); al reconectar, cada orden se re-envía por POST
   con una **idempotency key** (`x-idempotency-key: tempOrderNumber`). El
   servidor deduplica vía `ProcessedRequest(storeId, idempotencyKey)`.

No existe merge bidireccional: no hay edición offline de productos ni clientes,
así que no puede haber conflicto de escritura-escritura sobre el mismo registro.

## Matriz entidad × estrategia

| Entidad | Dirección | Estrategia | Justificación |
|---|---|---|---|
| Productos / Categorías / Servicios | Server → Client | **Server-wins** (bulkPut + purge de stale) | Solo el back-office los edita; la copia local es caché desechable |
| Clientes | Server → Client | **Server-wins** | Ídem; crear clientes offline está bloqueado |
| Stock (currentStock) | Server → Client (lectura) + validación server-side al vender | **Server-authoritative** | La reserva atómica (`StockReserver`, `updateMany` condicional) decide en servidor. El stock local es *optimista*: se decrementa en UI para feedback inmediato pero nunca se persiste como verdad |
| Órdenes (ventas) | Client → Server | **Append-only + idempotency key** | Las ventas son eventos creados una vez; la key estable evita duplicados entre reintentos |
| Caja registradora | Server → Client | Server-wins | Se abre/cierra online |

## Casos límite y su manejo

- **Venta sin stock suficiente al sincronizar:** la reserva atómica en el
  servidor rechaza la orden → HTTP 4xx → tras `MAX_RETRIES` la orden queda
  `status:'failed'` con el mensaje visible en UI. **Nunca se reintenta
  silenciosamente**: el usuario debe resolver (ajustar stock o anular) desde la
  bandeja de ventas fallidas.
- **Reintento con red intermitente:** backoff exponencial + jitter,
  `nextRetryAt`; errores de red no cuentan como rechazo semántico.
- **Doble entrega del mismo POST** (crash después de commitear en servidor pero
  antes de borrar de la cola): la idempotency key hace que el servidor devuelva
  la orden ya existente; el cliente borra el pendiente. Sin duplicados.
- **Dos cajas offline vendiendo el último ítem:** primera en llegar gana, la
  otra falla con mensaje claro. Es la resolución elegida a conciencia: el stock
  físico es uno solo, no se "reparte".

## Por qué no CRDT / last-write-wins

Con un único nodo autoritativo (Postgres del backend), LWW introduciría
pérdida silenciosa de datos. El modelo actual garantiza que **toda venta
offline es eventualmente aceptada o visiblemente rechazada** — nada se pierde
ni se duplica.
