import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getStatus } from '@/lib/invoicing/soap-client'
import { formatInvoiceNumber } from '@/lib/invoice-utils'
import { logger } from '@/lib/logger'
import { verifyCronSecret, unauthorizedResponse } from '@/lib/cron-auth'
import { claimExternalEvent } from '@/lib/idempotency'

export const dynamic = 'force-dynamic'

const MAX_ITEMS_PER_CALL = 50
const CONCURRENCY_LIMIT = 5
const FIVE_MINUTES_AGO = new Date(Date.now() - 5 * 60 * 1000)

// ─── Types ──────────────────────────────────────────────────────────────────

interface PollItem {
  type: 'invoice' | 'credit_note'
  id: number
  storeId: number
  prefix: string
  consecutive: number
  status: string
  dianResponse: string | null
  validatedAt: Date | null
  testMode: boolean
}

interface PollResult {
  type: string
  id: number
  documentNumber: string
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
  invoicesProcessed: number
  creditNotesProcessed: number
  results: PollResult[]
  timestamp: string
  message?: string
  durationMs?: number
}

// ─── Process single item ────────────────────────────────────────────────────

async function processItem(item: PollItem): Promise<PollResult> {
  const docNumber = formatInvoiceNumber(item.prefix, item.consecutive)

  // Extract trackId from dianResponse JSON
  let trackId: string | null = null
  let existingDianData: Record<string, unknown> = {}
  if (item.dianResponse) {
    try {
      existingDianData = JSON.parse(item.dianResponse)
      trackId = (existingDianData.trackId as string) || null
    } catch {
      // Invalid JSON
    }
  }

  if (!trackId) {
    return {
      type: item.type,
      id: item.id,
      documentNumber: docNumber,
      trackId: '',
      previousStatus: item.status,
      newStatus: null,
      dianStatusCode: null,
      error: 'No se encontró TrackId en dianResponse',
    }
  }

  try {
    const statusResult = await getStatus(trackId, {
      testMode: item.testMode,
      timeout: 15000,
    })

    // Build updated dianResponse
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
      newStatus = 'VALIDATED'
      updateData.status = newStatus
      if (!item.validatedAt) {
        updateData.validatedAt = new Date()
      }
    } else if (statusResult.statusCode === '10011') {
      newStatus = 'REJECTED'
      updateData.status = newStatus
      updateData.dianErrorCode = statusResult.errorCode || statusResult.statusCode
    }

    // Update the appropriate table
    if (item.type === 'invoice') {
      await db.invoice.update({ where: { id: item.id }, data: updateData })
    } else {
      await db.creditNote.update({ where: { id: item.id }, data: updateData })
    }

    return {
      type: item.type,
      id: item.id,
      documentNumber: docNumber,
      trackId,
      previousStatus: item.status,
      newStatus,
      dianStatusCode: statusResult.statusCode || null,
      error: statusResult.errorMessage || null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return {
      type: item.type,
      id: item.id,
      documentNumber: docNumber,
      trackId,
      previousStatus: item.status,
      newStatus: null,
      dianStatusCode: null,
      error: message,
    }
  }
}

// ─── GET /api/cron/poll-dian-status ─────────────────────────────────────────
// Cron job endpoint: polls DIAN for status of pending invoices and credit notes.
// Should be called every 10 minutes.

export async function GET(request: NextRequest) {
  // ── Auth por shared secret (entry point automático, sin sesión de usuario) ──
  if (!verifyCronSecret(request)) {
    logger.warn('[DIAN Cron] Intento de acceso sin CRON_SECRET válido')
    return unauthorizedResponse()
  }

  try {
    const startTime = Date.now()

    // ── Lock anti-concurrencia vía ProcessedEvent ──
    // Claim por minuto: si dos ejecuciones se solapan (scheduler + retry),
    // la segunda cae en P2002 y sale limpio con 200 {skipped:true}.
    const minuteBucket = new Date().toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM
    let lockClaimed = true
    await db.$transaction(async (tx) => {
      const claim = await claimExternalEvent(tx, 'CRON', `poll-dian-status:${minuteBucket}`)
      if (!claim.claimed) lockClaimed = false
    })
    if (!lockClaimed) {
      logger.info(`[DIAN Cron] Ejecución duplicada en el mismo minuto (${minuteBucket}), skipped`)
      return NextResponse.json({
        processed: 0,
        validated: 0,
        rejected: 0,
        stillPending: 0,
        errors: 0,
        invoicesProcessed: 0,
        creditNotesProcessed: 0,
        results: [],
        message: 'Ejecución duplicada — otro cron ya está corriendo en este minuto',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      } satisfies PollSummary)
    }

    // 1. Find pending invoices sent > 5 min ago
    const pendingInvoices = await db.invoice.findMany({
      where: {
        status: 'PENDING_VALIDATE',
        dianResponse: { not: null },
        sentAt: { lte: FIVE_MINUTES_AGO },
      },
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
      take: MAX_ITEMS_PER_CALL,
      orderBy: { createdAt: 'asc' },
    })

    // 2. Find pending credit notes sent > 5 min ago
    const pendingCreditNotes = await db.creditNote.findMany({
      where: {
        status: 'PENDING_VALIDATE',
        dianResponse: { not: null },
        sentAt: { lte: FIVE_MINUTES_AGO },
      },
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
      take: MAX_ITEMS_PER_CALL,
      orderBy: { createdAt: 'asc' },
    })

    const totalItems = pendingInvoices.length + pendingCreditNotes.length

    if (totalItems === 0) {
      return NextResponse.json({
        processed: 0,
        validated: 0,
        rejected: 0,
        stillPending: 0,
        errors: 0,
        invoicesProcessed: 0,
        creditNotesProcessed: 0,
        results: [],
        message: 'No hay documentos pendientes de validación',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      } satisfies PollSummary)
    }

    // 3. Combine and process all items
    const allItems: PollItem[] = [
      ...pendingInvoices.map((inv) => ({ ...inv, type: 'invoice' as const })),
      ...pendingCreditNotes.map((cn) => ({ ...cn, type: 'credit_note' as const })),
    ]

    const results: PollResult[] = []

    for (let i = 0; i < allItems.length; i += CONCURRENCY_LIMIT) {
      const batch = allItems.slice(i, i + CONCURRENCY_LIMIT)
      const batchResults = await Promise.all(batch.map(processItem))
      results.push(...batchResults)
    }

    // 4. Calculate summary
    let validated = 0
    let rejected = 0
    let stillPending = 0
    let errors = 0
    let invoicesProcessed = 0
    let creditNotesProcessed = 0

    for (const r of results) {
      if (r.type === 'invoice') invoicesProcessed++
      else creditNotesProcessed++

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
      invoicesProcessed,
      creditNotesProcessed,
      results,
      timestamp: new Date().toISOString(),
    }

    logger.info(
      `[DIAN Cron] Sondeo completado en ${Date.now() - startTime}ms: ` +
      `${validated} validadas, ${rejected} rechazadas, ${stillPending} pendientes, ${errors} errores ` +
      `(${invoicesProcessed} facturas, ${creditNotesProcessed} notas crédito)`,
    )

    return NextResponse.json(summary)
  } catch (error) {
    logger.error('[DIAN Cron] Error en poll-dian-status:', error)
    return NextResponse.json(
      { error: 'Error interno al consultar estado DIAN' },
      { status: 500 },
    )
  }
}
