import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const ledgerParamsSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  type: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  accountId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
})

// GET /api/ledger?storeId=1&type=entries&from=2024-01-01&to=2024-12-31&accountId=5
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const params = ledgerParamsSchema.parse(Object.fromEntries(searchParams.entries()))
    const { storeId, type, from, to, accountId, page, limit } = params
    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    const skip = (page - 1) * limit

    // GET accounts
    if (type !== 'entries') {
      const accounts = await db.ledgerAccount.findMany({
        where: { storeId },
        include: {
          _count: {
            select: { journalEntries: true },
          },
        },
        orderBy: [
          { type: 'asc' },
          { name: 'asc' },
        ],
      })

      // Calculate balance for each account — single GROUP BY query instead of N+1
      const balances = await db.$queryRaw<Array<{ ledgerAccountId: number; balance: number }>>`
        SELECT 
          journal_entries.ledger_account_id AS "ledgerAccountId",
          SUM(CASE WHEN journal_entries.direction = 'DEBIT' THEN journal_entries.amount ELSE -journal_entries.amount END) AS balance
        FROM journal_entries
        WHERE journal_entries.ledger_account_id IN (${accounts.map(a => a.id).join(',')})
        GROUP BY journal_entries.ledger_account_id
      `

      const balanceMap = new Map(balances.map(b => [b.ledgerAccountId, Number(b.balance)]))

      const accountsWithBalance = accounts.map(account => ({
        id: account.id,
        name: account.name,
        type: account.type,
        isDefault: account.isDefault,
        balance: balanceMap.get(account.id) || 0,
        entryCount: account._count.journalEntries,
        createdAt: account.createdAt.toISOString(),
      }))

      return NextResponse.json({ accounts: accountsWithBalance })
    }

    // GET journal entries — with pagination
    const where: Record<string, unknown> = {
      storeId,
    }

    // BUG FIX: Support accountId filter (was missing)
    if (accountId) {
      where.ledgerAccountId = accountId
    }

    if (from || to) {
      const dateFilter: Record<string, unknown> = {}
      if (from) dateFilter.gte = new Date(from)
      if (to) {
        const toDate = new Date(to)
        toDate.setHours(23, 59, 59, 999)
        dateFilter.lte = toDate
      }
      where.createdAt = dateFilter
    }

    const [total, entries] = await Promise.all([
      db.journalEntry.count({ where }),
      db.journalEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          ledgerAccount: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // BUG FIX: Format entries and compute totals (frontend expects {entries, totals})
    const formattedEntries = entries.map((entry) => ({
      id: entry.id,
      ledgerAccountId: entry.ledgerAccountId,
      accountName: entry.ledgerAccount.name,
      accountType: entry.ledgerAccount.type,
      amount: Number(entry.amount),
      direction: entry.direction,
      description: entry.description,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      createdAt: entry.createdAt.toISOString(),
    }))

    const totals = formattedEntries.reduce(
      (acc, entry) => {
        if (entry.direction === 'DEBIT') {
          acc.debits += entry.amount
        } else {
          acc.credits += entry.amount
        }
        return acc
      },
      { debits: 0, credits: 0 },
    )

    return NextResponse.json({
      entries: formattedEntries,
      totals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parámetros inválidos: ' + error.issues.map(i => i.message).join(', ') }, { status: 400 })
    }
    logger.error('Error fetching ledger data:', error)
    return NextResponse.json({ error: 'Failed to fetch ledger data' }, { status: 500 })
  }
}
