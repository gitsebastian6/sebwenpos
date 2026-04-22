# Task 1c-Roles-UI — Employee Roles Management UI

## Agent: main-orchestrator

## Summary
Created the employee/roles management UI and updated the app shell with permission-based menu filtering.

## Files Created

### 1. `src/components/employees/employees-view.tsx` (475 lines)
Full employee management page featuring:
- **Header** with title "Gestión de Empleados" and "Nuevo Empleado" button
- **Search bar** filtering by cédula, name, position, or email
- **Employees table** showing: Cédula (mono font), Nombre, Cargo (badge), Estado (Switch), Permisos (count badge), Fecha de creación, Acciones (Edit/Delete)
- **Create Dialog** with fields: Cédula, Nombre completo, Contraseña, Cargo (Select: Cajero/Mesero/Bartender/Administrador/Otro), Teléfono, Email
- **Collapsible Permission Editor** inside create dialog with 4 grouped sections:
  - Ventas: Punto de Venta, Mesas y Comandas, Órdenes y Ventas, Cotizaciones
  - Administración: Productos, Inventario, Proveedores
  - Finanzas: Contabilidad, Informes, Facturación
  - Sistema: Dashboard, Configuración, Gestionar Empleados, Servicios, Clientes
  - Each group has "Marcar todos" / "Desmarcar todos" toggle
- **Edit Dialog**: Allows changing position, permissions, active/inactive status, phone, email (NOT cédula or password)
- **Delete Confirmation**: AlertDialog with destructive styling, describes permanent deletion
- **Status Toggle**: Switch component directly on table row
- **Toast notifications** for all CRUD actions
- **Responsive design**: Mobile-friendly dialogs, hidden columns on small screens
- Uses shadcn/ui: Table, Dialog, AlertDialog, Badge, Switch, Button, Input, Label, Select, Card, Checkbox, Separator, ScrollArea

### 2. `src/components/quotations/quotations-view.tsx` (28 lines)
Placeholder module view for Cotizaciones — shows "Módulo en construcción" message. Needed because app-shell.tsx dynamically imports it.

## Files Modified

### 3. `src/components/layout/app-shell.tsx`
- Added `QuotationsView` and `EmployeesView` dynamic imports
- Added `quotations` (FileBarChart icon, permission: 'quotations') and `employees` (UsersRound icon, permission: 'manageEmployees') to menuItems array
- **Permission-based menu filtering**: Menu items are filtered using `hasPermission(item.permission)` — only items the user has permission for are shown in the sidebar
- Added `Badge` import for role badge
- **Sidebar footer updated**:
  - Shows role badge: "Propietario" (emerald color) or "Empleado" (sky color) based on `user.role`
  - Shows cédula in mono font instead of phone
  - Name and badge on same line with proper overflow handling
- **Header title mapping**: Added `quotations` → "Cotizaciones" and `employees` → "Empleados"
- **ViewRouter**: Added `quotations` → `<QuotationsView />` and `employees` → `<EmployeesView />` cases

## Lint Result
- 0 new errors in created/modified files
- 16 pre-existing errors in infrastructure files (daemon-prod.js, daemon.js, keepalive.cjs, mini-services, start-server.js) — all unrelated

## API Integration
All API calls use relative paths as required:
- `GET /api/employees?storeId=X` — list employees
- `POST /api/employees` — create employee
- `PUT /api/employees/[id]` — update employee
- `DELETE /api/employees/[id]` — delete employee
