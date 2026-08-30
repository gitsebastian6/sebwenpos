import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireStoreAccess } from '@/lib/api-auth'
import { requireActiveSubscription } from '@/lib/subscription-guard'
import { requirePermission } from '@/lib/permissions'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const EXPENSE_CATEGORIES = [
  'ARRIENDO', 'SERVICIOS', 'NOMINA', 'INSUMOS',
  'LICENCIAS', 'IMPUESTOS', 'TRANSPORTE', 'MANTENIMIENTO', 'OTRO',
] as const

const createExpenseSchema = z.object({
  storeId: z.number().int().positive(),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().min(1).max(500),
  amount: z.number().int().positive(),
  date: z.string().datetime().optional().default(() => new Date().toISOString()),
  notes: z.string().max(1000).optional(),
})

// ─── GET: List expenses ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = parseInt(searchParams.get('storeId') || '')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const category = searchParams.get('category')

    if (!storeId || isNaN(storeId)) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(request, 'accounting')
    if (permErr) return permErr

    const where: Record<string, unknown> = { storeId }

    if (from) {
      const fromDate = new Date(from)
      fromDate.setHours(0, 0, 0, 0)
      where.date = { ...((where.date as Record<string, unknown>) || {}), gte: fromDate }
    }
    if (to) {
      const toDate = new Date(to)
      toDate.setHours(23, 59, 59, 999)
      where.date = { ...((where.date as Record<string, unknown>) || {}), lte: toDate }
    }
    if (category) {
      where.category = category
    }

    const expenses = await db.expense.findMany({
      where,
      orderBy: { date: 'desc' },
    })

    return NextResponse.json({ expenses })
  } catch (error) {
    logger.error('GET /api/expenses error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// ─── POST: Create expense ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createExpenseSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { storeId, category, description, amount, date, notes } = parsed.data
    const dateObj = new Date(date)

    // Auth: verify user has access to this store
    const storeAccessError = requireStoreAccess(request, storeId)
    if (storeAccessError) return storeAccessError
    const permErr = await requirePermission(request, 'accounting')
    if (permErr) return permErr
    const subErr = await requireActiveSubscription(storeId)
    if (subErr) return subErr

    const expense = await db.$transaction(async (tx) => {
      // Find expense account (EXPENSE type)
      const expenseAccount = await tx.ledgerAccount.findFirst({
        where: { storeId, type: 'EXPENSE' },
      })
      if (!expenseAccount) {
        throw new Error('No se encontró cuenta de gastos (EXPENSE). Crea una en Contabilidad > Cuentas.')
      }

      // Find default asset account (Caja)
      const cashAccount = await tx.ledgerAccount.findFirst({
        where: { storeId, type: 'ASSET', isDefault: true },
      })
      if (!cashAccount) {
        throw new Error('No se encontró cuenta de caja (ASSET default). Crea una en Contabilidad > Cuentas.')
      }

      // This route always debits Caja for the expense (see journal entries below), so
      // if a register is currently open, link this expense to it — it needs to be
      // subtracted from that shift's expectedCash on close (gasto de caja menor).
      const openShift = await tx.cashRegister.findFirst({
        where: { storeId, status: 'OPEN' },
        select: { id: true },
      })

      // Create expense record
      const exp = await tx.expense.create({
        data: {
          storeId,
          category,
          description,
          amount,
          date: dateObj,
          notes,
          cashRegisterId: openShift?.id ?? null,
        },
      })

      // Create journal entries: DEBIT expense, CREDIT cash
      await tx.journalEntry.create({
        data: {
          storeId,
          ledgerAccountId: expenseAccount.id,
          amount,
          direction: 'DEBIT',
          description: `Gasto: ${description} (${category})`,
          referenceType: 'EXPENSE',
          referenceId: exp.id,
          createdAt: dateObj,
        },
      })

      await tx.journalEntry.create({
        data: {
          storeId,
          ledgerAccountId: cashAccount.id,
          amount,
          direction: 'CREDIT',
          description: `Pago gasto: ${description}`,
          referenceType: 'EXPENSE',
          referenceId: exp.id,
          createdAt: dateObj,
        },
      })

      return exp
    })

    return NextResponse.json({ expense }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    logger.error('POST /api/expenses error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
