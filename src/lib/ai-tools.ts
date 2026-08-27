// ---------------------------------------------------------------------------
// Sebwen POS — AI Tools (Function Calling) + KPI Context Injection
// ---------------------------------------------------------------------------
// Read-only data tools the AI chat assistant can invoke to answer questions
// about the user's REAL business data (sales, inventory, cash, invoices,
// debts). Each tool is scoped server-side by storeId (never trusting model
// args for tenancy) and mirrors the query patterns already used in
// /api/reports/daily and /api/reports/informes so results stay consistent.
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'
import { sql } from '@/lib/db-dialect'
import { logger } from '@/lib/logger'

// Serialize BigInt for JSON.stringify in tool results
;(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this)
}

const N = (v: number | bigint | null | undefined): number => Number(v ?? 0)

/** Compact COP formatter for the KPI context string (no Intl needed). */
function cop(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO')
}

// ─── Tool definitions (OpenAI function-calling schema) ─────────────────────

export interface AiToolCall {
  id: string
  name: string
  arguments: string // raw JSON string from the model
}

export const AI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_daily_report',
      description:
        'Resumen del día (estilo Corte Z): ventas totales, número de ventas, canceladas, desglose por método de pago, top productos, caja esperada, deudas nuevas y servicios del día. Úsalo cuando el usuario pregunte por ventas de hoy o de una fecha concreta.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD. Si se omite, usa hoy.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_sales_summary',
      description:
        'KPIs de ventas de un período (por defecto el mes actual): total vendido, número de ventas, ticket promedio, propinas, descuentos, desglose por método de pago y por categoría, y comparación con el mes anterior. Úsalo para preguntas sobre ventas del mes o un rango de fechas.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD. Si se omite, usa inicio de mes.' },
          to: { type: 'string', description: 'Fecha fin YYYY-MM-DD. Si se omite, usa hoy.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_top_products',
      description:
        'Productos más vendidos por ingreso y cantidad en los últimos N días (por defecto 30). Devuelve top productos con unidades vendidas y total. Úsalo para "¿qué vendo más?", "lo más vendido".',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Días hacia atrás a analizar (default 30).' },
          limit: { type: 'number', description: 'Cantidad de productos a devolver (default 10).' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_low_stock_products',
      description:
        'Productos con stock bajo o agotado (stock actual <= stock mínimo). Devuelve lista con nombre, stock actual, mínimo y estado (agotado/bajo). Úsalo para "¿qué debo reponer?", "stock bajo".',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_invoices_summary',
      description:
        'Estado de las facturas electrónicas DIAN de un período: cuántas validadas, pendientes, rechazadas, borradores, total facturado e IVA recaudado. Úsalo para preguntas sobre facturación electrónica.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (default: inicio de mes).' },
          to: { type: 'string', description: 'Fecha fin YYYY-MM-DD (default: hoy).' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_cash_status',
      description:
        'Estado de la caja registradora actual: turno abierto (si lo hay), saldo de apertura, efectivo esperado y ventas en efectivo del día. Úsalo para "¿cuánto hay en caja?", "cuadre de caja".',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_customer_debts',
      description:
        'Clientes con deuda (fiado): total de cartera, número de deudores, deuda más antigua y lista de los principales deudores. Úsalo para "¿quién me debe?", "cartera", "fiados".',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
]

// ─── Tool executor dispatcher ──────────────────────────────────────────────

/**
 * Execute a tool by name with parsed args. storeId is injected server-side
 * and is NEVER taken from the model's arguments (tenancy safety).
 * Returns a JSON-serializable object. Errors are caught and returned as
 * { error } so the model can react gracefully.
 */
export async function executeAiTool(
  name: string,
  args: Record<string, unknown>,
  storeId: number
): Promise<unknown> {
  try {
    switch (name) {
      case 'get_daily_report':
        return await toolGetDailyReport(storeId, args as { date?: string })
      case 'get_sales_summary':
        return await toolGetSalesSummary(storeId, args as { from?: string; to?: string })
      case 'get_top_products':
        return await toolGetTopProducts(storeId, args as { days?: number; limit?: number })
      case 'get_low_stock_products':
        return await toolGetLowStockProducts(storeId)
      case 'get_invoices_summary':
        return await toolGetInvoicesSummary(storeId, args as { from?: string; to?: string })
      case 'get_cash_status':
        return await toolGetCashStatus(storeId)
      case 'get_customer_debts':
        return await toolGetCustomerDebts(storeId)
      default:
        return { error: `Herramienta desconocida: ${name}` }
    }
  } catch (e: unknown) {
    logger.error(`[AI Tools] ${name} failed:`, e instanceof Error ? e.message : String(e))
    return { error: 'No pude obtener esos datos en este momento' }
  }
}

// ─── Tool implementations ──────────────────────────────────────────────────

async function toolGetDailyReport(storeId: number, args: { date?: string }) {
  const reportDate = args.date ? new Date(args.date + 'T00:00:00') : new Date()
  const start = new Date(reportDate)
  start.setHours(0, 0, 0, 0)
  const startTs = start.getTime()
  const endTs = startTs + 24 * 60 * 60 * 1000
  const dayFilter = `AND o.created_at >= ${sql.timestamp(startTs)} AND o.created_at < ${sql.timestamp(endTs)}`

  const [statsRaw, byPaymentRaw, topRaw, cancelledCount, servicesRaw] = await Promise.all([
    db.$queryRawUnsafe<Array<{ total: number; subtotal: number; tips: number; count: number }>>(`
      SELECT CAST(COALESCE(SUM(o.total),0) AS INTEGER) as total,
             CAST(COALESCE(SUM(o.subtotal),0) AS INTEGER) as subtotal,
             CAST(COALESCE(SUM(o.tip_amount),0) AS INTEGER) as tips,
             CAST(COUNT(*) AS INTEGER) as count
      FROM orders o
      WHERE o.store_id = ${storeId} AND o.status IN ('COMPLETED','CREDIT') ${dayFilter}
    `),
    db.$queryRawUnsafe<Array<{ method: string; count: number; total: number; tips: number }>>(`
      SELECT o.payment_method as method, CAST(COUNT(*) AS INTEGER) as count,
             CAST(SUM(o.total) AS INTEGER) as total, CAST(SUM(o.tip_amount) AS INTEGER) as tips
      FROM orders o
      WHERE o.store_id = ${storeId} AND o.status IN ('COMPLETED','CREDIT') ${dayFilter}
      GROUP BY o.payment_method
    `),
    db.$queryRawUnsafe<Array<{ productId: number; name: string; quantity: number; total: number }>>(`
      SELECT oi.product_id as productId, COALESCE(p.name,'Eliminado') as name,
             CAST(SUM(oi.quantity * oi.units_per_pack) AS REAL) as quantity,
             CAST(SUM(oi.total_row) AS INTEGER) as total
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.store_id = ${storeId} AND o.status IN ('COMPLETED','CREDIT') ${dayFilter}
      GROUP BY oi.product_id, p.name ORDER BY total DESC LIMIT 10
    `),
    db.order.count({
      where: { storeId, status: 'CANCELLED', createdAt: { gte: new Date(startTs), lt: new Date(endTs) } },
    }),
    db.$queryRawUnsafe<Array<{ totalAmount: number | null }>>(`
      SELECT CAST(COALESCE(SUM(total_amount),0) AS INTEGER) as totalAmount
      FROM service_transactions
      WHERE store_id = ${storeId} AND status = 'COMPLETED'
        AND created_at >= ${sql.timestamp(startTs)} AND created_at < ${sql.timestamp(endTs)}
    `),
  ])

  const stats = statsRaw[0]
  const byPayment: Record<string, { count: number; total: number; tips: number }> = {}
  for (const r of byPaymentRaw) byPayment[r.method] = { count: N(r.count), total: N(r.total), tips: N(r.tips) }

  return {
    date: reportDate.toISOString().split('T')[0],
    sales: {
      total: N(stats?.total),
      subtotal: N(stats?.subtotal),
      tips: N(stats?.tips),
      completedCount: N(stats?.count),
      cancelledCount,
    },
    byPayment,
    topProducts: topRaw.map(r => ({ name: r.name, quantity: N(r.quantity), total: N(r.total) })),
    services: N(servicesRaw[0]?.totalAmount),
  }
}


async function toolGetSalesSummary(storeId: number, args: { from?: string; to?: string }) {
  const now = new Date()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const pGte = args.from ? new Date(args.from + 'T00:00:00') : monthStart
  const pLte = args.to ? new Date(args.to + 'T23:59:59') : todayEnd
  const dateClause = `AND o.created_at >= ${sql.timestamp(pGte.getTime())} AND o.created_at <= ${sql.timestamp(pLte.getTime())}`
  const base = `o.store_id = ${storeId} AND o.status IN ('COMPLETED','CREDIT') ${dateClause}`

  const [agg, byPayment, byCategory, lastMonthAgg] = await Promise.all([
    db.$queryRawUnsafe<Array<{ total: number; subtotal: number; tips: number; discounts: number; count: number }>>(`
      SELECT CAST(COALESCE(SUM(o.total),0) AS INTEGER) as total,
             CAST(COALESCE(SUM(o.subtotal),0) AS INTEGER) as subtotal,
             CAST(COALESCE(SUM(o.tip_amount),0) AS INTEGER) as tips,
             CAST(COALESCE(SUM(o.discount_amount),0) AS INTEGER) as discounts,
             CAST(COUNT(*) AS INTEGER) as count
      FROM orders o WHERE ${base}
    `),
    db.$queryRawUnsafe<Array<{ method: string; count: number; total: number }>>(`
      SELECT o.payment_method as method, CAST(COUNT(*) AS INTEGER) as count,
             CAST(SUM(o.total) AS INTEGER) as total
      FROM orders o WHERE ${base} GROUP BY o.payment_method
    `),
    db.$queryRawUnsafe<Array<{ category: string; qty: number; total: number }>>(`
      SELECT COALESCE(c.name,'Sin categoria') as category,
             CAST(SUM(oi.quantity * oi.units_per_pack) AS REAL) as qty,
             CAST(SUM(oi.total_row) AS INTEGER) as total
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE o.store_id = ${storeId} AND o.status IN ('COMPLETED','CREDIT') ${dateClause}
      GROUP BY c.name ORDER BY total DESC LIMIT 10
    `),
    db.$queryRawUnsafe<Array<{ total: number; count: number }>>(`
      SELECT CAST(COALESCE(SUM(o.total),0) AS INTEGER) as total,
             CAST(COUNT(*) AS INTEGER) as count
      FROM orders o
      WHERE o.store_id = ${storeId} AND o.status IN ('COMPLETED','CREDIT')
        AND o.created_at >= ${sql.timestamp(lastMonthStart.getTime())}
        AND o.created_at <= ${sql.timestamp(lastMonthEnd.getTime())}
    `),
  ])

  const a = agg[0]
  const total = N(a?.total)
  const count = N(a?.count)
  const lastTotal = N(lastMonthAgg[0]?.total)
  const lastCount = N(lastMonthAgg[0]?.count)
  const vsLastMonthPct = lastTotal > 0 ? Math.round(((total - lastTotal) / lastTotal) * 1000) / 10 : null

  return {
    period: { from: pGte.toISOString().split('T')[0], to: pLte.toISOString().split('T')[0] },
    total,
    subtotal: N(a?.subtotal),
    tips: N(a?.tips),
    discounts: N(a?.discounts),
    count,
    avgTicket: count > 0 ? Math.round(total / count) : 0,
    vsLastMonth: { total: lastTotal, count: lastCount, pct: vsLastMonthPct },
    byPayment: byPayment.map(r => ({ method: r.method, count: N(r.count), total: N(r.total) })),
    byCategory: byCategory.map(r => ({ category: r.category, quantity: N(r.qty), total: N(r.total) })),
  }
}

async function toolGetTopProducts(storeId: number, args: { days?: number; limit?: number }) {
  const days = Math.min(Math.max(args.days ?? 30, 1), 365)
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 50)
  const since = Date.now() - days * 86400000

  const rows = await db.$queryRawUnsafe<Array<{ productId: number; name: string; quantity: number; total: number }>>(`
    SELECT oi.product_id as productId, COALESCE(p.name,'Eliminado') as name,
           CAST(SUM(oi.quantity * oi.units_per_pack) AS REAL) as quantity,
           CAST(SUM(oi.total_row) AS INTEGER) as total
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.store_id = ${storeId} AND o.status IN ('COMPLETED','CREDIT')
      AND o.created_at >= ${sql.timestamp(since)}
      AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id, p.name ORDER BY total DESC LIMIT ${limit}
  `)

  return {
    days,
    topProducts: rows.map(r => ({ name: r.name, quantity: N(r.quantity), total: N(r.total) })),
  }
}


