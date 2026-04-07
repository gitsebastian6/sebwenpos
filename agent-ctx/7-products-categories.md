# Task 7: Build Products and Categories Views

## Summary
Built a comprehensive Products & Categories management view for the POS system, including full CRUD functionality for both resources with 6 new files.

## Files Created

### Frontend
1. **`src/components/products/products-view.tsx`** — Main `ProductsView` component with:
   - **Products Tab**: Search bar, category filter dropdown, active/inactive filter, "Nuevo Producto" button, responsive table with columns (Nombre, SKU, Categoría, Precio Compra, Precio Venta, Stock, Estado, Acciones), stock alerts (red text + warning icon when ≤ minStock), estado badges (Activo=green, Inactivo=gray), dropdown actions menu (Edit, Toggle active, Delete), product form dialog with all fields (name, sku, category select, description, imgUrl, costPrice, salePrice, minStock, isActive switch), prices displayed/entered in pesos (×100 for cents), skeleton loading states
   - **Categories Tab**: Card grid layout, product count per category, edit/delete with hover reveal, empty state, "Nueva Categoría" dialog
   - **Delete confirmation** via AlertDialog for both products and categories
   - Uses `useAuthStore` for store info, `formatCurrency` for price formatting, `sonner` for toasts

### Backend API Routes
2. **`src/app/api/products/route.ts`** — GET (list with search, category, active filters) & POST (create with Zod validation, category ownership check)
3. **`src/app/api/products/[id]/route.ts`** — PUT (partial update) & DELETE (soft delete via isActive=false)
4. **`src/app/api/categories/route.ts`** — GET (list with product count) & POST (create with Zod validation, unique constraint)
5. **`src/app/api/categories/[id]/route.ts`** — PUT (rename) & DELETE (removes category reference from products first, then deletes)

## Design Decisions
- All prices stored/transported in cents, displayed/entered in pesos (÷100/×100)
- Soft delete for products (isActive=false), hard delete for categories (with product cleanup)
- Products sorted by isActive desc then name asc (active products always on top)
- No indigo/blue colors — uses emerald/green for active states, gray for inactive, amber/red for stock warnings
- Responsive layout: toolbar stacks on mobile, table scrolls horizontally, category cards in responsive grid

## Lint Status
All new code passes lint. Pre-existing lint errors in `page.tsx` and `app-shell.tsx` are unrelated to this task.
