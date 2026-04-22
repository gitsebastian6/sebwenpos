import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateOrderNumber } from '@/lib/auth'
import { requireStoreAccess } from '@/lib/api-auth'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// ─── POST: Create order ─────────────────────────────────────────────

const orderItemSchema = z.object({
  productId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive().optional(),
  quantity: z.number().int().min(1),
  notes: z.string().max(200).optional(),
}).refine((d) => d.productId || d.serviceId, {
  message: 'Debe especificar productId o serviceId',
}).refine((d) => !(d.productId && d.serviceId), {
  message: 'Solo puede especificar productId o serviceId, no ambos',
})

const createOrderSchema = z.object({
  storeId: z.number().int().positive(),
  customerId: z.number().int().positive().nullable().optional(),
  cashRegisterId: z.number().int().positive().optional(),
  paymentMethod: z.enum(['CASH', 'DAVIPLATA', 'NEQUI', 'CARD', 'TRANSFER', 'MIXED', 'CREDIT', 'FIADO']),
  tipAmount: z.number().int().min(0).default(0),
  discountType: z.enum(['NONE', 'PERCENTAGE', 'FIXED']).default('NONE'),
  discountAmount: z.number().int().min(0).default(0),
  discountReason: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
  items: z.array(orderItemSchema).min(1, 'La orden debe tener al menos un producto o servicio'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createOrderSchema.parse(body)

    // Auth: verify user has access to this store
    const storeAccessError = requireStoreAccess(req, data.storeId)
    if (storeAccessError) return storeAccessError

    // Separate product and service items
    const productItems = data.items.filter((i) => i.productId)
    const serviceItems = data.items.filter((i) => i.serviceId)

    // Resolve product info (including tax rate)
    const productMap = new Map<number, { id: number; name: string; salePrice: number; currentStock: number; taxRate: { id: number; code: string; rate: number; rateType: string; applyTo: string } | null }>()
    if (productItems.length > 0) {
      const productIds = productItems.map((i) => i.productId!)
      const products = await db.product.findMany({
        where: { id: { in: productIds }, storeId: data.storeId, isActive: true },
        select: { id: true, name: true, salePrice: true, currentStock: true, taxRate: { select: { id: true, code: true, rate: true, rateType: true, applyTo: true } } },
      })
      for (const p of products) productMap.set(p.id, p)
    }

    // Fetch store's default tax rate (for products/services without an assigned rate)
    const defaultTaxRate = await db.taxRate.findFirst({
      where: { storeId: data.storeId, isDefault: true, category: 'SALES_TAX', isActive: true },
    })
    // Also find a default for services if different
    const defaultServiceTaxRate = await db.taxRate.findFirst({
      where: { storeId: data.storeId, isDefault: true, category: 'SALES_TAX', isActive: true, applyTo: { in: ['SERVICE', 'BOTH'] } },
    })
    const fallbackServiceTaxRate = defaultServiceTaxRate ?? defaultTaxRate

    // Resolve service info
    const serviceMap = new Map<number, { id: number; name: string; price: number }>()
    if (serviceItems.length > 0) {
      const serviceIds = serviceItems.map((i) => i.serviceId!)
      const services = await db.service.findMany({
        where: { id: { in: serviceIds }, storeId: data.storeId, isActive: true },
        select: { id: true, name: true, price: true },
      })
      for (const s of services) serviceMap.set(s.id, s)
    }

    // Validate all items exist
    for (const item of productItems) {
      const product = productMap.get(item.productId!)
      if (!product) {
        return NextResponse.json(
          { error: `Producto con ID ${item.productId} no encontrado o inactivo` },
          { status: 400 },
        )
      }
      if (product.currentStock < item.quantity) {
        return NextResponse.json(
          { error: `Stock insuficiente para "${product.name}" (disponible: ${product.currentStock})` },
          { status: 400 },
        )
      }
    }

    for (const item of serviceItems) {
      const service = serviceMap.get(item.serviceId!)
      if (!service) {
        return NextResponse.json(
          { error: `Servicio con ID ${item.serviceId} no encontrado o inactivo` },
          { status: 400 },
        )
      }
    }

    // Helper: calculate tax for a line item ( Colombian tax-inclusive pricing )
    const calcTax = (totalRow: number, taxRateInfo: { code: string; rate: number; rateType: string } | null) => {
      // No tax rate → no tax
      if (!taxRateInfo) {
        return { taxCode: null, taxRate: 0, taxAmount: 0, taxBase: totalRow }
      }
      // EXEMPT (03) or EXCLUDED (04) → zero tax, base = full amount
      if (taxRateInfo.code === '03' || taxRateInfo.code === '04') {
        return { taxCode: taxRateInfo.code, taxRate: 0, taxAmount: 0, taxBase: totalRow }
      }
      // PERCENTAGE type (standard IVA): prices include tax
      if (taxRateInfo.rateType === 'PERCENTAGE' && taxRateInfo.rate > 0) {
        const taxBase = Math.round(totalRow / (1 + taxRateInfo.rate / 100))
        const taxAmount = totalRow - taxBase
        return { taxCode: taxRateInfo.code, taxRate: taxRateInfo.rate, taxAmount, taxBase }
      }
      // FIXED_AMOUNT type (e.g. Impoconsumo): tax is added on top
      // For now treat similarly — base = totalRow, amount = rate * qty
      // but since prices in the POS are consumer-facing and include everything,
      // we keep it simple: base = totalRow, amount = 0 unless explicitly handled
      return { taxCode: taxRateInfo.code, taxRate: taxRateInfo.rate, taxAmount: 0, taxBase: totalRow }
    }

    // Tax breakdown accumulator: grouped by tax code
    const taxBreakdownMap: Record<string, { code: string; name: string; base: number; rate: number; amount: number }> = {}

    // Calculate totals and build order item data (with tax info)
    let orderTaxAmount = 0
    const orderItemsData = data.items.map((item) => {
      if (item.productId) {
        const product = productMap.get(item.productId)!
        const totalRow = product.salePrice * item.quantity
        // Determine tax rate: product's own rate > store default > none
        const effectiveTax = product.taxRate
          ? { code: product.taxRate.code, rate: product.taxRate.rate, rateType: product.taxRate.rateType }
          : defaultTaxRate
            ? { code: defaultTaxRate.code, rate: defaultTaxRate.rate, rateType: defaultTaxRate.rateType }
            : null
        const tax = calcTax(totalRow, effectiveTax)
        // Accumulate into breakdown
        if (tax.taxCode) {
          const key = tax.taxCode
          if (!taxBreakdownMap[key]) {
            taxBreakdownMap[key] = { code: key, name: key, base: 0, rate: tax.taxRate, amount: 0 }
          }
          taxBreakdownMap[key].base += tax.taxBase
          taxBreakdownMap[key].amount += tax.taxAmount
        }
        orderTaxAmount += tax.taxAmount
        return {
          productId: item.productId,
          serviceId: null as number | null,
          quantity: item.quantity,
          unitPrice: product.salePrice,
          totalRow,
          taxCode: tax.taxCode,
          taxRate: tax.taxRate,
          taxAmount: tax.taxAmount,
          taxBase: tax.taxBase,
          notes: item.notes || null as string | null,
        }
      } else {
        const service = serviceMap.get(item.serviceId!)!
        const totalRow = service.price * item.quantity
        // Services use fallback service tax rate (store default for services)
        const effectiveTax = fallbackServiceTaxRate
          ? { code: fallbackServiceTaxRate.code, rate: fallbackServiceTaxRate.rate, rateType: fallbackServiceTaxRate.rateType }
          : null
        const tax = calcTax(totalRow, effectiveTax)
        if (tax.taxCode) {
          const key = tax.taxCode
          if (!taxBreakdownMap[key]) {
            taxBreakdownMap[key] = { code: key, name: key, base: 0, rate: tax.taxRate, amount: 0 }
          }
          taxBreakdownMap[key].base += tax.taxBase
          taxBreakdownMap[key].amount += tax.taxAmount
        }
        orderTaxAmount += tax.taxAmount
        return {
          productId: null as number | null,
          serviceId: item.serviceId,
          quantity: item.quantity,
          unitPrice: service.price,
          totalRow,
          taxCode: tax.taxCode,
          taxRate: tax.taxRate,
          taxAmount: tax.taxAmount,
          taxBase: tax.taxBase,
          notes: item.notes || null as string | null,
        }
      }
    })
    const subtotal = orderItemsData.reduce((sum, i) => sum + i.totalRow, 0)
    const tipAmount = data.tipAmount || 0

    // Resolve tax rate names for breakdown
    const allTaxRateIds = new Set<string>()
    for (const key of Object.keys(taxBreakdownMap)) {
      allTaxRateIds.add(key)
    }
    if (allTaxRateIds.size > 0) {
      const taxRateRecords = await db.taxRate.findMany({
        where: { storeId: data.storeId, code: { in: Array.from(allTaxRateIds) } },
        select: { code: true, name: true },
      })
      for (const tr of taxRateRecords) {
        if (taxBreakdownMap[tr.code]) {
          taxBreakdownMap[tr.code].name = tr.name
        }
      }
    }

    const taxBreakdownJson = Object.keys(taxBreakdownMap).length > 0
      ? JSON.stringify(Object.values(taxBreakdownMap))
      : null

    // Calculate discount
    let discountAmount = 0
    if (data.discountType === 'PERCENTAGE' && data.discountAmount > 0) {
      discountAmount = Math.round(subtotal * (data.discountAmount / 100))
    } else if (data.discountType === 'FIXED') {
      discountAmount = Math.min(data.discountAmount, subtotal)
    }
    // In Colombia, prices are tax-inclusive so total = subtotal - discount + tip
    // (tax is already embedded in subtotal/item prices)
    const total = subtotal - discountAmount + tipAmount

    // Tip is only allowed for non-credit orders
    if (tipAmount > 0 && (data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO')) {
      return NextResponse.json(
        { error: 'No se puede agregar propina a una venta fiada' },
        { status: 400 },
      )
    }

    const orderNumber = generateOrderNumber()

    // ─── Cash register validation: MUST have an open shift ──────────
    let targetCashRegisterId = data.cashRegisterId ?? null
    if (!targetCashRegisterId) {
      const openShift = await db.cashRegister.findFirst({
        where: { storeId: data.storeId, status: 'OPEN' },
        select: { id: true },
      })
      targetCashRegisterId = openShift?.id ?? null
    } else {
      // Verify the specified cash register exists and is open
      const shiftExists = await db.cashRegister.findFirst({
        where: { id: targetCashRegisterId, storeId: data.storeId, status: 'OPEN' },
        select: { id: true },
      })
      if (!shiftExists) {
        targetCashRegisterId = null
      }
    }

    // BLOCK sale if no cash register is open
    if (!targetCashRegisterId) {
      return NextResponse.json(
        { error: 'Debes abrir la caja antes de registrar una venta. Ve a Contabilidad → Caja y abre un turno.' },
        { status: 400 },
      )
    }

    // Create order, inventory movements, and journal entries in a transaction
    const order = await db.$transaction(async (tx) => {
      // 1. Create the order
      const createdOrder = await tx.order.create({
        data: {
          storeId: data.storeId,
          customerId: data.customerId ?? null,
          cashRegisterId: targetCashRegisterId,
          orderNumber,
          subtotal,
          taxAmount: orderTaxAmount,
          taxBreakdown: taxBreakdownJson,
          tipAmount,
          discountAmount,
          discountType: data.discountType,
          discountReason: data.discountReason ?? null,
          total,
          status: (data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO') ? 'CREDIT' : 'COMPLETED',
          paymentMethod: data.paymentMethod,
          notes: data.notes ?? null,
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

      // 2. Create inventory movements and decrement stock (only for product items)
      for (const item of productItems) {
        // Re-validate stock inside transaction to prevent race condition
        const freshProduct = await tx.product.findUnique({
          where: { id: item.productId },
          select: { currentStock: true, name: true },
        })
        if (!freshProduct || freshProduct.currentStock < item.quantity) {
          throw new Error(`Stock insuficiente para "${freshProduct?.name || 'Producto'}" (disponible: ${freshProduct?.currentStock || 0}). Intenta de nuevo.`)
        }

        await tx.inventoryMovement.create({
          data: {
            storeId: data.storeId,
            productId: item.productId,
            quantity: -item.quantity, // negative for sale
            movementType: 'SALE',
            referenceId: createdOrder.id,
            notes: `Venta ${orderNumber}`,
          },
        })
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: item.quantity } },
        })
      }

      // 2b. Create ServiceTransactions for service items
      for (const item of serviceItems) {
        await tx.serviceTransaction.create({
          data: {
            storeId: data.storeId,
            serviceId: item.serviceId,
            quantity: item.quantity,
            unitPrice: serviceMap.get(item.serviceId!)!.price,
            totalAmount: serviceMap.get(item.serviceId!)!.price * item.quantity,
            notes: `Venta ${orderNumber}`,
            status: 'COMPLETED',
          },
        })
      }

      // 3. Create journal entries (double-entry accounting)
      if (data.paymentMethod !== 'CREDIT' && data.paymentMethod !== 'FIADO') {
        // Find or use default asset account (Caja) and income account (Ventas)
        const cajaAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, type: 'ASSET', isDefault: true },
        })
        const ventasAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, type: 'INCOME' },
        })

        // DEBIT Caja for full total (subtotal + tip)
        if (cajaAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: cajaAccount.id,
              amount: total,
              direction: 'DEBIT',
              description: `Venta ${orderNumber}${tipAmount > 0 ? ` + Propina $${tipAmount.toLocaleString()}` : ''}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
        // CREDIT Ventas for subtotal (product/service value)
        if (ventasAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: ventasAccount.id,
              amount: subtotal,
              direction: 'CREDIT',
              description: `Venta ${orderNumber}`,
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
                description: `Propina venta ${orderNumber}`,
                referenceType: 'ORDER',
                referenceId: createdOrder.id,
              },
            })
          }
        }
      }

      // 4. Update customer debt if CREDIT/FIADO payment
      if ((data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO') && data.customerId) {
        await tx.customer.update({
          where: { id: data.customerId },
          data: { totalDebt: { increment: total } },
        })
        // Also create accounts receivable journal entry
        const cuentasPorCobrar = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, name: { contains: 'Cuentas por Cobrar' } },
        })
        const ventasAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, type: 'INCOME' },
        })
        if (cuentasPorCobrar) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: cuentasPorCobrar.id,
              amount: total,
              direction: 'DEBIT',
              description: `Venta fiada ${orderNumber}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
        if (ventasAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: ventasAccount.id,
              amount: subtotal,
              direction: 'CREDIT',
              description: `Venta fiada ${orderNumber}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
      }

      return createdOrder
    })

    return NextResponse.json(
      {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        subtotal: Number(order.subtotal),
        taxAmount: Number(order.taxAmount ?? 0),
        taxBreakdown: order.taxBreakdown ? JSON.parse(order.taxBreakdown) : null,
        tipAmount: Number(order.tipAmount ?? 0),
        discountAmount: Number(order.discountAmount ?? 0),
        discountType: order.discountType,
        total: Number(order.total),
        paymentMethod: order.paymentMethod,
        customer: order.customer,
        cashRegisterId: targetCashRegisterId,
        createdAt: order.createdAt.toISOString(),
        orderItems: order.orderItems.map((item) => ({
          id: item.id,
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
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/orders error:', error)
    return NextResponse.json({ error: 'Error interno al crear la orden' }, { status: 500 })
  }
}

// ─── GET: List orders ───────────────────────────────────────────────

// GET /api/orders?storeId=X&status=Y&from=DATE&to=DATE&q=ORDER_NUMBER&customerId=Z
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))
    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const q = searchParams.get('q')?.trim()
    const customerId = searchParams.get('customerId')
    const expand = searchParams.get('expand')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))
    const skip = (page - 1) * limit

    if (!storeId) {
      return NextResponse.json({ error: 'storeId requerido' }, { status: 400 })
    }

    const where: Record<string, unknown> = { storeId }

    if (status && status !== 'ALL') {
      where.status = status
    }

    if (customerId) {
      where.customerId = Number(customerId)
    }

    if (from || to) {
      where.createdAt = {}
      if (from) {
        where.createdAt.gte = new Date(from)
      }
      if (to) {
        // End of day
        const endDate = new Date(to)
        endDate.setHours(23, 59, 59, 999)
        where.createdAt.lte = endDate
      }
    }

    if (q) {
      where.orderNumber = { contains: q }
    }

    const includeItems = expand === 'items'

    const [total, orders] = await Promise.all([
      db.order.count({ where }),
      db.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        total: true,
        createdAt: true,
        tableSessionId: true,
        customer: {
          select: {
            name: true,
          },
        },
        tableSession: {
          select: {
            barTable: {
              select: { number: true, name: true },
            },
          },
        },
        ...(includeItems ? {
          orderItems: {
            select: {
              quantity: true,
              totalRow: true,
              product: { select: { name: true } },
              service: { select: { name: true } },
            },
          },
        } : {}),
      },
    }),
    ])

    const result = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name ?? null,
      status: order.status,
      paymentMethod: order.paymentMethod,
      total: Number(order.total),
      createdAt: order.createdAt.toISOString(),
      tableSessionId: order.tableSessionId ?? null,
      tableName: order.tableSession?.barTable ? `Mesa ${order.tableSession.barTable.number}` : null,
      ...(includeItems ? {
        orderItems: (order.orderItems || []).map((item) => ({
          productName: item.product?.name ?? item.service?.name ?? 'Eliminado',
          quantity: item.quantity,
          totalRow: Number(item.totalRow),
        })),
      } : {}),
    }))

    return NextResponse.json({
      data: result,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error('GET /api/orders error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
