# Task: Rewrite ALL Purchases API Routes for New Schema

## Agent: main-orchestrator
## Status: COMPLETE

## Files Modified
1. `src/app/api/purchases/route.ts` — Full rewrite (GET list + POST create)
2. `src/app/api/purchases/[id]/route.ts` — Full rewrite (GET detail + PUT edit + DELETE cancel)
3. `src/app/api/purchases/[id]/return/route.ts` — Full rewrite (POST return with debt update)
4. `src/app/api/purchases/[id]/payments/route.ts` — NEW file (GET list + POST register)

## Changes Summary

### GET /api/purchases (list)
- Added query param filters: storeId, q, status, paymentStatus, documentType, from, to
- Pagination: page, limit (skip/take with defaults: page=1, limit=50, max=200)
- Includes: provider (all fields), purchaseItems (with product name + costPrice), purchasePayments (count + total)
- Returns `{ data: [...], pagination: { page, limit, total, totalPages } }` format
- Includes all new fields: documentType, consecutiveNumber, dueDate, paymentTerms, paymentStatus, amountPaid, subtotal, totalIva, retenciones, totalDiscount

### POST /api/purchases (create)
- Accepts: storeId, providerId?, items[], documentType?, date?, paymentTerms?, notes?
- Per-item: productId, quantity, unitCost, ivaRate (default 19), discountAmount, lotNumber?, expiryDate?, manufacturingDate?
- Auto-calculates per item: ivaAmount, total
- Auto-calculates purchase: subtotal, totalIva, totalDiscount, retenciones (based on provider regime), total
- Auto-generates consecutiveNumber: "PC-NNNN" format
- Auto-calculates dueDate from paymentTerms
- Sets paymentStatus: CONTADO → PAID (with auto-payment record), credit → PENDING
- Updates product costPrice + creates CostHistory entry
- Creates inventory movements (PURCHASE type)
- Updates provider.totalPurchases and provider.totalDebt

### GET /api/purchases/[id] (detail)
- Includes all relations: provider (full), purchaseItems (with product + category), purchasePayments (with createdBy user), createdBy user
- Returns all new financial fields

### PUT /api/purchases/[id] (edit)
- Allows editing: invoiceNumber, documentType, date, notes, providerId, paymentTerms, items (add/remove/update)
- Full item reconciliation with stock movements
- Recalculates all totals and retenciones
- Provider change: updates debt on both old and new provider
- Only allows PENDING or COMPLETED status (not CANCELLED)
- Prevents payment terms change when payments exist

### DELETE /api/purchases/[id] (cancel)
- Sets status = CANCELLED
- Decrements product stock (respecting returned quantities)
- Decrements provider.totalPurchases
- Decrements provider.totalDebt for credit purchases
- Creates inventory movements (ADJUSTMENT type)

### POST /api/purchases/[id]/return (partial/full return)
- Same validation as before but with PURCHASE_RETURN movement type (instead of ADJUSTMENT)
- Proportionally decrements provider.totalDebt for credit purchases
- Sets purchase status to CANCELLED when all items fully returned

### GET /api/purchases/[id]/payments (list payments)
- Lists all payments for a purchase with createdBy user info
- Returns summary: totalPayments, totalAmountPaid, purchaseTotal, remainingBalance

### POST /api/purchases/[id]/payments (register payment)
- Accepts: amount, paymentMethod (CASH/TRANSFER/CHECK/CARD), reference?, notes?
- Validates: amount > 0, amount <= remaining balance, purchase not cancelled
- Creates PurchasePayment record
- Updates purchase.amountPaid and purchase.paymentStatus (PENDING → PARTIAL → PAID)
- Decrements provider.totalDebt

## Validation
- ESLint: 0 errors
- All Zod schemas validated
- All `requireStoreAccess` auth checks in place
- All `db.$transaction` for atomic operations
- Spanish error messages throughout
