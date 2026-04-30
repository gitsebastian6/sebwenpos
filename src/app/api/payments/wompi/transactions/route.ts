import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireAuthStoreId } from '@/lib/api-auth'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET /api/payments/wompi/transactions
// Lists WompiTransactions with filtering and pagination.
// Requires authentication and store access.
//
// Query params:
//   storeId    (required) — Filter by store
//   status     (optional) — PENDING, APPROVED, DECLINED, VOIDED, ERROR
//   type       (optional) — SUBSCRIPTION, POS (filters by subscriptionId presence)
//   page       (optional) — Page number (default: 1)
//   limit      (optional) — Items per page (default: 20, max: 100)
//   search     (optional) — Search by reference, customerEmail, customerName
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const storeIdParam = url.searchParams.get('storeId')
    const status = url.searchParams.get('status')
    const type = url.searchParams.get('type')
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)))
    const search = url.searchParams.get('search')

    if (!storeIdParam) {
      return NextResponse.json(
        { error: 'storeId es requerido' },
        { status: 400 },
      )
    }

    const storeId = parseInt(storeIdParam, 10)
    if (isNaN(storeId)) {
      return NextResponse.json({ error: 'storeId inválido' }, { status: 400 })
    }

    // ── Auth check ──
    const storeIdOrErr = requireAuthStoreId(request, storeId)
    if (storeIdOrErr instanceof NextResponse) return storeIdOrErr

    // ── Build where clause ──
    const where: Prisma.WompiTransactionWhereInput = { storeId }

    if (status && ['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'].includes(status)) {
      where.status = status
    }

    // Type filter: SUBSCRIPTION = has subscriptionId, POS = has orderId, no subscriptionId
    if (type === 'SUBSCRIPTION') {
      where.subscriptionId = { not: null }
    } else if (type === 'POS') {
      where.orderId = { not: null }
    }

    // Search filter
    if (search) {
      where.OR = [
        { reference: { contains: search } },
        { customerEmail: { contains: search } },
        { customerName: { contains: search } },
        { customerDocument: { contains: search } },
        { wompiId: { contains: search } },
      ]
    }

    // ── Count and fetch ──
    const [total, transactions] = await Promise.all([
      db.wompiTransaction.count({ where }),
      db.wompiTransaction.findMany({
        where,
        include: {
          subscription: {
            select: {
              id: true,
              status: true,
              plan: { select: { name: true, price: true } },
            },
          },
          receipt: {
            select: { id: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return NextResponse.json({
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error('[Wompi] Error listing transactions:', error)
    return NextResponse.json(
      { error: 'Error al listar transacciones Wompi' },
      { status: 500 },
    )
  }
}
