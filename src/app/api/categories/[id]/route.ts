import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const updateCategorySchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(100),
  icon: z.string().max(100).nullable().optional(),
})

// PUT /api/categories/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const categoryId = Number(id)
    if (isNaN(categoryId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = updateCategorySchema.parse(body)

    const existing = await db.category.findUnique({ where: { id: categoryId } })
    if (!existing) {
      return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, existing.storeId)
    if (storeAccessErr) return storeAccessErr

    const category = await db.category.update({
      where: { id: categoryId },
      data: {
        name: data.name,
        ...(data.icon !== undefined && { icon: data.icon }),
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    })

    return NextResponse.json(category)
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('Unique')) {
      return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 })
    }
    logger.error('PUT /api/categories/[id] error:', error)
    return NextResponse.json({ error: 'Error al actualizar categoría' }, { status: 500 })
  }
}

// DELETE /api/categories/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const categoryId = Number(id)
    if (isNaN(categoryId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const existing = await db.category.findUnique({
      where: { id: categoryId },
      include: { _count: { select: { products: true } } },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(req, existing.storeId)
    if (storeAccessErr) return storeAccessErr

    // Remove category from products that reference it, then delete
    await db.product.updateMany({
      where: { categoryId },
      data: { categoryId: null },
    })

    await db.category.delete({
      where: { id: categoryId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('DELETE /api/categories/[id] error:', error)
    return NextResponse.json({ error: 'Error al eliminar categoría' }, { status: 500 })
  }
}
