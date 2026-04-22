import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { formatInvoiceNumber } from '@/lib/invoice-utils'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// ─── GET: Obtener una factura de contingencia por ID ─────────────────────
// GET /api/contingency-invoices/[id]?storeId=X

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const url = new URL(request.url)
    const storeId = z.coerce.number().int().positive().parse(url.searchParams.get('storeId'))

    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    const contingency = await db.contingencyInvoice.findFirst({
      where: { id: Number(id), storeId },
      include: {
        invoice: {
          select: {
            id: true,
            prefix: true,
            consecutive: true,
            cufe: true,
            qrCode: true,
            status: true,
            paymentMethod: true,
            order: {
              select: {
                orderNumber: true,
                paymentMethod: true,
              },
            },
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            legalName: true,
            nit: true,
          },
        },
      },
    })

    if (!contingency) {
      return NextResponse.json({ error: 'Factura de contingencia no encontrada' }, { status: 404 })
    }

    return NextResponse.json({
      id: contingency.id,
      invoiceNumber: formatInvoiceNumber(contingency.prefix, contingency.consecutive),
      prefix: contingency.prefix,
      consecutive: contingency.consecutive,
      contingencyType: contingency.contingencyType,
      contingencyTypeLabel: contingency.contingencyType === '03'
        ? 'Contingencia del facturador'
        : 'Contingencia DIAN',
      reason: contingency.reason,
      // Cliente
      customerNit: contingency.customerNit,
      customerName: contingency.customerName,
      customerEmail: contingency.customerEmail,
      customerPhone: contingency.customerPhone,
      customerAddress: contingency.customerAddress,
      customerRegime: contingency.customerRegime,
      customerType: contingency.customerType,
      // Montos
      subtotalBase: Number(contingency.subtotalBase),
      taxExemptAmount: Number(contingency.taxExemptAmount),
      taxBreakdown: JSON.parse(contingency.taxBreakdown || '[]'),
      totalTaxAmount: Number(contingency.totalTaxAmount),
      totalWithTax: Number(contingency.totalWithTax),
      discountAmount: Number(contingency.discountAmount),
      grandTotal: Number(contingency.grandTotal),
      // CUFEs
      originalCufe: contingency.originalCufe,
      originalCufeQR: contingency.originalCufeQR,
      contingencyCufe: contingency.contingencyCufe,
      // XML
      hasXmlContent: !!contingency.xmlContent,
      // Estado
      status: contingency.status,
      statusLabel: getStatusLabel(contingency.status),
      testMode: contingency.testMode,
      dianResponse: contingency.dianResponse ? JSON.parse(contingency.dianResponse) : null,
      // Fechas
      contingencyStart: contingency.contingencyStart.toISOString(),
      contingencyEnd: contingency.contingencyEnd?.toISOString() ?? null,
      retransmittedAt: contingency.retransmittedAt?.toISOString() ?? null,
      createdAt: contingency.createdAt.toISOString(),
      updatedAt: contingency.updatedAt.toISOString(),
      // Factura original relacionada
      originalInvoice: contingency.invoice ? {
        id: contingency.invoice.id,
        invoiceNumber: formatInvoiceNumber(contingency.invoice.prefix, contingency.invoice.consecutive),
        cufe: contingency.invoice.cufe,
        qrCode: contingency.invoice.qrCode,
        status: contingency.invoice.status,
        paymentMethod: contingency.invoice.paymentMethod,
        orderNumber: contingency.invoice.order?.orderNumber ?? null,
      } : null,
      // Tienda
      store: {
        id: contingency.store.id,
        name: contingency.store.name,
        legalName: contingency.store.legalName,
        nit: contingency.store.nit,
      },
    })
  } catch (error) {
    logger.error('GET /api/contingency-invoices/[id] error:', error)
    return NextResponse.json({ error: 'Error interno al consultar la factura de contingencia' }, { status: 500 })
  }
}

// ─── Helper ────────────────────────────────────────────────────────────────

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Borrador',
    PENDING_RETRANSMIT: 'Pendiente de retransmisión',
    RETRANSMITTED: 'Retransmitida a DIAN',
    REJECTED: 'Rechazada por DIAN',
  }
  return labels[status] || status
}
