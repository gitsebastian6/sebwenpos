# Task r1+r2 — Fix Reports "Cotizaciones" Tab & Add Invoices/Credit Notes

**Task ID:** r1+r2
**Agent:** Main Agent
**Files Modified:**
- `src/app/api/reports/informes/route.ts`
- `src/components/reports/reports-view.tsx`

## Work Log

### Bug: Cotizaciones tab queried WRONG table
- **Root cause:** Line 199 queried `db.order` with `status: 'PENDING'` instead of `db.quotation`
- **Fix 1:** Replaced query #17 to use `db.quotation.findMany()` with proper `items` relation and `customer` include (nit, phone)
- **Fix 2:** Added 2 new KPI queries: `quotes-kpis` (aggregate ACTIVE quotations) and `quotes-converted` (count CONVERTED)
- **Fix 3:** Added 2 new data queries: `invoices` (db.invoice) and `credit-notes` (db.creditNote)
- **Fix 4:** Updated result array indices: IVA shifted from [22] → [24]; added [22]=quotesKpis, [23]=quotesConverted, [25]=invoices, [26]=creditNotes
- **Fix 5:** Added `quotesSummary`, `invoices` (mapped), `invoicesSummary`, `creditNotes` (mapped), `creditNotesSummary` to return JSON
- **Schema adaptation:** Used `cn.grandTotal` for CreditNote (schema field) mapped to `totalAmount` in response; used `cn.concept` mapped to `reason`; Invoice includes `prefix+consecutive` for `invoiceNumber`

### UI Updates (reports-view.tsx)
- Added imports: `CheckCircle2`, `ClipboardList`, `FileCheck`
- **Cotizaciones tab:** Complete redesign with 4 KPI stats (Activas, Valor Total, Convertidas, Total Período) + table with 7 columns (Fecha, Cotización, Cliente, Total, Items, Estado badge, Válido Hasta)
- **Facturas tab (NEW):** 4 KPI stats + table with 7 columns showing invoice number, status badges (Validada/Entregada/Rechazada/Borrador/Pendiente), Hab/Prod environment badge, truncated CUFE
- **Notas Crédito/Débito tab (NEW):** 4 KPI stats + table with 7 columns showing note number, NC/ND type badge, amount, status, referenced invoice number
- Added both new tabs to the tab list array between Cotizaciones and CxC

## Verification
- Lint: 16 errors — all pre-existing in infrastructure files (daemon.js, keepalive.cjs, mini-services). Zero new errors.
- Dev server: Running normally on port 3000
- No other files modified
