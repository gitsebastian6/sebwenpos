// ============================================================
// SEBWEN POS — Auth para endpoints de cron (entry points automáticos)
// ──────────────────────────────────────────────────────────
// Los endpoints /api/cron/* no tienen sesión de usuario: se autentican
// con un shared secret (CRON_SECRET) vía header Authorization Bearer.
// Compatibilidad: durante la migración del scheduler externo también
// acepta ?secret=... (query param), marcado como DEPRECATED.
// Si CRON_SECRET no está configurado, se rechaza (fail-closed).
// ============================================================

import type { NextRequest } from 'next/server'

export function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Fail-closed: sin secret configurado no hay forma segura de exponer el cron
    return false
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${secret}`) return true

  // DEPRECATED — solo para compatibilidad durante migración del scheduler
  const querySecret = req.nextUrl.searchParams.get('secret')
  if (querySecret === secret) return true

  return false

}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: 'No autorizado' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}
