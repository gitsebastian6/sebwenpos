// DIAN Status Poller Cron Service
// Runs every 5 minutes to check the status of pending invoices
// with the Colombian tax authority (DIAN).
//
// Calls POST /api/invoices/poll-pending on the main Next.js server
// to leverage the existing SOAP client and database logic.

const PORT = 3011
const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const MAIN_SERVER_URL = `http://localhost:3000/api/invoices/poll-pending`

interface PollSummary {
  processed: number
  validated: number
  rejected: number
  stillPending: number
  errors: number
  results: Array<{
    invoiceId: number
    invoiceNumber: string
    trackId: string
    previousStatus: string
    newStatus: string | null
    dianStatusCode: string | null
    error: string | null
  }>
  timestamp: string
}

async function pollPendingInvoices(): Promise<void> {
  const now = new Date().toISOString()
  console.log(`[${now}] Iniciando sondeo de facturas pendientes ante la DIAN...`)

  try {
    const response = await fetch(MAIN_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120_000), // 2 min timeout for batch processing
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(
        `[${now}] Error del servidor: ${response.status} ${response.statusText} — ${errorText}`,
      )
      return
    }

    const summary: PollSummary = await response.json()

    if (summary.processed === 0) {
      console.log(`[${now}] No hay facturas pendientes de validación`)
      return
    }

    console.log(
      `[${now}] Sondeo completado: ${summary.processed} procesadas — ` +
      `${summary.validated} validadas, ${summary.rejected} rechazadas, ` +
      `${summary.stillPending} pendientes, ${summary.errors} errores`,
    )

    // Log individual results for rejected invoices (they need attention)
    if (summary.rejected > 0) {
      for (const r of summary.results) {
        if (r.newStatus === 'REJECTED') {
          console.warn(
            `  ⚠ Factura ${r.invoiceNumber} (ID: ${r.invoiceId}) RECHAZADA — ` +
            `Código DIAN: ${r.dianStatusCode}, Error: ${r.error}`,
          )
        }
      }
    }

    // Log individual results for validated invoices
    if (summary.validated > 0) {
      for (const r of summary.results) {
        if (r.newStatus === 'VALIDATED') {
          console.log(
            `  ✓ Factura ${r.invoiceNumber} (ID: ${r.invoiceId}) VALIDADA — ` +
            `Código DIAN: ${r.dianStatusCode}`,
          )
        }
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      console.error(`[${now}] Timeout: el sondeo tardó más de 2 minutos`)
    } else {
      console.error(`[${now}] Error al consultar facturas pendientes:`, error)
    }
  }
}

// --- HTTP Server for manual trigger and health check ---
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    // Manual trigger endpoint
    if (url.pathname === '/poll' && req.method === 'POST') {
      try {
        // Run poll and return summary
        const response = await fetch(MAIN_SERVER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(120_000),
        })

        if (!response.ok) {
          const errorText = await response.text()
          return new Response(
            JSON.stringify({ error: 'Error del servidor principal', details: errorText }),
            { status: 502, headers: { 'Content-Type': 'application/json' } },
          )
        }

        const summary = await response.json()
        return new Response(
          JSON.stringify({
            message: summary.processed > 0
              ? `Sondeo completado: ${summary.validated} validadas, ${summary.rejected} rechazadas, ${summary.stillPending} pendientes`
              : 'No hay facturas pendientes',
            ...summary,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido'
        return new Response(
          JSON.stringify({ error: 'Error interno del sondeador', details: message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({ status: 'ok', service: 'dian-status-poller', port: PORT }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response('Not Found', { status: 404 })
  },
})

console.log(`[DIAN Status Poller] Servicio iniciado en puerto ${PORT}`)
console.log(`[DIAN Status Poller] Intervalo de sondeo: cada 5 minutos (${POLL_INTERVAL_MS}ms)`)

// --- Scheduled Polling ---
// Run first poll after 10 seconds (give main server time to start)
setTimeout(pollPendingInvoices, 10_000)

// Schedule recurring polls every 5 minutes
setInterval(pollPendingInvoices, POLL_INTERVAL_MS)
