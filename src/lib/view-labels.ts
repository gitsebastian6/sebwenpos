/**
 * Sebwen POS — View Labels
 * ─────────────────────────────────────────────────────────
 * Single source of truth for the human-readable name of each app view,
 * matching exactly what's shown in the sidebar (see app-shell.tsx).
 * Used by the app shell header, the AI assistant's "contexto activo" chip,
 * and the AI assistant's system prompt — so the assistant never refers to
 * a module by a name the user doesn't actually see on screen.
 */
export const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  pos: 'Punto de Venta',
  tables: 'Mesas y Comandas',
  products: 'Productos',
  customers: 'Clientes',
  providers: 'Proveedores',
  purchases: 'Compras',
  services: 'Servicios',
  orders: 'Órdenes',
  'online-orders': 'Pedidos en línea',
  invoices: 'Facturación Electrónica',
  quotations: 'Cotizaciones',
  inventory: 'Inventario',
  expirations: 'Vencimientos',
  accounting: 'Contabilidad',
  reports: 'Informes',
  employees: 'Empleados',
  roles: 'Roles y Permisos',
  settings: 'Configuración',
}
