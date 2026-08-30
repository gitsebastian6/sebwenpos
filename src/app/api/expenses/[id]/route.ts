import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const EXPENSE_CATEGORIES = [
  'ARRIENDO', 'SERVICIOS', 'NOMINA', 'INSUMOS',
  'LICENCIAS', 'IMPUESTOS', 'TRANSPORTE', 'MANTENIMIENTO', 'OTRO',
] as const

const updateExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  description: z.string().min(1).max(500).optional(),
  amount: z.number().int().positive().optional(),
  date: z.string().datetime().optional(),
  notes: z.string().max(1000).optional().nullable(),
})

// ─── PUT: Update expense ───────────────────────────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const expenseId = parseInt(id)
    if (isNaN(expenseId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json()
    const parsed = updateExpenseSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    // Check expense exists and validate store access
    const existing = await db.expense.findUnique({ where: { id: expenseId } })
    if (!existing) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })
    }
    const storeAccessErr = requireStoreAccess(request, existing.storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(request, 'accounting')
    if (permErr) return permErr

    const updateData: Record<string, unknown> = {}
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description
    if (parsed.data.amount !== undefined) updateData.amount = parsed.data.amount
    if (parsed.data.date !== undefined) updateData.date = new Date(parsed.data.date)
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes

    const updated = await db.$transaction(async (tx) => {
      // Delete old journal entries
      await tx.journalEntry.deleteMany({
        where: { referenceType: 'EXPENSE', referenceId: expenseId },
      })

      // Update expense
      const expense = await tx.expense.update({
        where: { id: expenseId },
        data: updateData,
      })

      // Find accounts
      const expenseAccount = await tx.ledgerAccount.findFirst({
        where: { storeId: expense.storeId, type: 'EXPENSE' },
      })
      const cashAccount = await tx.ledgerAccount.findFirst({
        where: { storeId: expense.storeId, type: 'ASSET', isDefault: true },
      })

      if (expenseAccount && cashAccount) {
        // Create new journal entries
        const desc = expense.description
        const cat = expense.category
        const amt = expense.amount
        const expDate = expense.date

        await tx.journalEntry.create({
          data: {
            storeId: expense.storeId,
            ledgerAccountId: expenseAccount.id,
            amount: amt,
            direction: 'DEBIT',
            description: `Gasto: ${desc} (${cat})`,
            referenceType: 'EXPENSE',
            referenceId: expense.id,
            createdAt: expDate,
          },
        })

        await tx.journalEntry.create({
          data: {
            storeId: expense.storeId,
            ledgerAccountId: cashAccount.id,
            amount: amt,
            direction: 'CREDIT',
            description: `Pago gasto: ${desc}`,
            referenceType: 'EXPENSE',
            referenceId: expense.id,
            createdAt: expDate,
          },
        })
      }

      return expense
    })

    return NextResponse.json({ expense: updated })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    logger.error('PUT /api/expenses/[id] error:', error)
    if (message === 'Gasto no encontrado') {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── DELETE: Delete expense ────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const expenseId = parseInt(id)
    if (isNaN(expenseId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    // Check expense exists and validate store access
    const existing = await db.expense.findUnique({ where: { id: expenseId } })
    if (!existing) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })
    }
    const storeAccessErr = requireStoreAccess(request, existing.storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(request, 'accounting')
    if (permErr) return permErr

    await db.$transaction(async (tx) => {
      // Delete journal entries first
      await tx.journalEntry.deleteMany({
        where: { referenceType: 'EXPENSE', referenceId: expenseId },
      })

      // Delete expense
      await tx.expense.delete({ where: { id: expenseId } })
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    logger.error('DELETE /api/expenses/[id] error:', error)
    if (message === 'Gasto no encontrado') {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
