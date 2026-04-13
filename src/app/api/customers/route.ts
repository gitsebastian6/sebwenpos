import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/customers?storeId=X&q=search
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))
    const q = searchParams.get('q')?.trim()

    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })
    }

    const where: any = { storeId }

    if (q) {
      where.OR = [
        { name: { contains: q } },
        { phone: { contains: q } },
      ]
    }

    const customers = await db.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        totalDebt: true,
        createdAt: true,
        _count: {
          select: { orders: true },
        },
      },
    })

    return NextResponse.json(customers)
  } catch (error) {
    console.error('GET /api/customers error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST /api/customers
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { storeId, name, phone, email } = body

    if (!storeId || !name?.trim()) {
      return NextResponse.json(
        { error: 'storeId y name son requeridos' },
        { status: 400 }
      )
    }

    const customer = await db.customer.create({
      data: {
        storeId,
        name: name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
      },
    })

    return NextResponse.json(customer, { status: 201 })
  } catch (error) {
    console.error('POST /api/customers error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
