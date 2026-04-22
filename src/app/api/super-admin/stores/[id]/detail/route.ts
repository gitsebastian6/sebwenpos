import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decryptField } from '@/lib/field-encryption'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/super-admin/stores/[id]/detail
 * Retorna el detalle completo de una tienda: owner, empleados, roles, IVA, categorías, stats
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const storeId = Number(id)
    if (isNaN(storeId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const store = await db.store.findUnique({
      where: { id: storeId },
      include: {
        user: {
          select: { id: true, cedula: true, fullName: true, email: true, phone: true, role: true, createdAt: true },
        },
      },
    })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // DIAN / Electronic Invoicing info from store record
    const dianInfo = {
      invoicePrefix: store.invoicePrefix,
      resolutionNumber: store.resolutionNumber,
      resolutionStartDate: store.resolutionStartDate,
      resolutionEndDate: store.resolutionEndDate,
      resolutionStartNumber: store.resolutionStartNumber,
      resolutionEndNumber: store.resolutionEndNumber,
      invoiceTestMode: store.invoiceTestMode,
    }

    // Get all related data in parallel
    const [
      employees,
      roles,
      taxRates,
      categories,
      products,
      customers,
      orders,
      invoices,
      quotations,
      expenses,
      services,
      providers,
      ledgerAccounts,
      subscription,
      invoiceStats,
    ] = await Promise.all([
      db.employee.findMany({
        where: { storeId },
        include: {
          user: { select: { id: true, cedula: true, fullName: true, email: true, phone: true, role: true, createdAt: true } },
          role: { select: { id: true, name: true, description: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.role.findMany({
        where: { storeId },
        include: { _count: { select: { employees: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      db.taxRate.findMany({
        where: { storeId },
        orderBy: { rate: 'desc' },
      }),
      db.category.findMany({
        where: { storeId },
        include: { _count: { select: { products: true } } },
        orderBy: { name: 'asc' },
      }),
      db.product.findMany({
        where: { storeId },
        include: {
          category: { select: { name: true } },
          taxRate: { select: { name: true, rate: true, code: true } },
        },
        orderBy: { name: 'asc' },
        take: 50,
      }),
      db.customer.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      db.order.findMany({
        where: { storeId },
        include: {
          customer: { select: { name: true } },
          _count: { select: { orderItems: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      db.invoice.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      db.quotation.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      db.expense.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      db.service.findMany({
        where: { storeId },
        orderBy: { name: 'asc' },
      }),
      db.provider.findMany({
        where: { storeId },
        orderBy: { name: 'asc' },
      }),
      db.ledgerAccount.findMany({
        where: { storeId },
        orderBy: { type: 'asc' },
      }),
      db.subscription.findUnique({
        where: { storeId },
        include: { plan: true },
      }),
      db.invoice.groupBy({
        by: ['status'],
        where: { storeId },
        _count: true,
      }),
    ])

    // Totals (get ALL orders, not just last 20)
    const totalOrdersAmount = await db.order.aggregate({
      where: { storeId, status: 'COMPLETED' },
      _sum: { total: true },
    })
    const totalExpensesAmount = await db.expense.aggregate({
      where: { storeId },
      _sum: { amount: true },
    })

    // Recent orders count by status
    const ordersByStatus = await db.order.groupBy({
      by: ['status'],
      where: { storeId },
      _count: true,
    })

    // Actual counts for limits (not limited by take)
    const [
      actualProductCount,
      actualEmployeeCount,
    ] = await Promise.all([
      db.product.count({ where: { storeId } }),
      db.employee.count({ where: { storeId } }),
    ])

    return NextResponse.json({
      store: {
        ...store,
        certificatePassword: undefined,
        softwarePin: store.softwarePin ? decryptField(store.softwarePin) : null,
        _count: {
          employees: actualEmployeeCount,
          products: actualProductCount,
          orders: ordersByStatus.reduce((sum, g) => sum + g._count, 0),
          customers: customers.length,
          categories: categories.length,
          taxRates: taxRates.length,
          roles: roles.length,
          invoices: invoices.length,
          quotations: quotations.length,
          expenses: expenses.length,
          services: services.length,
          providers: providers.length,
        },
      },
      stats: {
        totalSales: totalOrdersAmount._sum.total || 0,
        totalExpenses: totalExpensesAmount._sum.amount || 0,
        ordersByStatus: Object.fromEntries(ordersByStatus.map(g => [g.status, g._count])),
      },
      subscription,
      dianInfo,
      invoiceStats: Object.fromEntries(invoiceStats.map(g => [g.status, g._count])),
      employees,
      roles,
      taxRates,
      categories,
      products,
      customers,
      orders,
      invoices,
      quotations,
      expenses,
      services,
      providers,
      ledgerAccounts,
    })
  } catch (error) {
    logger.error('Error fetching store detail:', error)
    return NextResponse.json({ error: 'Error al obtener detalle de la tienda' }, { status: 500 })
  }
}
