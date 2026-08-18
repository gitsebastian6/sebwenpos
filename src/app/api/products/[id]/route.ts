import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const presentationSchema = z.object({
  name: z.string().min(1, 'El nombre de la presentación es obligatorio').max(100),
  unitLabel: z.string().max(10).default('UND'),
  barcode: z.string().max(100).optional().or(z.literal('')),
  sku: z.string().max(100).optional().or(z.literal('')),
  unitsPerPack: z.number().int().min(1, 'Debe equivaler a 1 o más unidades base'),
  salePrice: z.number().int().min(1, 'El precio de venta debe ser mayor a 0'),
  costPrice: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sku: z.string().max(100).nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  unitLabel: z.string().max(10).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  providerId: z.number().int().positive().nullable().optional(),
  taxRateId: z.number().int().positive().nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  imgUrl: z.string().max(500).nullable().optional(),
  invima: z.string().max(100).nullable().optional(),
  costPrice: z.number().int().min(0).optional(),
  salePrice: z.number().int().min(1).optional(),
  minStock: z.number().int().min(0).optional(),
  trackInventory: z.boolean().optional(),
  trackExpiration: z.boolean().optional(),
  isActive: z.boolean().optional(),
  commission: z.number().int().min(0).max(100).optional(),
  presentations: z.array(presentationSchema).max(2, 'Máximo 2 presentaciones adicionales').optional(),
})

// PUT /api/products/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const productId = Number(id)
    if (isNaN(productId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = updateProductSchema.parse(body)

    // Verify product exists
    const existing = await db.product.findUnique({ where: { id: productId } })
    if (!existing) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, existing.storeId)
    if (storeAccessErr) return storeAccessErr

    // Verify category belongs to store if provided
    if (data.categoryId !== undefined && data.categoryId !== null) {
      const category = await db.category.findFirst({
        where: { id: data.categoryId, storeId: existing.storeId },
      })
      if (!category) {
        return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 400 })
      }
    }

    // Verify provider belongs to store if provided
    if (data.providerId !== undefined && data.providerId !== null) {
      const provider = await db.provider.findFirst({
        where: { id: data.providerId, storeId: existing.storeId },
      })
      if (!provider) {
        return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 400 })
      }
    }

    // Verify tax rate belongs to store if provided
    if (data.taxRateId !== undefined && data.taxRateId !== null) {
      const taxRate = await db.taxRate.findFirst({
        where: { id: data.taxRateId, storeId: existing.storeId },
      })
      if (!taxRate) {
        return NextResponse.json({ error: 'Tasa de impuesto no encontrada' }, { status: 400 })
      }
    }

    // Presentations: full replace (delete + recreate) — safe for now since
    // nothing else references ProductPresentation.id yet. If Compras/POS
    // start storing a presentationId on their own line items, this needs to
    // become an upsert-by-id instead, to avoid orphaning historical records.
    if (data.presentations !== undefined) {
      await db.productPresentation.deleteMany({ where: { productId } })
    }

    const product = await db.product.update({
      where: { id: productId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.sku !== undefined && { sku: data.sku }),
        ...(data.barcode !== undefined && { barcode: data.barcode }),
        ...(data.unitLabel !== undefined && { unitLabel: data.unitLabel }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.providerId !== undefined && { providerId: data.providerId }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.imgUrl !== undefined && { imgUrl: data.imgUrl }),
        ...(data.invima !== undefined && { invima: data.invima }),
        ...(data.costPrice !== undefined && { costPrice: data.costPrice }),
        ...(data.salePrice !== undefined && { salePrice: data.salePrice }),
        ...(data.minStock !== undefined && { minStock: data.minStock }),
        ...(data.trackInventory !== undefined && { trackInventory: data.trackInventory }),
        ...(data.trackExpiration !== undefined && { trackExpiration: data.trackExpiration }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.commission !== undefined && { commission: data.commission }),
        ...(data.taxRateId !== undefined && { taxRateId: data.taxRateId }),
        ...(data.presentations?.length ? {
          presentations: {
            create: data.presentations.map((p, i) => ({
              name: p.name,
              unitLabel: p.unitLabel,
              barcode: p.barcode || null,
              sku: p.sku || null,
              unitsPerPack: p.unitsPerPack,
              salePrice: p.salePrice,
              costPrice: p.costPrice,
              isActive: p.isActive,
              sortOrder: i,
            })),
          },
        } : {}),
      },
      include: {
        category: {
          select: { id: true, name: true, icon: true },
        },
        provider: {
          select: { id: true, name: true },
        },
        taxRate: {
          select: { id: true, name: true, code: true, rate: true, rateType: true },
        },
        presentations: { orderBy: { sortOrder: 'asc' } },
      },
    })

    return NextResponse.json(product)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('Unique')) {
      return NextResponse.json({ error: 'Ya existe un producto con ese nombre o SKU' }, { status: 409 })
    }
    logger.error('PUT /api/products/[id] error:', error)
    return NextResponse.json({ error: 'Error al actualizar producto' }, { status: 500 })
  }
}

// DELETE /api/products/[id] (soft delete via isActive = false)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const productId = Number(id)
    if (isNaN(productId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const existing = await db.product.findUnique({ where: { id: productId } })
    if (!existing) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, existing.storeId)
    if (storeAccessErr) return storeAccessErr

    // Soft delete
    await db.product.update({
      where: { id: productId },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('DELETE /api/products/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar producto' }, { status: 500 })
  }
}
