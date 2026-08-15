// Subscription Cron Service
// Runs daily to:
//   1. Check for expired subscriptions and transition their status
//      (delegates to the app's own Prisma-based billing-check endpoint,
//      so this works identically against SQLite or PostgreSQL — the app
//      is the single source of truth for the transition rules)
//   2. Send expiry alert emails (3 days and 1 day before)
// Every 30 seconds:
//   3. Process pending Wompi demo transactions (auto-approve after 10s delay)
//
// Also exposes manual trigger endpoints.

const ALERT_API_BASE = process.env.ALERT_API_BASE || ''
if (!ALERT_API_BASE) {
  console.warn('[ENV] WARN: ALERT_API_BASE is not set. Expiry alert emails will be skipped. Set it to enable email alerts. Example: http://app:3000/api/subscription/alerts')
}

// App base URL (internal Docker network hostname, e.g. http://app:3000)
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000'
const DEMO_PROCESS_URL = `${APP_BASE_URL}/api/payments/wompi/demo-process`
const BILLING_CHECK_URL = `${APP_BASE_URL}/api/subscription/billing-check`

const INTERNAL_SECRET = process.env.INTERNAL_SECRET
if (!INTERNAL_SECRET) {
  throw new Error('INTERNAL_SECRET no configurado. Agrégalo a las variables de entorno del servicio.')
}

interface BillingCheckResult {
  checked: number
  pastDue: number
  expired: number
  errors: number
}

async function checkExpiredSubscriptions(): Promise<BillingCheckResult> {
  const response = await fetch(BILLING_CHECK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': INTERNAL_SECRET as string,
    },
    signal: AbortSignal.timeout(30000), // 30s timeout
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Billing-check API returned ${response.status}: ${text}`)
  }

  return response.json() as Promise<BillingCheckResult>
}

// ── Demo Transaction Processing ──
async function triggerDemoProcessing(): Promise<void> {
  try {
    console.log(`[${new Date().toISOString()}] Checking pending Wompi demo transactions...`)

    const response = await fetch(DEMO_PROCESS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': INTERNAL_SECRET,
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`[${new Date().toISOString()}] Demo-process API returned ${response.status}: ${text}`)
      return
    }

    const data = await response.json()
    if (data.processed > 0) {
      console.log(`[${new Date().toISOString()}] Demo processing: ${data.processed} transaction(s) auto-approved`)
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error triggering demo processing:`, error)
  }
}

