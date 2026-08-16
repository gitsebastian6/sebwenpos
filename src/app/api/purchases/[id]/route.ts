import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireStoreAccess, getAuthUser } from '@/lib/api-auth'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const editPurchaseItemSchema = z.object({
  id: z.number().int().positive().optional(), // Existing item id (for update)
  productId: z.number().int().positive().optional(), // For new items
  quantity: z.number().int().positive('La cantidad debe ser mayor a 0').optional(),
  unitCost: z.number().int().min(0, 'El costo unitario no puede ser negativo').optional(),
  ivaRate: z.number().int().min(0).max(100).optional(),
  discountAmount: z.number().int().min(0).optional(),
  lotNumber: z.string().max(50).nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  manufacturingDate: z.string().nullable().optional(),
})

const editPurchaseSchema = z.object({
  invoiceNumber: z.string().max(100).nullable().optional(),
  documentType: z.enum(['FACTURA_COMPRA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'RECIBO_CAJA', 'ORDEN_COMPRA']).optional(),
  date: z.string().optional(),
  notes: z.string().max(500).nullable().optional(),
  providerId: z.number().int().positive().nullable().optional(),
  paymentTerms: z.enum(['CONTADO', 'CREDITO_30', 'CREDITO_60', 'CREDITO_90']).optional(),
  items: z.array(editPurchaseItemSchema).optional(), // null = no item changes, [] = remove all
})

// ─── Helpers ────────────────────────────────────────────────────────────────

const RETE_FUENTE_RATE = 0.025
const RETE_FUENTE_THRESHOLD = 2_800_000
const RETE_ICA_RATE = 0.00966
const RETE_ICA_THRESHOLD = 0

function creditDays(terms: string): number {
  switch (terms) {
    case 'CREDITO_30': return 30
    case 'CREDITO_60': return 60
    case 'CREDITO_90': return 90
    default: return 0
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function calculateRetenciones(subtotal: number, regime: string) {
  let totalReteFuente = 0
  let totalReteIca = 0
  const totalReteIva = 0

  if (regime === 'RESPONSABLE' && subtotal > RETE_FUENTE_THRESHOLD) {
    totalReteFuente = Math.round(subtotal * RETE_FUENTE_RATE)
  }
  if (subtotal > RETE_ICA_THRESHOLD) {
    totalReteIca = Math.round(subtotal * RETE_ICA_RATE)
  }

  return { totalReteFuente, totalReteIca, totalReteIva }
}

// ─── GET: Single purchase with full relations ───────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pid = Number(id)
    if (isNaN(pid)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const purchase = await db.purchase.findUnique({
      where: { id: pid },
      include: {
        provider: true,
        purchaseItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                costPrice: true,
                salePrice: true,
                currentStock: true,
                category: { select: { id: true, name: true } },
              },
            },
          },
        },
        purchasePayments: {
          include: {
            createdBy: {
              select: { id: true, fullName: true, cedula: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        createdBy: {
          select: { id: true, fullName: true, cedula: true },
        },
      },
    })

    if (!purchase) {
      return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(request, purchase.storeId)
    if (storeAccessErr) return storeAccessErr

    return NextResponse.json({
      id: purchase.id,
      storeId: purchase.storeId,
      providerId: purchase.providerId,
      provider: purchase.provider || null,
      invoiceNumber: purchase.invoiceNumber,
      documentType: purchase.documentType,
      consecutiveNumber: purchase.consecutiveNumber,
      date: purchase.date.toISOString(),
      dueDate: purchase.dueDate?.toISOString() || null,
      paymentTerms: purchase.paymentTerms,
      paymentStatus: purchase.paymentStatus,
      amountPaid: purchase.amountPaid,
      subtotal: purchase.subtotal,
      totalIva: purchase.totalIva,
      totalReteFuente: purchase.totalReteFuente,
      totalReteIca: purchase.totalReteIca,
      totalReteIva: purchase.totalReteIva,
      totalDiscount: purchase.totalDiscount,
      notes: purchase.notes,
      total: purchase.total,
      status: purchase.status,
      createdById: purchase.createdById,
      createdBy: purchase.createdBy || null,
      purchaseItems: purchase.purchaseItems.map((item) => ({
        id: item.id,
        purchaseId: item.purchaseId,
        productId: item.productId,
        product: item.product,
        quantity: item.quantity,
        returnedQuantity: item.returnedQuantity,
        unitCost: item.unitCost,
        ivaRate: item.ivaRate,
        ivaAmount: item.ivaAmount,
        discountAmount: item.discountAmount,
        lotNumber: item.lotNumber,
        expiryDate: item.expiryDate?.toISOString() || null,
        manufacturingDate: item.manufacturingDate?.toISOString() || null,
        total: item.total,
      })),
      purchasePayments: purchase.purchasePayments.map((pp) => ({
        id: pp.id,
        purchaseId: pp.purchaseId,
        amount: pp.amount,
        paymentMethod: pp.paymentMethod,
        reference: pp.reference,
        notes: pp.notes,
        createdById: pp.createdById,
        createdBy: pp.createdBy || null,
        createdAt: pp.createdAt.toISOString(),
      })),
      createdAt: purchase.createdAt.toISOString(),
      updatedAt: purchase.updatedAt.toISOString(),
    })
  } catch (error) {
    logger.error('GET /api/purchases/[id] error:', error)
    return NextResponse.json({ error: 'Error al obtener compra' }, { status: 500 })
  }
}

// ─── PUT: Edit purchase ─────────────────────────────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pid = Number(id)
    if (isNaN(pid)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    // Parse body
    let body: z.infer<typeof editPurchaseSchema>
    try {
      const raw = await request.json()
      body = editPurchaseSchema.parse(raw)
    } catch (e: unknown) {
      const msg = e instanceof z.ZodError ? e.issues[0]?.message : 'Datos inválidos'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // Fetch existing purchase with all relations
    const purchase = await db.purchase.findUnique({
      where: { id: pid },
      include: {
        purchaseItems: {
          include: {
            product: { select: { id: true, name: true, costPrice: true, currentStock: true } },
          },
        },
        purchasePayments: { select: { id: true, amount: true } },
      },
    })

    if (!purchase) {
      return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(request, purchase.storeId)
    if (storeAccessErr) return storeAccessErr

    // Only allow editing PENDING or COMPLETED
    if (purchase.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'No se puede editar una compra cancelada' },
        { status: 400 },
      )
    }

    // Validate payment terms change is allowed (only if no payments yet)
    if (body.paymentTerms && body.paymentTerms !== purchase.paymentTerms) {
      const hasPayments = purchase.purchasePayments.length > 0
      if (hasPayments) {
        return NextResponse.json(
          { error: 'No se puede cambiar la forma de pago cuando ya hay pagos registrados' },
          { status: 400 },
        )
      }
    }

    // Provider change
    if (body.providerId !== undefined && body.providerId !== purchase.providerId) {
      // Validate new provider belongs to store
      if (body.providerId !== null) {
        const newProvider = await db.provider.findFirst({
          where: { id: body.providerId, storeId: purchase.storeId },
        })
        if (!newProvider) {
          return NextResponse.json({ error: 'Nuevo proveedor no encontrado' }, { status: 400 })
        }
      }
    }

    // Items reconciliation
    const oldItemMap = new Map(purchase.purchaseItems.map((item) => [item.id, item]))
    const newItems = body.items

    // Validate items if provided
    if (newItems !== undefined) {
      // Validate existing item IDs
      for (const item of newItems) {
        if (item.id && !oldItemMap.has(item.id)) {
          return NextResponse.json(
            { error: `Item #${item.id} no pertenece a esta compra` },
            { status: 400 },
          )
        }
        // For new items (no id), productId is required
        if (!item.id && !item.productId) {
          return NextResponse.json(
            { error: 'Se requiere productId para nuevos items' },
            { status: 400 },
          )
        }
      }

      // Check stock availability for new/quantity-increased items
      for (const item of newItems) {
        if (item.id) {
          // Existing item being updated
          const oldItem = oldItemMap.get(item.id)!
          const qtyIncrease = (item.quantity || oldItem.quantity) - oldItem.quantity
          if (qtyIncrease > 0 && oldItem.product) {
            // No stock check needed for increases — they're from purchases
          }
        }
      }
    }

    // Execute in transaction
    const result = await db.$transaction(async (tx) => {
      // Determine provider for retenciones calculation
      let providerRegime = 'NO_RESPONSABLE'
      const effectiveProviderId = body.providerId !== undefined ? body.providerId : purchase.providerId
      if (effectiveProviderId) {
        const provider = await tx.provider.findFirst({
          where: { id: effectiveProviderId, storeId: purchase.storeId },
        })
        if (provider) providerRegime = provider.regime
      }

      // ─── Item reconciliation ─────────────────────────────────────────
      let recalculatedItems: {
        id?: number
        productId: number
        quantity: number
        unitCost: number
        ivaRate: number
        ivaAmount: number
        discountAmount: number
        lotNumber: string | null
        expiryDate: Date | null
        manufacturingDate: Date | null
        total: number
      }[] = []

      if (newItems !== undefined) {
        const newItemIds = new Set(newItems.filter((i) => i.id).map((i) => i.id!))
        const removedItems = purchase.purchaseItems.filter((i) => !newItemIds.has(i.id))

        // Handle removed items: decrement stock
        for (const removed of removedItems) {
          await tx.product.update({
            where: { id: removed.productId },
            data: { currentStock: { decrement: removed.quantity - removed.returnedQuantity } },
          })
          await tx.inventoryMovement.create({
            data: {
              storeId: purchase.storeId,
              productId: removed.productId,
              quantity: -(removed.quantity - removed.returnedQuantity),
              movementType: 'ADJUSTMENT',
              referenceId: pid,
              notes: `Eliminado de compra #${purchase.consecutiveNumber || pid} — ${removed.product?.name}`,
            },
          })
          // Delete the purchase item
          await tx.purchaseItem.delete({ where: { id: removed.id } })
        }

        // Handle updated/new items
        for (const item of newItems) {
          if (item.id) {
            // Update existing item
            const oldItem = oldItemMap.get(item.id)!
            const newQuantity = item.quantity ?? oldItem.quantity
            const newUnitCost = item.unitCost ?? oldItem.unitCost
            const newIvaRate = item.ivaRate ?? oldItem.ivaRate
            const newDiscountAmount = item.discountAmount ?? oldItem.discountAmount
            const newLotNumber = item.lotNumber !== undefined ? item.lotNumber : oldItem.lotNumber
            const newExpiryDate = item.expiryDate !== undefined
              ? (item.expiryDate ? new Date(item.expiryDate) : null)
              : oldItem.expiryDate
            const newManufacturingDate = item.manufacturingDate !== undefined
              ? (item.manufacturingDate ? new Date(item.manufacturingDate) : null)
              : oldItem.manufacturingDate

            const ivaAmount = Math.round(newUnitCost * newQuantity * newIvaRate / 100)
            const total = Math.max(0, newUnitCost * newQuantity + ivaAmount - newDiscountAmount)

            // Reconcile stock: only adjust the net difference (excluding returned)
            const availableQty = oldItem.quantity - oldItem.returnedQuantity
            const qtyDiff = newQuantity - availableQty

            if (qtyDiff > 0) {
              // Adding more quantity
              await tx.product.update({
                where: { id: oldItem.productId },
                data: { currentStock: { increment: qtyDiff } },
              })
              await tx.inventoryMovement.create({
                data: {
                  storeId: purchase.storeId,
                  productId: oldItem.productId,
                  quantity: qtyDiff,
                  movementType: 'PURCHASE',
                  referenceId: pid,
                  notes: `Ajuste compra #${purchase.consecutiveNumber || pid} — ${oldItem.product?.name} +${qtyDiff}`,
                },
              })
            } else if (qtyDiff < 0) {
              // Reducing quantity
              await tx.product.update({
                where: { id: oldItem.productId },
                data: { currentStock: { decrement: Math.abs(qtyDiff) } },
              })
              await tx.inventoryMovement.create({
                data: {
                  storeId: purchase.storeId,
                  productId: oldItem.productId,
                  quantity: qtyDiff,
                  movementType: 'ADJUSTMENT',
                  referenceId: pid,
                  notes: `Ajuste compra #${purchase.consecutiveNumber || pid} — ${oldItem.product?.name} ${qtyDiff}`,
                },
              })
            }

            // Update cost price if changed
            if (newUnitCost !== oldItem.unitCost && oldItem.product) {
              await tx.product.update({
                where: { id: oldItem.productId },
                data: { costPrice: newUnitCost },
              })
              await tx.costHistory.create({
                data: {
                  productId: oldItem.productId,
                  storeId: purchase.storeId,
                  previousCost: oldItem.product.costPrice,
                  newCost: newUnitCost,
                  purchaseId: pid,
                  reason: 'ADJUSTMENT',
                },
              })
            }

            await tx.purchaseItem.update({
              where: { id: item.id },
              data: {
                quantity: newQuantity,
                unitCost: newUnitCost,
                ivaRate: newIvaRate,
                ivaAmount,
                discountAmount: newDiscountAmount,
                lotNumber: newLotNumber,
                expiryDate: newExpiryDate,
                manufacturingDate: newManufacturingDate,
                total,
              },
            })

            recalculatedItems.push({
              id: item.id,
              productId: oldItem.productId,
              quantity: newQuantity,
              unitCost: newUnitCost,
              ivaRate: newIvaRate,
              ivaAmount,
              discountAmount: newDiscountAmount,
              lotNumber: newLotNumber,
              expiryDate: newExpiryDate,
              manufacturingDate: newManufacturingDate,
              total,
            })
          } else if (item.productId) {
            // New item
            const newQuantity = item.quantity!
            const newUnitCost = item.unitCost ?? 0
            const newIvaRate = item.ivaRate ?? 19
            const newDiscountAmount = item.discountAmount ?? 0
            const newLotNumber = item.lotNumber ?? null
            const newExpiryDate = item.expiryDate ? new Date(item.expiryDate) : null
            const newManufacturingDate = item.manufacturingDate ? new Date(item.manufacturingDate) : null

            const ivaAmount = Math.round(newUnitCost * newQuantity * newIvaRate / 100)
            const total = Math.max(0, newUnitCost * newQuantity + ivaAmount - newDiscountAmount)

            // Create the purchase item
            const created = await tx.purchaseItem.create({
              data: {
                purchaseId: pid,
                productId: item.productId,
                quantity: newQuantity,
                unitCost: newUnitCost,
                ivaRate: newIvaRate,
                ivaAmount,
                discountAmount: newDiscountAmount,
                lotNumber: newLotNumber,
                expiryDate: newExpiryDate,
                manufacturingDate: newManufacturingDate,
                total,
              },
            })

            // Costo Promedio Ponderado (CPP) — same rule as a normal purchase: blend
            // with existing stock instead of overwriting with the latest unit cost.
            const productForCpp = await tx.product.findUnique({
              where: { id: item.productId },
              select: { costPrice: true, currentStock: true },
            })
            const existingStock = Math.max(0, productForCpp?.currentStock ?? 0)
            const existingCost = productForCpp?.costPrice ?? newUnitCost
            const newCostPrice = Math.round(
              (existingStock * existingCost + newQuantity * newUnitCost) / (existingStock + newQuantity)
            )

            // Increment stock
            await tx.product.update({
              where: { id: item.productId },
              data: {
                currentStock: { increment: newQuantity },
                costPrice: newCostPrice,
              },
            })

            await tx.inventoryMovement.create({
              data: {
                storeId: purchase.storeId,
                productId: item.productId,
                quantity: newQuantity,
                movementType: 'PURCHASE',
                referenceId: pid,
                notes: `Nuevo item compra #${purchase.consecutiveNumber || pid}`,
              },
            })

            recalculatedItems.push({
              id: created.id,
              productId: item.productId,
              quantity: newQuantity,
              unitCost: newUnitCost,
              ivaRate: newIvaRate,
              ivaAmount,
              discountAmount: newDiscountAmount,
              lotNumber: newLotNumber,
              expiryDate: newExpiryDate,
              manufacturingDate: newManufacturingDate,
              total,
            })
          }
        }
      } else {
        // No items change — use existing items for recalculation
        recalculatedItems = purchase.purchaseItems.map((item) => ({
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          ivaRate: item.ivaRate,
          ivaAmount: item.ivaAmount,
          discountAmount: item.discountAmount,
          lotNumber: item.lotNumber,
          expiryDate: item.expiryDate,
          manufacturingDate: item.manufacturingDate,
          total: item.total,
        }))
      }

      // ─── Recalculate purchase totals ─────────────────────────────────
      const subtotal = recalculatedItems.reduce((sum, item) => sum + item.unitCost * item.quantity, 0)
      const totalIva = recalculatedItems.reduce((sum, item) => sum + item.ivaAmount, 0)
      const totalDiscount = recalculatedItems.reduce((sum, item) => sum + item.discountAmount, 0)

      const { totalReteFuente, totalReteIca, totalReteIva } = calculateRetenciones(subtotal, providerRegime)
      const total = subtotal + totalIva - totalReteFuente - totalReteIca - totalReteIva - totalDiscount

      // Payment terms & due date
      const effectivePaymentTerms = body.paymentTerms || purchase.paymentTerms
      const isContado = effectivePaymentTerms === 'CONTADO'
      const effectiveDate = body.date ? new Date(body.date) : purchase.date
      const dueDate = isContado ? null : addDays(effectiveDate, creditDays(effectivePaymentTerms))

      // Recalculate payment status if totals changed and no payments exist
      let effectivePaymentStatus = purchase.paymentStatus
      let effectiveAmountPaid = purchase.amountPaid
      if (purchase.purchasePayments.length === 0) {
        if (isContado) {
          effectivePaymentStatus = 'PAID'
          effectiveAmountPaid = total
        } else {
          effectivePaymentStatus = 'PENDING'
          effectiveAmountPaid = 0
        }
      } else {
        // Recalculate based on existing payments
        if (effectiveAmountPaid >= total) {
          effectivePaymentStatus = 'PAID'
        } else if (effectiveAmountPaid > 0) {
          effectivePaymentStatus = 'PARTIAL'
        } else {
          effectivePaymentStatus = 'PENDING'
        }
      }

      // ─── Provider debt reconciliation ────────────────────────────────
      const oldTotal = purchase.total
      const oldProviderId = purchase.providerId
      const newProviderId = body.providerId !== undefined ? body.providerId : oldProviderId

      // Remove old total from old provider
      if (oldProviderId && oldProviderId !== newProviderId) {
        await tx.provider.update({
          where: { id: oldProviderId },
          data: {
            totalPurchases: { decrement: oldTotal },
            totalDebt: { decrement: Math.max(0, oldTotal - purchase.amountPaid) },
          },
        })
      }

      // Add new total to new provider
      if (newProviderId) {
        const diff = total - (oldProviderId === newProviderId ? oldTotal : 0)
        const debtDiff = effectiveAmountPaid >= total
          ? 0
          : (total - effectiveAmountPaid) - (oldProviderId === newProviderId ? Math.max(0, oldTotal - purchase.amountPaid) : 0)
        await tx.provider.update({
          where: { id: newProviderId },
          data: {
            totalPurchases: { increment: diff },
            ...(debtDiff !== 0 ? { totalDebt: { increment: debtDiff } } : {}),
          },
        })
      }

      // ─── Update purchase ────────────────────────────────────────────
      const updated = await tx.purchase.update({
        where: { id: pid },
        data: {
          invoiceNumber: body.invoiceNumber !== undefined ? body.invoiceNumber : purchase.invoiceNumber,
          documentType: body.documentType || purchase.documentType,
          date: effectiveDate,
          dueDate,
          paymentTerms: effectivePaymentTerms,
          paymentStatus: effectivePaymentStatus,
          amountPaid: effectiveAmountPaid,
          subtotal,
          totalIva,
          totalReteFuente,
          totalReteIca,
          totalReteIva,
          totalDiscount,
          notes: body.notes !== undefined ? body.notes : purchase.notes,
          total,
          providerId: newProviderId,
        },
      })

      // Handle CONTADO auto-payment if no payments exist yet
      if (isContado && purchase.purchasePayments.length === 0 && total > 0) {
        const auth = getAuthUser(request)
        await tx.purchasePayment.create({
          data: {
            purchaseId: pid,
            storeId: purchase.storeId,
            amount: total,
            paymentMethod: 'CASH',
            notes: 'Pago de contado al editar compra',
            createdById: auth?.userId || null,
          },
        })
      }

      return updated
    })

    return NextResponse.json({
      id: result.id,
      message: 'Compra actualizada exitosamente',
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('PUT /api/purchases/[id] error:', error)
    const message = error instanceof Error ? error.message : 'Error al actualizar compra'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── DELETE: Cancel a purchase ──────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pid = Number(id)
    if (isNaN(pid)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const purchase = await db.purchase.findUnique({
      where: { id: pid },
      include: {
        purchaseItems: {
          include: {
            product: { select: { id: true, name: true, currentStock: true } },
          },
        },
        purchasePayments: { select: { id: true, amount: true } },
      },
    })

    if (!purchase) {
      return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(request, purchase.storeId)
    if (storeAccessErr) return storeAccessErr

    if (purchase.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Esta compra ya fue cancelada' },
        { status: 400 },
      )
    }

    // Cancel purchase in a transaction
    await db.$transaction(async (tx) => {
      // Update purchase status
      await tx.purchase.update({
        where: { id: pid },
        data: { status: 'CANCELLED' },
      })

      // For each item: decrement stock and create adjustment movement
      for (const item of purchase.purchaseItems) {
        const availableQty = item.quantity - item.returnedQuantity
        if (availableQty <= 0) continue

        // Decrement product stock
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { decrement: availableQty },
          },
        })

        // Create inventory adjustment movement (negative quantity)
        await tx.inventoryMovement.create({
          data: {
            storeId: purchase.storeId,
            productId: item.productId,
            quantity: -availableQty,
            movementType: 'ADJUSTMENT',
            referenceId: pid,
            notes: `Compra cancelada ${purchase.consecutiveNumber ? purchase.consecutiveNumber : `#${pid}`} — ${item.product?.name || 'Producto'} x${availableQty}`,
          },
        })
      }

      // Update provider totals
      if (purchase.providerId) {
        await tx.provider.update({
          where: { id: purchase.providerId },
          data: {
            totalPurchases: { decrement: purchase.total },
          },
        })

        // If was on credit, decrement debt
        const remainingDebt = purchase.total - purchase.amountPaid
        if (remainingDebt > 0) {
          await tx.provider.update({
            where: { id: purchase.providerId },
            data: {
              totalDebt: { decrement: remainingDebt },
            },
          })
        }
      }
    })

    return NextResponse.json({ message: 'Compra cancelada exitosamente' })
  } catch (error) {
    logger.error('DELETE /api/purchases/[id] error:', error)
    return NextResponse.json({ error: 'Error al cancelar compra' }, { status: 500 })
  }
}
