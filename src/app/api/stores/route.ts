import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const storeUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  legalName: z.string().max(200).optional().nullable(),
  nit: z.string().max(50).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  currencyCode: z.string().length(3).optional(),
  countryCode: z.string().max(10).optional().nullable(),
})

// GET /api/stores?storeId=1
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 })
    }

    const store = await db.store.findUnique({
      where: { id: parseInt(storeId) },
    })

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    return NextResponse.json(store)
  } catch (error) {
    console.error('Error fetching store:', error)
    return NextResponse.json({ error: 'Failed to fetch store' }, { status: 500 })
  }
}

// PUT /api/stores?storeId=1
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 })
    }

    const body = await request.json()
    const parsed = storeUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const existing = await db.store.findUnique({
      where: { id: parseInt(storeId) },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    const store = await db.store.update({
      where: { id: parseInt(storeId) },
      data: {
        ...parsed.data,
        countryCode: parsed.data.countryCode ?? undefined,
        legalName: parsed.data.legalName ?? undefined,
        nit: parsed.data.nit ?? undefined,
        address: parsed.data.address ?? undefined,
        phone: parsed.data.phone ?? undefined,
      },
    })

    return NextResponse.json(store)
  } catch (error) {
    console.error('Error updating store:', error)
    return NextResponse.json({ error: 'Failed to update store' }, { status: 500 })
  }
}
