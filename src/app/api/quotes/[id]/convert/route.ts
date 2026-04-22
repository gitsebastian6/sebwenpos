import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateOrderNumber } from '@/lib/auth'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const convertSchema = z.object({
  paymentMethod: z.enum(['CASH', 'DAVIPLATA', 'NEQUI', 'CARD', 'TRANSFER', 'MIXED', 'CREDIT', 'FIADO']).default('CASH'),
  tipAmount: z.number().int().min(0).default(0),
  notes: z.string().max(500).nullable().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const quoteId = parseInt(id, 10)
    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json()
    const data = convertSchema.parse(body)

    // Fetch quote with items
    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      include: {
        customer: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, salePrice: true, currentStock: true, taxRate: { select: { id: true, code: true, rate: true, rateType: true, applyTo: true } } } },
            service: { select: { id: true, name: true, price: true } },
          },
        },
      },
    })

    if (!quote) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    // Only DRAFT, SENT, or APPROVED can be converted
    if (!['DRAFT', 'SENT', 'APPROVED'].includes(quote.status)) {
      return NextResponse.json(
        { error: `No se puede convertir una cotización en estado ${quote.status}` },
        { status: 400 },
      )
    }

    // Validate product stock
    for (const item of quote.items) {
      if (item.productId && item.product) {
        if (item.product.currentStock < item.quantity) {
          return NextResponse.json(
            { error: `Stock insuficiente para "${item.product.name}" (disponible: ${item.product.currentStock}, solicitado: ${item.quantity})` },
            { status: 400 },
          )
        }
      }
    }

    // Fetch store's default tax rate
    const defaultTaxRate = await db.taxRate.findFirst({
      where: { storeId: quote.storeId, isDefault: true, category: 'SALES_TAX', isActive: true },
    })
    const defaultServiceTaxRate = await db.taxRate.findFirst({
      where: { storeId: quote.storeId, isDefault: true, category: 'SALES_TAX', isActive: true, applyTo: { in: ['SERVICE', 'BOTH'] } },
    })
    const fallbackServiceTaxRate = defaultServiceTaxRate ?? defaultTaxRate

    // Helper: calculate tax for a line item
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

    const taxBreakdownMap: Record<string, { code: string; name: string; base: number; rate: number; amount: number }> = {}
    let orderTaxAmount = 0

    // Build order items data
    const orderItemsData = quote.items.map(item => {
      const totalRow = Number(item.totalRow)
      let effectiveTax: { code: string; rate: number; rateType: string } | null = null

      if (item.productId && item.product?.taxRate) {
        effectiveTax = {
          code: item.product.taxRate.code,
          rate: item.product.taxRate.rate,
          rateType: item.product.taxRate.rateType,
        }
      } else if (item.serviceId && fallbackServiceTaxRate) {
        effectiveTax = {
          code: fallbackServiceTaxRate.code,
          rate: fallbackServiceTaxRate.rate,
          rateType: fallbackServiceTaxRate.rateType,
        }
      } else if (item.productId && defaultTaxRate) {
        effectiveTax = {
          code: defaultTaxRate.code,
          rate: defaultTaxRate.rate,
          rateType: defaultTaxRate.rateType,
        }
      }

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
        serviceId: item.serviceId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalRow,
        taxCode: tax.taxCode,
        taxRate: tax.taxRate,
        taxAmount: tax.taxAmount,
        taxBase: tax.taxBase,
        notes: item.notes,
      }
    })

    const subtotal = orderItemsData.reduce((sum, i) => sum + i.totalRow, 0)
    const tipAmount = data.tipAmount || 0
    const discountAmount = Number(quote.discountAmount)
    const total = subtotal - discountAmount + tipAmount

    // Resolve tax rate names for breakdown
    const allTaxCodes = Object.keys(taxBreakdownMap)
    if (allTaxCodes.length > 0) {
      const taxRateRecords = await db.taxRate.findMany({
        where: { storeId: quote.storeId, code: { in: allTaxCodes } },
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

    const orderNumber = generateOrderNumber()

    // Find open cash register
    const openShift = await db.cashRegister.findFirst({
      where: { storeId: quote.storeId, status: 'OPEN' },
      select: { id: true },
    })
    const targetCashRegisterId = openShift?.id ?? null

    // Create order in transaction
    const order = await db.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          storeId: quote.storeId,
          customerId: quote.customerId,
          cashRegisterId: targetCashRegisterId,
          quoteId: quoteId,
          orderNumber,
          subtotal,
          taxAmount: orderTaxAmount,
          taxBreakdown: taxBreakdownJson,
          tipAmount,
          discountAmount,
          discountType: quote.discountType,
          total,
          status: (data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO') ? 'CREDIT' : 'COMPLETED',
          paymentMethod: data.paymentMethod,
          notes: data.notes ?? `Convertido desde cotización ${quote.quoteNumber}`,
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

      // Inventory movements for products
      for (const item of quote.items) {
        if (item.productId) {
          await tx.inventoryMovement.create({
            data: {
              storeId: quote.storeId,
              productId: item.productId,
              quantity: -item.quantity,
              movementType: 'SALE',
              referenceId: createdOrder.id,
              notes: `Venta desde COT ${quote.quoteNumber}`,
            },
          })
          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: { decrement: item.quantity } },
          })
        }
      }

      // Service transactions
      for (const item of quote.items) {
        if (item.serviceId) {
          await tx.serviceTransaction.create({
            data: {
              storeId: quote.storeId,
              serviceId: item.serviceId,
              quantity: item.quantity,
              unitPrice: Number(item.unitPrice),
              totalAmount: Number(item.totalRow),
              notes: `Venta desde COT ${quote.quoteNumber}`,
              status: 'COMPLETED',
            },
          })
        }
      }

      // Journal entries (double-entry)
      if (data.paymentMethod !== 'CREDIT' && data.paymentMethod !== 'FIADO') {
        const cajaAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: quote.storeId, type: 'ASSET', isDefault: true },
        })
        const ventasAccount = await tx.ledgerAccount.findFirst({
          where: { storeId: quote.storeId, type: 'INCOME' },
        })
        if (cajaAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: quote.storeId,
              ledgerAccountId: cajaAccount.id,
              amount: total,
              direction: 'DEBIT',
              description: `Venta desde cotización ${quote.quoteNumber}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
        if (ventasAccount) {
          await tx.journalEntry.create({
            data: {
              storeId: quote.storeId,
              ledgerAccountId: ventasAccount.id,
              amount: subtotal,
              direction: 'CREDIT',
              description: `Venta desde cotización ${quote.quoteNumber}`,
              referenceType: 'ORDER',
              referenceId: createdOrder.id,
            },
          })
        }
      }

      // Update customer debt if credit
      if ((data.paymentMethod === 'CREDIT' || data.paymentMethod === 'FIADO') && quote.customerId) {
        await tx.customer.update({
          where: { id: quote.customerId },
          data: { totalDebt: { increment: subtotal } },
        })
      }

      // Update quote status to CONVERTED
      await tx.quote.update({
        where: { id: quoteId },
        data: { status: 'CONVERTED' },
      })

      return createdOrder
    })

    return NextResponse.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      subtotal: Number(order.subtotal),
      taxAmount: Number(order.taxAmount ?? 0),
      tipAmount: Number(order.tipAmount ?? 0),
      discountAmount: Number(order.discountAmount ?? 0),
      total: Number(order.total),
      paymentMethod: order.paymentMethod,
      quoteNumber: quote.quoteNumber,
      createdAt: order.createdAt.toISOString(),
      orderItems: order.orderItems.map((item) => ({
        id: item.id,
        productName: item.product?.name ?? item.service?.name ?? 'Producto',
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalRow: Number(item.totalRow),
      })),
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('POST /api/quotes/[id]/convert error:', error)
    return NextResponse.json({ error: 'Error interno al convertir la cotización' }, { status: 500 })
  }
}
