# Task 2: Add Invoice Mode Selector to Quotations Convert Dialog

## Agent: Main Agent

## Task
Add invoice mode selector (tirilla/factura electrónica) to the quotations convert dialog, matching the POS pattern.

## Work Log
- Read `/home/z/my-project/worklog.md` for project context (e-invoicing system already implemented in POS)
- Read `/home/z/my-project/src/components/quotations/quotations-view.tsx` (1442+ lines)
- Read `/home/z/my-project/src/app/api/quotations/[id]/convert/route.ts` to understand response shape: returns `{ success, orderNumber, orderId, total, message }`
- Verified `StoreInfo` interface in auth-store has `invoiceEnabled`, `invoiceTestMode`, `nit` fields

## Changes Made (all in `src/components/quotations/quotations-view.tsx`)

### 1. Added imports
- Added `Receipt` and `QrCode` to lucide-react imports (`FileText` was already present)

### 2. Added state variables (after convert dialog state block)
- `isEInvEnabled` — derived boolean from `store.invoiceEnabled && store.nit`
- `convertInvoiceMode` — `'TIRILLA' | 'ELECTRONICA'` (default: TIRILLA)
- `invoiceCustomerNit`, `invoiceCustomerName`, `invoiceCustomerEmail` — customer fields for electronic invoice
- `nitDvError` — NIT DV validation error message
- `creatingInvoice` — loading state for invoice creation

### 3. Updated `openConvertDialog`
- Resets all invoice-related states when opening the convert dialog

### 4. Updated `handleConvert`
- Renamed `data` to `convertResult` for clarity
- After successful conversion, if ELECTRONICA mode is selected:
  - Calls `POST /api/invoices` with orderId, testMode, customerNit, customerName, customerEmail
  - Shows success toast with invoice number or error toast on failure
  - Sets `creatingInvoice` loading state during invoice creation

### 5. Added Invoice Mode Selector to Convert Dialog JSX
- Conditional render (only when `isEInvEnabled`)
- Two-button grid: "Tirilla de Venta" and "Factura Electrónica"
- When ELECTRONICA selected: shows NIT DV validation, customer name, and email fields
- NIT DV validator on blur with Colombian algorithm (weights array)
- QR code info text when ELECTRONICA selected

### 6. Updated Convert Button
- Dynamic text: "Convertir a Orden" (default) / "Convertir + Factura Electrónica" (electronic)
- Loading states: "Convirtiendo..." / "Generando factura..."
- Disabled when `converting` or `creatingInvoice`
- Cancel button also disabled during invoice creation

## Verification
- `bun run lint` — 0 new errors (all 17 errors are pre-existing infrastructure files)
- Dev server running without compilation errors
- No changes to any other files
