import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import {
  formatInvoiceNumber,
  generateCUFE,
  generateQRCodeURL,
  getAppBaseUrl,
  type TaxBreakdownItem,
} from '@/lib/invoice-utils'

export const dynamic = 'force-dynamic'

// ─── Esquemas de validación ───────────────────────────────────────────────

const creditNoteItemSchema = z.object({
  orderItemId: z.number().int().positive(),
  quantity: z.number().int().min(1),
})

const createCreditNoteSchema = z.object({
  items: z.array(creditNoteItemSchema).min(1, 'Debe incluir al menos un item'),
  reason: z.string().max(500).optional(),
  returnCode: z.enum(['01', '02', '03', '04', '05']).optional().default('01'),
  notes: z.string().max(1000).optional(),
})

// ─── Helper: obtener siguiente consecutivo para Nota Crédito ──────────────
// Similar a getNextConsecutive pero consulta la tabla credit_notes

async function getNextCreditNoteConsecutive(storeId: number) {
  return await db.$transaction(async (tx) => {
    const store = await tx.store.findUniqueOrThrow({
      where: { id: storeId },
      select: {
        invoicePrefix: true,
        resolutionNumber: true,
        resolutionStartDate: true,
        resolutionEndDate: true,
        resolutionStartNumber: true,
        resolutionEndNumber: true,
        nit: true,
        invoiceTestMode: true,
      },
    })

    if (!store.resolutionNumber) {
      throw new Error(
        'La tienda no tiene configurada una resolución de numeración DIAN. ' +
        'Configure la resolución en la sección de Facturación Electrónica.',
      )
    }

    if (store.resolutionStartNumber == null || store.resolutionEndNumber == null) {
      throw new Error(
        'La resolución de numeración está incompleta. ' +
        'Configure el rango de consecutivos autorizados.',
      )
    }

    const startNumber = store.resolutionStartNumber
    const endNumber = store.resolutionEndNumber
    const prefix = store.invoicePrefix ?? 'FE'

    // Validar vigencia
    const now = new Date()
    if (store.resolutionStartDate && now < store.resolutionStartDate) {
      throw new Error(
        `La resolución ${store.resolutionNumber} no está vigente aún.`,
      )
    }
    if (store.resolutionEndDate && now > store.resolutionEndDate) {
      throw new Error(
        `La resolución ${store.resolutionNumber} ha expirado.`,
      )
    }

    // Último consecutivo de NOTAS CRÉDITO (no de facturas)
    const lastCreditNote = await tx.creditNote.findFirst({
      where: { storeId },
      orderBy: { consecutive: 'desc' },
      select: { consecutive: true },
    })

    const nextConsecutive = (lastCreditNote?.consecutive ?? 0) + 1

    if (nextConsecutive < startNumber) {
      throw new Error(
        `El consecutivo calculado (${nextConsecutive}) es menor al inicio del rango autorizado (${startNumber}).`,
      )
    }
    if (nextConsecutive > endNumber) {
      throw new Error(
        `Se ha agotado el rango de numeración autorizado por la resolución ${store.resolutionNumber}. ` +
        `Rango: ${startNumber} a ${endNumber}.`,
      )
    }

    return {
      consecutive: nextConsecutive,
      prefix,
      resolutionNumber: store.resolutionNumber,
      resolutionDate: store.resolutionStartDate?.toISOString() ?? new Date().toISOString(),
      startDate: store.resolutionStartDate,
      endDate: store.resolutionEndDate,
      startNumber,
      endNumber,
      storeNit: store.nit,
      testMode: store.invoiceTestMode,
    }
  })
}

