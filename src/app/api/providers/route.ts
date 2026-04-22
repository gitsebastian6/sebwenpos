import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const createProviderSchema = z.object({
  storeId: z.number().int().positive(),
  name: z.string().min(1, 'El nombre es requerido').max(100),
  contactName: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().max(100).optional().or(z.literal('')),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  nit: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
})

// GET: List providers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId')
    const q = searchParams.get('q') || ''
    const active = searchParams.get('active')

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const sid = Number(storeId)
    if (isNaN(sid)) {
      return NextResponse.json({ error: 'storeId inválido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(request, sid)
    if (storeAccessErr) return storeAccessErr

    const where: Record<string, unknown> = { storeId: sid }

    if (q) {
      where.name = { contains: q }
    }
    if (active !== null && active !== undefined && active !== '') {
      where.isActive = active === 'true'
    }

    const providers = await db.provider.findMany({
      where,
      orderBy: { name: 'asc' },
    })

    const result = providers.map((p) => ({
      id: p.id,
      storeId: p.storeId,
      name: p.name,
      contactName: p.contactName,
      phone: p.phone,
      email: p.email,
      address: p.address,
      city: p.city,
      nit: p.nit,
      dv: p.dv,
      regime: p.regime,
      autoretainer: p.autoretainer,
      paymentTerms: p.paymentTerms,
      creditLimit: p.creditLimit,
      totalDebt: p.totalDebt,
      totalPurchases: p.totalPurchases,
      notes: p.notes,
      isActive: p.isActive,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (error) {
    logger.error('GET /api/providers error:', error)
    return NextResponse.json({ error: 'Error al obtener proveedores' }, { status: 500 })
  }
}

// POST: Create provider
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createProviderSchema.parse(body)

    const storeAccessErr = requireStoreAccess(req, data.storeId)
    if (storeAccessErr) return storeAccessErr

    const provider = await db.provider.create({
      data: {
        storeId: data.storeId,
        name: data.name,
        contactName: data.contactName,
        phone: data.phone,
        email: data.email || null,
        address: data.address,
        city: data.city,
        nit: data.nit,
        notes: data.notes,
      },
    })

    return NextResponse.json(
      { id: provider.id, name: provider.name },
      { status: 201 }
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/providers error:', error)
    return NextResponse.json({ error: 'Error al crear proveedor' }, { status: 500 })
  }
}
