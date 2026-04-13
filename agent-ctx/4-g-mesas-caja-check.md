# Task 4-g: Block Payments When Cash Register (Caja) Is Not Open

## Agent: Cash Register Guard Agent

## Summary
Added a cash register validation check to the Mesas (Tables) payment flow. When a user attempts to process a payment in the comanda dialog, the system now verifies that a cash register shift is open before allowing the payment. If no shift is open, an error toast is shown and the payment is blocked. After a successful payment, any warning from the API response is displayed as a toast, and the cash register status is refreshed.

## Changes Made

### File: `src/components/tables/tables-view.tsx`

1. **Import: Added `AlertTriangle`** from lucide-react (available for future use in UI if needed)

2. **New function: `fetchCashRegisterStatus`**
   - Added a `useCallback` that calls `GET /api/cash-register/current?storeId=X`
   - Returns `true` if `data.shift !== null` (shift is open)
   - Returns `false` if no shift or on any error (safe default: block payment)
   - Depends on `store?.id`

3. **Modified: `handleConfirmPayment`**
   - **Before existing validation checks**: calls `fetchCashRegisterStatus()` 
   - If cash register is NOT open → shows error toast `"⚠️ Debes abrir la caja antes de procesar pagos"` and returns early
   - **After successful payment**: checks `paymentData.warning` and shows `toast.warning(paymentData.warning)` if present
   - **After successful payment**: calls `fetchCashRegisterStatus()` to refresh the status (fire-and-forget)

## Cash Register API
- Endpoint: `GET /api/cash-register/current?storeId={id}`
- No shift open: `{ shift: null }`
- Shift open: `{ shift: {...}, orderCount: N, totalSales: N, ... }`

## Payment API Warning
- Response may include `warning` field (e.g., when payment was processed but not linked to a cash register shift)
- Example: `"No hay caja abierta. La venta no se registró en ningún turno de caja."`

## Lint Status
- Zero lint errors in `tables-view.tsx`
- Pre-existing lint errors in unrelated files (keepalive.cjs, mini-services) remain unchanged
