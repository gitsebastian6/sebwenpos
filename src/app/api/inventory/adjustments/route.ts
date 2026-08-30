import { adjustStock, InsufficientStockError } from '@/domain/inventory/adjust-stock'
import { lotInputFields, resolveLotInput } from '@/domain/inventory/lot-input'
import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'
import { getUnitOfMeasureLabel } from '@/lib/constants'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { mul, roundQty, sub, toNum } from '@/lib/stock-math'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const adjustmentSchema = z.object({
  storeId: z.number().int().positive(),
  productId: z.number().int().positive(),
  presentationId: z.number().int().positive().optional(),
  // 'delta'    → quantity es ± en la unidad elegida (agregar/quitar)
  // 'absolute' → quantity es el conteo total en la unidad elegida (establecer)
  mode: z.enum(['delta', 'absolute']).default('delta'),
  quantity: z.number(), // en la unidad de la presentación elegida (o base si no hay presentationId)
  notes: z.string().optional(),
  ...lotInputFields,
})

// POST /api/inventory/adjustments
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = adjustmentSchema.parse(body)

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
    // El modo 'absolute' (establecer total) se cuenta SIEMPRE en unidades base:
    // un total exacto en una presentación no puede representar cantidades que no
    // sean múltiplo de unitsPerPack. Solo 'delta' usa la presentación.
    let unitsPerPack = 1
    let presentationName: string | null = null
    if (data.presentationId && data.mode === 'delta') {
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

    const result = await db.$transaction(async (tx) => {
      // El delta base se resuelve DENTRO de la transacción para que 'absolute'
      // use el currentStock fresco (no una lectura vieja del cliente).
      let baseDelta: number
      if (data.mode === 'absolute') {
        const fresh = await tx.product.findUnique({
          where: { id: data.productId },
          select: { currentStock: true },
        })
        const target = toNum(roundQty(mul(data.quantity, unitsPerPack)))
        baseDelta = toNum(roundQty(sub(target, fresh?.currentStock ?? 0)))
      } else {
        baseDelta = toNum(roundQty(mul(data.quantity, unitsPerPack)))
      }

      if (baseDelta === 0) return null

      const adj = await adjustStock(tx, {
        storeId: data.storeId,
        productId: data.productId,
        baseDelta,
        movementType: 'ADJUSTMENT',
        presentationId: data.presentationId ?? null,
        presentationName,
        unitsPerPack,
        notes: data.notes ?? null,
        ...resolveLotInput(data),
      })
      return { ...adj, baseDelta }
    })

    if (!result) {
      return NextResponse.json({ error: 'No hay cambio en el stock' }, { status: 400 })
    }

    return NextResponse.json(
      {
        id: result.movementId,
        productId: data.productId,
        productName: product.name,
        presentationName,
        unitsPerPack,
        quantity: result.baseDelta,
        movementType: 'ADJUSTMENT',
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
    logger.error('POST /api/inventory/adjustments error:', error)
    return NextResponse.json({ error: 'Error al crear ajuste de inventario' }, { status: 500 })
  }
}
