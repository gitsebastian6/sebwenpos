# SEBWEN POS — Context Map (Domain-Driven Design)

> Mapa de Bounded Contexts y sus relaciones, según los principios de
> *Domain-Driven Design* (Eric Evans). Este documento describe la **arquitectura
> objetivo** del dominio y sirve de guía para los refactors incrementales.
>
> Estado: **fase 0–1** — el código actual es *Transaction Script*; este mapa
> define las fronteras hacia las que se migra sin big-bang.

---

## 1. Bounded Contexts identificados

| # | Contexto | Raíz(es) de agregado | Lenguaje ubicuo clave | Modelos Prisma |
|---|----------|----------------------|-----------------------|----------------|
| 1 | **Sales** (Ventas POS) | `Order` | venta, carrito, cobro, propina, fiado, vuelta, split-tender | Order, OrderItem, Customer, TaxRate (lectura) |
| 2 | **Catalog** (Catálogo) | `Product` (agg: `ProductPresentation[]`) | Unidad, Six-pack, Caja x24, unitsPerPack, trackInventory, perecedero, INVIMA | Product, ProductPresentation, Category, TaxRate |
| 3 | **Invoicing / DIAN** (Facturación electrónica) | `Invoice` | CUFE, CUDE, consecutivo, resolución, nota crédito/débito, contingencia, consumidor final | Invoice, CreditNote, DebitNote, ContingencyInvoice, TaxRate |
| 4 | **Inventory / Purchasing** (Compras e inventario) | `Purchase`, `InventoryMovement` | CPP, bonificado, homologación, vencimiento, lote, costo histórico | Purchase, PurchaseItem, PurchasePayment, Provider, ProviderProductMapping, InventoryMovement, CostHistory |
| 5 | **Restaurant** (Mesas) | `TableSession` (agg: `ComandaItem[]`, `BarTable`) | mesa, comanda, sesión, cierre, transferencia de mesa | BarTable, TableSession, ComandaItem |
| 6 | **Subscription / SaaS** | `Subscription` | trial, ACTIVE, PAST_DUE, EXPIRED, plan, billing, trial window | Store, Plan, Subscription, SubscriptionHistory, BillingRecord, WompiTransaction, StoreEventLog |
| 7 | **Accounting** (Contabilidad) | `JournalEntry` | asiento, cuenta mayor, libro, caja, gasto, abono | LedgerAccount, JournalEntry, CashRegister, Expense, CustomerPayment, ServiceTransaction |
| 8 | **Identity / Access** | `User` | cédula, OTP, rol, OWNER/EMPLOYEE/SUPER_ADMIN, token revocado | User, OtpToken, RevokedToken, Employee, Role |

**Contextos de soporte** (sin lógica de dominio propia, solo CRUD/UI):
- `Leads` (CRM de onboarding) — `Lead`, `Contact`, `LeadDocument`, `LeadActivity`.
- `Support` (chat IA) — `ChatSession`, `ChatMessage`, `PushSubscription`.

> Nota: los 52 modelos del `schema.prisma` se **mantienen en un único schema**
> (Prisma compartido), pero cada contexto declara solo los modelos que le
> interesan a través de su interfaz de Repositorio. No se separan físicamente
> las tablas — se separan los **puntos de acceso**.

---

## 2. Context Map — relaciones entre contextos

```
                       ┌────────────────────────┐
                       │   Identity / Access    │ ← valida tokens + roles
                       └───────────┬────────────┘
                                   │ ACL (auth-helpers)
        ┌──────────────────────────┼───────────────────────────┐
        ▼                          ▼                           ▼
┌───────────────┐         ┌──────────────────┐        ┌────────────────┐
│ Subscription  │──gate──▶│      Sales        │──────▶│   Invoicing    │
│   / SaaS      │  (PAST  │   (Order agg)     │ ACL   │   / DIAN       │
│               │  DUE   │                   │ Order→│   (Invoice)    │
└───────────────┘  blocks)│                   │ Invoice│  CUFE/XML/SOAP │
        ▲                 └────────┬──────────┘ traduc. └────────────────┘
        │                          │
   Wompi (pago)                    │ reserva stock
                                  ▼
                         ┌──────────────────┐
                         │     Catalog       │
                         │  (Product agg)    │
                         │  + presentaciones │
                         └────────┬──────────┘
                                  │ movimientos
                                  ▼
                         ┌──────────────────┐
                         │ Inventory /       │
                         │  Purchasing       │
                         └────────┬──────────┘
                                  │ asientos
                                  ▼
                         ┌──────────────────┐
                         │    Accounting     │
                         └──────────────────┘
```

### Patrones de relación

| De → Hacia | Patrón (Evans) | Descripción |
|-----------|----------------|-------------|
| Identity → (todos) | **ACL** (Anti-Corruption Layer) | El middleware `src/middleware.ts` traduce tokens HMAC en headers `x-auth-*`. Ningún contexto conoce los detalles criptográficos. |
| Subscription → Sales | **Customer / Supplier** (con gate) | Subscription es *upstream*: decide si Sales puede operar (bloquea ventas nuevas en PAST_DUE vía `isSubscriptionActive`). Sales solo pregunta "¿puedo?". |
| Sales → Invoicing | **ACL + Traducción** | Un `Order` del contexto Sales se **traduce** a un `Invoice` del contexto Invoicing. Sales no conoce CUFE/XML/SOAP. Punto de extensión: `InvoiceTranslator`. |
| Sales → Catalog | **Conformist** (hoy) → **Customer/Supplier** (objetivo) | Hoy Sales lee `Product` directamente vía Prisma. Objetivo: Sales pide al agregado `Product` "¿puedes satisfacer esta línea?" sin tocar la base. |
| Sales → Inventory | **Shared Kernel** (StockReserver) | El pool de stock en unidades base es conocimiento **compartido** entre Sales y Catalog. Se extrae a un Domain Service compartido. |
| Sales → Accounting | **Customer / Supplier** | Sales emite `OrderCompleted` → Accounting genera el asiento. Hoy acoplado en la misma transacción; objetivo: evento de dominio. |
| Restaurant → Sales | **Shared Kernel** (pago de mesa) | `tables/sessions/[id]/pay` reutiliza la lógica de `calcTax` de Sales → mismo `TaxCalculator`. |

