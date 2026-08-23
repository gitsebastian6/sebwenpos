import { requireStoreAccess } from '@/lib/api-auth'
import { auditLogFromRequest } from '@/lib/audit-logger'
import { DIAN_CONSUMIDOR_FINAL_NIT, getSoftwareProviderNIT } from '@/lib/constants'
import { db } from '@/lib/db'
import { decryptField } from '@/lib/field-encryption'
import {
    formatInvoiceNumber,
    generateCUDFE,
    generateQRCodeURL,
} from '@/lib/invoice-utils'
import { getNextCreditNoteConsecutive } from '@/lib/invoicing/credit-note-counter'
import { logger } from '@/lib/logger'
import { add, gt, gte, lte, mul, sub, toNum } from '@/lib/stock-math'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const returnItemSchema = z.object({
  orderItemId: z.number().int().positive(),
  quantity: z.number().min(0.001),
})

const returnSchema = z.object({
  items: z.array(returnItemSchema).min(1),
  reason: z.string().optional(),
})

// POST /api/orders/[id]/return — Devolver parcial o totalmente una venta
// Permite seleccionar productos y cantidades específicas a devolver
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orderId = Number(id)

    if (isNaN(orderId)) {
      return NextResponse.json({ error: 'ID de orden inválido' }, { status: 400 })
    }

    // Parse body
    let body: { items?: { orderItemId: number; quantity: number }[]; reason?: string } = {}
    try {
      const raw = await request.json()
      body = returnSchema.parse(raw)
    } catch (e: unknown) {
      const msg = e instanceof z.ZodError ? e.issues[0]?.message : 'Datos inválidos'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // Fetch order with items
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: {
            product: {
              select: { id: true, name: true, currentStock: true },
            },
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    const storeAccessErr = requireStoreAccess(request, order.storeId)
    if (storeAccessErr) return storeAccessErr

    if (order.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Esta orden ya fue cancelada/devuelta' },
        { status: 400 }
      )
    }

    // Build a map of order items for quick lookup
    const itemMap = new Map(order.orderItems.map((item) => [item.id, item]))

    // Basic validation: items must belong to this order and have a product
    for (const reqItem of body.items!) {
      const item = itemMap.get(reqItem.orderItemId)
      if (!item) {
        return NextResponse.json(
          { error: `Item #${reqItem.orderItemId} no pertenece a esta orden` },
          { status: 400 }
        )
      }
      if (!item.productId) {
        return NextResponse.json(
          { error: `"${item.product?.name || 'Servicio'}" no tiene producto asociado, no se puede devolver al inventario` },
          { status: 400 }
        )
      }
    }

    // Process return in transaction
    const results = await db.$transaction(async (tx) => {
      // Re-validate quantities INSIDE transaction to prevent race conditions
      for (const reqItem of body.items!) {
        const freshItem = await tx.orderItem.findUnique({
          where: { id: reqItem.orderItemId },
          select: { quantity: true, returnedQuantity: true },
        })
        if (!freshItem) {
          throw new Error(`Item #${reqItem.orderItemId} no encontrado`)
        }
        const available = sub(freshItem.quantity, freshItem.returnedQuantity ?? 0)
        if (lte(available, 0)) {
          throw new Error(`"${itemMap.get(reqItem.orderItemId)?.product?.name || 'Producto'}" ya fue devuelto completamente`)
        }
        if (gt(reqItem.quantity, available)) {
          throw new Error(`Solo se pueden devolver ${toNum(available)} unidad(es) de "${itemMap.get(reqItem.orderItemId)?.product?.name || 'Producto'}". Ya se devolvieron ${toNum(freshItem.returnedQuantity ?? 0)}.`)
        }
      }

      let totalReturned = 0
      const returnedItems: { name: string; quantity: number }[] = []

      for (const reqItem of body.items!) {
        const item = itemMap.get(reqItem.orderItemId)!
        const productName = item.product?.name || 'Producto'
        const displayName = item.presentationName ? `${productName} — ${item.presentationName}` : productName
        // Stock is a single shared pool in base units — returning N units of a
        // presentation line (e.g. Six-pack) must put back N × unitsPerPack
        // base units, not N, or the pool ends up short after every such return.
        const unitsPerPack = item.unitsPerPack || 1
        const baseUnitsReturned = mul(reqItem.quantity, unitsPerPack)

        // Increment product stock
        await tx.product.update({
          where: { id: item.productId! },
          data: {
            currentStock: { increment: baseUnitsReturned },
          },
        })

        // Update returnedQuantity on the order item (in the item's own unit —
        // e.g. "2" Six-packs returned — so future partial-return math against
        // item.quantity stays consistent)
        await tx.orderItem.update({
          where: { id: reqItem.orderItemId },
          data: {
            returnedQuantity: { increment: reqItem.quantity },
          },
        })

        // Create inventory movement (RETURN type, positive = stock returned, always in base units)
        await tx.inventoryMovement.create({
          data: {
            storeId: order.storeId,
            productId: item.productId!,
            presentationId: item.presentationId,
            presentationName: item.presentationName,
            unitsPerPack: item.unitsPerPack,
            quantity: baseUnitsReturned,
            movementType: 'RETURN',
            referenceId: orderId,
            notes: `Devolución parcial venta #${order.orderNumber} — ${displayName} x${reqItem.quantity}${body.reason ? ` — ${body.reason}` : ''}`,
          },
        })

        totalReturned += reqItem.quantity
        returnedItems.push({ name: displayName, quantity: reqItem.quantity })
      }

      // If the order was CREDIT/FIADO, reduce customer's debt proportionally
      if (order.customerId && (order.status === 'CREDIT' || order.status === 'COMPLETED')) {
        // Check if there was originally debt (only CREDIT orders have debt)
        const creditOrders = await tx.order.findFirst({
          where: { id: orderId, status: 'CREDIT', customerId: order.customerId },
          select: { id: true },
        })
        if (creditOrders) {
          // Calculate proportional discount ratio
          const discountRatio = order.discountAmount > 0 && order.subtotal > 0
            ? order.discountAmount / order.subtotal
            : 0

          const returnAmount = order.orderItems
            .filter(oi => body.items!.some(ri => ri.orderItemId === oi.id))
            .reduce((sum, oi) => {
              const returnItem = body.items!.find(ri => ri.orderItemId === oi.id)!
              const itemTotal = Number(oi.unitPrice) * returnItem.quantity
              const discountedTotal = Math.round(itemTotal * (1 - discountRatio))
              return sum + discountedTotal
            }, 0)

          // Only reduce debt if returnAmount > 0
          if (returnAmount > 0) {
            const debtCustomer = await tx.customer.findUnique({
              where: { id: order.customerId },
              select: { totalDebt: true },
            })
            const willBeCleared = !!debtCustomer && debtCustomer.totalDebt - returnAmount <= 0
            await tx.customer.update({
              where: { id: order.customerId },
              data: { totalDebt: { decrement: returnAmount }, ...(willBeCleared ? { debtSince: null } : {}) },
            })
            logger.info(`Return: reduced customer ${order.customerId} debt by $${returnAmount}`)
          }
        }
      }

      // Check if ALL items are now fully returned
      const allFullyReturned = order.orderItems.every(
        (item) => gte(add(item.returnedQuantity ?? 0, body.items!.find((r) => r.orderItemId === item.id)?.quantity || 0), item.quantity)
      )

      // Update order status
      if (allFullyReturned) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'CANCELLED' },
        })
      }

      return { totalReturned, returnedItems, fullyReturned: allFullyReturned }
    })

    const itemSummary = results.returnedItems.map((i) => `${i.name} x${i.quantity}`).join(', ')

    // ── Auto-generate Credit Note if order has an electronic invoice ──
    let creditNoteResult: {
      noteNumber: string
      noteType: string
      grandTotal: number
      concept: string
    } | null = null

    try {
      const invoice = await db.invoice.findUnique({
        where: { orderId },
        select: {
          id: true,
          prefix: true,
          consecutive: true,
          cufe: true,
          customerNit: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          customerAddress: true,
          customerRegime: true,
          customerType: true,
          grandTotal: true,
          storeId: true,
        },
      })

      if (invoice && invoice.cufe) {
        // There's an electronic invoice — generate a Credit Note automatically
        const store = await db.store.findUnique({
          where: { id: invoice.storeId },
          select: {
            nit: true,
            resolutionNumber: true,
            resolutionStartDate: true,
            resolutionEndDate: true,
            resolutionStartNumber: true,
            resolutionEndNumber: true,
            currencyCode: true,
            invoiceTestMode: true,
            softwarePin: true,
          },
        })

        // Compute amounts from returned items
        let ncSubtotalBase = 0
        let ncTotalTax = 0
        let ncGrandTotal = 0
        const ncItems: { productName: string; description: string; quantity: number; unitPrice: number; taxAmount: number; taxBase: number; taxCode: string; taxRate: number }[] = []

        for (const reqItem of body.items!) {
          const item = itemMap.get(reqItem.orderItemId)!
          const unitPrice = Number(item.unitPrice)
          const totalRow = unitPrice * reqItem.quantity
          const taxRate = Number(item.taxRate || 0)
          const taxBase = taxRate > 0 ? Math.round(totalRow / (1 + taxRate / 100)) : totalRow
          const taxAmount = totalRow - taxBase

          ncSubtotalBase += taxBase
          ncTotalTax += taxAmount
          ncGrandTotal += totalRow

          const ncDisplayName = item.presentationName
            ? `${item.product?.name || 'Producto'} — ${item.presentationName}`
            : (item.product?.name || 'Producto')
          ncItems.push({
            productName: ncDisplayName,
            description: `Devolución: ${ncDisplayName}`,
            quantity: reqItem.quantity,
            unitPrice,
            taxAmount: Math.round(taxAmount),
            taxBase: Math.round(taxBase),
            taxCode: String(item.taxCode || (taxRate > 0 ? '01' : '00')),
            taxRate,
          })
        }

        // Get next NC consecutive + create credit note in atomic transaction
        const creditNote = await db.$transaction(async (tx) => {
          const consecutiveResult = await getNextCreditNoteConsecutive(order.storeId, 'CREDIT', tx)

        // Generate CUDFE
        const now = new Date()
        const issueDate = now.toISOString().slice(0, 10).replace(/-/g, '')
        const issueTime = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}000`

        const softwarePIN = decryptField(store?.softwarePin || '') || process.env.DIAN_SOFTWARE_PIN || ''
        const providerNit = getSoftwareProviderNIT()
        const resolutionNumber = store?.resolutionNumber || ''
        const resolutionDate = store?.resolutionStartDate
          ? store.resolutionStartDate.toISOString().slice(0, 10).replace(/-/g, '')
          : ''

        let cudfe: string | null = null
        let qrCode: string | null = null

        try {
          cudfe = generateCUDFE({
            storeNit: store?.nit || '',
            issueDate,
            issueTime,
            prefix: consecutiveResult.prefix,
            consecutive: consecutiveResult.consecutive,
            customerNit: invoice.customerNit || DIAN_CONSUMIDOR_FINAL_NIT,
            subtotalBase: ncSubtotalBase,
            totalTaxAmount: ncTotalTax,
            discountAmount: 0,
            grandTotal: ncGrandTotal,
            currencyCode: store?.currencyCode || 'COP',
            resolutionNumber,
            resolutionDate,
            pinSoftware: softwarePIN,
            providerNit,
            cude: invoice.cufe,
          })

          const testMode = store?.invoiceTestMode ?? true
          qrCode = generateQRCodeURL({
            storeNit: store?.nit || '',
            prefix: consecutiveResult.prefix,
            consecutive: consecutiveResult.consecutive,
            date: now.toISOString().slice(0, 10),
            grandTotal: ncGrandTotal,
            cufe: cudfe,
            testMode,
          })
        } catch (cudfeErr) {
          logger.warn('[Return→NC] Error generando CUDFE:', cudfeErr)
        }

        // Build tax breakdown JSON
        const taxBreakdownMap: Record<string, { code: string; name: string; base: number; rate: number; amount: number }> = {}
        for (const ni of ncItems) {
          if (ni.taxRate > 0 && ni.taxCode) {
            const key = ni.taxCode
            if (!taxBreakdownMap[key]) {
              taxBreakdownMap[key] = { code: key, name: `Impuesto ${ni.taxCode}`, base: 0, rate: ni.taxRate, amount: 0 }
            }
            taxBreakdownMap[key].base += ni.taxBase
            taxBreakdownMap[key].amount += ni.taxAmount
          }
        }
        const taxBreakdown = Object.keys(taxBreakdownMap).length > 0
          ? JSON.stringify(Object.values(taxBreakdownMap))
          : '[]'

        // Create the Credit Note (within transaction)
        const createdNote = await tx.creditNote.create({
          data: {
            storeId: order.storeId,
            invoiceId: invoice.id,
            prefix: consecutiveResult.prefix,
            consecutive: consecutiveResult.consecutive,
            resolutionNumber: store?.resolutionNumber || null,
            resolutionDate: store?.resolutionStartDate ? new Date(store.resolutionStartDate) : null,
            startDate: store?.resolutionStartDate || null,
            endDate: store?.resolutionEndDate || null,
            startNumber: store?.resolutionStartNumber,
            endNumber: store?.resolutionEndNumber,
            noteType: 'CREDIT',
            concept: results.fullyReturned ? 'Devolución total' : 'Devolución parcial',
            description: `Devolución automática de venta #${order.orderNumber}${body.reason ? ` — ${body.reason}` : ''}`,
            customerNit: invoice.customerNit || DIAN_CONSUMIDOR_FINAL_NIT,
            customerName: invoice.customerName || 'Consumidor Final',
            customerEmail: invoice.customerEmail || null,
            customerPhone: invoice.customerPhone || null,
            customerAddress: invoice.customerAddress || null,
            customerRegime: invoice.customerRegime || 'NO_RESPONSABLE',
            customerType: invoice.customerType || 'CC',
            subtotalBase: ncSubtotalBase,
            taxExemptAmount: 0,
            taxBreakdown,
            totalTaxAmount: ncTotalTax,
            totalWithTax: ncSubtotalBase + ncTotalTax,
            discountAmount: 0,
            grandTotal: ncGrandTotal,
            cufe: cudfe,
            qrCode,
            referencedInvoiceId: invoice.cufe || null,
            referencedPrefix: invoice.prefix,
            referencedConsec: invoice.consecutive,
            items: JSON.stringify(ncItems),
            status: 'DRAFT',
            testMode: store?.invoiceTestMode ?? true,
            notes: `Auto-generada por devolución de orden #${order.orderNumber}`,
          },
        })

          return createdNote
        }) // fin de $transaction

        creditNoteResult = {
          noteNumber: formatInvoiceNumber(creditNote.prefix, creditNote.consecutive),
          noteType: 'CREDIT',
          grandTotal: ncGrandTotal,
          concept: results.fullyReturned ? 'Devolución total' : 'Devolución parcial',
        }

        logger.info(`[Return→NC] Credit Note ${creditNoteResult.noteNumber} auto-generated for order #${order.orderNumber}`)
      }
    } catch (ncErr) {
      // Credit note generation failed — log but don't fail the return
      logger.error('[Return→NC] Error auto-generating credit note:', ncErr)
    }

    // Audit: order return
    auditLogFromRequest(request, {
      storeId: order.storeId,
      action: 'RETURN',
      entity: 'Order',
      entityId: order.id,
      newValue: { orderNumber: order.orderNumber, fullyReturned: results.fullyReturned, totalReturned: results.totalReturned },
    }).catch(() => {})

    return NextResponse.json({
      message: results.fullyReturned
        ? `Venta #${order.orderNumber} devuelta completamente: ${itemSummary}`
        : `Devolución parcial de venta #${order.orderNumber}: ${itemSummary}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      fullyReturned: results.fullyReturned,
      totalReturned: results.totalReturned,
      creditNote: creditNoteResult,
    })
  } catch (error) {
    logger.error('POST /api/orders/[id]/return error:', error)
    const message = error instanceof Error ? error.message : 'Error al procesar la devolución'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
