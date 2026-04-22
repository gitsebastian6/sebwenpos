import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/super-admin/customers
 * Lista todos los clientes de todas las tiendas para el Super Admin.
 *
 * Query params:
 *   ?search=term   — filtra por nombre, teléfono, email o NIT del cliente
 *   ?storeId=123   — filtra por tienda específica
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim() || ''
    const storeIdParam = searchParams.get('storeId')
    const storeId = storeIdParam ? Number(storeIdParam) : null

    // ─── Build where clause ───
    const where: Prisma.CustomerWhereInput = {}

    if (storeId && !isNaN(storeId)) {
      where.storeId = storeId
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { nit: { contains: search } },
      ]
    }

    // ─── Fetch customers + total + stores in parallel ───
    const [customers, total, stores] = await Promise.all([
      db.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          nit: true,
          documentType: true,
          address: true,
          regime: true,
          totalDebt: true,
          createdAt: true,
          updatedAt: true,
          store: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      db.customer.count({ where }),
      db.store.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ])

    // ─── Stats ───
    const totalDebt = customers.reduce((sum, c) => sum + c.totalDebt, 0)
    const customersWithDebt = customers.filter((c) => c.totalDebt > 0).length
    const stats = {
      totalCustomers: total,
      totalDebt,
      customersWithDebt,
      avgDebt: total > 0 ? Math.round(totalDebt / total) : 0,
      storesCount: stores.length,
    }

    return NextResponse.json({
      customers,
      total,
      stores,
      stats,
    })
  } catch (error) {
    logger.error('Error listing customers (super-admin):', error)
    return NextResponse.json({ error: 'Error al listar clientes' }, { status: 500 })
  }
}
