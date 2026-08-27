import { getAuthUser, requireStoreAccess } from '@/lib/api-auth'
import { auditLogFromRequest } from '@/lib/audit-logger'
import { generateOrderNumber } from '@/lib/auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { add, lt, mul, toNum } from '@/lib/stock-math'
import { isSubscriptionActive } from '@/lib/subscription-helpers'
import { calcLineTax, buildTaxBreakdown, prorateDiscountOverTax, resolveDiscount, type TaxRateInfo } from '@/domain/sales/tax-calculator'
import { reserveStockAtomically } from '@/lib/atomic-stock'
import { reserveStock } from '@/domain/inventory/stock-reserver'
import { validateOrder } from '@/domain/sales/order-aggregate'
import { publishDomainEvent, type OrderCompletedPayload } from '@/domain/shared/domain-events'
import '@/domain/accounting/journaling-on-order-completed'
import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── Shared order include + response shape ─────────────────────────────
// Usado tanto por el path de creación como por el replay idempotente, para que
// el cliente reciba un body idéntico tanto si la orden se acaba de crear como
// si se recupera de un intento previo cuya respuesta se perdió.
const orderInclude = {
  customer: { select: { id: true, name: true } },
  orderItems: {
    include: {
      product: { select: { name: true } },
      service: { select: { name: true } },
    },
  },
} satisfies Prisma.OrderInclude

type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>

function buildOrderResponse(order: OrderWithItems, cashRegisterId: number | null) {
  return {
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
    cashRegisterId,
    createdAt: order.createdAt.toISOString(),
    orderItems: order.orderItems.map((item) => ({
      id: item.id,
      productName: item.product?.name ?? item.service?.name ?? 'Eliminado',
      presentationName: item.presentationName ?? null,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalRow: Number(item.totalRow),
      taxCode: item.taxCode,
      taxRate: item.taxRate,
      taxAmount: Number(item.taxAmount),
      taxBase: Number(item.taxBase),
      isService: !!item.serviceId,
    })),
  }
}

// ─── POST: Create order ─────────────────────────────────────────────

const orderItemSchema = z.object({
  productId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive().optional(),
  // Extra presentation of the product (e.g. Six-pack, Caja x24). Omit for
  // the product's own "Unidad" (base) presentation.
  presentationId: z.number().int().positive().optional(),
  quantity: z.number().min(0.001),
  notes: z.string().max(200).optional(),
}).refine((d) => d.productId || d.serviceId, {
  message: 'Debe especificar productId o serviceId',
}).refine((d) => !(d.productId && d.serviceId), {
  message: 'Solo puede especificar productId o serviceId, no ambos',
}).refine((d) => !d.presentationId || d.productId, {
  message: 'presentationId solo aplica a productos',
})

