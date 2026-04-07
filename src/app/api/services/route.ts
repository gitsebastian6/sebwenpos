import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const serviceCreateSchema = z.object({
  storeId: z.number().int().positive(),
  provider: z.string().min(1).max(100),
  transactionType: z.enum(['TOPUP', 'BILL_PAYMENT']),
  amount: z.number().int().positive(),
  commissionEarned: z.number().int().min(0).default(0),
  externalId: z.string().max(200).optional().nullable(),
})

// GET /api/services?storeId=1
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 })
    }

    const transactions = await db.serviceTransaction.findMany({
      where: { storeId: parseInt(storeId) },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(transactions)
  } catch (error) {
    console.error('Error fetching service transactions:', error)
    return NextResponse.json({ error: 'Failed to fetch service transactions' }, { status: 500 })
  }
}

// POST /api/services — Create service transaction with journal entry for commission
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = serviceCreateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { storeId, provider, transactionType, amount, commissionEarned, externalId } = parsed.data

    const result = await db.$transaction(async (tx) => {
      // Create service transaction
      const serviceTransaction = await tx.serviceTransaction.create({
        data: {
          storeId,
          provider,
          transactionType,
          amount,
          commissionEarned,
          status: 'SUCCESS',
          externalId: externalId ?? null,
        },
      })

      // Create journal entry for commission income if > 0
      if (commissionEarned > 0) {
        const cajaAccount = await tx.ledgerAccount.findFirst({
          where: {
            storeId,
            type: 'ASSET',
            isDefault: true,
          },
        })

        const comisionesAccount = await tx.ledgerAccount.findFirst({
          where: {
            storeId,
            name: 'Comisiones',
            type: 'INCOME',
          },
        })

        const description = `${transactionType} commission - ${provider} - ${serviceTransaction.id}`

        if (cajaAccount) {
          await tx.journalEntry.create({
            data: {
              storeId,
              ledgerAccountId: cajaAccount.id,
              amount: commissionEarned,
              direction: 'DEBIT',
              description,
              referenceType: 'TOPUP',
              referenceId: serviceTransaction.id,
            },
          })
        }

        if (comisionesAccount) {
          await tx.journalEntry.create({
            data: {
              storeId,
              ledgerAccountId: comisionesAccount.id,
              amount: commissionEarned,
              direction: 'CREDIT',
              description,
              referenceType: 'TOPUP',
              referenceId: serviceTransaction.id,
            },
          })
        }
      }

      return serviceTransaction
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creating service transaction:', error)
    return NextResponse.json({ error: 'Failed to create service transaction' }, { status: 500 })
  }
}
