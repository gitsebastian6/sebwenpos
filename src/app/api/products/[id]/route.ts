import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sku: z.string().max(100).nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  providerId: z.number().int().positive().nullable().optional(),
  taxRateId: z.number().int().positive().nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  imgUrl: z.string().max(500).nullable().optional(),
  costPrice: z.number().int().min(0).optional(),
  salePrice: z.number().int().min(1).optional(),
  minStock: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  currentStock: z.number().int().min(0).optional(),
  commission: z.number().int().min(0).max(100).optional(),
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

    // Verify category belongs to store if provided
    if (data.categoryId !== undefined && data.categoryId !== null) {
      const category = await db.category.findFirst({
        where: { id: data.categoryId, storeId: existing.storeId },
      })
      if (!category) {
        return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 400 })
      }
    }

    const product = await db.product.update({
      where: { id: productId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.sku !== undefined && { sku: data.sku }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.providerId !== undefined && { providerId: data.providerId }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.imgUrl !== undefined && { imgUrl: data.imgUrl }),
        ...(data.costPrice !== undefined && { costPrice: data.costPrice }),
        ...(data.salePrice !== undefined && { salePrice: data.salePrice }),
        ...(data.minStock !== undefined && { minStock: data.minStock }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.currentStock !== undefined && { currentStock: data.currentStock }),
        ...(data.commission !== undefined && { commission: data.commission }),
        ...(data.taxRateId !== undefined && { taxRateId: data.taxRateId }),
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
    console.error('PUT /api/products/[id] error:', error)
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

    // Soft delete
    await db.product.update({
      where: { id: productId },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/products/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar producto' }, { status: 500 })
  }
}
