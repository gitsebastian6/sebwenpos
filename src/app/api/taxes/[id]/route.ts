import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Colombian DIAN tax codes
const DIAN_TAX_CODES = [
  '01', // IVA General 19%
  '02', // IVA Reducido 5%
  '03', // IVA Exento 0%
  '04', // IVA Excluido
  '05', // Impoconsumo 8%
  '06', // ICA 0.8%
  '07', // ReteFuente
  '08', // ReteICA
  '09', // ReteIVA
] as const

const RATE_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT'] as const
const APPLY_TO_OPTIONS = ['PRODUCT', 'SERVICE', 'BOTH'] as const
const TAX_CATEGORIES = ['SALES_TAX', 'CONSUMPTION_TAX', 'WITHHOLDING', 'MUNICIPAL'] as const

const updateTaxRateSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(200).optional(),
  code: z.enum(DIAN_TAX_CODES as unknown as [string, ...string[]], {
    message: 'Código DIAN inválido. Debe ser uno de: 01-09',
  }).optional(),
  rateType: z.enum(RATE_TYPES as unknown as [string, ...string[]], {
    message: 'Tipo de tasa inválido. Use PERCENTAGE o FIXED_AMOUNT',
  }).optional(),
  rate: z.number().int().min(0, 'La tasa no puede ser negativa').max(1000000, 'La tasa excede el límite permitido').optional(),
  applyTo: z.enum(APPLY_TO_OPTIONS as unknown as [string, ...string[]]).optional(),
  category: z.enum(TAX_CATEGORIES as unknown as [string, ...string[]]).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  description: z.string().max(500, 'La descripción no puede exceder 500 caracteres').nullable().optional(),
})

// ─── GET: Get a single tax rate ─────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const taxRateId = Number(id)
    if (isNaN(taxRateId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const taxRate = await db.taxRate.findUnique({
      where: { id: taxRateId },
      include: {
        _count: {
          select: { products: true },
        },
      },
    })

    if (!taxRate) {
      return NextResponse.json({ error: 'Tarifa de impuesto no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, taxRate.storeId)
    if (storeAccessErr) return storeAccessErr

    return NextResponse.json(taxRate)
  } catch (error) {
    logger.error('GET /api/taxes/[id] error:', error)
    return NextResponse.json({ error: 'Error al obtener la tarifa de impuesto' }, { status: 500 })
  }
}

// ─── PUT: Update a tax rate ─────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const taxRateId = Number(id)
    if (isNaN(taxRateId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = updateTaxRateSchema.parse(body)

    // Verify tax rate exists
    const existing = await db.taxRate.findUnique({ where: { id: taxRateId } })
    if (!existing) {
      return NextResponse.json({ error: 'Tarifa de impuesto no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, existing.storeId)
    if (storeAccessErr) return storeAccessErr

    // Update in a transaction to handle isDefault logic
    const taxRate = await db.$transaction(async (tx) => {
      // If setting as default, unset other defaults in same category+store
      if (data.isDefault === true) {
        const targetCategory = data.category || existing.category
        await tx.taxRate.updateMany({
          where: {
            storeId: existing.storeId,
            category: targetCategory,
            isDefault: true,
            id: { not: taxRateId },
          },
          data: {
            isDefault: false,
          },
        })
      }

      // Build update payload
      const updateData: Record<string, unknown> = {}
      if (data.name !== undefined) updateData.name = data.name
      if (data.code !== undefined) updateData.code = data.code
      if (data.rateType !== undefined) updateData.rateType = data.rateType
      if (data.rate !== undefined) updateData.rate = data.rate
      if (data.applyTo !== undefined) updateData.applyTo = data.applyTo
      if (data.category !== undefined) updateData.category = data.category
      if (data.isActive !== undefined) updateData.isActive = data.isActive
      if (data.isDefault !== undefined) updateData.isDefault = data.isDefault
      if (data.description !== undefined) updateData.description = data.description

      return tx.taxRate.update({
        where: { id: taxRateId },
        data: updateData,
      })
    })

    return NextResponse.json(taxRate)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('Unique')) {
      return NextResponse.json(
        { error: 'Ya existe una tarifa de impuesto con ese código DIAN' },
        { status: 409 }
      )
    }
    logger.error('PUT /api/taxes/[id] error:', error)
    return NextResponse.json({ error: 'Error al actualizar la tarifa de impuesto' }, { status: 500 })
  }
}

// ─── DELETE: Delete a tax rate ──────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const taxRateId = Number(id)
    if (isNaN(taxRateId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    // Verify tax rate exists and check for linked products
    const existing = await db.taxRate.findUnique({
      where: { id: taxRateId },
      include: {
        _count: {
          select: { products: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Tarifa de impuesto no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, existing.storeId)
    if (storeAccessErr) return storeAccessErr

    // Prevent deletion if products are using this tax rate
    if (existing._count.products > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar esta tarifa porque está asignada a ${existing._count.products} producto(s). Desasígnela primero.` },
        { status: 409 }
      )
    }

    await db.taxRate.delete({
      where: { id: taxRateId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('DELETE /api/taxes/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar la tarifa de impuesto' }, { status: 500 })
  }
}
