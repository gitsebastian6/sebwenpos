# Task 10 - Build Inventory and Services Views

## Summary
Built two complete POS system views (Inventory & Services) with their corresponding API routes.

## Files Created

### Frontend Components
1. **`src/components/inventory/inventory-view.tsx`** — Inventory management view
   - **Stock Alerts Section**: Amber-themed card showing products with low stock (currentStock <= minStock). Displays product name, current stock (red badge), min stock, and category in a responsive grid.
   - **Inventory Movements Section**: Full CRUD for inventory movements with:
     - "Nuevo Movimiento" button opening a Dialog
     - Movement types: PURCHASE (Compra), ADJUSTMENT (Ajuste +/-), RETURN (Devolución)
     - Form with product select, movement type, quantity, notes
     - Table with Fecha, Producto, Tipo (Badge with icons), Cantidad (green/red), Notas
     - Filters by movement type and product
     - Formatted dates using date-fns with Spanish locale

2. **`src/components/services/services-view.tsx`** — Service transactions view
   - **Quick Actions Grid**: 6 clickable cards (Telcel, AT&T, Movistar, CFE, Agua, Otros) with distinct color themes and icons
   - **Service Form** (left column): Provider select, transaction type, phone/account number, amount in pesos with currency preview, process button with loading state
   - **Transactions Table** (right column): Fecha, Proveedor (with icon), Tipo, Monto, Comisión, Estado (SUCCESS=green, FAILED=red, PENDING=amber badges)
   - Amount conversion from pesos (UI) to cents (API)
   - Auto-selects transaction type based on provider (recarga vs pago)

### API Routes
3. **`src/app/api/products/route.ts`** — GET products for a store (used by inventory and product selection)
4. **`src/app/api/inventory/route.ts`** — GET movements (with type/product filters) + POST new movement with stock update in a Prisma transaction
5. **`src/app/api/services/route.ts`** — GET service transactions + POST new service transaction with mock commission calculation (3% TOPUP, 2% BILL_PAYMENT) and simulated processing (90% success rate)

## Design Decisions
- No indigo/blue colors — used amber for alerts, emerald for success, red for failed/danger
- Responsive layout: grid adapts from 1 to multi-column
- All data fetched from API routes (no server components for views)
- Inventory POST uses Prisma transaction for atomic stock updates
- Amount in services stored in cents, displayed in pesos with formatCurrency
- date-fns with Spanish locale for consistent date formatting

## Lint Status
All new files pass ESLint cleanly. Pre-existing errors in page.tsx and app-shell.tsx are unrelated.
