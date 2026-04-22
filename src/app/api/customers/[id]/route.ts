import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

const updateCustomerSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(150).optional(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email('Email inválido').optional().nullable(),
})

export const dynamic = 'force-dynamic'

// PUT /api/customers/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const data = updateCustomerSchema.parse(body)
    const { name, phone, email } = data

    // Lookup customer to validate store access
    const existing = await db.customer.findUnique({ where: { id: Number(id) } })
    if (!existing) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }
    const storeAccessErr = requireStoreAccess(request, existing.storeId)
    if (storeAccessErr) return storeAccessErr

    const customer = await db.customer.update({
      where: { id: Number(id) },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(email !== undefined ? { email: email?.trim() || null } : {}),
      },
    })

    return NextResponse.json(customer)
  } catch (error) {
    logger.error('PUT /api/customers/[id] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
