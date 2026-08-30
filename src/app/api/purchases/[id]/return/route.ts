import { requireStoreAccess } from '@/lib/api-auth'
import { requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { add, gt, gte, lt, lte, mul, sub, toNum } from '@/lib/stock-math'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const returnItemSchema = z.object({
  purchaseItemId: z.number().int().positive(),
  quantity: z.number().min(0.001),
})

const returnSchema = z.object({
  items: z.array(returnItemSchema).min(1),
  reason: z.string().max(500).optional(),
})

// ─── POST: Partial or full purchase return ──────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const purchaseId = Number(id)

    if (isNaN(purchaseId)) {
      return NextResponse.json({ error: 'ID de compra inválido' }, { status: 400 })
    }

    // Parse body
    let body: { items: { purchaseItemId: number; quantity: number }[]; reason?: string }
    try {
      const raw = await request.json()
      body = returnSchema.parse(raw) as { items: { purchaseItemId: number; quantity: number }[]; reason?: string }
    } catch (e: unknown) {
      const msg = e instanceof z.ZodError ? e.issues[0]?.message : 'Datos inválidos'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // Fetch purchase with items and provider
    const purchase = await db.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        provider: {
          select: { id: true, name: true, totalDebt: true },
        },
        purchaseItems: {
          include: {
            product: {
              select: { id: true, name: true, currentStock: true },
            },
          },
        },
      },
    })

    if (!purchase) {
      return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(request, purchase.storeId)
    if (storeAccessErr) return storeAccessErr
    const permErr = await requirePermission(request, 'purchases')
    if (permErr) return permErr

    if (purchase.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Esta compra ya fue cancelada/devuelta' },
        { status: 400 },
      )
    }

    // Build a map of purchase items
    const itemMap = new Map(purchase.purchaseItems.map((item) => [item.id, item]))

    // Validate items
    for (const reqItem of body.items) {
      const item = itemMap.get(reqItem.purchaseItemId)
      if (!item) {
        return NextResponse.json(
          { error: `Item #${reqItem.purchaseItemId} no pertenece a esta compra` },
          { status: 400 },
        )
      }
      const available = sub(item.quantity, item.returnedQuantity ?? 0)
      if (lte(available, 0)) {
        return NextResponse.json(
          { error: `"${item.product?.name || 'Producto'}" ya fue devuelto completamente` },
          { status: 400 },
        )
      }
      if (gt(reqItem.quantity, available)) {
        return NextResponse.json(
          { error: `Solo se pueden devolver ${toNum(available)} unidad(es) de "${item.product?.name || 'Producto'}". Ya se devolvieron ${toNum(item.returnedQuantity ?? 0)}.` },
          { status: 400 },
        )
      }
    }

    // Process return in transaction
    const results = await db.$transaction(async (tx) => {
      // Validate sufficient stock before decrementing (in base units — a
      // returned presentation line, e.g. Caja x24, removes unitsPerPack times
      // as much from the shared stock pool as its own quantity)
      for (const reqItem of body.items) {
        const item = itemMap.get(reqItem.purchaseItemId)!
        const baseUnits = mul(reqItem.quantity, item.unitsPerPack)
        if (item.product && lt(item.product.currentStock, baseUnits)) {
          throw new Error(
            `Stock insuficiente para devolver "${item.product.name}". ` +
            `Stock actual: ${toNum(item.product.currentStock)}, cantidad a devolver: ${toNum(baseUnits)} unidades base`,
          )
        }
      }

      let totalReturned = 0
      let totalReturnValue = 0
      const returnedItems: { name: string; quantity: number; unitCost: number }[] = []

      for (const reqItem of body.items) {
        const item = itemMap.get(reqItem.purchaseItemId)!
        const productName = item.product?.name || 'Producto'
        const displayName = item.presentationName ? `${productName} — ${item.presentationName}` : productName
        const baseUnits = mul(reqItem.quantity, item.unitsPerPack)

        // Decrement product stock (base units)
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { decrement: baseUnits },
          },
        })

        // Update returnedQuantity on the purchase item (in the item's own unit)
        await tx.purchaseItem.update({
          where: { id: reqItem.purchaseItemId },
          data: {
            returnedQuantity: { increment: reqItem.quantity },
          },
        })

        // Create inventory movement with type PURCHASE_RETURN (base units)
        await tx.inventoryMovement.create({
          data: {
            storeId: purchase.storeId,
            productId: item.productId,
            presentationId: item.presentationId,
            presentationName: item.presentationName,
            unitsPerPack: item.unitsPerPack,
            quantity: baseUnits.negated(),
            movementType: 'PURCHASE_RETURN',
            referenceId: purchaseId,
            notes: `Devolución compra ${purchase.consecutiveNumber ? purchase.consecutiveNumber : `#${purchaseId}`} — ${displayName} x${reqItem.quantity}${body.reason ? ` — ${body.reason}` : ''}`,
          },
        })

        totalReturned += reqItem.quantity
        totalReturnValue += item.unitCost * reqItem.quantity
        returnedItems.push({ name: displayName, quantity: reqItem.quantity, unitCost: item.unitCost })
      }

      // Check if ALL items are now fully returned
      const allFullyReturned = purchase.purchaseItems.every((item) => {
        const returnedForThis = body.items.find((r) => r.purchaseItemId === item.id)?.quantity || 0
        return gte(add(item.returnedQuantity ?? 0, returnedForThis), item.quantity)
      })

      // Update purchase status
      if (allFullyReturned) {
        await tx.purchase.update({
          where: { id: purchaseId },
          data: { status: 'CANCELLED' },
        })
      }

      // If purchase was on credit, decrement provider debt proportionally
      if (purchase.providerId && purchase.paymentTerms !== 'CONTADO') {
        const remainingDebt = purchase.total - purchase.amountPaid
        if (remainingDebt > 0) {
          // Calculate proportional debt reduction
          const returnRatio = totalReturnValue / purchase.total
          const debtReduction = Math.round(remainingDebt * returnRatio)
          if (debtReduction > 0) {
            await tx.provider.update({
              where: { id: purchase.providerId },
              data: {
                totalDebt: { decrement: debtReduction },
              },
            })
          }
        }
      }

      return {
        totalReturned,
        totalReturnValue,
        returnedItems,
        fullyReturned: allFullyReturned,
      }
    }, { timeout: 15000, maxWait: 5000 })

    const itemSummary = results.returnedItems.map((i) => `${i.name} x${i.quantity}`).join(', ')
    return NextResponse.json({
      message: results.fullyReturned
        ? `Compra ${purchase.consecutiveNumber || `#${purchaseId}`} devuelta completamente: ${itemSummary}`
        : `Devolución parcial de compra ${purchase.consecutiveNumber || `#${purchaseId}`}: ${itemSummary}`,
      purchaseId: purchase.id,
      fullyReturned: results.fullyReturned,
      totalReturned: results.totalReturned,
      totalReturnValue: results.totalReturnValue,
    })
  } catch (error: unknown) {
    logger.error('POST /api/purchases/[id]/return error:', error)
    const message = error instanceof Error ? error.message : 'Error al procesar la devolución'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
