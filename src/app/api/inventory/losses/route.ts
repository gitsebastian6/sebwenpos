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

const lossSchema = z.object({
  storeId: z.number().int().positive(),
  productId: z.number().int().positive(),
  presentationId: z.number().int().positive().optional(),
  quantity: z.number().positive(), // en la unidad de la presentación elegida (o base)
  reason: z.string().optional(),
  notes: z.string().optional(),
  ...lotInputFields,
})

// POST /api/inventory/losses
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = lossSchema.parse(body)

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
    const notes = [data.reason, data.notes].filter(Boolean).join(' — ') || null

    const result = await db.$transaction(async (tx) => {
      const adj = await adjustStock(tx, {
        storeId: data.storeId,
        productId: data.productId,
        baseDelta: -baseUnits,
        movementType: 'LOSS',
        presentationId: data.presentationId ?? null,
        presentationName,
        unitsPerPack,
        notes,
        ...resolveLotInput(data),
      })

      // Contabiliza la merma como gasto no operativo (siempre valuada a costo,
      // nunca a precio de venta — misma regla que reports-view totalLossesValue).
      const lossValue = adj.costPrice * baseUnits
      if (lossValue > 0) {
        let inventarioAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, name: 'Inventario Productos' },
        })
        if (!inventarioAccount) {
          inventarioAccount = await tx.ledgerAccount.create({
            data: { storeId: data.storeId, name: 'Inventario Productos', type: 'ASSET', isDefault: false },
          })
        }
        let perdidaAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, name: 'Pérdida por Merma' },
        })
        if (!perdidaAccount) {
          perdidaAccount = await tx.ledgerAccount.create({
            data: { storeId: data.storeId, name: 'Pérdida por Merma', type: 'EXPENSE', isDefault: false },
          })
        }
        const description = `Pérdida: ${product.name} x${baseUnits}${data.reason ? ` (${data.reason})` : ''}`
        await tx.journalEntry.create({
          data: {
            storeId: data.storeId,
            ledgerAccountId: perdidaAccount.id,
            amount: lossValue,
            direction: 'DEBIT',
            description,
            referenceType: 'INVENTORY_MOVEMENT',
            referenceId: adj.movementId,
          },
        })
        await tx.journalEntry.create({
          data: {
            storeId: data.storeId,
            ledgerAccountId: inventarioAccount.id,
            amount: lossValue,
            direction: 'CREDIT',
            description,
            referenceType: 'INVENTORY_MOVEMENT',
            referenceId: adj.movementId,
          },
        })
      }

      return adj
    })

    return NextResponse.json(
      {
        id: result.movementId,
        productId: data.productId,
        productName: product.name,
        presentationName,
        unitsPerPack,
        quantity: -baseUnits,
        movementType: 'LOSS',
        notes,
        newStock: result.newStock,
        createdAt: new Date().toISOString(),
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json(
        {
          error: 'Stock insuficiente. No se puede registrar más pérdidas que el stock disponible.',
          availableStock: error.availableStock,
        },
        { status: 400 }
      )
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/inventory/losses error:', error)
    return NextResponse.json({ error: 'Error al registrar pérdida' }, { status: 500 })
  }
}