async function toolGetLowStockProducts(storeId: number) {
  const rows = await db.$queryRawUnsafe<Array<{ id: number; name: string; currentStock: number; minStock: number }>>(`
    SELECT id, name, CAST(current_stock AS REAL) as "currentStock",
           CAST(min_stock AS REAL) as "minStock"
    FROM products
    WHERE store_id = ${storeId} AND is_active = ${sql.bool(true)} AND track_inventory = ${sql.bool(true)}
      AND CAST(current_stock AS REAL) <= CAST(min_stock AS REAL)
    ORDER BY current_stock ASC LIMIT 30
  `)

  const items = rows.map(r => {
    const stock = N(r.currentStock)
    return { name: r.name, currentStock: stock, minStock: N(r.minStock), status: stock <= 0 ? 'AGOTADO' : 'BAJO' }
  })

  return {
    count: items.length,
    outOfStock: items.filter(i => i.status === 'AGOTADO').length,
    lowStock: items.filter(i => i.status === 'BAJO').length,
    items,
  }
}

async function toolGetInvoicesSummary(storeId: number, args: { from?: string; to?: string }) {
  const now = new Date()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const gte = args.from ? new Date(args.from + 'T00:00:00') : monthStart
  const lte = args.to ? new Date(args.to + 'T23:59:59') : todayEnd

  const rows = await db.$queryRawUnsafe<Array<{ status: string; count: number; grandTotal: number; totalTax: number }>>(`
    SELECT status, CAST(COUNT(*) AS INTEGER) as count,
           CAST(SUM(grand_total) AS INTEGER) as "grandTotal",
           CAST(SUM(total_tax_amount) AS INTEGER) as "totalTax"
    FROM invoices
    WHERE store_id = ${storeId}
      AND created_at >= ${sql.timestamp(gte.getTime())}
      AND created_at <= ${sql.timestamp(lte.getTime())}
    GROUP BY status
  `)

  let count = 0
  let grandTotal = 0
  let totalTax = 0
  const byStatus: Record<string, number> = {}
  for (const r of rows) {
    const c = N(r.count)
    count += c
    grandTotal += N(r.grandTotal)
    totalTax += N(r.totalTax)
    byStatus[r.status] = c
  }

  return {
    period: { from: gte.toISOString().split('T')[0], to: lte.toISOString().split('T')[0] },
    count,
    grandTotal,
    totalTax,
    byStatus,
    validated: N(byStatus['VALIDATED']) + N(byStatus['DELIVERED']),
    pending: N(byStatus['DRAFT']) + N(byStatus['PENDING_VALIDATE']),
    rejected: N(byStatus['REJECTED']),
  }
}

