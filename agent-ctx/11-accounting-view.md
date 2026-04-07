# Task 11 - Build the Accounting View

## Summary
Created a comprehensive, fintech-style accounting module for the POS system with three tabs: Cuentas (Ledger Accounts), Movimientos (Journal Entries), and Resumen (Summary).

## Files Created

### 1. `/home/z/my-project/src/app/api/ledger/route.ts`
- **GET** endpoint with two modes:
  - `?storeId=X&type=accounts` — Returns all ledger accounts with calculated balances (DEBITs - CREDITs for ASSET/EXPENSE, CREDITs - DEBITs for LIABILITY/EQUITY/INCOME)
  - `?storeId=X&type=entries&accountId=Y&from=DATE&to=DATE` — Returns journal entries with optional filters, including totals for debits and credits
- Uses Prisma with `groupBy` for efficient balance calculation

### 2. `/home/z/my-project/src/components/accounting/accounting-view.tsx`
- **'use client'** component exported as `AccountingView`
- Three-tab layout using shadcn/ui Tabs

#### Tab 1: "Cuentas" (Ledger Accounts)
- Grid of Cards (1/2/3 cols responsive)
- Each card: account name, type badge (color-coded), current balance, movement count, "Ver Movimientos" button
- Account type colors: ASSET=green, LIABILITY=amber, EQUITY=purple, INCOME=teal, EXPENSE=red
- Balance colors based on normal balance direction
- Loading skeletons and empty state

#### Tab 2: "Movimientos" (Journal Entries)
- Filter bar with: account Select (all accounts or specific), date range (from/to)
- Table with columns: Fecha (date+time), Cuenta (name + type badge), Tipo (DEBIT/CRÉDITO badges), Monto (formatted currency with color), Descripción, Referencia
- Summary footer with total debits/credits
- Loading skeletons and empty state

#### Tab 3: "Resumen" (Summary)
- 4 summary cards: Total Ingresos, Total Gastos, Balance de Caja, Cuentas por Cobrar
- Each card has colored left border and icon
- Income vs Expense comparison with horizontal gradient bars
- Net result calculation
- Account balances breakdown by type

## Design Decisions
- No indigo/blue colors used — teal for debits/income, orange for credits, green for assets, amber for liabilities/receivables, purple for equity, red for expenses
- All monetary values formatted with `formatCurrency` using store's `currencyCode`
- Responsive design: mobile-first with sm/md/lg breakpoints
- Professional fintech aesthetic with subtle borders, shadows on hover
- `tabular-nums` on all monetary values for alignment
- Empty states with icons and helpful messages
