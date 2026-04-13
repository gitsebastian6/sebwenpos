# Task 4-f: Block POS Sales When Cash Register (Caja) Is Closed

## Summary
Updated the POS component (`src/components/pos/pos-view.tsx`) to check cash register status and block sales when no shift is open.

## Changes Made (single file: `src/components/pos/pos-view.tsx`)

### 1. New Imports
- `Alert`, `AlertTitle`, `AlertDescription` from `@/components/ui/alert` — for the warning banner
- `AlertTriangle`, `Wallet` from `lucide-react` — warning icons
- `useAppStore` from `@/stores/app-store` — to navigate to the Caja tab

### 2. Cash Register Status State & Fetch
- Added `cashRegisterOpen` state: `useState<boolean | null>(null)` — `null` during loading, `true`/`false` after fetch
- Added `fetchCashRegisterStatus` callback: fetches `/api/cash-register/current?storeId=X`, sets `cashRegisterOpen` based on whether `data.shift !== null`
- Added `fetchCashRegisterStatus()` to the initial `useEffect`

### 3. Warning Banner (top of POS)
- Shows an `Alert` (variant="destructive") when `cashRegisterOpen === false`
- Amber-themed styling with `AlertTriangle` icon
- Title: "Caja cerrada"
- Description: "Debes abrir la caja antes de realizar ventas."
- "Ir a Caja" button navigates to the `accounting` view via `useAppStore.getState().setView('accounting')`
- Only renders when explicitly `false` (not during initial `null` loading state — no flash of false warning)

### 4. Cobrar Button Disabled
- Added `cashRegisterOpen === false` to the disabled condition on the "Cobrar" button
- Button is now disabled when: `cart.length === 0 || isSubmitting || cashRegisterOpen === false`

### 5. Warning Toast from Order Response
- After a successful order submission, checks `order.warning` field
- If present, displays it as `toast.warning(order.warning, { duration: 6000 })`
- This handles cases like "No hay caja abierta. La venta no se registró en ningún turno de caja."

### 6. Refresh Cash Register Status After Sale
- Calls `fetchCashRegisterStatus()` immediately after a successful order
- Ensures the banner updates if the sale itself triggers a cash register state change

## Lint
- Zero errors in the modified file (only pre-existing errors in `keepalive.cjs` and `mini-services/`)