async function toolGetCashStatus(storeId: number) {
  const openShift = await db.cashRegister.findFirst({
    where: { storeId, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
    select: { id: true, openingBalance: true, openedAt: true, user: { select: { fullName: true } } },
  })

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const startTs = start.getTime()
  const endTs = startTs + 86400000

  const cashRaw = await db.$queryRawUnsafe<Array<{ total: number }>>(`
    SELECT CAST(COALESCE(SUM(o.total),0) AS INTEGER) as total
    FROM orders o
    WHERE o.store_id = ${storeId} AND o.status IN ('COMPLETED','CREDIT')
      AND o.payment_method IN ('CASH','EFECTIVO')
      AND o.created_at >= ${sql.timestamp(startTs)} AND o.created_at < ${sql.timestamp(endTs)}
  `)
  const cashToday = N(cashRaw[0]?.total)
  const opening = openShift ? openShift.openingBalance : 0

  return {
    hasOpenShift: !!openShift,
    openedAt: openShift?.openedAt?.toISOString() || null,
    openedBy: openShift?.user?.fullName || null,
    openingBalance: opening,
    cashSalesToday: cashToday,
    expectedCash: opening + cashToday,
  }
}

async function toolGetCustomerDebts(storeId: number) {
  const rows = await db.$queryRawUnsafe<Array<{ id: number; name: string; totalDebt: number; debtSince: string | null }>>(`
    SELECT id, name, total_debt as "totalDebt", debt_since as "debtSince"
    FROM customers
    WHERE store_id = ${storeId} AND total_debt > 0
    ORDER BY total_debt DESC LIMIT 20
  `)

  const now = Date.now()
  const items = rows.map(r => ({
    name: r.name,
    debt: N(r.totalDebt),
    daysOutstanding: r.debtSince ? Math.floor((now - new Date(r.debtSince).getTime()) / 86400000) : null,
  }))
  const totalDebt = items.reduce((s, i) => s + i.debt, 0)
  const oldestDays = items.reduce((m, i) => Math.max(m, i.daysOutstanding ?? 0), 0)

  return {
    totalDebt,
    debtorCount: items.length,
    oldestDebtDays: oldestDays,
    topDebtors: items.slice(0, 10),
  }
}


// ─── KPI Context (F1) — compact snapshot appended to the system prompt ──────

/**
 * Build a compact, human-readable snapshot of the store's key metrics for the
 * current moment. Appended to the system prompt so the model has context even
 * before invoking any tool. Fail-safe: returns '' on any error.
 */
export async function buildStoreKpisContext(storeId: number): Promise<string> {
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart.getTime() + 86399999)
    const yesterdayStart = new Date(todayStart.getTime() - 86400000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn() } catch { return null }
    }

    const [today, yesterday, thisMonth, lastMonth, lowStock, pendingInv, debts] = await Promise.all([
      safe(() => db.order.aggregate({
        where: { storeId, status: 'COMPLETED', createdAt: { gte: todayStart, lte: todayEnd } },
        _sum: { total: true }, _count: { id: true },
      })),
      safe(() => db.order.aggregate({
        where: { storeId, status: 'COMPLETED', createdAt: { gte: yesterdayStart, lte: todayStart } },
        _sum: { total: true }, _count: { id: true },
      })),
      safe(() => db.order.aggregate({
        where: { storeId, status: 'COMPLETED', createdAt: { gte: monthStart, lte: todayEnd } },
        _sum: { total: true }, _count: { id: true },
      })),
      safe(() => db.order.aggregate({
        where: { storeId, status: 'COMPLETED', createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum: { total: true },
      })),
      safe(() => db.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT CAST(COUNT(*) AS INTEGER) as c FROM products
         WHERE store_id = ${storeId} AND is_active = ${sql.bool(true)} AND track_inventory = ${sql.bool(true)}
           AND CAST(current_stock AS REAL) <= CAST(min_stock AS REAL)`
      )),
      safe(() => db.invoice.count({
        where: { storeId, status: { in: ['DRAFT', 'PENDING_VALIDATE'] }, createdAt: { gte: monthStart, lte: todayEnd } },
      })),
      safe(() => db.customer.aggregate({
        where: { storeId, totalDebt: { gt: 0 } },
        _sum: { totalDebt: true }, _count: { id: true },
      })),
    ])

    const todayTotal = N(today?._sum?.total)
    const todayCount = N(today?._count?.id)
    const yesterdayTotal = N(yesterday?._sum?.total)
    const todayVsYesterdayPct = yesterdayTotal > 0
      ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 1000) / 10
      : null
    const monthTotal = N(thisMonth?._sum?.total)
    const monthCount = N(thisMonth?._count?.id)
    const lastMonthTotal = N(lastMonth?._sum?.total)
    const monthVsLastPct = lastMonthTotal > 0
      ? Math.round(((monthTotal - lastMonthTotal) / lastMonthTotal) * 1000) / 10
      : null
    const lowStockCount = N(lowStock?.[0]?.c)
    const pendingInvoices = N(pendingInv)
    const debtTotal = N(debts?._sum?.totalDebt)
    const debtCount = N(debts?._count?.id)

    const dateStr = now.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
    const lines: string[] = [
      `\n\n## Datos del negocio (hoy, ${dateStr})`,
      `- Ventas hoy: ${cop(todayTotal)} (${todayCount} ventas)${todayVsYesterdayPct !== null ? ` | Ayer: ${cop(yesterdayTotal)} (${todayVsYesterdayPct >= 0 ? '+' : ''}${todayVsYesterdayPct}%)` : ''}`,
      `- Ventas del mes: ${cop(monthTotal)} (${monthCount} ventas)${monthVsLastPct !== null ? ` | Mes pasado: ${cop(lastMonthTotal)} (${monthVsLastPct >= 0 ? '+' : ''}${monthVsLastPct}%)` : ''}`,
    ]
    if (lowStockCount > 0) lines.push(`- Productos con stock bajo/agotado: ${lowStockCount}`)
    if (pendingInvoices > 0) lines.push(`- Facturas DIAN pendientes de validacion: ${pendingInvoices}`)
    if (debtTotal > 0) lines.push(`- Cartera (fiado por cobrar): ${cop(debtTotal)} en ${debtCount} clientes`)
    lines.push('- Estos son datos REALES del negocio. Usa las herramientas para consultas mas detalladas.')

    return lines.join('\n')
  } catch (e: unknown) {
    logger.warn('[AI Tools] KPI context failed:', e instanceof Error ? e.message : String(e))
    return ''
  }
}

/** Section appended to the system prompt when tools are available. */
export const AI_TOOLS_SECTION = `\n\n## Acceso a datos del negocio (TIENES HERRAMIENTAS)
Cuando el usuario pregunte por cifras reales de SU negocio (ventas, inventario, caja, facturas, deudas, productos mas vendidos, etc.), USA las herramientas disponibles para consultar los datos reales en tiempo real. NUNCA inventes cifras — si te falta un dato, llama a la herramienta correspondiente.
- get_daily_report: ventas de hoy o una fecha concreta (Corte Z)
- get_sales_summary: ventas de un periodo o mes (con comparacion vs mes anterior)
- get_top_products: productos mas vendidos
- get_low_stock_products: stock bajo/agotado (que reponer)
- get_invoices_summary: estado de facturas electronicas DIAN
- get_cash_status: caja actual (turno abierto, efectivo esperado)
- get_customer_debts: clientes con deuda / cartera
Al responder con cifras, compara periodos cuando sea util, da contexto y usa pesos colombianos (COP). Solo usas las herramientas para consultar datos del negocio del usuario actual, nunca de otros.`

