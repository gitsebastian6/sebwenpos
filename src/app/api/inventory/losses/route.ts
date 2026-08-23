import { requireStoreAccess } from '@/lib/api-auth'
import { getUnitOfMeasureLabel } from '@/lib/constants'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { lt } from '@/lib/stock-math'
import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const lossSchema = z.object({
  storeId: z.number().int().positive(),
  productId: z.number().int().positive(),
  presentationId: z.number().int().positive().optional(),
  quantity: z.number().positive(), // always in BASE units
  reason: z.string().optional(),
  notes: z.string().optional(),
})

// POST /api/inventory/losses
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = lossSchema.parse(body)

    // Verify product exists
    const storeAccessErr = requireStoreAccess(req, data.storeId)
    if (storeAccessErr) return storeAccessErr


    const product = await db.product.findFirst({
      where: { id: data.productId, storeId: data.storeId },
    })

    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    }

    let presentationSnapshot: { name: string; unitsPerPack: Prisma.Decimal | number } | null = null
    if (data.presentationId) {
      const presentation = await db.productPresentation.findFirst({
        where: { id: data.presentationId, productId: data.productId },
      })
      if (!presentation) {
        return NextResponse.json({ error: 'Presentación no encontrada' }, { status: 404 })
      }
      presentationSnapshot = { name: getUnitOfMeasureLabel(presentation.unitLabel), unitsPerPack: presentation.unitsPerPack }
    }

    // Prevent stock from going below 0
    if (lt(product.currentStock, data.quantity)) {
      return NextResponse.json(
        { error: 'Stock insuficiente. No se puede registrar más pérdidas que el stock disponible.' },
        { status: 400 }
      )
    }

    // Create movement (positive quantity in request, but stock decreases) and update stock
    const movement = await db.$transaction(async (tx) => {
      const mov = await tx.inventoryMovement.create({
        data: {
          storeId: data.storeId,
          productId: data.productId,
          presentationId: data.presentationId,
          presentationName: presentationSnapshot?.name,
          unitsPerPack: presentationSnapshot?.unitsPerPack ?? 1,
          quantity: -data.quantity, // negative: stock decreases
          movementType: 'LOSS',
          notes: [data.reason, data.notes].filter(Boolean).join(' — ') || null,
        },
        include: {
          product: {
            select: { id: true, name: true, currentStock: true },
          },
        },
      })

      await tx.product.update({
        where: { id: data.productId },
        data: {
          currentStock: {
            decrement: data.quantity,
          },
        },
      })

      // Book the loss as a non-operational expense so it shows up in Contabilidad
      // instead of only existing as an isolated inventory movement (valued at cost,
      // never at sale price — see reports-view.tsx totalLossesValue for the same rule).
      const lossValue = product.costPrice * data.quantity
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
        const description = `Pérdida: ${product.name} x${data.quantity}${data.reason ? ` (${data.reason})` : ''}`
        await tx.journalEntry.create({
          data: {
            storeId: data.storeId,
            ledgerAccountId: perdidaAccount.id,
            amount: lossValue,
            direction: 'DEBIT',
            description,
            referenceType: 'INVENTORY_MOVEMENT',
            referenceId: mov.id,
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
            referenceId: mov.id,
          },
        })
      }

      return mov
    })

    return NextResponse.json({
      id: movement.id,
      productId: movement.productId,
      productName: movement.product.name,
      presentationName: movement.presentationName,
      unitsPerPack: movement.unitsPerPack,
      quantity: movement.quantity,
      movementType: movement.movementType,
      notes: movement.notes,
      createdAt: movement.createdAt.toISOString(),
    }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/inventory/losses error:', error)
    return NextResponse.json({ error: 'Error al registrar pérdida' }, { status: 500 })
  }
}
