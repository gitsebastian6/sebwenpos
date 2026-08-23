import { requireStoreAccess } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { lt, mul, toNum } from '@/lib/stock-math'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const convertSchema = z.object({
  storeId: z.number().int().positive(),
  paymentMethod: z.enum(['CASH', 'DAVIPLATA', 'NEQUI', 'CARD', 'TRANSFER', 'FIADO']),
})

// ─── POST: Convert quotation to order ─────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const data = convertSchema.parse(body)

    const storeAccessErr = requireStoreAccess(req, data.storeId)
    if (storeAccessErr) return storeAccessErr

    const quotation = await db.quotation.findFirst({
      where: { id: Number(id), storeId: data.storeId },
      include: {
        customer: { select: { id: true, name: true } },
        items: { orderBy: { id: 'asc' } },
      },
    })

    if (!quotation) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    if (quotation.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `Solo se pueden convertir cotizaciones activas. Estado actual: ${quotation.status}` },
        { status: 400 },
      )
    }

    if (!quotation.items || quotation.items.length === 0) {
      return NextResponse.json({ error: 'La cotización no tiene productos' }, { status: 400 })
    }

    // Resolve product info and validate stock
    const productIds = quotation.items.filter((i) => i.productId).map((i) => i.productId!)
    const products = await db.product.findMany({
      where: { id: { in: productIds }, storeId: data.storeId, isActive: true },
      select: { id: true, name: true, salePrice: true, currentStock: true, taxRate: { select: { id: true, code: true, rate: true, rateType: true, applyTo: true } } },
    })
    const productMap = new Map<number, typeof products[0]>()
    for (const p of products) productMap.set(p.id, p)

    // Validate stock — quantity is denominated in whatever presentation was
    // quoted (e.g. "2 Cajas x24"), so it must convert to base units before
    // comparing against currentStock (which is always tracked in base units).
    for (const item of quotation.items) {
      if (item.productId) {
        const product = productMap.get(item.productId)
        if (!product) {
          return NextResponse.json(
            { error: `Producto "${item.productName}" (ID ${item.productId}) no encontrado o inactivo` },
            { status: 400 },
          )
        }
        const baseUnitsNeeded = mul(item.quantity, item.unitsPerPack || 1)
        if (lt(product.currentStock, baseUnitsNeeded)) {
          return NextResponse.json(
            { error: `Stock insuficiente para "${item.productName}" (disponible: ${toNum(product.currentStock)}, requerido: ${toNum(baseUnitsNeeded)})` },
            { status: 400 },
          )
        }
      }
    }

    // Tax calculation helper
    const calcTax = (totalRow: number, taxRateInfo: { code: string; rate: number; rateType: string } | null) => {
      if (!taxRateInfo) return { taxCode: null, taxRate: 0, taxAmount: 0, taxBase: totalRow }
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

    const defaultTaxRate = await db.taxRate.findFirst({
      where: { storeId: data.storeId, isDefault: true, category: 'SALES_TAX', isActive: true },
    })

    const taxBreakdownMap: Record<string, { code: string; name: string; base: number; rate: number; amount: number }> = {}
    let orderTaxAmount = 0

    const orderItemsData = quotation.items.map((item) => {
      const product = item.productId ? productMap.get(item.productId) : null
      const unitPrice = item.unitPrice
      const totalRow = item.totalRow
      const effectiveTax = product?.taxRate
        ? { code: product.taxRate.code, rate: product.taxRate.rate, rateType: product.taxRate.rateType }
        : defaultTaxRate
          ? { code: defaultTaxRate.code, rate: defaultTaxRate.rate, rateType: defaultTaxRate.rateType }
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
        productId: item.productId,
        serviceId: null as number | null,
        presentationId: item.presentationId,
        presentationName: item.presentationName,
        unitsPerPack: item.unitsPerPack,
        quantity: item.quantity,
        unitPrice,
        totalRow,
        taxCode: tax.taxCode,
        taxRate: tax.taxRate,
        taxAmount: tax.taxAmount,
        taxBase: tax.taxBase,
        notes: item.notes || null as string | null,
      }
    })

    const subtotal = quotation.subtotal
    const discountAmount = quotation.discountAmount
    const total = quotation.total

    // Resolve tax rate names
    const allTaxCodes = Object.keys(taxBreakdownMap)
    if (allTaxCodes.length > 0) {
      const taxRateRecords = await db.taxRate.findMany({
        where: { storeId: data.storeId, code: { in: allTaxCodes } },
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

    // Generate order number
    const now = new Date()
    const dateStr = now.getFullYear().toString().slice(2) +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0')
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    const todayCount = await db.order.count({
      where: { storeId: data.storeId, createdAt: { gte: todayStart, lte: todayEnd } },
    })
    const orderNumber = `OV-${dateStr}-${(todayCount + 1).toString().padStart(4, '0')}`

    // ─── Cash register validation: MUST have an open shift ──────────
    let cashRegisterId: number | null = null
    const openShift = await db.cashRegister.findFirst({
      where: { storeId: data.storeId, status: 'OPEN' },
      select: { id: true },
    })
    cashRegisterId = openShift?.id ?? null

    // BLOCK conversion if no cash register is open
    if (!cashRegisterId) {
      return NextResponse.json(
        { error: 'Debes abrir la caja antes de convertir una cotización a venta. Ve a Contabilidad → Caja y abre un turno.' },
        { status: 400 },
      )
    }

    // Execute in transaction
    const order = await db.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          storeId: data.storeId,
          customerId: quotation.customerId ?? null,
          cashRegisterId,
          orderNumber,
          subtotal,
          taxAmount: orderTaxAmount,
          taxBreakdown: taxBreakdownJson,
          tipAmount: 0,
          discountAmount,
          discountType: quotation.discountType,
          total,
          status: (data.paymentMethod === 'FIADO') ? 'CREDIT' : 'COMPLETED',
          paymentMethod: data.paymentMethod,
          notes: `Convertido desde cotización ${quotation.quotationNumber}${quotation.notes ? ' — ' + quotation.notes : ''}`,
          orderItems: { create: orderItemsData },
        },
        include: {
          customer: { select: { id: true, name: true } },
        },
      })

      // Create inventory movements and decrement stock (always in base units)
      for (const item of quotation.items) {
        if (item.productId) {
          const baseUnits = mul(item.quantity, item.unitsPerPack || 1)
          await tx.inventoryMovement.create({
            data: {
              storeId: data.storeId,
              productId: item.productId,
              presentationId: item.presentationId,
              presentationName: item.presentationName,
              unitsPerPack: item.unitsPerPack,
              quantity: baseUnits.negated(),
              movementType: 'SALE',
              referenceId: createdOrder.id,
              notes: item.presentationName
                ? `Venta ${orderNumber} — ${item.presentationName} x${item.quantity} (${toNum(baseUnits)} uds base) (desde cotización ${quotation.quotationNumber})`
                : `Venta ${orderNumber} (desde cotización ${quotation.quotationNumber})`,
            },
          })
          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: { decrement: baseUnits } },
          })
        }
      }

      // Journal entries
      if (data.paymentMethod !== 'FIADO') {
        const cajaAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, type: 'ASSET', isDefault: true },
        })
        const ventasAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: data.storeId, type: 'INCOME' },
        })
        if (cajaAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: data.storeId,
              ledgerAccountId: cajaAccount.id,
              amount: total,
              direction: 'DEBIT',
              description: `Venta ${orderNumber} (Cotización ${quotation.quotationNumber})`,
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
              description: `Venta ${orderNumber} (Cotización ${quotation.quotationNumber})`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
      }

      // Update quotation status
      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          status: 'CONVERTED',
          convertedToOrderId: createdOrder.id,
        },
      })

      return createdOrder
    })

    return NextResponse.json({
      success: true,
      orderNumber: order.orderNumber,
      orderId: order.id,
      total: Number(order.total),
      message: `Cotización ${quotation.quotationNumber} convertida a venta ${order.orderNumber}`,
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/quotations/[id]/convert error:', error)
    return NextResponse.json({ error: 'Error interno al convertir la cotización' }, { status: 500 })
  }
}
