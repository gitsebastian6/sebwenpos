// ============================================================
// SEBWEN POS — Order Factory (creación de una venta real)
// ──────────────────────────────────────────────────────────
// Núcleo extraído de POST /api/orders para que también lo use la aceptación
// de un pedido de la tienda virtual (src/app/api/online-orders/[id]).
//
// Responsabilidades:
//   - resolver productos / presentaciones / servicios desde la BD (nunca
//     confía en precios del cliente)
//   - chequeo de stock en unidades base (pool compartido por producto)
//   - cálculo de impuestos (TaxCalculator) + prorrateo de descuento
//   - validar invariantes del agregado Order
//   - transacción: Order + InventoryMovement + ServiceTransaction +
//     OrderCompleted (asientos contables) + deuda del cliente + idempotencia
//
// NO conoce HTTP. Devuelve un resultado discriminado; el caller traduce a
// NextResponse. La verificación de suscripción y de acceso a la tienda se
// quedan en el caller.
// ============================================================

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { generateOrderNumber } from '@/lib/auth'
import { add, lt, mul, toNum } from '@/lib/stock-math'
import {
  calcLineTax,
  buildTaxBreakdown,
  prorateDiscountOverTax,
  resolveDiscount,
  type TaxRateInfo,
} from '@/domain/sales/tax-calculator'
import { reserveStock } from '@/domain/inventory/stock-reserver'
import { validateOrder } from '@/domain/sales/order-aggregate'
import { publishDomainEvent, type OrderCompletedPayload } from '@/domain/shared/domain-events'
import '@/domain/accounting/journaling-on-order-completed'
import { Prisma } from '@prisma/client'

export const orderInclude = {
  customer: { select: { id: true, name: true } },
  orderItems: {
    include: {
      product: { select: { name: true } },
      service: { select: { name: true } },
    },
  },
} satisfies Prisma.OrderInclude

export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>

export type PaymentMethod =
  | 'CASH' | 'DAVIPLATA' | 'NEQUI' | 'CARD' | 'TRANSFER' | 'MIXED' | 'CREDIT' | 'FIADO' | 'WOMPI_PENDING'

export interface OrderFactoryItem {
  productId?: number
  serviceId?: number
  presentationId?: number
  quantity: number
  notes?: string
}

export interface CreateOrderInput {
  storeId: number
  customerId?: number | null
  /** Si se omite, se busca el turno OPEN de la tienda; si no hay, se rechaza. */
  cashRegisterId?: number | null
  soldByEmployeeId?: number | null
  paymentMethod: PaymentMethod
  paymentSplits?: { method: string; amount: number; reference?: string }[]
  tipAmount?: number
  discountType?: 'NONE' | 'PERCENTAGE' | 'FIXED'
  discountAmount?: number
  discountReason?: string
  notes?: string | null
  items: OrderFactoryItem[]
  // ── Contexto de entrega (pedidos de la tienda virtual) ──
  fulfillmentType?: 'IN_STORE' | 'DELIVERY' | 'PICKUP'
  deliveryFee?: number
  deliveryAddress?: string | null
  placedAt?: Date | null
  // ── Idempotencia opcional (header Idempotency-Key en el path HTTP) ──
  idempotencyKey?: string | null
}

// Resultado plano (el repo corre con strictNullChecks:false, donde las uniones
// discriminadas por booleano literal no estrechan bien — ver order-aggregate).
export interface CreateOrderResult {
  ok: boolean
  /** En éxito: 200 si fue replay idempotente, 201 si se creó. En error: código HTTP. */
  status: number
  error?: string
  order?: OrderWithItems
  cashRegisterId?: number
  replayed?: boolean
}

// Replay de una orden ya persistida bajo una idempotency key.
export async function findOrderByIdempotencyKey(storeId: number, key: string): Promise<OrderWithItems | null> {
  return replayByIdempotencyKey(storeId, key)
}

