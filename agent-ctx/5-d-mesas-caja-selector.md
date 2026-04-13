# Task 5-d: Add Caja Selector to Mesas Payment Dialog

## Work Log
- Read worklog and existing `tables-view.tsx` to understand current code
- Added `Wallet` icon import from lucide-react
- Replaced old `fetchCashRegisterStatus` (boolean-returning) with new list-based approach:
  - `openCashRegisters` state array with shift id, user, openingBalance
  - `selectedCashRegisterId` state string (default 'auto')
  - `fetchOpenCashRegisters` callback that fetches from `/api/cash-register/current?storeId=X` and maps `data.shifts[]` to the state shape
- Added `useEffect` to call `fetchOpenCashRegisters()` on component mount
- Updated `handleConfirmPayment`:
  - Removed blocking check (`fetchCashRegisterStatus()` that returned error toast and stopped payment)
  - Added warning toast when no cajas are open (but still allows payment)
  - Added `cashRegisterId` to payment payload (number or undefined when 'auto')
  - Calls `fetchOpenCashRegisters()` instead of old `fetchCashRegisterStatus()` after success
  - Resets `selectedCashRegisterId` to 'auto' after payment
- Added Caja selector UI in payment dialog (before payment method buttons):
  - Shows "No hay cajas abiertas" amber warning when no shifts are open
  - Shows Select dropdown with "Automática" default + list of open cajas (id + user name)
  - Uses Wallet icon for label, AlertTriangle icon for empty state

## Files Modified
- `src/components/tables/tables-view.tsx` - All changes in this single file

## Lint Results
- Zero errors in modified file (pre-existing errors only in `keepalive.cjs` and `mini-services/next-keeper/`)
