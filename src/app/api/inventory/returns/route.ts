import { adjustStock, InsufficientStockError } from '@/domain/inventory/adjust-stock'
import { lotInputFields, resolveLotInput } from '@/domain/inventory/lot-input'
import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'
import { getUnitOfMeasureLabel } from '@/lib/constants'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { mul, roundQty, toNum } from '@/lib/stock-math'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const returnSchema = z.object({
  storeId: z.number().int().positive(),
  productId: z.number().int().positive(),
  presentationId: z.number().int().positive().optional(),
  quantity: z.number().positive(), // en la unidad de la presentación elegida (o base)
  notes: z.string().optional(),
  ...lotInputFields,
})

// POST /api/inventory/returns
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = returnSchema.parse(body)

    const storeAccessErr = requireStoreAccess(req, data.storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(req, 'inventory')
    if (permErr) return permErr

    const product = await db.product.findFirst({
      where: { id: data.productId, storeId: data.storeId },
      select: { id: true, name: true },
    })
    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    }

    // unitsPerPack SIEMPRE se relee de BD — nunca se confía en el cliente.
    let unitsPerPack = 1
    let presentationName: string | null = null
    if (data.presentationId) {
      const presentation = await db.productPresentation.findFirst({
        where: { id: data.presentationId, productId: data.productId },
        select: { unitLabel: true, unitsPerPack: true },
      })
      if (!presentation) {
        return NextResponse.json({ error: 'Presentación no encontrada' }, { status: 404 })
      }
      unitsPerPack = toNum(presentation.unitsPerPack) || 1
      presentationName = getUnitOfMeasureLabel(presentation.unitLabel)
    }

    const baseUnits = toNum(roundQty(mul(data.quantity, unitsPerPack)))

    const result = await db.$transaction((tx) =>
      adjustStock(tx, {
        storeId: data.storeId,
        productId: data.productId,
        baseDelta: baseUnits,
        movementType: 'RETURN',
        presentationId: data.presentationId ?? null,
        presentationName,
        unitsPerPack,
        notes: data.notes ?? null,
        ...resolveLotInput(data),
      })
    )

    return NextResponse.json(
      {
        id: result.movementId,
        productId: data.productId,
        productName: product.name,
        presentationName,
        unitsPerPack,
        quantity: baseUnits,
        movementType: 'RETURN',
        notes: data.notes ?? null,
        newStock: result.newStock,
        createdAt: new Date().toISOString(),
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: error.message, availableStock: error.availableStock }, { status: 400 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/inventory/returns error:', error)
    return NextResponse.json({ error: 'Error al registrar devolución' }, { status: 500 })
  }
}
