import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const updateProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  contactName: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().max(100).optional().or(z.literal('')),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  nit: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
})

// GET: Single provider
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pid = Number(id)
    if (isNaN(pid)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const provider = await db.provider.findUnique({ where: { id: pid } })
    if (!provider) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(_request, provider.storeId)
    if (storeAccessErr) return storeAccessErr

    return NextResponse.json({
      id: provider.id,
      storeId: provider.storeId,
      name: provider.name,
      contactName: provider.contactName,
      phone: provider.phone,
      email: provider.email,
      address: provider.address,
      city: provider.city,
      nit: provider.nit,
      notes: provider.notes,
      isActive: provider.isActive,
      createdAt: provider.createdAt.toISOString(),
      updatedAt: provider.updatedAt.toISOString(),
    })
  } catch (error) {
    logger.error('GET /api/providers/[id] error:', error)
    return NextResponse.json({ error: 'Error al obtener proveedor' }, { status: 500 })
  }
}

// PUT: Update provider
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pid = Number(id)
    if (isNaN(pid)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = updateProviderSchema.parse(body)

    const provider = await db.provider.findUnique({ where: { id: pid } })
    if (!provider) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, provider.storeId)
    if (storeAccessErr) return storeAccessErr

    const updated = await db.provider.update({
      where: { id: pid },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.contactName !== undefined && { contactName: data.contactName || null }),
        ...(data.phone !== undefined && { phone: data.phone || null }),
        ...(data.email !== undefined && { email: data.email || null }),
        ...(data.address !== undefined && { address: data.address || null }),
        ...(data.city !== undefined && { city: data.city || null }),
        ...(data.nit !== undefined && { nit: data.nit || null }),
        ...(data.notes !== undefined && { notes: data.notes || null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    })

    return NextResponse.json({ id: updated.id, name: updated.name })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('PUT /api/providers/[id] error:', error)
    return NextResponse.json({ error: 'Error al actualizar proveedor' }, { status: 500 })
  }
}

// DELETE: Delete provider
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pid = Number(id)
    if (isNaN(pid)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const provider = await db.provider.findUnique({ where: { id: pid } })
    if (!provider) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(_request, provider.storeId)
    if (storeAccessErr) return storeAccessErr

    await db.provider.delete({ where: { id: pid } })
    return NextResponse.json({ message: 'Proveedor eliminado' })
  } catch (error) {
    logger.error('DELETE /api/providers/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar proveedor' }, { status: 500 })
  }
}
