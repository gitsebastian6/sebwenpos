import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { formatInvoiceNumber } from '@/lib/invoice-utils'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// ─── Esquema de validacion ────────────────────────────────────────────────

const createContingencySchema = z.object({
  contingencyType: z.enum(['03', '04'], {
    message: 'El tipo de contingencia debe ser "03" (facturador) o "04" (DIAN)',
  }).default('04'),
  reason: z.string().max(500, 'La razón no puede exceder 500 caracteres').optional(),
  notes: z.string().max(1000).optional(),
})

// ─── POST: Crear factura de contingencia para una factura específica ──────
// POST /api/invoices/[id]/contingency?storeId=X
//
// Endpoint de conveniencia que crea una factura de contingencia a partir de
// una factura que falló al enviarse. Pre-llena todo desde la factura original.
// Internamente llama a POST /api/contingency-invoices.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    // 1. Validar acceso
    const storeAccessErr = requireStoreAccess(request, storeId)
    if (storeAccessErr) return storeAccessErr

    // Verificar que la factura existe
    const invoice = await db.invoice.findFirst({
      where: { id: Number(id), storeId },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    // 2. Validar el body
    let body: Record<string, unknown> = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }
    const data = createContingencySchema.parse(body)

    // 3. Generar un motivo descriptivo por defecto si no se proporciona
    const formattedOriginal = formatInvoiceNumber(invoice.prefix, invoice.consecutive)
    const defaultReason = data.contingencyType === '03'
      ? `Falla técnica del facturador al enviar factura ${formattedOriginal}`
      : `Servicio de la DIAN no disponible al enviar factura ${formattedOriginal}`

    // 4. Llamar internamente a POST /api/contingency-invoices
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!baseUrl) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL no está configurado. Requerido para facturas de contingencia.' }, { status: 500 })
    }
    const internalResponse = await fetch(`${baseUrl}/api/contingency-invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId,
        invoiceId: invoice.id,
        contingencyType: data.contingencyType,
        reason: data.reason || defaultReason,
        notes: data.notes,
      }),
    })

    const responseBody = await internalResponse.json()

    return NextResponse.json(responseBody, { status: internalResponse.status })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    logger.error('POST /api/invoices/[id]/contingency error:', error)
    return NextResponse.json(
      { error: 'Error interno al crear la factura de contingencia' },
      { status: 500 },
    )
  }
}
