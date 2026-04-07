import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/ledger?storeId=1&type=entries&from=2024-01-01&to=2024-12-31
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const storeId = searchParams.get('storeId')
    const type = searchParams.get('type')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 })
    }

    // GET accounts
    if (type !== 'entries') {
      const accounts = await db.ledgerAccount.findMany({
        where: { storeId: parseInt(storeId) },
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

      // Calculate balance for each account
      const accountsWithBalance = await Promise.all(
        accounts.map(async (account) => {
          const entries = await db.journalEntry.findMany({
            where: { ledgerAccountId: account.id },
            select: { amount: true, direction: true },
          })

          let balance = 0
          for (const entry of entries) {
            if (entry.direction === 'DEBIT') {
              balance += entry.amount
            } else {
              balance -= entry.amount
            }
          }

          return {
            ...account,
            balance,
          }
        })
      )

      return NextResponse.json(accountsWithBalance)
    }

    // GET journal entries
    const where: Record<string, unknown> = {
      storeId: parseInt(storeId),
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

    const entries = await db.journalEntry.findMany({
      where,
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
    })

    return NextResponse.json(entries)
  } catch (error) {
    console.error('Error fetching ledger data:', error)
    return NextResponse.json({ error: 'Failed to fetch ledger data' }, { status: 500 })
  }
}