const createOrderSchema = z.object({
  storeId: z.number().int().positive(),
  customerId: z.number().int().positive().nullable().optional(),
  cashRegisterId: z.number().int().positive().optional(),
  paymentMethod: z.enum(['CASH', 'DAVIPLATA', 'NEQUI', 'CARD', 'TRANSFER', 'MIXED', 'CREDIT', 'FIADO', 'WOMPI_PENDING']),
  // Split-tender: multiple payment methods for a single sale (paymentMethod='MIXED')
  paymentSplits: z.array(
    z.object({
      method: z.enum(['CASH', 'DAVIPLATA', 'NEQUI', 'CARD', 'TRANSFER', 'WOMPI']),
      amount: z.number().int().positive(),
      reference: z.string().max(100).optional(),
    })
  ).optional(),
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
    const auth = getAuthUser(req)

    // ── Idempotency (Kleppmann Ch. 11): si el cliente envía un header
    //    Idempotency-Key, un POST reintentado (p.ej. tras un timeout donde el
    //    servidor sí procesó la venta pero la respuesta se perdió) debe
    //    devolver la orden original en vez de duplicarla. El sync offline envía
    //    el temp order number como key, que es estable entre reintentos.
    const idempotencyKey = req.headers.get('x-idempotency-key')?.trim() || null
    if (idempotencyKey) {
      const existing = await db.processedRequest.findUnique({
        where: { storeId_idempotencyKey: { storeId: data.storeId, idempotencyKey } },
        select: { orderId: true },
      })
      if (existing) {
        const replayed = await db.order.findUnique({
          where: { id: existing.orderId },
          include: orderInclude,
        })
        if (replayed) {
          return NextResponse.json(
            buildOrderResponse(replayed, replayed.cashRegisterId ?? null),
            { status: 200 },
          )
        }
      }
    }

    // ── Subscription gate: block order creation when subscription is expired/cancelled ──
    const subActive = await isSubscriptionActive(data.storeId)
    if (!subActive) {
      return NextResponse.json(
        { error: 'Tu suscripción está vencida. Renueva tu plan para continuar vendiendo.' },
        { status: 403 },
      )
    }

    // Separate product and service items
    const productItems = data.items.filter((i) => i.productId)
    const serviceItems = data.items.filter((i) => i.serviceId)

    // Resolve product info (including tax rate)
    const productMap = new Map<number, { id: number; name: string; salePrice: number; currentStock: Prisma.Decimal; trackInventory: boolean; taxRate: { id: number; code: string; rate: number; rateType: string; applyTo: string } | null }>()
    if (productItems.length > 0) {
      const productIds = productItems.map((i) => i.productId!)
      const products = await db.product.findMany({
        where: { id: { in: productIds }, storeId: data.storeId, isActive: true },
        select: { id: true, name: true, salePrice: true, currentStock: true, trackInventory: true, taxRate: { select: { id: true, code: true, rate: true, rateType: true, applyTo: true } } },
      })
      for (const p of products) productMap.set(p.id, p)
    }

    // Resolve presentation info (Six-pack, Caja x24, etc.) — price and stock
    // conversion always come from the DB, never trusted from the client.
    // Tax rate is NOT resolved per-presentation: it's inherited from the
    // parent product (same product, same tax treatment regardless of packaging).
    const presentationMap = new Map<number, { id: number; productId: number; name: string; unitLabel: string; salePrice: number; unitsPerPack: Prisma.Decimal }>()
    const presentationIds = productItems.map((i) => i.presentationId).filter((id): id is number => !!id)
    if (presentationIds.length > 0) {
      const presentations = await db.productPresentation.findMany({
        where: { id: { in: presentationIds }, isActive: true, product: { storeId: data.storeId } },
        select: { id: true, productId: true, name: true, unitLabel: true, salePrice: true, unitsPerPack: true },
      })
      for (const p of presentations) presentationMap.set(p.id, p)
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

    // Validate all items exist, and that any requested presentation is real,
    // active, and actually belongs to the product it's being sold under.
    for (const item of productItems) {
      const product = productMap.get(item.productId!)
      if (!product) {
        return NextResponse.json(
          { error: `Producto con ID ${item.productId} no encontrado o inactivo` },
          { status: 400 },
        )
      }
      if (item.presentationId) {
        const presentation = presentationMap.get(item.presentationId)
        if (!presentation || presentation.productId !== item.productId) {
          return NextResponse.json(
            { error: `La presentación seleccionada para "${product.name}" ya no existe o fue desactivada` },
            { status: 400 },
          )
        }
      }
    }

    // Stock check in base units, combined across all lines of the same
    // product — a product's stock is a single shared pool, so e.g. "1
    // Six-pack + 2 unidades sueltas" of the same product must be checked
    // together (6 + 2 = 8 base units), not as two independent lines.
    const baseUnitsByProduct = new Map<number, Prisma.Decimal>()
    for (const item of productItems) {
      const unitsPerPack = item.presentationId ? presentationMap.get(item.presentationId)!.unitsPerPack : 1
      baseUnitsByProduct.set(item.productId!, add(baseUnitsByProduct.get(item.productId!) ?? 0, mul(item.quantity, unitsPerPack)))
    }
    for (const [productId, baseUnits] of baseUnitsByProduct) {
      const product = productMap.get(productId)!
      if (product.trackInventory === false) continue // no stock control — always sellable
      if (lt(product.currentStock, baseUnits)) {
        return NextResponse.json(
          { error: `Stock insuficiente para "${product.name}" (disponible: ${toNum(product.currentStock)} unidades)` },
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

    // Tax calculation delegated to the Sales domain service (TaxCalculator).
    // See src/domain/sales/tax-calculator.ts — single source of truth for
    // Colombian tax-inclusive pricing (previously duplicated across routes).

    // Tax breakdown accumulator: grouped by tax code
    const taxBreakdownMap: Record<string, { code: string; name: string; base: number; rate: number; amount: number }> = {}

    // Calculate totals and build order item data (with tax info)
    let orderTaxAmount = 0
    const orderItemsData = data.items.map((item) => {
      if (item.productId) {
        const product = productMap.get(item.productId)!
        const presentation = item.presentationId ? presentationMap.get(item.presentationId) : undefined
        const unitPrice = presentation ? presentation.salePrice : product.salePrice
        const unitsPerPack = presentation ? presentation.unitsPerPack : 1
        // Redondear a COP entero: quantity puede ser decimal (0.333 KG × $10,000 = 3330.0000000000005)
        // y totalRow es Int en el schema (Postgres rechaza floats en INTEGER)
        const totalRow = Math.round(unitPrice * item.quantity)
        // Determine tax rate: product's own rate > store default > none
        // (presentations don't carry their own tax rate — same product, same tax treatment)
        const effectiveTax = product.taxRate
          ? { code: product.taxRate.code, rate: product.taxRate.rate, rateType: product.taxRate.rateType }
          : defaultTaxRate
            ? { code: defaultTaxRate.code, rate: defaultTaxRate.rate, rateType: defaultTaxRate.rateType }
            : null
        const tax = calcLineTax(totalRow, effectiveTax as TaxRateInfo | null)
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
      } else {
        const service = serviceMap.get(item.serviceId!)!
        const totalRow = Math.round(service.price * item.quantity)
        // Services use fallback service tax rate (store default for services)
        const effectiveTax = fallbackServiceTaxRate
          ? { code: fallbackServiceTaxRate.code, rate: fallbackServiceTaxRate.rate, rateType: fallbackServiceTaxRate.rateType }
          : null
        const tax = calcLineTax(totalRow, effectiveTax as TaxRateInfo | null)
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
      }
    })
    const subtotal = orderItemsData.reduce((sum, i) => sum + i.totalRow, 0)
    const tipAmount = data.tipAmount || 0

    // Calculate discount (before finalizing the tax breakdown — see below).
    // Delegated to the Sales domain service (TaxCalculator.resolveDiscount).
    const discountAmount = resolveDiscount(data.discountType, data.discountAmount, subtotal)

    // A discount reduces what the business actually received, so the IVA base
    // must shrink proportionally too — otherwise the order (and DIAN reporting)
    // declares tax on money that was never collected. totalRow/unitPrice are
    // left untouched (they still represent list price, e.g. for the receipt);
    // only taxBase/taxAmount — the DIAN-facing figures — are discounted.
    // Delegated to TaxCalculator.prorateDiscountOverTax (single source of truth).
    if (discountAmount > 0 && subtotal > 0) {
      const { lines: adjusted, totalTax } = prorateDiscountOverTax(orderItemsData, discountAmount, subtotal)
      // Reflect the prorated figures back onto the line objects the loop built.
      for (let i = 0; i < orderItemsData.length; i++) {
        orderItemsData[i].taxBase = adjusted[i].taxBase
        orderItemsData[i].taxAmount = adjusted[i].taxAmount
      }
      // Rebuild breakdown from the prorated lines via the domain service.
      for (const key of Object.keys(taxBreakdownMap)) delete taxBreakdownMap[key]
      for (const entry of buildTaxBreakdown(orderItemsData)) {
        taxBreakdownMap[entry.code] = { code: entry.code, name: entry.name, base: entry.base, rate: entry.rate, amount: entry.amount }
      }
      orderTaxAmount = totalTax
    }

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

    // In Colombia, prices are tax-inclusive so total = subtotal - discount + tip
    // (tax is already embedded in subtotal/item prices)
    const total = subtotal - discountAmount + tipAmount

    // ── Agregado Order (DDD): validar invariantes de la raíz ANTES de abrir tx ──
    // I1–I7: ítems no vacíos, producto XOR servicio, cantidades > 0, sin líneas
    // duplicadas, subtotal/total derivados y consistentes.
    const orderValidation = validateOrder(orderItemsData as never, {
      subtotal,
      taxAmount: orderTaxAmount,
      discountAmount,
      tipAmount,
      total,
    })
    if (!orderValidation.ok) {
      return NextResponse.json(
        { error: orderValidation.message },
        { status: 400 },
      )
    }

    // Tip is only allowed for non-credit orders
    if (tipAmount > 0 && (data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO')) {
      return NextResponse.json(
        { error: 'No se puede agregar propina a una venta fiada' },
        { status: 400 },
      )
    }

    // Validate CREDIT/FIADO requires customer
    if ((data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO') && !data.customerId) {
      return NextResponse.json(
        { error: 'Las ventas fiadas requieren un cliente asociado' },
        { status: 400 }
      )
    }

    const orderNumber = generateOrderNumber()

    // ── IDOR check: verify customer belongs to this store before creating credit order ──
    if (data.customerId) {
      const customerBelongsToStore = await db.customer.findFirst({
        where: { id: data.customerId, storeId: data.storeId },
      })
      if (!customerBelongsToStore) {
        return NextResponse.json({ error: 'Cliente no encontrado en esta tienda' }, { status: 400 })
      }
    }

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

    // Create order, inventory movements, and journal entries in a transaction.
    // Envuelto en try/catch para manejar la violación de unique constraint
    // (P2002) que lanza un POST reintentado concurrente sobre ProcessedRequest:
    // en ese caso se hace replay de la orden ya creada en vez de devolver 500.
    let order: OrderWithItems
    try {
      order = await db.$transaction(async (tx) => {
      // 1. Create the order
      const createdOrder = await tx.order.create({
        data: {
          storeId: data.storeId,
          customerId: data.customerId ?? null,
          cashRegisterId: targetCashRegisterId,
          soldByEmployeeId: auth?.employeeId ?? null,
          orderNumber,
          subtotal,
          taxAmount: orderTaxAmount,
          taxBreakdown: taxBreakdownJson,
          tipAmount,
          discountAmount,
          discountType: data.discountType,
          discountReason: data.discountReason ?? null,
          total,
          status: (data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO')
            ? 'CREDIT'
            : data.paymentMethod === 'WOMPI_PENDING'
              ? 'PENDING_PAYMENT'
              : 'COMPLETED',
          paymentMethod: data.paymentMethod,
          paymentSplits: data.paymentSplits?.length ? JSON.stringify(data.paymentSplits) : null,
          notes: data.notes ?? null,
          orderItems: { create: orderItemsData },
        },
        include: orderInclude,
      })

      // 1b. Registra la idempotency key atómicamente con la orden, de modo que
      //     un POST reintentado concurrente (race) choque con el constraint
      //     único (P2002) y se haga replay en vez de duplicar la venta.
      if (idempotencyKey) {
        await tx.processedRequest.create({
          data: { storeId: data.storeId, idempotencyKey, orderId: createdOrder.id },
        })
      }

      // 2. Create inventory movements and decrement stock (only for product items)
      //    Deducted — and re-validated — in base units: a presentation line
      //    (e.g. 1 Six-pack) removes unitsPerPack base units from the single
      //    shared stock pool, not 1.
      for (const item of productItems) {
        const presentation = item.presentationId ? presentationMap.get(item.presentationId) : undefined
        const unitsPerPack = presentation ? presentation.unitsPerPack : 1
        const baseUnits = mul(item.quantity, unitsPerPack)

        // StockReserver (Shared Kernel Sales→Inventory): descuento atómico
        // + trazabilidad FEFO en un solo contrato. Read-your-writes dentro
        // de la misma tx maneja múltiples líneas del mismo producto.
        const reservation = await reserveStock(tx, data.storeId, item.productId!, toNum(baseUnits))
        if (!reservation.success && !reservation.notTracked) {
          throw new Error(
            reservation.availableStock !== undefined
              ? `Stock insuficiente para "${reservation.productName}" (disponible: ${reservation.availableStock}). Intenta de nuevo.`
              : `Producto no encontrado. Intenta de nuevo.`,
          )
        }

        if (reservation.uncovered > 0) {
          logger.warn('[orders] stock sin lote asignado (legacy)', {
            storeId: data.storeId,
            productId: item.productId,
            orderId: createdOrder.id,
            uncovered: reservation.uncovered,
          })
        }

        await tx.inventoryMovement.create({
          data: {
            storeId: data.storeId,
            productId: item.productId,
            presentationId: presentation ? presentation.id : null,
            presentationName: presentation ? presentation.name : null,
            unitsPerPack,
            quantity: baseUnits.negated(), // negative for sale, always in base units
            movementType: 'SALE',
            referenceId: createdOrder.id,
            // Lote consumido solo si la venta salió de un único lote;
            // multi-lote queda trazado en los Batch mismos.
            batchId:
              reservation.consumptions.length === 1 ? reservation.consumptions[0].batchId : null,
            notes: presentation
              ? `Venta ${orderNumber} — ${presentation.name} x${item.quantity} (${toNum(baseUnits)} uds base)`
              : `Venta ${orderNumber}`,
          },
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

      // 3. Asientos contables vía Domain Event (Accounting se suscribe a
      //    Sales.OrderCompleted — la ruta no conoce cuentas ni partida doble).
      await publishDomainEvent<OrderCompletedPayload>('OrderCompleted', tx, {
        storeId: data.storeId,
        orderId: createdOrder.id,
        orderNumber,
        paymentMethod: data.paymentMethod,
        paymentSplits: data.paymentSplits,
        subtotal,
        discountAmount,
        tipAmount,
        total,
        customerId: data.customerId ?? null,
      })


      // 4. Update customer debt if CREDIT/FIADO payment
      if ((data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO') && data.customerId) {
        // Stamp debtSince only when debt starts accruing from $0 (Índice de Morosidad aging proxy)
        const debtCustomer = await tx.customer.findUnique({
          where: { id: data.customerId },
          select: { totalDebt: true },
        })
        await tx.customer.update({
          where: { id: data.customerId },
          data: {
            totalDebt: { increment: total },
            ...(debtCustomer && debtCustomer.totalDebt <= 0 ? { debtSince: new Date() } : {}),
          },
        })
        // Asientos de la venta fiada (CxC/Ventas/Descuentos) los escribe el
        // handler JournalingOnOrderCompleted vía OrderCompleted (ver arriba).
      }

      return createdOrder
    })
    } catch (error) {
      // P2002 sobre processed_requests(store_id, idempotency_key) => un retry
      // concurrente ya persistió esta venta. Refetch y replay de la misma orden.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        idempotencyKey
      ) {
        const existing = await db.processedRequest.findUnique({
          where: { storeId_idempotencyKey: { storeId: data.storeId, idempotencyKey } },
          select: { orderId: true },
        })
        if (existing) {
          const replayed = await db.order.findUnique({
            where: { id: existing.orderId },
            include: orderInclude,
          })
          if (replayed) {
            return NextResponse.json(
              buildOrderResponse(replayed, replayed.cashRegisterId ?? null),
              { status: 200 },
            )
          }
        }
      }
      throw error
    }

    // Audit: order created
    auditLogFromRequest(req, {
      storeId: data.storeId,
      action: 'CREATE',
      entity: 'Order',
      entityId: order.id,
      newValue: { orderNumber: order.orderNumber, total: order.total, paymentMethod: order.paymentMethod, discountType: order.discountType, discountAmount: order.discountAmount },
      metadata: { itemcount: data.items.length },
    }).catch(() => {})

    return NextResponse.json(
      buildOrderResponse(order, targetCashRegisterId),
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

    // Auth: verify user has access to this store
    const storeAccessError = requireStoreAccess(request, storeId)
    if (storeAccessError) return storeAccessError

    const where: Record<string, unknown> = { storeId }

    if (status && status !== 'ALL') {
      where.status = status
    }

    if (customerId) {
      where.customerId = Number(customerId)
    }

    if (from || to) {
      const dateFilter: Record<string, Date> = {}
      if (from) {
        dateFilter.gte = new Date(from)
      }
      if (to) {
        // End of day
        const endDate = new Date(to)
        endDate.setHours(23, 59, 59, 999)
        dateFilter.lte = endDate
      }
      where.createdAt = dateFilter
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
              presentationName: true,
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
          presentationName: item.presentationName ?? null,
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
