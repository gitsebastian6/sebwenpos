// ---------------------------------------------------------------------------
// Sebwen POS — Catálogo de permisos de módulo (fuente única de verdad)
// ---------------------------------------------------------------------------
// Client-safe: NO importa `db`, `next/server`, ni nada de servidor. Lo usan
// tanto el guard server-side (src/lib/permissions.ts) como el editor de roles,
// el auth-store y las rutas de auth.
//
// ⚠️ Agregar aquí una key nueva y punto — `emptyPermissions()` / `fullPermissions()`
//    y el type `PermissionKey` se propagan solos. El editor de roles
//    (roles-view.tsx) tiene una aserción que falla si su lista se desincroniza.
// ---------------------------------------------------------------------------

export const PERMISSION_KEYS = [
  'dashboard',
  'pos',
  'tables',
  'products',
  'customers',
  'providers',
  'purchases',
  'orders',
  'onlineOrders',
  'invoices',
  'inventory',
  'accounting',
  'services',
  'reports',
  'settings',
  'quotations',
  'manageEmployees',
  'manageRoles',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

/** Etiquetas en español para la UI (editor de roles, ficha de empleado). */
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  dashboard: 'Dashboard',
  pos: 'Punto de Venta',
  tables: 'Mesas y Comandas',
  products: 'Productos',
  customers: 'Clientes',
  providers: 'Proveedores',
  purchases: 'Compras',
  orders: 'Órdenes y Ventas',
  onlineOrders: 'Pedidos en línea',
  invoices: 'Facturación',
  inventory: 'Inventario',
  accounting: 'Contabilidad',
  services: 'Servicios',
  reports: 'Informes',
  settings: 'Configuración',
  quotations: 'Cotizaciones',
  manageEmployees: 'Gestionar Empleados',
  manageRoles: 'Gestionar Roles',
}

/** Objeto con TODAS las keys en false — base para mergear permisos parciales. */
export function emptyPermissions(): Record<PermissionKey, boolean> {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])) as Record<PermissionKey, boolean>
}

/** Objeto con TODAS las keys en true — acceso completo (OWNER, fallback del store). */
export function fullPermissions(): Record<PermissionKey, boolean> {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as Record<PermissionKey, boolean>
}
