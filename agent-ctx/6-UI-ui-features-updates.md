---
Task ID: 6-UI
Agent: ui-features-updates
Task: Update Inventory and Products views with operational features

Work Log:
- Read worklog.md for context on existing APIs (adjustments, returns, losses endpoints already exist from task 3-APIs)
- Read full inventory-view.tsx (610 lines) and products-view.tsx (1130 lines)
- Updated inventory-view.tsx with:
  - New "Inventario de Productos" Card section between Stock Alerts and Movements
  - Product inventory table with: name, SKU, category badge, stock (low-stock warnings), sale price
  - DropdownMenu per product row (MoreVertical icon) with 3 options:
    - "Ajustar Stock" → Dialog: mode select (Establecer/Agregar+Quitar), quantity input, notes textarea → POST /api/inventory/adjustments
    - "Registrar Devolución" → Dialog: quantity input, notes textarea → POST /api/inventory/returns
    - "Registrar Pérdida" → Dialog: quantity input, required reason textarea → POST /api/inventory/losses
  - All dialogs show product name/stock, loading spinners, toast notifications
  - refreshAll() reloads stock alerts + movements + products after actions
  - Added LOSS to MOVEMENT_TYPE_LABELS/ICONS, DropdownMenu imports, SlidersHorizontal/MoreVertical icons
- Updated products-view.tsx with:
  - commission: number added to Product interface
  - commission: string added to ProductFormData interface
  - commission: '0' in emptyProductForm defaults
  - openEditProductDialog populates commission from product.commission ?? 0
  - Save payload includes commission (clamped 0-100)
  - "Comisión %" input field in product dialog (number, 0-100, help text)
  - Placed next to Stock Mínimo in compact grid layout

Stage Summary:
- Inventory view: full product list with per-product quick action dropdowns (adjust/return/loss)
- 3 compact action dialogs with validation, loading, toast feedback
- Products view: commission % field in create/edit form
- Lint: 0 errors in modified files
