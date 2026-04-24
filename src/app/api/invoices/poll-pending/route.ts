import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getStatus } from '@/lib/invoicing/soap-client'
import { formatInvoiceNumber } from '@/lib/invoice-utils'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const MAX_INVOICES_PER_CALL = 50

// ─── POST: Sondeo automático de facturas pendientes ante la DIAN ─────────────
// POST /api/invoices/poll-pending?storeId=X (storeId opcional)
//
// Busca todas las facturas con estado "PENDING_VALIDATE" que tengan un trackId
// en dianResponse, consulta el estado a la DIAN y actualiza cada factura.

interface PollResult {
  invoiceId: number
  invoiceNumber: string
  trackId: string
  previousStatus: string
  newStatus: string | null
  dianStatusCode: string | null
  error: string | null
}

interface PollSummary {
  processed: number
  validated: number
  rejected: number
  stillPending: number
  errors: number
  results: PollResult[]
  timestamp: string
  message?: string
}

async function processInvoice(invoice: {
  id: number
  storeId: number
  prefix: string
  consecutive: number
  status: string
  dianResponse: string | null
  validatedAt: Date | null
  testMode: boolean
}): Promise<PollResult> {
  const invoiceNumber = formatInvoiceNumber(invoice.prefix, invoice.consecutive)

  // Extraer trackId del dianResponse (JSON)
  let trackId: string | null = null
  let existingDianData: Record<string, unknown> = {}
  if (invoice.dianResponse) {
    try {
      existingDianData = JSON.parse(invoice.dianResponse)
      trackId = (existingDianData.trackId as string) || null
    } catch {
      // dianResponse no es JSON válido
    }
  }

  if (!trackId) {
    return {
      invoiceId: invoice.id,
      invoiceNumber,
      trackId: '',
      previousStatus: invoice.status,
      newStatus: null,
      dianStatusCode: null,
      error: 'No se encontró TrackId en dianResponse',
    }
  }

  try {
    // Consultar estado a la DIAN
    const statusResult = await getStatus(trackId, {
      testMode: invoice.testMode,
      timeout: 15000, // Timeout más corto para batch (15s vs 30s)
    })

    // Construir dianResponse actualizado
    const updatedDianData = {
      ...existingDianData,
      trackId,
      lastQuery: {
        statusCode: statusResult.statusCode,
        statusMessage: statusResult.statusMessage,
        success: statusResult.success,
        errorMessage: statusResult.errorMessage,
        errorCode: statusResult.errorCode,
        httpStatus: statusResult.httpStatus,
        timestamp: statusResult.timestamp,
        source: 'cron_poll',
      },
    }

    const updateData: Record<string, unknown> = {
      dianResponse: JSON.stringify(updatedDianData),
    }

    let newStatus: string | null = null

    if (statusResult.statusCode === '10010' || statusResult.statusCode === '10012') {
      // Factura aceptada/validada
      newStatus = 'VALIDATED'
      updateData.status = newStatus
      if (!invoice.validatedAt) {
        updateData.validatedAt = new Date()
      }
    } else if (statusResult.statusCode === '10011') {
      // Factura rechazada
      newStatus = 'REJECTED'
      updateData.status = newStatus
      updateData.dianErrorCode = statusResult.errorCode || statusResult.statusCode
    }
    // 10009 o sin statusCode → mantener PENDING_VALIDATE (no actualizar estado)

    // Actualizar la factura si hay cambio o para actualizar lastQuery
    if (newStatus || !newStatus) {
      await db.invoice.update({
        where: { id: invoice.id },
        data: updateData,
      })
    }

    return {
      invoiceId: invoice.id,
      invoiceNumber,
      trackId,
      previousStatus: invoice.status,
      newStatus,
      dianStatusCode: statusResult.statusCode || null,
      error: statusResult.errorMessage || null,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido'
    return {
      invoiceId: invoice.id,
      invoiceNumber,
      trackId,
      previousStatus: invoice.status,
      newStatus: null,
      dianStatusCode: null,
      error: message,
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sp = {
      storeId: searchParams.get('storeId'),
    }
    const { storeId } = z.object({
      storeId: z.coerce.number().int().positive().optional(),
    }).parse(sp)

    // Construir filtro
    // Validate store access if storeId is provided
    if (storeId) {
      const storeAccessErr = requireStoreAccess(request, storeId)
      if (storeAccessErr) return storeAccessErr
    }

    // Construir filtro
    const where: Record<string, unknown> = {
      status: 'PENDING_VALIDATE',
      dianResponse: { not: null },
    }

    // Si se proporciona storeId, filtrar por tienda
    if (storeId) {
      where.storeId = storeId
    }

    // 1. Buscar facturas pendientes con trackId
    const pendingInvoices = await db.invoice.findMany({
      where,
      select: {
        id: true,
        storeId: true,
        prefix: true,
        consecutive: true,
        status: true,
        dianResponse: true,
        validatedAt: true,
        testMode: true,
      },
      take: MAX_INVOICES_PER_CALL,
      orderBy: { createdAt: 'asc' }, // Procesar las más antiguas primero
    })

    if (pendingInvoices.length === 0) {
      return NextResponse.json({
        processed: 0,
        validated: 0,
        rejected: 0,
        stillPending: 0,
        errors: 0,
        results: [],
        message: 'No hay facturas pendientes de validación',
        timestamp: new Date().toISOString(),
      } satisfies PollSummary)
    }

    // 2. Procesar cada factura en paralelo (con límite de concurrencia)
    const results: PollResult[] = []
    const CONCURRENCY_LIMIT = 5

    for (let i = 0; i < pendingInvoices.length; i += CONCURRENCY_LIMIT) {
      const batch = pendingInvoices.slice(i, i + CONCURRENCY_LIMIT)
      const batchResults = await Promise.all(batch.map(processInvoice))
      results.push(...batchResults)
    }

    // 3. Calcular resumen
    let validated = 0
    let rejected = 0
    let stillPending = 0
    let errors = 0

    for (const r of results) {
      if (r.error && !r.dianStatusCode) {
        errors++
      } else if (r.newStatus === 'VALIDATED') {
        validated++
      } else if (r.newStatus === 'REJECTED') {
        rejected++
      } else {
        stillPending++
      }
    }

    const summary: PollSummary = {
      processed: results.length,
      validated,
      rejected,
      stillPending,
      errors,
      results,
      timestamp: new Date().toISOString(),
    }

    logger.info(
      `[DIAN Cron] Sondeo completado: ${validated} validadas, ${rejected} rechazadas, ${stillPending} pendientes, ${errors} errores (de ${results.length} procesadas)`,
    )

    return NextResponse.json(summary)
  } catch (error) {
    logger.error('[DIAN Cron] Error en poll-pending:', error)
    return NextResponse.json(
      { error: 'Error interno al consultar facturas pendientes ante la DIAN' },
      { status: 500 },
    )
  }
}
