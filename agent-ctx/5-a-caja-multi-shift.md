# Task 5-a: Update Caja Tab for Multiple Open Shifts

## Summary
Updated the Caja (Cash Register) tab in the Accounting view to support multiple open shifts and added a new "Saldos" card showing Saldo Inicial + Saldo al Momento.

## Changes Made

### File Modified: `src/components/accounting/accounting-view.tsx`

#### 1. State Variables (replaced ~10 individual states with 2)
- **Removed**: `currentShift`, `shiftOrderCount`, `shiftTotalSales`, `shiftCashSales`, `shiftOtherSales`, `shiftCreditSales`, `shiftTotalTips`, `shiftExpectedCash`, `shiftByPayment`, `shiftRecentOrders`
- **Added**: `openShifts` (array of shift data objects), `selectedShiftId` (number | null for close dialog)

#### 2. fetchCurrentShift (simplified)
- Now parses `data.shifts` array instead of `data.shift` single object
- Sets `setOpenShifts(data.shifts || [])`

#### 3. handleCloseShift (updated)
- Finds the shift to close from `openShifts` array using `selectedShiftId`
- After close, calls `fetchCurrentShift()` to refresh (instead of `setCurrentShift(null)`)
- Resets `selectedShiftId` after close

#### 4. Tab 5 JSX - Caja (major rewrite)
- Loops over `openShifts.map(...)` rendering 4 cards per shift:
  - **Card 1: Turno Info** - Shows shift label (Turno #1, #2...), user name, opening time, initial balance, order count, close/refresh buttons
  - **Card 2: Saldos (NEW)** - Two-column card with emerald theme showing "Saldo Inicial" (openingBalance) and "Saldo al Momento" (expectedCash = openingBalance + cashSales) with subtitle "Apertura + Ventas Efectivo"
  - **Card 3: Resumen del Turno** - Total sales, cash, other methods, fiado, tips, expected cash, payment breakdown
  - **Card 4: Últimas Ventas** - Recent orders table
- When no shifts are open: shows existing "Caja Cerrada" card with "Abrir Caja" button
- Close button sets `selectedShiftId` and opens dialog

#### 5. Close Dialog (updated)
- Uses IIFE to find shift data from `openShifts` by `selectedShiftId`
- Shows the correct opening balance for the selected shift
- Resets `selectedShiftId` on cancel/close

## Preserved
- All existing functionality: shift history, print actions, last closed difference, daily summary print
- All text in Spanish
- All existing imports (Wallet, Heart, etc.)
- PAYMENT_METHOD_LABELS, PAYMENT_METHOD_COLORS, formatCurrency, formatDate, formatTime

## Verification
- ESLint: 0 errors in accounting-view.tsx (9 pre-existing errors in unrelated .cjs files)
- Dev server: running on port 3000, returns HTTP 200
