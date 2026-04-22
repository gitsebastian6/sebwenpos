// Subscription Cron Service
// Runs daily to:
//   1. Check for expired subscriptions and mark them as EXPIRED
//   2. Send expiry alert emails (3 days and 1 day before)
//
// Also exposes manual trigger endpoints.

import { Database } from 'bun:sqlite'

function getDbPath(): string {
  // Priority: explicit DATABASE_PATH env var > parse from DATABASE_URL > default
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH
  if (process.env.DATABASE_URL) {
    // Parse file path from DATABASE_URL format: "file:/path/to/db.db"
    const match = process.env.DATABASE_URL.match(/^file:(.+)/)
    if (match) return match[1]
  }
  return '/home/z/my-project/db/custom.db'
}
const DB_PATH = getDbPath()
const ALERT_API_BASE = process.env.ALERT_API_BASE || 'http://localhost:3000/api/subscription/alerts'

// Load INTERNAL_SECRET from .env
function getInternalSecret(): string {
  try {
    const envContent = require('fs').readFileSync('/home/z/my-project/.env', 'utf-8')
    const match = envContent.match(/INTERNAL_SECRET=(.+)/)
    if (match && match[1].trim()) return match[1].trim()
  } catch { /* file not found */ }
  // No fallback — INTERNAL_SECRET must be set in .env
  throw new Error('INTERNAL_SECRET no configurado. Agrégalo al archivo .env')
}

const INTERNAL_SECRET = getInternalSecret()

function getDb(): Database {
  return new Database(DB_PATH)
}

interface ExpiredResult {
  id: number
  storeId: number
  storeName: string
  planName: string
  previousStatus: string
  endDate: string
}

function checkExpiredSubscriptions(): { expiredCount: number; subscriptions: ExpiredResult[] } {
  const db = getDb()
  try {
    const now = new Date().toISOString()
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000
    const graceEnd = new Date(Date.now() + threeDaysMs).toISOString()

    // Step 1: Mark expired subscriptions as PAST_DUE with grace period (instead of directly EXPIRED)
    const expired = db.query(`
      SELECT s.id, s.store_id as storeId, s.status as previousStatus, s.end_date as endDate,
             st.name as storeName, p.name as planName
      FROM subscriptions s
      JOIN stores st ON s.store_id = st.id
      JOIN plans p ON s.plan_id = p.id
      WHERE s.end_date IS NOT NULL
        AND s.end_date < ?
        AND s.status IN ('TRIAL', 'ACTIVE')
        AND s.grace_end_date IS NULL
    `).all(now) as ExpiredResult[]

    let pastDueCount = 0
    if (expired.length > 0) {
      const ids = expired.map((s) => s.id)
      const placeholders = ids.map(() => '?').join(',')
      // Set PAST_DUE with grace_end_date 3 days from now
      db.query(`UPDATE subscriptions SET status = 'PAST_DUE', grace_end_date = ? WHERE id IN (${placeholders})`).run(graceEnd, ...ids)
      console.log(`[${new Date().toISOString()}] Marked ${expired.length} subscription(s) as PAST_DUE (3-day grace period)`)
      pastDueCount = expired.length
    }

    // Step 2: Mark PAST_DUE → EXPIRED when grace period ended
    const pastDueExpired = db.query(`
      SELECT s.id, s.store_id as storeId, s.status as previousStatus, s.grace_end_date as graceEndDate,
             st.name as storeName, p.name as planName
      FROM subscriptions s
      JOIN stores st ON s.store_id = st.id
      JOIN plans p ON s.plan_id = p.id
      WHERE s.grace_end_date IS NOT NULL
        AND s.grace_end_date < ?
        AND s.status = 'PAST_DUE'
    `).all(now) as Array<ExpiredResult & { graceEndDate: string }>

    let expiredCount = 0
    if (pastDueExpired.length > 0) {
      const pdIds = pastDueExpired.map((s) => s.id)
      const pdPlaceholders = pdIds.map(() => '?').join(',')
      db.query(`UPDATE subscriptions SET status = 'EXPIRED', grace_end_date = NULL WHERE id IN (${pdPlaceholders})`).run(...pdIds)
      console.log(`[${new Date().toISOString()}] Marked ${pastDueExpired.length} PAST_DUE subscription(s) as EXPIRED (grace ended)`)
      expiredCount = pastDueExpired.length
    }

    return { expiredCount: pastDueCount + expiredCount, subscriptions: [...expired, ...pastDueExpired] }
  } finally {
    db.close()
  }
}

// ── Alert Check: find subscriptions needing 3-day or 1-day alerts ──
async function triggerExpiryAlerts(daysBefore: number): Promise<void> {
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
  fetch(req) {
    const url = new URL(req.url)

    // Manual trigger: check expired
    if (url.pathname === '/check-expired' && req.method === 'POST') {
      try {
        const result = checkExpiredSubscriptions()
        return new Response(JSON.stringify({
          message: result.expiredCount > 0
            ? `${result.expiredCount} suscripción(es) procesada(s) (PAST_DUE y/o EXPIRED)`
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

    // Manual trigger: check and send alerts
    if (url.pathname === '/check-alerts' && req.method === 'POST') {
      try {
        const daysBefore = parseInt(url.searchParams.get('daysBefore') || '3', 10)
        if (![1, 3].includes(daysBefore)) {
          return new Response(JSON.stringify({ error: 'daysBefore must be 1 or 3' }), {
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
        const expiryResult = checkExpiredSubscriptions()

        // 2. Trigger alerts (non-blocking)
        triggerExpiryAlerts(3)
        // Slight delay for 1-day alerts to not overwhelm
        setTimeout(() => triggerExpiryAlerts(1), 5000)

        return new Response(JSON.stringify({
          message: 'Full check initiated (expired + alerts)',
          expired: expiryResult.expiredCount,
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
        version: '2.0',
        features: ['expiry-check', 'expiry-alerts'],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('Not Found', { status: 404 })
  },
})

console.log(`[Subscription Cron v2] Running on port ${PORT}`)

// --- Scheduled Checks ---
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

function runScheduledChecks() {
  console.log(`[${new Date().toISOString()}] Running scheduled subscription checks...`)

  // 1. Check expired subscriptions
  try {
    const result = checkExpiredSubscriptions()
    if (result.expiredCount > 0) {
      console.log(`[${new Date().toISOString()}] Found ${result.expiredCount} expired subscription(s)`)
      result.subscriptions.forEach((s) => {
        console.log(`  - Store "${s.storeName}" (ID: ${s.storeId}): Plan "${s.planName}" was ${s.previousStatus}, expired on ${s.endDate}`)
      })
    } else {
      console.log(`[${new Date().toISOString()}] No expired subscriptions found`)
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in expiry check:`, error)
  }

  // 2. Trigger expiry alerts (3-day and 1-day)
  triggerExpiryAlerts(3)
  setTimeout(() => triggerExpiryAlerts(1), 5000)
}

// Run first check after 5 seconds
setTimeout(runScheduledChecks, 5000)

// Schedule recurring checks every 24 hours
setInterval(runScheduledChecks, CHECK_INTERVAL_MS)