// ── Alert Check: find subscriptions needing 3-day or 1-day alerts ──
async function triggerExpiryAlerts(daysBefore: number): Promise<void> {
  if (!ALERT_API_BASE) {
    console.log(`[${new Date().toISOString()}] Skipping ${daysBefore}-day alert check (ALERT_API_BASE not configured)`)
    return
  }
  try {
    const url = `${ALERT_API_BASE}?daysBefore=${daysBefore}`
    console.log(`[${new Date().toISOString()}] Checking ${daysBefore}-day expiry alerts...`)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': INTERNAL_SECRET,
      },
      signal: AbortSignal.timeout(30000), // 30s timeout
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`[${new Date().toISOString()}] Alert API returned ${response.status}: ${text}`)
      return
    }

    const data = await response.json()
    console.log(
      `[${new Date().toISOString()}] ${daysBefore}-day alert check: ${data.total ?? 0} subscription(s), ${data.emailSent ?? 0} email(s) sent`
    )
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error triggering ${daysBefore}-day alerts:`, error)
  }
}

// --- HTTP Server ---
const PORT = parseInt(process.env.CRON_PORT || '3010', 10)

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    // Manual trigger: check expired
    if (url.pathname === '/check-expired' && req.method === 'POST') {
      try {
        const result = await checkExpiredSubscriptions()
        const total = result.pastDue + result.expired
        return new Response(JSON.stringify({
          message: total > 0
            ? `${total} suscripción(es) procesada(s) (PAST_DUE y/o EXPIRED)`
            : 'No hay suscripciones que requieran actualización',
          ...result,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error in check-expired endpoint:', error)
        return new Response(JSON.stringify({ error: 'Error interno' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // Manual trigger: process pending demo transactions
    if (url.pathname === '/demo-process' && req.method === 'POST') {
      try {
        // Trigger demo processing in background
        triggerDemoProcessing()

        return new Response(JSON.stringify({
          message: 'Demo transaction processing initiated',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error in demo-process endpoint:', error)
        return new Response(JSON.stringify({ error: 'Error interno' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // Manual trigger: check and send alerts
    if (url.pathname === '/check-alerts' && req.method === 'POST') {
      try {
        const daysBefore = parseInt(url.searchParams.get('daysBefore') || '3', 10)
        if (![0, 1, 3].includes(daysBefore)) {
          return new Response(JSON.stringify({ error: 'daysBefore must be 0, 1 or 3' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Trigger alerts in background
        triggerExpiryAlerts(daysBefore)

        return new Response(JSON.stringify({
          message: `Alert check for ${daysBefore}-day expiry initiated`,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error in check-alerts endpoint:', error)
        return new Response(JSON.stringify({ error: 'Error interno' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // Manual trigger: run ALL checks (expired + alerts)
    if (url.pathname === '/check-all' && req.method === 'POST') {
      try {
        // 1. Check expired
        const expiryResult = await checkExpiredSubscriptions()

        // 2. Trigger alerts (non-blocking) — 3-day, 1-day pre-expiry, and grace-ending dunning
        triggerExpiryAlerts(3)
        setTimeout(() => triggerExpiryAlerts(1), 5000)
        setTimeout(() => triggerExpiryAlerts(0), 10000)

        return new Response(JSON.stringify({
          message: 'Full check initiated (expired + alerts)',
          pastDue: expiryResult.pastDue,
          expired: expiryResult.expired,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        console.error('Error in check-all endpoint:', error)
        return new Response(JSON.stringify({ error: 'Error interno' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'subscription-cron',
        port: PORT,
        version: '3.0',
        features: ['expiry-check', 'expiry-alerts', 'demo-process'],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('Not Found', { status: 404 })
  },
})

console.log(`[Subscription Cron v3] Running on port ${PORT}`)

// --- Scheduled Checks ---
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours
const DEMO_PROCESS_INTERVAL_MS = 30 * 1000 // 30 seconds

async function runScheduledChecks() {
  console.log(`[${new Date().toISOString()}] Running scheduled subscription checks...`)

  // 1. Check expired subscriptions
  try {
    const result = await checkExpiredSubscriptions()
    if (result.pastDue > 0 || result.expired > 0) {
      console.log(`[${new Date().toISOString()}] Checked ${result.checked} subscription(s) — PAST_DUE: ${result.pastDue}, EXPIRED: ${result.expired}`)
    } else {
      console.log(`[${new Date().toISOString()}] No subscriptions needed a status update (checked ${result.checked})`)
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in expiry check:`, error)
  }

  // 2. Trigger expiry alerts — 3-day, 1-day pre-expiry, and grace-ending dunning
  triggerExpiryAlerts(3)
  setTimeout(() => triggerExpiryAlerts(1), 5000)
  setTimeout(() => triggerExpiryAlerts(0), 10000)
}

// Run first check after 5 seconds
setTimeout(runScheduledChecks, 5000)

// Schedule recurring checks every 24 hours
setInterval(runScheduledChecks, CHECK_INTERVAL_MS)

// --- Scheduled Demo Processing ---
// Process pending Wompi demo transactions every 30 seconds
// This ensures demo payments are auto-approved even if the user
// closes the browser (server-side processing instead of client polling)
setTimeout(() => {
  console.log(`[${new Date().toISOString()}] Starting demo transaction processor (every ${DEMO_PROCESS_INTERVAL_MS / 1000}s)...`)
  triggerDemoProcessing()
  setInterval(triggerDemoProcessing, DEMO_PROCESS_INTERVAL_MS)
}, 10000) // Start after 10 seconds to let the app fully initialize
