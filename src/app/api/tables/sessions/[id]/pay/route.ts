import { getAuthUser, requireStoreAccess } from '@/lib/api-auth'
import { generateOrderNumber } from '@/lib/auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { mul, toNum } from '@/lib/stock-math'
import { isSubscriptionActive } from '@/lib/subscription-helpers'
import { emitComandaItemsUpdated, emitPaymentProcessed } from '@/lib/tables-sync'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Zod Schemas ──────────────────────────────────────────────────

const paySessionSchema = z.object({
  storeId: z.number().int().positive(),
  itemIds: z.array(z.number().int().positive()).min(1, 'Debe seleccionar al menos un item'),
  paymentMethod: z.enum(['CASH', 'DAVIPLATA', 'NEQUI', 'CARD', 'TRANSFER', 'MIXED', 'CREDIT', 'FIADO']),
 customerId: z.number().int().positive().nullable().optional(),
 cashRegisterId: z.number().int().positive().optional(),
  tipAmount: z.number().int().min(0).default(0),
  discountType: z.enum(['NONE', 'PERCENTAGE', 'FIXED']).default('NONE'),
  discountAmount: z.number().int().min(0).default(0),
  discountReason: z.string().max(200).optional(),
})

// ─── POST: Process payment for comanda items ──────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const sid = Number(id)
    if (isNaN(sid)) {
      return NextResponse.json({ error: 'ID de sesión inválido' }, { status: 400 })
    }

    const body = await req.json()
    const data = paySessionSchema.parse(body)

    // Verify session exists and is OPEN
    const session = await db.tableSession.findUnique({
      where: { id: sid },
      include: {
        barTable: { select: { number: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
    })
    if (!session) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }
    if (session.status !== 'OPEN') {
      return NextResponse.json({ error: 'La sesión está cerrada' }, { status: 400 })
    }
    if (session.storeId !== data.storeId) {
      return NextResponse.json(
        { error: 'La sesión no pertenece a esta tienda' },
        { status: 400 },
      )
    }

    const storeAccessErr = requireStoreAccess(req, data.storeId)
    if (storeAccessErr) return storeAccessErr
    const auth = getAuthUser(req)

    // ── Subscription gate: block payment when subscription is expired/cancelled ──
    const subActive = await isSubscriptionActive(data.storeId)
    if (!subActive) {
      return NextResponse.json(
        { error: 'Tu suscripción está vencida. Renueva tu plan para continuar vendiendo.' },
        { status: 403 },
      )
    }

    // Get comanda items to pay — must be SERVED or PENDING (not already PAID or CANCELLED)
    const comandaItems = await db.comandaItem.findMany({
      where: {
        id: { in: data.itemIds },
        tableSessionId: sid,
        status: { in: ['PENDING', 'SERVED'] },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            salePrice: true,
            costPrice: true,
            currentStock: true,
            taxRate: { select: { id: true, name: true, code: true, rate: true, rateType: true } },
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
      },
    })

    if (comandaItems.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron items elegibles para pagar (deben estar PENDIENTES o SERVIDOS)' },
        { status: 400 },
      )
    }

    // Check all requested item IDs were found
    const foundIds = new Set(comandaItems.map((i) => i.id))
    const missingIds = data.itemIds.filter((id) => !foundIds.has(id))
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `Item(s) con ID(s) ${missingIds.join(', ')} no encontrados o no son elegibles para pago` },
        { status: 400 },
      )
    }

    // Verify customer belongs to store if provided (for CREDIT payment)
    if (data.customerId) {
      const customer = await db.customer.findFirst({
        where: { id: data.customerId, storeId: data.storeId },
      })
      if (!customer) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
      }
    }

    // Calculate totals
    const subtotal = comandaItems.reduce((sum, item) => sum + Number(item.total), 0)
    const tipAmount = data.tipAmount || 0

    // Calculate discount
    let discountAmount = 0
    if (data.discountType === 'PERCENTAGE' && data.discountAmount > 0) {
      discountAmount = Math.round(subtotal * (data.discountAmount / 100))
    } else if (data.discountType === 'FIXED') {
      discountAmount = Math.min(data.discountAmount, subtotal)
    }
    const total = subtotal - discountAmount + tipAmount

    // Tip is only allowed for non-credit orders
    if (tipAmount > 0 && (data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO')) {
      return NextResponse.json(
        { error: 'No se puede agregar propina a una venta fiada' },
        { status: 400 },
      )
    }

    // Separate product and service items
    const productComandaItems = comandaItems.filter((i) => i.productId)
    const serviceComandaItems = comandaItems.filter((i) => i.serviceId)

    // ── Tax computation (Colombian tax-inclusive pricing) ──
    const taxBreakdownMap: Record<string, { code: string; name: string; base: number; rate: number; amount: number }> = {}
    let orderTaxAmount = 0

    const calcTax = (totalRow: number, taxRateInfo: { code: string; rate: number; rateType: string } | null) => {
      if (!taxRateInfo) {
        return { taxCode: null, taxRate: 0, taxAmount: 0, taxBase: totalRow }
      }
      if (taxRateInfo.code === '03' || taxRateInfo.code === '04') {
        return { taxCode: taxRateInfo.code, taxRate: 0, taxAmount: 0, taxBase: totalRow }
      }
      if (taxRateInfo.rateType === 'PERCENTAGE' && taxRateInfo.rate > 0) {
        const taxBase = Math.round(totalRow / (1 + taxRateInfo.rate / 100))
        const taxAmount = totalRow - taxBase
        return { taxCode: taxRateInfo.code, taxRate: taxRateInfo.rate, taxAmount, taxBase }
      }
      return { taxCode: taxRateInfo.code, taxRate: taxRateInfo.rate, taxAmount: 0, taxBase: totalRow }
    }

    // Build order item data with per-item tax info
    const orderItemsData = comandaItems.map((item) => {
      const totalRow = Number(item.total)
      const tr = item.product?.taxRate
        ? { code: item.product.taxRate.code, rate: item.product.taxRate.rate, rateType: item.product.taxRate.rateType }
        : null
      const tax = calcTax(totalRow, tr)

      // Accumulate into breakdown
      if (tax.taxCode) {
        const key = tax.taxCode
        if (!taxBreakdownMap[key]) {
          taxBreakdownMap[key] = { code: key, name: item.product?.taxRate?.name || key, base: 0, rate: tax.taxRate, amount: 0 }
        }
        taxBreakdownMap[key].base += tax.taxBase
        taxBreakdownMap[key].amount += tax.taxAmount
      }
      orderTaxAmount += tax.taxAmount

      return {
        productId: item.productId ?? null,
        serviceId: item.serviceId ?? null,
        presentationId: item.presentationId ?? null,
        presentationName: item.presentationName ?? null,
        unitsPerPack: item.unitsPerPack,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalRow,
        taxCode: tax.taxCode,
        taxRate: tax.taxRate,
        taxAmount: tax.taxAmount,
        taxBase: tax.taxBase,
      }
    })

    // A discount reduces what the business actually received, so the IVA base
    // must shrink proportionally too — otherwise the order (and DIAN reporting)
    // declares tax on money that was never collected. totalRow/unitPrice are
    // left untouched; only taxBase/taxAmount — the DIAN-facing figures — are discounted.
    if (discountAmount > 0 && subtotal > 0) {
      const discountRatio = discountAmount / subtotal
      for (const item of orderItemsData) {
        item.taxBase = Math.round(item.taxBase * (1 - discountRatio))
        item.taxAmount = Math.round(item.taxAmount * (1 - discountRatio))
      }
      for (const key of Object.keys(taxBreakdownMap)) delete taxBreakdownMap[key]
      for (const item of orderItemsData) {
        if (!item.taxCode) continue
        if (!taxBreakdownMap[item.taxCode]) {
          taxBreakdownMap[item.taxCode] = { code: item.taxCode, name: item.taxCode, base: 0, rate: item.taxRate, amount: 0 }
        }
        taxBreakdownMap[item.taxCode].base += item.taxBase
        taxBreakdownMap[item.taxCode].amount += item.taxAmount
      }
      orderTaxAmount = orderItemsData.reduce((sum, i) => sum + i.taxAmount, 0)
    }

    const taxBreakdownJson = Object.keys(taxBreakdownMap).length > 0
      ? JSON.stringify(Object.values(taxBreakdownMap))
      : null

    const orderNumber = generateOrderNumber()
    const tableLabel = session.barTable.name || `Mesa ${session.barTable.number}`

    // ─── Cash register validation: MUST have an open shift ──────────
    let targetCashRegisterId = data.cashRegisterId ?? null
    if (!targetCashRegisterId) {
      const openShift = await db.cashRegister.findFirst({
        where: { storeId: data.storeId, status: 'OPEN' },
        select: { id: true },
      })
      targetCashRegisterId = openShift?.id ?? null
    } else {
      const shiftExists = await db.cashRegister.findFirst({
        where: { id: targetCashRegisterId, storeId: data.storeId, status: 'OPEN' },
        select: { id: true },
      })
      if (!shiftExists) targetCashRegisterId = null
    }

    // BLOCK payment if no cash register is open
    if (!targetCashRegisterId) {
      return NextResponse.json(
        { error: 'Debes abrir la caja antes de procesar pagos. Ve a Contabilidad → Caja y abre un turno.' },
        { status: 400 },
      )
    }

    const order = await db.$transaction(async (tx) => {
      // 1. Create the order linked to this table session
      const createdOrder = await tx.order.create({
        data: {
          storeId: data.storeId,
          customerId: data.customerId ?? session.customerId ?? null,
          tableSessionId: sid,
          cashRegisterId: targetCashRegisterId,
          soldByEmployeeId: auth?.employeeId ?? null,
          orderNumber,
          subtotal: subtotal,
          taxAmount: orderTaxAmount,
          taxBreakdown: taxBreakdownJson,
          tipAmount,
          discountAmount,
          discountType: data.discountType,
          discountReason: data.discountReason ?? null,
          total,
          status: (data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO') ? 'CREDIT' : 'COMPLETED',
          paymentMethod: data.paymentMethod,
          notes: `Pago ${tableLabel} - Sesión #${sid}`,
          orderItems: { create: orderItemsData },
        },
        include: {
          customer: { select: { id: true, name: true } },
          orderItems: {
            include: {
              product: { select: { name: true } },
              service: { select: { name: true } },
            },
          },
        },
      })

      // 2. Mark comanda items as PAID
      await tx.comandaItem.updateMany({
        where: { id: { in: comandaItems.map((i) => i.id) } },
        data: { status: 'PAID' },
      })

      // 3. Create inventory movements and decrement stock (only for product items)
      //    Deducted in base units: a presentation line (e.g. 1 Six-pack) removes
      //    unitsPerPack base units from the single shared stock pool, not 1.
      for (const item of productComandaItems) {
        const unitsPerPack = item.unitsPerPack || 1
        const baseUnits = mul(item.quantity, unitsPerPack)
        await tx.inventoryMovement.create({
          data: {
            storeId: data.storeId,
            productId: item.productId,
            presentationId: item.presentationId,
            presentationName: item.presentationName,
            unitsPerPack,
            quantity: baseUnits.negated(),
            movementType: 'SALE',
            referenceId: createdOrder.id,
            notes: `Venta ${orderNumber} - ${tableLabel}`,
          },
        })
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: baseUnits } },
        })
      }

      // 4. Create ServiceTransactions for service items
      for (const item of serviceComandaItems) {
        await tx.serviceTransaction.create({
          data: {
            storeId: data.storeId,
            serviceId: item.serviceId,
            quantity: toNum(item.quantity),
            unitPrice: Number(item.unitPrice),
            totalAmount: Number(item.total),
            notes: `Venta ${orderNumber} - ${tableLabel}`,
            status: 'COMPLETED',
          },
        })
      }

      // Descuentos en Ventas: contra-revenue account so a discounted sale still
      // balances (DEBIT Caja/CxC total + DEBIT Descuento = CREDIT Ventas subtotal).
      // Created lazily so existing stores get it without a backfill migration.
      const getDescuentoAccount = async () => {
        const existing = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, name: 'Descuentos en Ventas' },
        })
        if (existing) return existing
        return tx.ledgerAccount.create({
          data: { storeId: data.storeId, name: 'Descuentos en Ventas', type: 'EXPENSE', isDefault: false },
        })
      }

      // 5. Create journal entries (double-entry: DEBIT caja, CREDIT ventas)
      if (data.paymentMethod !== 'CREDIT' && data.paymentMethod !== 'FIADO') {
        const cajaAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, type: 'ASSET', isDefault: true },
        })
        const ventasAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, name: 'Ventas' },
        })

        // DEBIT Caja for full total (subtotal + tip)
        if (cajaAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: cajaAccount.id,
              amount: total,
              direction: 'DEBIT',
              description: `Venta ${orderNumber} - ${tableLabel}${tipAmount > 0 ? ` + Propina $${tipAmount.toLocaleString()}` : ''}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
        // CREDIT Ventas for subtotal
        if (ventasAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: ventasAccount.id,
              amount: subtotal,
              direction: 'CREDIT',
              description: `Venta ${orderNumber} - ${tableLabel}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
        // DEBIT Descuentos en Ventas for discountAmount (if any) — keeps the entry balanced
        if (discountAmount > 0) {
          const descuentoAccount = await getDescuentoAccount()
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: descuentoAccount.id,
              amount: discountAmount,
              direction: 'DEBIT',
              description: `Descuento venta ${orderNumber} - ${tableLabel}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
        // CREDIT Propina for tip amount (if any)
        if (tipAmount > 0) {
          const propinaAccount = await tx.ledgerAccount.findFirst({
            where: { storeId: data.storeId, name: 'Propina' },
          })
          if (propinaAccount) {
            await tx.journalEntry.create({
              data: {
                storeId: data.storeId,
                ledgerAccountId: propinaAccount.id,
                amount: tipAmount,
                direction: 'CREDIT',
                description: `Propina venta ${orderNumber} - ${tableLabel}`,
                referenceType: 'ORDER',
                referenceId: createdOrder.id,
              },
            })
          }
        }
      } else {
        // CREDIT payment: create accounts receivable journal entry
        const customerId = data.customerId ?? session.customerId
        const cuentasPorCobrar = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, name: { contains: 'Cuentas por Cobrar' } },
        })
        const ventasAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, name: 'Ventas' },
        })

        if (cuentasPorCobrar) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: cuentasPorCobrar.id,
              amount: total,
              direction: 'DEBIT',
              description: `Venta fiada ${orderNumber} - ${tableLabel}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
        // CREDIT Ventas for subtotal (not total — a discount is its own contra-entry below,
        // consistent with the cash-sale branch above and with src/app/api/orders/route.ts)
        if (ventasAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: ventasAccount.id,
              amount: subtotal,
              direction: 'CREDIT',
              description: `Venta fiada ${orderNumber} - ${tableLabel}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
        // DEBIT Descuentos en Ventas for discountAmount (if any) — keeps the entry balanced
        if (discountAmount > 0) {
          const descuentoAccount = await getDescuentoAccount()
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: descuentoAccount.id,
              amount: discountAmount,
              direction: 'DEBIT',
              description: `Descuento venta fiada ${orderNumber} - ${tableLabel}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }

        // Update customer debt if customerId is provided (total = subtotal - discount,
        // matching what the CxC journal entry above actually debits)
        if (customerId) {
          // Stamp debtSince only when debt starts accruing from $0 (Índice de Morosidad aging proxy)
          const debtCustomer = await tx.customer.findUnique({
            where: { id: customerId },
            select: { totalDebt: true },
          })
          await tx.customer.update({
            where: { id: customerId },
            data: {
              totalDebt: { increment: total },
              ...(debtCustomer && debtCustomer.totalDebt <= 0 ? { debtSince: new Date() } : {}),
            },
          })
        }
      }

      return createdOrder
    })

    // Calculate profitability (only for product items — services have no costPrice)
    const profitability = productComandaItems.map((item) => ({
      productName: item.productName,
      quantity: toNum(item.quantity),
      unitPrice: Number(item.unitPrice),
      costPrice: Number(item.product?.costPrice ?? 0),
      revenue: Number(item.total),
      cogs: Number(item.product?.costPrice ?? 0) * toNum(item.quantity),
      grossProfit: (Number(item.unitPrice) - Number(item.product?.costPrice ?? 0)) * toNum(item.quantity),
    }))

    const totalCogs = profitability.reduce((sum, p) => sum + p.cogs, 0)
    const totalGrossProfit = profitability.reduce((sum, p) => sum + p.grossProfit, 0)

    // Broadcast real-time events
    emitComandaItemsUpdated(data.storeId, sid, session.barTableId, 'PAID')
    emitPaymentProcessed(data.storeId, sid, session.barTableId, orderNumber)

    return NextResponse.json(
      {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentMethod: order.paymentMethod,
        subtotal: Number(order.subtotal),
        taxAmount: Number(order.taxAmount ?? 0),
        taxBreakdown: order.taxBreakdown ? JSON.parse(order.taxBreakdown) : null,
        tipAmount: Number(order.tipAmount),
        discountAmount: Number(order.discountAmount ?? 0),
        discountType: order.discountType,
        total: Number(order.total),
        tableSessionId: sid,
        customer: order.customer,
        cashRegisterId: targetCashRegisterId,
        orderItems: order.orderItems.map((item) => ({
          id: item.id,
          productId: item.productId ?? null,
          serviceId: item.serviceId ?? null,
          presentationName: item.presentationName ?? null,
          productName: item.product?.name ?? item.service?.name ?? 'Eliminado',
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalRow: Number(item.totalRow),
          taxCode: item.taxCode,
          taxRate: item.taxRate,
          taxAmount: Number(item.taxAmount),
          taxBase: Number(item.taxBase),
          isService: !!item.serviceId,
        })),
        profitability,
        totalCogs,
        totalGrossProfit,
        createdAt: order.createdAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/tables/sessions/[id]/pay error:', error)
    return NextResponse.json({ error: 'Error al procesar el pago' }, { status: 500 })
  }
}
