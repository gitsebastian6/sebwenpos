import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Schemas ─────────────────────────────────────────────────

const createServiceSchema = z.object({
  storeId: z.number().int().positive(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  price: z.number().int().min(0),
  icon: z.string().min(1).max(50),
  unit: z.string().min(1).max(50),
})

const createTransactionSchema = z.object({
  storeId: z.number().int().positive(),
  serviceId: z.number().int().positive(),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().int().min(0),
  totalAmount: z.number().int().min(0),
  notes: z.string().max(500).optional().nullable(),
})

// ─── GET ─────────────────────────────────────────────────────
// GET /api/services?storeId=1&include=transactions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const storeId = searchParams.get('storeId')
    const include = searchParams.get('include')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 })
    }

    const services = await db.service.findMany({
      where: { storeId: parseInt(storeId) },
      orderBy: { createdAt: 'asc' },
      include: include === 'transactions' ? {
        serviceTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        _count: { select: { serviceTransactions: true } },
      } : {
        _count: { select: { serviceTransactions: true } },
      },
    })

    return NextResponse.json(services)
  } catch (error) {
    console.error('Error fetching services:', error)
    return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 })
  }
}

// ─── POST ────────────────────────────────────────────────────
// POST /api/services — Create service or transaction
// body.type = "service" | "transaction"
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.type === 'transaction') {
      // Create a service transaction
      const parsed = createTransactionSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: parsed.error.flatten() },
          { status: 400 }
        )
      }

      const { storeId, serviceId, quantity, unitPrice, totalAmount, notes } = parsed.data

      // Verify service exists and belongs to store
      const service = await db.service.findFirst({
        where: { id: serviceId, storeId },
      })
      if (!service) {
        return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
      }

      const transaction = await db.serviceTransaction.create({
        data: {
          storeId,
          serviceId,
          quantity,
          unitPrice,
          totalAmount,
          notes: notes ?? null,
          status: 'COMPLETED',
        },
        include: { service: true },
      })

      return NextResponse.json(transaction, { status: 201 })
    }

    // Create a service (default)
    const parsed = createServiceSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { storeId, name, description, price, icon, unit } = parsed.data

    const service = await db.service.create({
      data: {
        storeId,
        name,
        description: description ?? null,
        price,
        icon,
        unit,
        isActive: true,
      },
    })

    return NextResponse.json(service, { status: 201 })
  } catch (error) {
    console.error('Error creating service:', error)
    return NextResponse.json({ error: 'Failed to create service' }, { status: 500 })
  }
}
