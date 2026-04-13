import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getStatus, parseDIANStatusMessage } from '@/lib/invoicing/soap-client'
import { formatInvoiceNumber } from '@/lib/invoice-utils'

export const dynamic = 'force-dynamic'

// ─── GET: Consultar estado de factura en la DIAN ─────────────────────────────
// GET /api/invoices/[id]/status?storeId=X
//
// Consulta el estado actual de la factura ante la DIAN usando el TrackId
// almacenado en dianResponse. Actualiza la factura con el resultado obtenido.

export async function GET(
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

    // 1. Obtener factura
    const invoice = await db.invoice.findFirst({
      where: { id: Number(id), storeId },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    // 2. Extraer trackId del dianResponse (JSON)
    let trackId: string | null = null
    if (invoice.dianResponse) {
      try {
        const dianData = JSON.parse(invoice.dianResponse)
        trackId = dianData.trackId || null
      } catch {
        // dianResponse no es JSON valido
      }
    }

    if (!trackId) {
      return NextResponse.json(
        { error: 'La factura no ha sido enviada a la DIAN. No hay TrackId disponible.' },
        { status: 400 },
      )
    }

    // 3. Consultar estado a la DIAN
    const statusResult = await getStatus(trackId, {
      testMode: invoice.testMode,
      timeout: 30000,
    })

    // 4. Actualizar factura segun respuesta
    const updateData: Record<string, unknown> = {
      dianResponse: JSON.stringify({
        trackId,
        lastQuery: {
          statusCode: statusResult.statusCode,
          statusMessage: statusResult.statusMessage,
          success: statusResult.success,
          errorMessage: statusResult.errorMessage,
          errorCode: statusResult.errorCode,
          httpStatus: statusResult.httpStatus,
          timestamp: statusResult.timestamp,
        },
      }),
    }

    let newStatus: string | null = null

    if (statusResult.statusCode === '10010' || statusResult.statusCode === '10012') {
      newStatus = 'VALIDATED'
      updateData.status = newStatus
      if (!invoice.validatedAt) {
        updateData.validatedAt = new Date()
      }
    } else if (statusResult.statusCode === '10011') {
      newStatus = 'REJECTED'
      updateData.status = newStatus
      updateData.dianErrorCode = statusResult.errorCode || statusResult.statusCode
    }

    // Solo actualizar si hubo cambio de estado
    if (newStatus && newStatus !== invoice.status) {
      await db.invoice.update({
        where: { id: Number(id) },
        data: updateData,
      })
    } else if (!newStatus) {
      // Actualizar dianResponse con la consulta aunque no haya cambio de estado
      await db.invoice.update({
        where: { id: Number(id) },
        data: updateData,
      })
    }

    // 5. Construir respuesta
    const parsedStatus = statusResult.statusCode
      ? parseDIANStatusMessage(statusResult.statusCode)
      : null

    return NextResponse.json({
      id: invoice.id,
      invoiceNumber: formatInvoiceNumber(invoice.prefix, invoice.consecutive),
      previousStatus: invoice.status,
      currentStatus: newStatus || invoice.status,
      trackId,
      dianStatusCode: statusResult.statusCode || null,
      dianStatusMessage: statusResult.statusMessage || null,
      parsedStatus,
      validatedAt: updateData.validatedAt instanceof Date
        ? (updateData.validatedAt as Date).toISOString()
        : (invoice.validatedAt?.toISOString() ?? null),
      dianErrorCode: statusResult.errorCode || null,
      error: statusResult.errorMessage || null,
      success: statusResult.success,
      httpStatus: statusResult.httpStatus,
      timestamp: statusResult.timestamp,
    })
  } catch (error) {
    console.error('GET /api/invoices/[id]/status error:', error)
    return NextResponse.json(
      { error: 'Error interno al consultar el estado de la factura en la DIAN' },
      { status: 500 },
    )
  }
}