// ─── GET: Listar notas crédito de una factura ────────────────────────────
// GET /api/invoices/[id]/credit-notes?storeId=X

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    // Verificar que la factura existe
    const invoice = await db.invoice.findFirst({
      where: { id: Number(id), storeId },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    const creditNotes = await db.creditNote.findMany({
      where: { invoiceId: Number(id), storeId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        prefix: true,
        consecutive: true,
        reason: true,
        returnCode: true,
        grandTotal: true,
        status: true,
        testMode: true,
        createdAt: true,
      },
    })

    const result = creditNotes.map((cn) => ({
      id: cn.id,
      creditNoteNumber: formatInvoiceNumber(cn.prefix, cn.consecutive),
      reason: cn.reason,
      returnCode: cn.returnCode,
      grandTotal: Number(cn.grandTotal),
      status: cn.status,
      testMode: cn.testMode,
      createdAt: cn.createdAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/invoices/[id]/credit-notes error:', error)
    return NextResponse.json(
      { error: 'Error interno al consultar notas crédito' },
      { status: 500 },
    )
  }
}

// ─── POST: Crear nota crédito desde devolución ────────────────────────────
// POST /api/invoices/[id]/credit-notes?storeId=X

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const invoiceId = Number(id)
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    // Parse y validar body
    let body: {
      items: { orderItemId: number; quantity: number }[]
      reason?: string
      returnCode?: string
      notes?: string
    }
    try {
      const raw = await request.json()
      body = createCreditNoteSchema.parse(raw)
    } catch (e: unknown) {
      const msg = (e instanceof z.ZodError) ? e.issues[0].message : 'Datos inválidos'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // 1. Fetch invoice with order, order items, and store
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, storeId },
      include: {
        order: {
          include: {
            orderItems: {
              include: {
                product: { select: { id: true, name: true, currentStock: true } },
                service: { select: { id: true, name: true } },
              },
            },
          },
        },
        store: {
          select: {
            nit: true,
            name: true,
            address: true,
            phone: true,
            email: true,
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    // 2. Validate invoice status (can only credit VALIDATED or DELIVERED)
    if (!['VALIDATED', 'DELIVERED'].includes(invoice.status)) {
      return NextResponse.json(
        {
          error: `No se puede generar nota crédito para una factura en estado "${invoice.status}". ` +
            `Solo se permiten facturas VALIDATED o DELIVERED.`,
        },
        { status: 400 },
      )
    }

    const order = invoice.order
    const orderItems = order.orderItems

    // Build map for quick lookup
    const itemMap = new Map(orderItems.map((item) => [item.id, item]))

    // 3. Validate each return item
    for (const reqItem of body.items) {
      const item = itemMap.get(reqItem.orderItemId)
      if (!item) {
        return NextResponse.json(
          { error: `Item #${reqItem.orderItemId} no pertenece a esta factura` },
          { status: 400 },
        )
      }
      const available = item.quantity - (item.returnedQuantity ?? 0)
      if (available <= 0) {
        const name = item.product?.name ?? item.service?.name ?? 'Producto'
        return NextResponse.json(
          { error: `"${name}" ya fue devuelto completamente` },
          { status: 400 },
        )
      }
      if (reqItem.quantity > available) {
        const name = item.product?.name ?? item.service?.name ?? 'Producto'
        return NextResponse.json(
          {
            error: `Solo se pueden devolver ${available} unidad(es) de "${name}". ` +
              `Ya se devolvieron ${item.returnedQuantity ?? 0} de ${item.quantity} original(es).`,
          },
          { status: 400 },
        )
      }
    }

    // 4. Calculate tax breakdown proportionally for returned items
    const taxMap = new Map<string, TaxBreakdownItem>()
    let totalWithTax = 0
    let subtotalBase = 0
    let totalTaxAmount = 0
    let taxExemptAmount = 0

    const returnedItemsData: {
      orderItemId: number
      productName: string
      quantity: number
      unitPrice: number
      taxCode: string | null
      taxRate: number
      taxAmount: number
      taxBase: number
    }[] = []

    for (const reqItem of body.items) {
      const item = itemMap.get(reqItem.orderItemId)!
      const productName = item.product?.name ?? item.service?.name ?? 'Eliminado'

      // Proportional calculation: returned qty / original qty
      const ratio = reqItem.quantity / item.quantity
      const returnedTotal = Math.round(item.totalRow * ratio)
      const returnedTaxBase = Math.round((item.taxBase || 0) * ratio)
      const returnedTaxAmount = Math.round((item.taxAmount || 0) * ratio)

      returnedItemsData.push({
        orderItemId: item.id,
        productName,
        quantity: reqItem.quantity,
        unitPrice: item.unitPrice,
        taxCode: item.taxCode ?? null,
        taxRate: item.taxRate,
        taxAmount: returnedTaxAmount,
        taxBase: returnedTaxBase,
      })

      totalWithTax += returnedTotal
      subtotalBase += returnedTaxBase
      totalTaxAmount += returnedTaxAmount

      // Accumulate by tax code
      if (item.taxCode && item.taxRate > 0) {
        const existing = taxMap.get(item.taxCode)
        if (existing) {
          existing.base += returnedTaxBase
          existing.amount += returnedTaxAmount
        } else {
          const nameMap: Record<string, string> = {
            '01': 'IVA 19%',
            '02': 'IVA 5%',
            '03': 'IVA 0% Exento',
            '04': 'IVA Excluido',
            '05': 'Impoconsumo',
          }
          taxMap.set(item.taxCode, {
            code: item.taxCode,
            name: nameMap[item.taxCode] ?? `Impuesto ${item.taxCode}`,
            base: returnedTaxBase,
            rate: item.taxRate,
            amount: returnedTaxAmount,
          })
        }
      }

      // Exempt amounts (codes 03, 04)
      if (item.taxCode === '03' || item.taxCode === '04') {
        taxExemptAmount += returnedTaxBase
      }
    }

    const taxBreakdown = Array.from(taxMap.values())
    const grandTotal = totalWithTax // NC total = total returned with tax

    // 5. Get next consecutive for NC prefix
    let consecResult
    try {
      consecResult = await getNextCreditNoteConsecutive(storeId)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error al obtener consecutivo'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // 6. Generate CUFE/CUDFE
    const now = new Date()
    const issueDate = now.toISOString().slice(0, 10).replace(/-/g, '')
    const issueTime = now.toTimeString().slice(0, 8).replace(/:/g, '') + '000'

    const cufe = generateCUFE({
      storeNit: consecResult.storeNit ?? '',
      issueDate,
      issueTime,
      prefix: 'NC',
      consecutive: consecResult.consecutive,
      customerNit: invoice.customerNit ?? '222222222222',
      subtotalBase,
      totalTaxAmount,
      discountAmount: 0,
      grandTotal,
    })

    // 7. Generate QR code URL
    const appBaseUrl = getAppBaseUrl(request)
    const qrCode = generateQRCodeURL({
      storeNit: consecResult.storeNit ?? '',
      prefix: 'NC',
      consecutive: consecResult.consecutive,
      date: now.toISOString().slice(0, 10),
      grandTotal,
      cufe,
      appBaseUrl,
    })

    // 8-12: Create credit note and side effects in a transaction
    const creditNote = await db.$transaction(async (tx) => {
      // 8. Create CreditNote
      const cn = await tx.creditNote.create({
        data: {
          storeId,
          invoiceId,
          // Numeración DIAN
          prefix: 'NC',
          consecutive: consecResult.consecutive,
          resolutionNumber: consecResult.resolutionNumber,
          resolutionDate: consecResult.startDate ? new Date(consecResult.resolutionDate) : null,
          startDate: consecResult.startDate,
          endDate: consecResult.endDate,
          startNumber: consecResult.startNumber,
          endNumber: consecResult.endNumber,
          // Emisor (snapshot de la tienda)
          supplierNit: invoice.store?.nit,
          supplierName: invoice.store?.name,
          supplierAddress: invoice.store?.address,
          supplierPhone: invoice.store?.phone,
          supplierEmail: invoice.store?.email,
          // Cliente (copiado de factura original)
          customerNit: invoice.customerNit,
          customerName: invoice.customerName,
          customerAddress: invoice.customerAddress,
          customerPhone: invoice.customerPhone,
          customerEmail: invoice.customerEmail,
          customerRegime: invoice.customerRegime,
          customerType: invoice.customerType,
          // Desglose tributario
          subtotalBase,
          taxExemptAmount,
          taxBreakdown: JSON.stringify(taxBreakdown),
          totalTaxAmount,
          totalWithTax,
          grandTotal,
          // Items devueltos
          items: JSON.stringify(returnedItemsData),
          // Motivo
          reason: body.reason ?? null,
          returnCode: body.returnCode ?? '01',
          // DIAN
          cufe,
          qrCode,
          notes: body.notes ?? null,
          // Estado
          status: consecResult.testMode ? 'DRAFT' : 'PENDING_VALIDATE',
          testMode: consecResult.testMode,
        },
      })

      // 9. Update returnedQuantity for each OrderItem
      for (const reqItem of body.items) {
        await tx.orderItem.update({
          where: { id: reqItem.orderItemId },
          data: { returnedQuantity: { increment: reqItem.quantity } },
        })
      }

      // 10. Create InventoryMovement entries (RETURN type) for product items
      for (const reqItem of body.items) {
        const item = itemMap.get(reqItem.orderItemId)!
        if (item.productId) {
          // Increment product stock
          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: { increment: reqItem.quantity } },
          })

          // Create inventory movement
          const productName = item.product?.name ?? 'Producto'
          await tx.inventoryMovement.create({
            data: {
              storeId,
              productId: item.productId,
              quantity: reqItem.quantity,
              movementType: 'RETURN',
              referenceId: order.id,
              notes: `Nota Crédito NC-${String(consecResult.consecutive).padStart(8, '0')} — ${productName} x${reqItem.quantity}`,
            },
          })
        }
      }

      // 11. Check if ALL order items are now fully returned
      // Re-read the items to get fresh returnedQuantity values
      const freshItems = await tx.orderItem.findMany({
        where: { orderId: order.id },
        select: { id: true, quantity: true, returnedQuantity: true },
      })

      const allFullyReturned = freshItems.every(
        (item) => (item.returnedQuantity ?? 0) >= item.quantity,
      )

      if (allFullyReturned) {
        // Cancel the order
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'CANCELLED' },
        })
        // Cancel the invoice
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: 'CANCELLED' },
        })
      }

      return cn
    })

    // 12. Return the created credit note
    return NextResponse.json(
      {
        id: creditNote.id,
        creditNoteNumber: formatInvoiceNumber(creditNote.prefix, creditNote.consecutive),
        storeId: creditNote.storeId,
        invoiceId: creditNote.invoiceId,
        // Numeración DIAN
        prefix: creditNote.prefix,
        consecutive: creditNote.consecutive,
        resolutionNumber: creditNote.resolutionNumber,
        // Cliente
        customerNit: creditNote.customerNit,
        customerName: creditNote.customerName,
        customerAddress: creditNote.customerAddress,
        customerPhone: creditNote.customerPhone,
        customerEmail: creditNote.customerEmail,
        customerRegime: creditNote.customerRegime,
        customerType: creditNote.customerType,
        // Emisor
        supplierNit: creditNote.supplierNit,
        supplierName: creditNote.supplierName,
        supplierAddress: creditNote.supplierAddress,
        supplierPhone: creditNote.supplierPhone,
        supplierEmail: creditNote.supplierEmail,
        // Tributario
        subtotalBase: Number(creditNote.subtotalBase),
        taxExemptAmount: Number(creditNote.taxExemptAmount),
        taxBreakdown: JSON.parse(creditNote.taxBreakdown || '[]'),
        totalTaxAmount: Number(creditNote.totalTaxAmount),
        totalWithTax: Number(creditNote.totalWithTax),
        grandTotal: Number(creditNote.grandTotal),
        // Items
        items: JSON.parse(creditNote.items),
        // Motivo
        reason: creditNote.reason,
        returnCode: creditNote.returnCode,
        // DIAN
        cufe: creditNote.cufe,
        qrCode: creditNote.qrCode,
        // Estado
        status: creditNote.status,
        notes: creditNote.notes,
        testMode: creditNote.testMode,
        createdAt: creditNote.createdAt.toISOString(),
        updatedAt: creditNote.updatedAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('POST /api/invoices/[id]/credit-notes error:', error)
    const message = error instanceof Error ? error.message : 'Error al crear la nota crédito'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
