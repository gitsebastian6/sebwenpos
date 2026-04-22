---
Task ID: RBAC
Agent: main-orchestrator
Task: Build comprehensive Role-Based Access Control (RBAC) system

Work Log:
- Read worklog.md and existing codebase (schema, auth-store, app-shell, auth routes)
- Updated prisma/schema.prisma:
  - Added Role model (id, storeId, name, description, permissions JSON, isActive, isDefault)
  - Added roleId, documentType, isActive, storeId fields to User model
  - Added storeId-based relation (StoreUsers) from User to Store (many-to-one)
  - Added staff relation from Store to User[]
  - Ran db:push to sync database
- Updated auth-store.ts:
  - Added ALL_MODULES constant (14 modules)
  - Added ModuleKey type
  - Exported AuthUser interface (added permissions field)
  - Added permissions state, setPermissions(), hasPermission(), isOwner() methods
  - hasPermission(): OWNER always true, dashboard+pos always true, else check permissions map
  - Updated partialize to persist permissions
- Updated app-store.ts: Added 'staff' to AppView type
- Created /src/app/api/roles/route.ts (GET list + POST create)
- Created /src/app/api/roles/[id]/route.ts (GET + PUT + DELETE)
- Updated /src/app/api/users/route.ts (GET list by storeId + POST create employee + PUT update)
- Created /src/app/api/users/[id]/route.ts (GET + DELETE deactivate)
- Created /src/app/api/staff/route.ts (GET combined users+roles+stats)
- Updated /src/app/api/auth/login/route.ts (returns role permissions, handles ownedStore vs store)
- Updated /src/app/api/auth/register/route.ts (creates store with owner, sets storeId)
- Updated /src/app/api/seed/route.ts (added 5 default roles: Administrador, Cajero, Mesero, Bartender, Contador)
- Updated app-shell.tsx:
  - Added StaffView dynamic import
  - Added 'staff' menu item with UsersRound icon
  - Added useMemo for permission-based menu filtering
  - Owner sees all modules; employees see only permitted modules
  - Display roleName in footer, displayLabel for header
  - Added ViewRouter case for 'staff'
- Updated auth-page.tsx:
  - Import ALL_MODULES and AuthUser type
  - After login: setPermissions from user.permissions
  - After register: set all permissions (OWNER)
- Created /src/components/staff/staff-view.tsx (~770 lines):
  - TWO tabs: EMPLEADOS and ROLES
  - EMPLEADOS tab: searchable table with Nombre, Documento, Teléfono, Email, Rol, Estado
  - Employee dialog: docType, cedula, fullName, phone, email, password, role select
  - Employee actions: Edit, Toggle Active, Delete (soft deactivate)
  - ROLES tab: 5 preset template buttons, role cards with permission summaries
  - Role dialog: name, description, isDefault toggle, permission grid by group
  - Permission groups: VENTAS (3), INVENTARIO (3), FINANCIERO (3), GESTIÓN (5) = 14 modules
  - Role actions: Edit, Duplicate, Delete (only if no users assigned)
  - Stats cards: active users, total users, total roles
  - Color-coded role badges (Administrador=emerald, Cajero=sky, etc.)

Stage Summary:
- Full RBAC system with Role model, 14 module permissions, CRUD APIs
- Staff view with Employees and Roles management
- Permission-based sidebar filtering (dynamic per user role)
- 5 preset role templates matching Colombian restaurant/bar staff
- Auth flow updated to propagate permissions on login/register
- Seed data includes 5 default roles
- Zero new lint/TS errors in RBAC code (all pre-existing)