async function replayByIdempotencyKey(storeId: number, key: string): Promise<OrderWithItems | null> {
  const existing = await db.processedRequest.findUnique({
    where: { storeId_idempotencyKey: { storeId, idempotencyKey: key } },
    select: { orderId: true },
  })
  if (!existing) return null
  return db.order.findUnique({ where: { id: existing.orderId }, include: orderInclude })
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const {
    storeId,
    customerId = null,
    soldByEmployeeId = null,
    paymentMethod,
    paymentSplits,
    tipAmount: rawTip = 0,
    discountType = 'NONE',
    discountAmount: rawDiscount = 0,
    discountReason,
    notes = null,
    items,
    fulfillmentType = 'IN_STORE',
    deliveryFee = 0,
    deliveryAddress = null,
    placedAt = null,
    idempotencyKey = null,
  } = input

  // ── Idempotency replay (Kleppmann Ch. 11) ──
  if (idempotencyKey) {
    const replayed = await replayByIdempotencyKey(storeId, idempotencyKey)
    if (replayed) {
      return { ok: true, status: 200, order: replayed, cashRegisterId: replayed.cashRegisterId ?? 0, replayed: true }
    }
  }

  const productItems = items.filter((i) => i.productId)
  const serviceItems = items.filter((i) => i.serviceId)

  // ── Resolver productos (incluye tasa de impuesto) ──
  const productMap = new Map<number, { id: number; name: string; salePrice: number; currentStock: Prisma.Decimal; trackInventory: boolean; taxRate: { id: number; code: string; rate: number; rateType: string; applyTo: string } | null }>()
  if (productItems.length > 0) {
    const productIds = productItems.map((i) => i.productId!)
    const products = await db.product.findMany({
      where: { id: { in: productIds }, storeId, isActive: true },
      select: { id: true, name: true, salePrice: true, currentStock: true, trackInventory: true, taxRate: { select: { id: true, code: true, rate: true, rateType: true, applyTo: true } } },
    })
    for (const p of products) productMap.set(p.id, p)
  }

  // ── Resolver presentaciones (precio y conversión de stock SIEMPRE desde BD) ──
  const presentationMap = new Map<number, { id: number; productId: number; name: string; unitLabel: string; salePrice: number; unitsPerPack: Prisma.Decimal }>()
  const presentationIds = productItems.map((i) => i.presentationId).filter((id): id is number => !!id)
  if (presentationIds.length > 0) {
    const presentations = await db.productPresentation.findMany({
      where: { id: { in: presentationIds }, isActive: true, product: { storeId } },
      select: { id: true, productId: true, name: true, unitLabel: true, salePrice: true, unitsPerPack: true },
    })
    for (const p of presentations) presentationMap.set(p.id, p)
  }

  // Tasa por defecto de la tienda (para productos/servicios sin tasa propia)
  const defaultTaxRate = await db.taxRate.findFirst({
    where: { storeId, isDefault: true, category: 'SALES_TAX', isActive: true },
  })
  const defaultServiceTaxRate = await db.taxRate.findFirst({
    where: { storeId, isDefault: true, category: 'SALES_TAX', isActive: true, applyTo: { in: ['SERVICE', 'BOTH'] } },
  })
  const fallbackServiceTaxRate = defaultServiceTaxRate ?? defaultTaxRate

  // ── Resolver servicios ──
  const serviceMap = new Map<number, { id: number; name: string; price: number }>()
  if (serviceItems.length > 0) {
    const serviceIds = serviceItems.map((i) => i.serviceId!)
    const services = await db.service.findMany({
      where: { id: { in: serviceIds }, storeId, isActive: true },
      select: { id: true, name: true, price: true },
    })
    for (const s of services) serviceMap.set(s.id, s)
  }

  // Validar existencia y que la presentación pertenezca a su producto
  for (const item of productItems) {
    const product = productMap.get(item.productId!)
    if (!product) {
      return { ok: false, status: 400, error: `Producto con ID ${item.productId} no encontrado o inactivo` }
    }
    if (item.presentationId) {
      const presentation = presentationMap.get(item.presentationId)
      if (!presentation || presentation.productId !== item.productId) {
        return { ok: false, status: 400, error: `La presentación seleccionada para "${product.name}" ya no existe o fue desactivada` }
      }
    }
  }

  // Stock check en unidades base, combinado por producto (pool compartido)
  const baseUnitsByProduct = new Map<number, Prisma.Decimal>()
  for (const item of productItems) {
    const unitsPerPack = item.presentationId ? presentationMap.get(item.presentationId)!.unitsPerPack : 1
    baseUnitsByProduct.set(item.productId!, add(baseUnitsByProduct.get(item.productId!) ?? 0, mul(item.quantity, unitsPerPack)))
  }
  for (const [productId, baseUnits] of baseUnitsByProduct) {
    const product = productMap.get(productId)!
    if (product.trackInventory === false) continue
    if (lt(product.currentStock, baseUnits)) {
      return { ok: false, status: 400, error: `Stock insuficiente para "${product.name}" (disponible: ${toNum(product.currentStock)} unidades)` }
    }
  }

  for (const item of serviceItems) {
    if (!serviceMap.get(item.serviceId!)) {
      return { ok: false, status: 400, error: `Servicio con ID ${item.serviceId} no encontrado o inactivo` }
    }
  }

  // ── Cálculo de impuestos + líneas ──
  const taxBreakdownMap: Record<string, { code: string; name: string; base: number; rate: number; amount: number }> = {}
  let orderTaxAmount = 0
  const orderItemsData = items.map((item) => {
    if (item.productId) {
      const product = productMap.get(item.productId)!
      const presentation = item.presentationId ? presentationMap.get(item.presentationId) : undefined
      const unitPrice = presentation ? presentation.salePrice : product.salePrice
      const unitsPerPack = presentation ? presentation.unitsPerPack : 1
      const totalRow = Math.round(unitPrice * item.quantity)
      const effectiveTax = product.taxRate
        ? { code: product.taxRate.code, rate: product.taxRate.rate, rateType: product.taxRate.rateType }
        : defaultTaxRate
          ? { code: defaultTaxRate.code, rate: defaultTaxRate.rate, rateType: defaultTaxRate.rateType }
          : null
      const tax = calcLineTax(totalRow, effectiveTax as TaxRateInfo | null)
      if (tax.taxCode) {
        const key = tax.taxCode
        if (!taxBreakdownMap[key]) taxBreakdownMap[key] = { code: key, name: key, base: 0, rate: tax.taxRate, amount: 0 }
        taxBreakdownMap[key].base += tax.taxBase
        taxBreakdownMap[key].amount += tax.taxAmount
      }
      orderTaxAmount += tax.taxAmount
      return {
        productId: item.productId,
        serviceId: null as number | null,
        presentationId: presentation ? presentation.id : null as number | null,
        presentationName: presentation ? presentation.name : null as string | null,
        unitsPerPack,
        quantity: item.quantity,
        unitPrice,
        totalRow,
        taxCode: tax.taxCode,
        taxRate: tax.taxRate,
        taxAmount: tax.taxAmount,
        taxBase: tax.taxBase,
        notes: item.notes || null as string | null,
      }
    }
    const service = serviceMap.get(item.serviceId!)!
    const totalRow = Math.round(service.price * item.quantity)
    const effectiveTax = fallbackServiceTaxRate
      ? { code: fallbackServiceTaxRate.code, rate: fallbackServiceTaxRate.rate, rateType: fallbackServiceTaxRate.rateType }
      : null
    const tax = calcLineTax(totalRow, effectiveTax as TaxRateInfo | null)
    if (tax.taxCode) {
      const key = tax.taxCode
      if (!taxBreakdownMap[key]) taxBreakdownMap[key] = { code: key, name: key, base: 0, rate: tax.taxRate, amount: 0 }
      taxBreakdownMap[key].base += tax.taxBase
      taxBreakdownMap[key].amount += tax.taxAmount
    }
    orderTaxAmount += tax.taxAmount
    return {
      productId: null as number | null,
      serviceId: item.serviceId!,
      presentationId: null as number | null,
      presentationName: null as string | null,
      unitsPerPack: 1,
      quantity: item.quantity,
      unitPrice: service.price,
      totalRow,
      taxCode: tax.taxCode,
      taxRate: tax.taxRate,
      taxAmount: tax.taxAmount,
      taxBase: tax.taxBase,
      notes: item.notes || null as string | null,
    }
  })

  const subtotal = orderItemsData.reduce((sum, i) => sum + i.totalRow, 0)
  const tipAmount = rawTip || 0
  const discountAmount = resolveDiscount(discountType, rawDiscount, subtotal)

  if (discountAmount > 0 && subtotal > 0) {
    const { lines: adjusted, totalTax } = prorateDiscountOverTax(orderItemsData, discountAmount, subtotal)
    for (let i = 0; i < orderItemsData.length; i++) {
      orderItemsData[i].taxBase = adjusted[i].taxBase
      orderItemsData[i].taxAmount = adjusted[i].taxAmount
    }
    for (const key of Object.keys(taxBreakdownMap)) delete taxBreakdownMap[key]
    for (const entry of buildTaxBreakdown(orderItemsData)) {
      taxBreakdownMap[entry.code] = { code: entry.code, name: entry.name, base: entry.base, rate: entry.rate, amount: entry.amount }
    }
    orderTaxAmount = totalTax
  }

  const allTaxRateCodes = new Set<string>(Object.keys(taxBreakdownMap))
  if (allTaxRateCodes.size > 0) {
    const taxRateRecords = await db.taxRate.findMany({
      where: { storeId, code: { in: Array.from(allTaxRateCodes) } },
      select: { code: true, name: true },
    })
    for (const tr of taxRateRecords) {
      if (taxBreakdownMap[tr.code]) taxBreakdownMap[tr.code].name = tr.name
    }
  }

  const taxBreakdownJson = Object.keys(taxBreakdownMap).length > 0
    ? JSON.stringify(Object.values(taxBreakdownMap))
    : null

  const safeDeliveryFee = Math.max(0, Math.round(deliveryFee || 0))
  // Colombia: precios tax-inclusive → total = subtotal − descuento + propina + domicilio
  const total = subtotal - discountAmount + tipAmount + safeDeliveryFee

  // ── Invariantes del agregado (I1–I7) ──
  const orderValidation = validateOrder(orderItemsData as never, {
    subtotal,
    taxAmount: orderTaxAmount,
    discountAmount,
    tipAmount,
    deliveryFee: safeDeliveryFee,
    total,
  })
  if (!orderValidation.ok) {
    return { ok: false, status: 400, error: orderValidation.message }
  }

  const isCredit = paymentMethod === 'CREDIT' || paymentMethod === 'FIADO'

  if (tipAmount > 0 && isCredit) {
    return { ok: false, status: 400, error: 'No se puede agregar propina a una venta fiada' }
  }
  if (isCredit && !customerId) {
    return { ok: false, status: 400, error: 'Las ventas fiadas requieren un cliente asociado' }
  }

  // ── IDOR: el cliente debe pertenecer a la tienda ──
  if (customerId) {
    const belongs = await db.customer.findFirst({ where: { id: customerId, storeId }, select: { id: true } })
    if (!belongs) {
      return { ok: false, status: 400, error: 'Cliente no encontrado en esta tienda' }
    }
  }

  // ── Caja: debe haber un turno OPEN ──
  let targetCashRegisterId = input.cashRegisterId ?? null
  if (targetCashRegisterId) {
    const shift = await db.cashRegister.findFirst({ where: { id: targetCashRegisterId, storeId, status: 'OPEN' }, select: { id: true } })
    if (!shift) targetCashRegisterId = null
  }
  if (!targetCashRegisterId) {
    const openShift = await db.cashRegister.findFirst({ where: { storeId, status: 'OPEN' }, select: { id: true } })
    targetCashRegisterId = openShift?.id ?? null
  }
  if (!targetCashRegisterId) {
    return { ok: false, status: 400, error: 'Debes abrir la caja antes de registrar una venta. Ve a Contabilidad → Caja y abre un turno.' }
  }

  const orderNumber = generateOrderNumber()

  let order: OrderWithItems
  try {
    order = await db.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          storeId,
          customerId: customerId ?? null,
          cashRegisterId: targetCashRegisterId,
          soldByEmployeeId: soldByEmployeeId ?? null,
          orderNumber,
          subtotal,
          taxAmount: orderTaxAmount,
          taxBreakdown: taxBreakdownJson,
          tipAmount,
          discountAmount,
          discountType,
          discountReason: discountReason ?? null,
          total,
          status: isCredit
            ? 'CREDIT'
            : paymentMethod === 'WOMPI_PENDING'
              ? 'PENDING_PAYMENT'
              : 'COMPLETED',
          paymentMethod,
          paymentSplits: paymentSplits?.length ? JSON.stringify(paymentSplits) : null,
          notes: notes ?? null,
          fulfillmentType,
          deliveryFee: safeDeliveryFee,
          deliveryAddress: deliveryAddress ?? null,
          placedAt: placedAt ?? null,
          orderItems: { create: orderItemsData },
        },
        include: orderInclude,
      })

      if (idempotencyKey) {
        await tx.processedRequest.create({
          data: { storeId, idempotencyKey, orderId: createdOrder.id },
        })
      }

      for (const item of productItems) {
        const presentation = item.presentationId ? presentationMap.get(item.presentationId) : undefined
        const unitsPerPack = presentation ? presentation.unitsPerPack : 1
        const baseUnits = mul(item.quantity, unitsPerPack)

        const reservation = await reserveStock(tx, storeId, item.productId!, toNum(baseUnits))
        if (!reservation.success && !reservation.notTracked) {
          throw new Error(
            reservation.availableStock !== undefined
              ? `Stock insuficiente para "${reservation.productName}" (disponible: ${reservation.availableStock}). Intenta de nuevo.`
              : `Producto no encontrado. Intenta de nuevo.`,
          )
        }
        if (reservation.uncovered > 0) {
          logger.warn('[order-factory] stock sin lote asignado (legacy)', {
            storeId, productId: item.productId, orderId: createdOrder.id, uncovered: reservation.uncovered,
          })
        }

        await tx.inventoryMovement.create({
          data: {
            storeId,
            productId: item.productId!, // productItems is filtered on productId
            presentationId: presentation ? presentation.id : null,
            presentationName: presentation ? presentation.name : null,
            unitsPerPack,
            quantity: baseUnits.negated(),
            movementType: 'SALE',
            referenceId: createdOrder.id,
            batchId: reservation.consumptions.length === 1 ? reservation.consumptions[0].batchId : null,
            notes: presentation
              ? `Venta ${orderNumber} — ${presentation.name} x${item.quantity} (${toNum(baseUnits)} uds base)`
              : `Venta ${orderNumber}`,
          },
        })
      }

      for (const item of serviceItems) {
        const svc = serviceMap.get(item.serviceId!)!
        await tx.serviceTransaction.create({
          data: {
            storeId,
            serviceId: item.serviceId!, // serviceItems is filtered on serviceId
            quantity: item.quantity,
            unitPrice: svc.price,
            totalAmount: svc.price * item.quantity,
            notes: `Venta ${orderNumber}`,
            status: 'COMPLETED',
          },
        })
      }

      await publishDomainEvent<OrderCompletedPayload>('OrderCompleted', tx, {
        storeId,
        orderId: createdOrder.id,
        orderNumber,
        paymentMethod,
        paymentSplits,
        subtotal,
        discountAmount,
        tipAmount,
        total,
        customerId: customerId ?? null,
      })

      if (isCredit && customerId) {
        const debtCustomer = await tx.customer.findUnique({ where: { id: customerId }, select: { totalDebt: true } })
        await tx.customer.update({
          where: { id: customerId },
          data: {
            totalDebt: { increment: total },
            ...(debtCustomer && debtCustomer.totalDebt <= 0 ? { debtSince: new Date() } : {}),
          },
        })
      }

      return createdOrder
    }, { timeout: 15000, maxWait: 5000 })
  } catch (error) {
    // P2002 sobre processed_requests(store_id, idempotency_key): un retry
    // concurrente ya persistió esta venta → replay.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && idempotencyKey) {
      const replayed = await replayByIdempotencyKey(storeId, idempotencyKey)
      if (replayed) {
        return { ok: true, status: 200, order: replayed, cashRegisterId: replayed.cashRegisterId ?? 0, replayed: true }
      }
    }
    if (error instanceof Error && /stock insuficiente/i.test(error.message)) {
      return { ok: false, status: 409, error: error.message }
    }
    logger.error('[order-factory] transaction error', error)
    return { ok: false, status: 500, error: 'Error interno al crear la orden' }
  }

  return { ok: true, status: 201, order, cashRegisterId: targetCashRegisterId, replayed: false }
}
